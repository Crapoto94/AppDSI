const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { getSqlite, pgDb } = require('../../shared/database');
const { excelDateToISO, parseOracleDate } = require('../../shared/utils');

// Forward declaration - sendMail will be injected
let sendMailFn = null;
// Reformate « NOM Prénom » en « Prénom Nom » (tokens tout en majuscules = nom de famille)
function formatPrenomNom(name) {
    const tokens = String(name || '').trim().split(/\s+/);
    if (tokens.length < 2) return name;
    const isUpper = (t) => t.replace(/[-']/g, '').length >= 2 && t === t.toLocaleUpperCase('fr') && /[A-ZÀ-Þ]/.test(t);
    const nom = tokens.filter(isUpper), prenom = tokens.filter(t => !isUpper(t));
    return nom.length && prenom.length ? [...prenom, ...nom].join(' ') : name;
}

// Le CP pressenti de la demande devient le chef de projet du projet lié.
async function syncChefProjet(demandeId, byUsername) {
    const d = await pgDb.get('SELECT projet_id, cp_presenti FROM rencontres_budgetaires WHERE id = ?', [demandeId]);
    if (!d || !d.projet_id || !d.cp_presenti) return false;
    const actuel = await pgDb.get('SELECT chef_projet_username FROM projets.projets WHERE id = $1', [d.projet_id]);
    if (actuel && String(actuel.chef_projet_username || '').toLowerCase() === String(d.cp_presenti).toLowerCase()) return false;
    const u = await pgDb.get('SELECT displayName AS dn FROM hub.users WHERE LOWER(username) = LOWER($1)', [d.cp_presenti]);
    const display = formatPrenomNom((u && u.dn) || d.cp_presenti);
    await pgDb.run(
        'UPDATE projets.projets SET chef_projet_username = $1, chef_projet_display_name = $2, date_modification = CURRENT_TIMESTAMP, modified_by_username = $3 WHERE id = $4',
        [d.cp_presenti, display, byUsername || null, d.projet_id]
    );
    return true;
}

// La demande devient une tâche du projet, attribuée au chef de projet (visible dans « Mes tâches »),
// qui en est averti par mail. Sans doublon : une seule tâche par demande et par projet.
async function creerTacheProjet(demandeId, projetId, byUsername) {
    const d = await pgDb.get('SELECT * FROM rencontres_budgetaires WHERE id = ?', [demandeId]);
    if (!d) return false;
    const deja = await pgDb.get('SELECT id FROM projets.projet_taches_standalone WHERE rencontre_id = $1 AND projet_id = $2', [demandeId, projetId]);
    if (deja) return false;
    const p = await pgDb.get('SELECT id, titre, chef_projet_username, chef_projet_display_name FROM projets.projets WHERE id = $1', [projetId]);
    if (!p) return false;
    const cp = p.chef_projet_username || '';
    const texte = `[Demande budgétaire] ${d.titre || ''}${d.direction ? ` — ${d.direction}` : ''}`.trim();
    await pgDb.run(
        `INSERT INTO projets.projet_taches_standalone (projet_id, tache, responsable, responsable_username, statut, created_by_username, rencontre_id)
         VALUES ($1, $2, $3, $4, 'a_faire', $5, $6)`,
        [projetId, texte, p.chef_projet_display_name || cp, cp, byUsername || '', demandeId]
    );
    if (!cp || !sendMailFn) return true;
    if (byUsername && byUsername.toLowerCase() === cp.toLowerCase()) return true; // pas de mail à soi-même
    try {
        const u = await pgDb.get('SELECT email FROM hub.users WHERE LOWER(username) = LOWER($1)', [cp]);
        if (!u || !u.email) return true;
        const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const { getAppBaseUrl } = require('../../shared/app_url');
        const base = await getAppBaseUrl();
        const html = `
            <h2 style="margin:0 0 8px;">Nouvelle tâche issue des demandes budgétaires</h2>
            <p>Une demande des <strong>rencontres budgétaires</strong> a été rattachée au projet <strong>${esc(p.titre)}</strong> et vous a été attribuée comme tâche :</p>
            <blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #6366f1;background:#eef2ff;">
              <strong>${esc(d.titre)}</strong>${d.direction ? `<br/>Direction : ${esc(d.direction)}` : ''}${d.description ? `<br/>${esc(d.description)}` : ''}
            </blockquote>
            <p><a href="${base}/projets/${projetId}" style="background:#6366f1;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Voir le projet</a></p>
            <p style="color:#64748b;font-size:13px;">Retrouvez-la dans <em>Mes Tâches</em>. Sa validation clôturera automatiquement la demande budgétaire.</p>`;
        await sendMailFn(u.email, '📋 Nouvelle tâche (demande budgétaire) — DSI Hub', html, [], 'task_alert');
    } catch (e) { console.error('[RENCONTRES] mail tâche projet échoué:', e.message); }
    return true;
}

module.exports.setSendMail = (fn) => { sendMailFn = fn; };

module.exports = {
    setSendMail: (fn) => { sendMailFn = fn; },

    // GET: Liste des rencontres budgétaires
    getAll: async (req, res) => {
        try {
            const { direction, annee, statut, directions } = req.query;
            let sql = 'SELECT * FROM rencontres_budgetaires WHERE 1=1';
            const params = [];

            if (directions && typeof directions === 'string') {
                const dirList = directions.split(',').map(d => d.trim()).filter(d => d);
                if (dirList.length > 0) {
                    sql += ` AND UPPER(TRIM(direction)) IN (${dirList.map(() => '?').join(',')})`;
                    params.push(...dirList.map(d => d.toUpperCase()));
                }
            } else if (!direction) {
                try {
                    const username = req.user.username;
                    if (username) {
                        const userDirections = await pgDb.all('SELECT direction FROM direction_emails WHERE email LIKE ? OR email LIKE ?', [`${username}@%`, `${username}%`]);
                        if (userDirections && userDirections.length > 0) {
                            const dirList = userDirections.map(d => d.direction);
                            sql += ` AND UPPER(TRIM(direction)) IN (${dirList.map(() => '?').join(',')})`;
                            params.push(...dirList.map(d => String(d || '').trim().toUpperCase()));
                        }
                    }
                } catch (e) {
                    console.warn('Impossible de récupérer les directions:', e.message);
                }
            } else if (direction) {
                sql += ' AND UPPER(TRIM(direction)) = ?';
                params.push(String(direction).trim().toUpperCase());
            }

            if (annee) { sql += ' AND annee = ?'; params.push(parseInt(annee)); }
            if (statut) { sql += ' AND statut = ?'; params.push(statut); }
            sql += ' ORDER BY date_reunion DESC';

            const rencontres = await pgDb.all(sql, params);
            res.json(rencontres);
        } catch (error) {
            console.error('Erreur GET rencontres:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET: Détail d'une rencontre
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const rencontre = await pgDb.get('SELECT * FROM rencontres_budgetaires WHERE id = ?', [id]);
            if (!rencontre) return res.status(404).json({ error: 'Rencontre non trouvée' });

            const participants = await pgDb.all('SELECT * FROM rencontres_participants WHERE rencontre_id = ?', [id]);
            const suivi = await pgDb.all('SELECT * FROM rencontres_suivi WHERE rencontre_id = ?', [id]);
            res.json({ ...rencontre, participants, suivi });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST: Import Excel/CSV
    importFile: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

            const db = getSqlite();
            const fileName = req.file.originalname || '';
            let rows = [];
            let debugLog = `Filename: "${fileName}"\n`;

            // CSV parsing - handle encoding (UTF-8 or Latin-1/Windows-1252)
            let content = req.file.buffer.toString('utf-8');
            if (content.includes('\uFFFD')) {
                content = req.file.buffer.toString('latin1');
            }

            // Parse CSV lines handling quoted fields with multiline values
            const rawLines = [];
            let building = '';
            let inQuote = false;
            for (let i = 0; i < content.length; i++) {
                const ch = content[i];
                if (ch === '"') inQuote = !inQuote;
                if (ch === '\n' && !inQuote) {
                    if (building.trim()) rawLines.push(building.trim());
                    building = '';
                } else if (ch !== '\r') {
                    building += ch;
                }
            }
            if (building.trim()) rawLines.push(building.trim());

            if (rawLines.length < 2) return res.status(400).json({ error: 'Fichier CSV vide' });

            const headerLine = rawLines[0];
            const headers = headerLine.split(';').map(h => h.trim().replace(/^"|"$/g, ''));
            const suiviIndex = headers.findIndex(h => h.toLowerCase() === 'suivi');

            const splitCSVLine = (line, delimiter) => {
                const result = [];
                let field = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') {
                        inQuotes = !inQuotes;
                    } else if (c === delimiter && !inQuotes) {
                        result.push(field.replace(/^"|"$/g, '').trim());
                        field = '';
                    } else {
                        field += c;
                    }
                }
                result.push(field.replace(/^"|"$/g, '').trim());
                return result;
            };

            for (let i = 1; i < rawLines.length; i++) {
                const values = splitCSVLine(rawLines[i], ';');
                const row = {};
                headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
                row['__suivi'] = suiviIndex >= 0 ? (values[suiviIndex] || '') : '';
                rows.push(row);
            }

            const data = rows.filter(r => r.Direction || r.Date);
            if (!Array.isArray(data) || data.length === 0) {
                return res.status(400).json({ error: 'Aucune donnée trouvée dans le fichier' });
            }

            let imported = 0;
            let errors = [];

            for (let i = 0; i < data.length; i++) {
                try {
                    const row = data[i];
                    if (!row.Direction) { errors.push(`Ligne ${i + 2}: Direction manquante`); continue; }
                    if (row.Date === '' || row.Date === null || row.Date === undefined) { errors.push(`Ligne ${i + 2}: Date manquante`); continue; }

                    const dateReunion = parseOracleDate(row.Date);
                    if (!dateReunion) { errors.push(`Ligne ${i + 2}: Format de date invalide (${row.Date})`); continue; }

                    const annee = parseInt(dateReunion.split('-')[0]);
                    // Montant vide = inconnu (NULL) ; 0 explicite = gratuit
                    let coutTTC = null;
                    if (row['Cout TTC'] !== undefined && String(row['Cout TTC']).trim() !== '') {
                        const parsed = parseFloat(String(row['Cout TTC']).replace(/[^0-9,.]/g, '').replace(',', '.'));
                        coutTTC = Number.isNaN(parsed) ? null : parsed;
                    }

                    const titre = row['Quoi ?'] ? String(row['Quoi ?']).trim().substring(0, 255) : '';
                    const direction = String(row['Direction']).trim();
                    const service = (row['Service'] || row['SERVICE'] || row['service_code'] || row['Service code']) ? String(row['Service'] || row['SERVICE'] || row['service_code'] || row['Service code']).trim() : '';
                    const type = row['Type'] ? String(row['Type']).trim() : '';
                    const description = row['Quoi ?'] ? String(row['Quoi ?']).trim() : '';
                    const arbitrage = (row['Arbitrage'] || row['Arbitrage '] || row['ARBITRAGE'] || '') ? String(row['Arbitrage'] || row['Arbitrage '] || row['ARBITRAGE'] || '').trim() : '';
                    const responsableDsi = row['DSI'] && String(row['DSI']).trim() !== '' ? String(row['DSI']).trim() : '';
                    const ticketRaw = row['TICKET'] || row['Ticket'] || row['ticket'] || row['N° TICKET'] || row['N°TICKET'] || '';
                    let ticketGlpi = '';
                    if (ticketRaw !== '' && ticketRaw !== null && ticketRaw !== undefined) {
                        const ticketNum = parseFloat(String(ticketRaw).replace(/[^0-9.]/g, ''));
                        if (!isNaN(ticketNum) && ticketNum > 0) ticketGlpi = String(Math.round(ticketNum));
                        else if (String(ticketRaw).trim()) ticketGlpi = String(ticketRaw).trim();
                    }
                    const lienReference = row['LIEN'] && String(row['LIEN']).trim() !== '' ? String(row['LIEN']).trim() : '';
                    const commentaires = row['Commentaire ?'] && String(row['Commentaire ?']).trim() !== '' ? String(row['Commentaire ?']).trim() : '';
                    const suiviRaw = row['__suivi'] ? String(row['__suivi']).trim() : '';
                    const suiviSeul = suiviRaw && suiviRaw.toLowerCase() !== 'undefined' && suiviRaw.toLowerCase() !== 'null' && suiviRaw !== '' ? suiviRaw : '';
                    // Commentaire et suivi fusionnés : tout est stocké dans « suivi »
                    const suivi = [suiviSeul, commentaires].filter(Boolean).join('\n');

                    const dateReunionObj = new Date(dateReunion + 'T00:00:00');
                    const rowStatut = dateReunionObj > new Date() ? 'planifiée' : '';

                    await pgDb.run(
                        `INSERT INTO rencontres_budgetaires
                        (direction, service, date_reunion, annee, type, titre, description, cout_ttc,
                         arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, suivi, statut)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [direction, service, dateReunion, annee, type, titre, description, coutTTC, arbitrage, responsableDsi, ticketGlpi, lienReference, '', suivi, rowStatut]
                    );
                    imported++;
                } catch (lineError) {
                    errors.push(`Ligne ${i + 2}: ${lineError.message}`);
                }
            }

            await pgDb.run('INSERT INTO hub.import_logs (type, username) VALUES (?, ?)', ['rencontres_budgetaires', req.user.username]);

            res.json({
                imported,
                errors: errors.length > 0 ? errors : [],
                message: `${imported} rencontres importées${errors.length > 0 ? `, ${errors.length} erreurs` : ''}`
            });
        } catch (error) {
            console.error('Erreur import rencontres:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // POST: Créer une rencontre manuelle
    create: async (req, res) => {
        try {
            const { titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, suivi, charge_cp, cp_presenti } = req.body;
            if (!titre || !direction) return res.status(400).json({ error: 'Titre et Direction sont obligatoires' });

            const result = await pgDb.run(
                `INSERT INTO rencontres_budgetaires (titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, suivi, charge_cp, cp_presenti, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planifiée')`,
                [titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, [suivi, commentaires].filter(Boolean).join('\n') || null, charge_cp || null, cp_presenti || null]
            );
            res.json({ id: result.lastID, message: 'Rencontre créée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST: Créer depuis une réunion
    createFromReunion: async (req, res) => {
        try {
            const { titre, direction, service, date_reunion, annee, type, description, reunion_id } = req.body;
            if (!titre || !direction) return res.status(400).json({ error: 'Titre et Direction sont obligatoires' });

            const result = await pgDb.run(
                `INSERT INTO rencontres_budgetaires (titre, direction, service, date_reunion, annee, type, description, statut, reunion_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'demandée', ?)`,
                [titre, direction, service || null, date_reunion, annee, type, description, reunion_id]
            );
            res.status(201).json({ id: result.lastID, message: 'Demande créée depuis la réunion', reunion_id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PUT: Mettre à jour
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, suivi, charge_cp, cp_presenti, statut, annee_validation } = req.body;
            const validee = statut === 'Validé';
            if (validee && annee_validation !== undefined && annee_validation !== null && !Number.isInteger(Number(annee_validation))) return res.status(400).json({ error: 'Année de validation invalide' });
            await pgDb.run(
                `UPDATE rencontres_budgetaires SET titre=?, direction=?, service=?, date_reunion=?, annee=?, type=?, description=?, cout_ttc=?, arbitrage=?, responsable_dsi=?, ticket_glpi=?, lien_reference=?, suivi=COALESCE(?, suivi), charge_cp=?, cp_presenti=?, statut=?, annee_validation=${validee ? 'COALESCE(?, annee_validation)' : '?'}, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                [titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, suivi ?? null, charge_cp || null, cp_presenti || null, statut, validee && annee_validation != null ? Number(annee_validation) : null, id]
            );

            // Utilisateur de référence : enregistré seulement s'il est fourni (null = effacé).
            // S'il change et qu'un ticket est déjà lié, le demandeur du ticket est mis à jour.
            let ticketUpdated = null;
            if (Object.prototype.hasOwnProperty.call(req.body, 'user_ref_email')) {
                const { user_ref_username, user_ref_name, user_ref_email } = req.body;
                const before = await pgDb.get('SELECT user_ref_email, user_ref_name, ticket_glpi FROM rencontres_budgetaires WHERE id=?', [id]);
                await pgDb.run('UPDATE rencontres_budgetaires SET user_ref_username=?, user_ref_name=?, user_ref_email=? WHERE id=?',
                    [user_ref_username || null, user_ref_name || null, user_ref_email || null, id]);
                const ticketId = parseInt(before?.ticket_glpi, 10);
                const changed = (before?.user_ref_email || '') !== (user_ref_email || '') || (before?.user_ref_name || '') !== (user_ref_name || '');
                if (changed && user_ref_email && Number.isInteger(ticketId)) {
                    try {
                        await require('../tickets/services/ticket.service').update(ticketId, { requester_name: user_ref_name || user_ref_email, requester_email_22: user_ref_email }, req.user);
                        ticketUpdated = ticketId;
                    } catch (e) { console.error('[RENCONTRES] maj demandeur ticket #%s échouée:', ticketId, e.message); }
                }
            }
            // CP pressenti modifié → chef de projet du projet lié
            let chefMaj = false;
            try { chefMaj = await syncChefProjet(id, req.user?.username); } catch (e) { console.error('[RENCONTRES] maj chef de projet échouée:', e.message); }
            res.json({ message: 'Rencontre mise à jour', ticket_updated: ticketUpdated, chef_projet_updated: chefMaj });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE all
    deleteAll: async (req, res) => {
        try {
            const { confirm } = req.body;
            if (confirm !== 'DELETE_ALL_RENCONTRES') return res.status(400).json({ error: 'Confirmation manquante ou incorrecte' });

            const countResults = await pgDb.all('SELECT COUNT(*) as count FROM rencontres_budgetaires');
            const totalCount = countResults?.[0]?.count || 0;

            await pgDb.run('DELETE FROM rencontres_participants');
            await pgDb.run('DELETE FROM rencontres_suivi');
            await pgDb.run('DELETE FROM rencontres_budgetaires');

            res.json({ message: `${totalCount} demandes supprimées`, deleted: totalCount });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE one
    deleteOne: async (req, res) => {
        try {
            const { id } = req.params;
            await pgDb.run('DELETE FROM rencontres_participants WHERE rencontre_id=?', [id]);
            await pgDb.run('DELETE FROM rencontres_suivi WHERE rencontre_id=?', [id]);
            await pgDb.run('DELETE FROM rencontres_budgetaires WHERE id=?', [id]);
            res.json({ message: 'Rencontre supprimée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Stats
    // Chefs de projet du module Projets (candidats au « CP pressenti ») : ceux déclarés dans
    // chef_projet_services + ceux désignés sur au moins un projet. Nom affiché en « Prénom Nom ».
    listChefsProjets: async (req, res) => {
        try {
            const rows = await pgDb.all(`
                WITH cps AS (
                    SELECT chef_projet_username AS username FROM projets.chef_projet_services
                    UNION
                    SELECT chef_projet_username FROM projets.projets WHERE COALESCE(chef_projet_username, '') <> ''
                )
                SELECT DISTINCT ON (LOWER(c.username)) c.username, u.displayName AS display_name,
                    (SELECT p.chef_projet_display_name FROM projets.projets p
                      WHERE LOWER(p.chef_projet_username) = LOWER(c.username) AND COALESCE(p.chef_projet_display_name, '') <> ''
                      LIMIT 1) AS projet_name
                FROM cps c
                LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(c.username)
                WHERE COALESCE(c.username, '') <> ''
                ORDER BY LOWER(c.username)
            `);
            const list = [];
            for (const r of rows || []) {
                const u = String(r.username);
                // Un « nom » identique au login (ex. « MMasson ») n'est pas un vrai nom
                const real = [r.display_name, r.projet_name].find(n => n && String(n).trim().toLowerCase() !== u.toLowerCase());
                let name = real || null;
                if (!name) {
                    // Absent de l'annuaire local : recherche dans RH Studio (nom de famille = login sans 1re lettre)
                    try {
                        const studio = require('../infra/studio-onboarding');
                        const found = await studio.searchAgents(u.slice(1));
                        const agents = Array.isArray(found?.data) ? found.data : [];
                        const hit = agents.find(a => String(a.email || '').split('@')[0].toLowerCase() === u.toLowerCase())
                            || (agents.filter(a => String(a.prenom || '').toLowerCase().startsWith(u[0].toLowerCase()) && String(a.nom || '').toLowerCase() === u.slice(1).toLowerCase()).length === 1
                                ? agents.find(a => String(a.prenom || '').toLowerCase().startsWith(u[0].toLowerCase()) && String(a.nom || '').toLowerCase() === u.slice(1).toLowerCase())
                                : null);
                        if (hit) name = `${hit.prenom || ''} ${hit.nom || ''}`.trim();
                    } catch (e) { /* RH Studio indisponible : on garde le login */ }
                }
                list.push({ username: u, display_name: name ? formatPrenomNom(name) : u });
            }
            list.sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
            res.json(list);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Projets du portefeuille (pour lier une demande à un projet)
    listProjets: async (req, res) => {
        try {
            const rows = await pgDb.all(`SELECT id, code, titre, statut, chef_projet_username, chef_projet_display_name
                FROM projets.projets ORDER BY titre`);
            res.json(rows || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Lie (ou délie avec projet_id = null) une demande à un projet ; le CP pressenti devient chef de projet
    linkProjet: async (req, res) => {
        try {
            const { id } = req.params;
            const projetId = req.body.projet_id == null || req.body.projet_id === '' ? null : parseInt(req.body.projet_id, 10);
            if (projetId !== null) {
                if (!Number.isInteger(projetId)) return res.status(400).json({ error: 'Projet invalide' });
                const p = await pgDb.get('SELECT id FROM projets.projets WHERE id = $1', [projetId]);
                if (!p) return res.status(404).json({ error: 'Projet introuvable' });
            }
            await pgDb.run('UPDATE rencontres_budgetaires SET projet_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projetId, id]);
            const chefMaj = projetId !== null ? await syncChefProjet(id, req.user?.username) : false;
            let tacheCreee = false;
            if (projetId !== null) {
                try { tacheCreee = await creerTacheProjet(id, projetId, req.user?.username); }
                catch (e) { console.error('[RENCONTRES] création tâche projet échouée:', e.message); }
            }
            res.json({ message: projetId === null ? 'Projet délié' : 'Projet lié', projet_id: projetId, chef_projet_updated: chefMaj, tache_creee: tacheCreee });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Projets « maîtres » (sans projet parent) d'un chef de projet : candidats au « sous-projet de »
    listProjetsMaitres: async (req, res) => {
        try {
            const cp = String(req.query.cp || '').trim();
            if (!cp) return res.json([]);
            const rows = await pgDb.all(`SELECT id, code, titre, statut, service_pilote FROM projets.projets
                WHERE LOWER(chef_projet_username) = LOWER($1) AND projet_parent_id IS NULL ORDER BY titre`, [cp]);
            res.json(rows || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Crée un projet simple (mini-projet) depuis une demande, éventuellement sous un projet maître,
    // avec le CP pressenti comme chef de projet, puis le lie à la demande.
    createProjetFromDemande: async (req, res) => {
        try {
            const { id } = req.params;
            const d = await pgDb.get('SELECT * FROM rencontres_budgetaires WHERE id = ?', [id]);
            if (!d) return res.status(404).json({ error: 'Demande introuvable' });
            if (d.projet_id) return res.status(409).json({ error: 'Cette demande est déjà liée à un projet' });

            const titre = String(req.body.titre || d.titre || '').trim();
            if (!titre) return res.status(400).json({ error: 'Titre obligatoire' });
            const description = req.body.description !== undefined ? req.body.description : (d.description || '');
            const chef = String(req.body.chef_projet_username || d.cp_presenti || '').trim() || null;
            const parentId = req.body.projet_parent_id ? parseInt(req.body.projet_parent_id, 10) : null;

            // Service pilote : celui du projet maître, sinon un service du chef de projet, sinon celui de la demande
            let servicePilote = null;
            if (parentId) {
                const parent = await pgDb.get('SELECT service_pilote FROM projets.projets WHERE id = $1', [parentId]);
                if (!parent) return res.status(404).json({ error: 'Projet maître introuvable' });
                servicePilote = parent.service_pilote;
            }
            if (!servicePilote && chef) {
                const svc = await pgDb.get('SELECT service_code FROM projets.chef_projet_services WHERE LOWER(chef_projet_username) = LOWER($1) AND service_code IS NOT NULL ORDER BY id LIMIT 1', [chef]);
                servicePilote = svc && svc.service_code;
            }
            if (!servicePilote) servicePilote = d.service || d.direction;
            if (!servicePilote) return res.status(400).json({ error: 'Service pilote introuvable : renseignez la direction/le service de la demande' });

            // Réutilise la création standard du module Projets (code, journal…)
            const out = { code: 200, body: null };
            const fakeRes = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; } };
            await require('../projets/projets.controller').create({
                body: { titre, description, niveau_projet: 'mineur', is_mini_projet: true, service_pilote: servicePilote, chef_projet_username: chef, projet_parent_id: parentId },
                user: req.user,
            }, fakeRes);
            if (out.code >= 400 || !out.body || !out.body.id) return res.status(out.code >= 400 ? out.code : 500).json({ error: (out.body && out.body.error) || 'Création du projet impossible' });

            await pgDb.run('UPDATE rencontres_budgetaires SET projet_id = ?, cp_presenti = COALESCE(?, cp_presenti), updated_at = CURRENT_TIMESTAMP WHERE id = ?', [out.body.id, chef, id]);
            res.status(201).json({ id: out.body.id, code: out.body.code, message: 'Projet créé et lié à la demande' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    statsDirections: async (req, res) => {
        try {
            const stats = await pgDb.all(`SELECT direction, COUNT(*) as count, SUM(cout_ttc) as montant_total FROM rencontres_budgetaires GROUP BY direction ORDER BY count DESC`);
            res.json(stats);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    statsAnnees: async (req, res) => {
        try {
            const stats = await pgDb.all(`SELECT annee, COUNT(*) as count, SUM(cout_ttc) as montant_total FROM rencontres_budgetaires WHERE annee IS NOT NULL GROUP BY annee ORDER BY annee DESC`);
            res.json(stats);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Participants
    addParticipant: async (req, res) => {
        try {
            const { id } = req.params;
            const { nom, role, email, statut } = req.body;
            const result = await pgDb.run(`INSERT INTO rencontres_participants (rencontre_id, nom, role, email, statut) VALUES (?, ?, ?, ?, ?)`, [id, nom, role, email, statut || 'en attente']);
            res.json({ id: result.lastID, message: 'Participant ajouté' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteParticipant: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM rencontres_participants WHERE id=?', [req.params.id]);
            res.json({ message: 'Participant supprimé' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Lien vers le ticket DSIHUB associé (le champ ticket_glpi stocke désormais l'id d'un ticket hub_tickets et non plus un ticket GLPI)
    ticketLink: async (req, res) => {
        try {
            const { id } = req.params;
            const rencontre = await pgDb.get('SELECT ticket_glpi FROM rencontres_budgetaires WHERE id=?', [id]);
            if (!rencontre || !rencontre.ticket_glpi) return res.json({ exists: false, message: 'Aucun ticket associé' });

            const ticketId = rencontre.ticket_glpi;
            const ticket = await pgDb.get('SELECT glpi_id FROM hub_tickets.tickets WHERE glpi_id=?', [ticketId]);
            if (!ticket) {
                await pgDb.run('UPDATE rencontres_budgetaires SET ticket_glpi=NULL WHERE id=?', [id]);
                return res.json({ exists: false, message: `Ticket #${ticketId} introuvable — lien supprimé` });
            }
            return res.json({ exists: true, url: `/tickets/${ticketId}`, message: `Ticket #${ticketId}` });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Suivi
    addSuivi: async (req, res) => {
        try {
            const { id } = req.params;
            const { action_item, responsable, date_echeance, statut } = req.body;
            const result = await pgDb.run(`INSERT INTO rencontres_suivi (rencontre_id, action_item, responsable, date_echeance, statut) VALUES (?, ?, ?, ?, ?)`, [id, action_item, responsable, date_echeance, statut || 'en cours']);
            res.json({ id: result.lastID, message: 'Action ajoutée' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    updateSuivi: async (req, res) => {
        try {
            const { id } = req.params;
            const { action_item, responsable, date_echeance, statut } = req.body;
            await pgDb.run(`UPDATE rencontres_suivi SET action_item=?, responsable=?, date_echeance=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [action_item, responsable, date_echeance, statut, id]);
            res.json({ message: 'Suivi mis à jour' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteSuivi: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM rencontres_suivi WHERE id=?', [req.params.id]);
            res.json({ message: 'Suivi supprimé' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Directions & Services
    getDirectionsServices: async (req, res) => {
        try {
            const fromParticipants = await pgDb.all(`SELECT DISTINCT direction, service FROM reunion_participants WHERE direction IS NOT NULL AND direction != '' ORDER BY direction, service`);
            const fromDemandes = await pgDb.all(`SELECT DISTINCT direction, service FROM rencontres_budgetaires WHERE direction IS NOT NULL AND direction != '' ORDER BY direction, service`);

            const all = [...fromParticipants, ...fromDemandes];
            const dirSet = new Set();
            const svcSet = new Set();
            const dirServicesMap = {};

            for (const row of all) {
                if (row.direction) {
                    const dir = String(row.direction).trim().replace(/\s+/g, ' ').toUpperCase();
                    dirSet.add(dir);
                    if (!dirServicesMap[dir]) dirServicesMap[dir] = new Set();
                    if (row.service) { svcSet.add(row.service); dirServicesMap[dir].add(row.service); }
                }
            }

            // Services réels de l'organigramme, rattachés à leur direction
            try {
                const org = await pgDb.all(`SELECT DISTINCT "DIRECTION_L" AS dir, "SERVICE_L" AS svc FROM oracle.rh_siim_organigramme WHERE "SERVICE_L" IS NOT NULL AND "DIRECTION_L" IS NOT NULL`);
                for (const o of org) {
                    const dir = String(o.dir).trim().replace(/\s+/g, ' ').toUpperCase();
                    const svc = String(o.svc).trim();
                    if (!svc || svc.toUpperCase() === dir) continue; // le « service » égal à la direction n'en est pas un
                    dirSet.add(dir);
                    svcSet.add(svc);
                    if (!dirServicesMap[dir]) dirServicesMap[dir] = new Set();
                    dirServicesMap[dir].add(svc);
                }
            } catch (e) { /* organigramme indisponible : on garde les données des demandes */ }

            const dirServicesFinal = {};
            for (const [dir, svcs] of Object.entries(dirServicesMap)) {
                // Dédoublonnage insensible à la casse/accents ; on garde la forme en majuscules (celle de l'organigramme) ;
                // un « service » identique à sa direction n'en est pas un.
                const key = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
                const byKey = new Map();
                for (const sv of [...svcs].filter(Boolean)) {
                    const k = key(sv);
                    if (!k || k === key(dir)) continue;
                    const cur = byKey.get(k);
                    if (!cur || (sv === sv.toUpperCase() && cur !== cur.toUpperCase())) byKey.set(k, sv);
                }
                dirServicesFinal[dir] = [...byKey.values()].sort((x, y) => x.localeCompare(y, 'fr'));
            }

            res.json({ directions: [...dirSet].sort(), services: [...svcSet].sort(), dirServicesMap: dirServicesFinal });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Direction Emails
    getDirectionEmails: async (req, res) => {
        try {
            const data = await pgDb.all('SELECT id, direction, email, created_at FROM direction_emails ORDER BY direction, email');
            res.json(data || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    getDirectionEmailsByDirection: async (req, res) => {
        try {
            const data = await pgDb.all('SELECT id, direction, email FROM direction_emails WHERE direction = ? ORDER BY email', [req.params.direction]);
            res.json(data || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    addDirectionEmail: async (req, res) => {
        try {
            const { direction, email } = req.body;
            if (!direction || !email) return res.status(400).json({ error: 'Direction et email sont obligatoires' });
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Format email invalide' });

            await pgDb.run('INSERT INTO direction_emails (direction, email) VALUES (?, ?)', [direction.trim(), email.trim().toLowerCase()]);
            res.json({ message: 'Email ajouté avec succès', direction, email });
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') return res.status(400).json({ error: 'Cet email est déjà attribué' });
            res.status(500).json({ error: error.message });
        }
    },

    batchDirectionEmails: async (req, res) => {
        try {
            const { direction } = req.params;
            const { emails } = req.body;
            if (!direction || !Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: "Direction et liste d'emails sont obligatoires" });

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const invalidEmails = emails.filter(e => !emailRegex.test(e));
            if (invalidEmails.length > 0) return res.status(400).json({ error: 'Emails invalides: ' + invalidEmails.join(', ') });

            await pgDb.run('DELETE FROM direction_emails WHERE direction = ?', [direction.trim()]);
            const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()))];
            let inserted = 0, skipped = 0;

            for (const email of uniqueEmails) {
                try {
                    await pgDb.run('INSERT INTO direction_emails (direction, email) VALUES (?, ?)', [direction.trim(), email]);
                    inserted++;
                } catch (error) {
                    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') skipped++;
                    else throw error;
                }
            }

            res.json({ message: `Emails attribués à ${direction}`, inserted, skipped, total: uniqueEmails.length });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteDirectionEmail: async (req, res) => {
        try {
            const result = await pgDb.run('DELETE FROM direction_emails WHERE id = ?', [req.params.id]);
            if (result.changes === 0) return res.status(404).json({ error: 'Email non trouvé' });
            res.json({ message: 'Email supprimé avec succès' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    }
};
