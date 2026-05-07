const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');
const { getSqlite, pgDb } = require('../../shared/database');
const { excelDateToISO, parseOracleDate } = require('../../shared/utils');

// Forward declaration - sendMail will be injected
let sendMailFn = null;
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
                    sql += ` AND direction IN (${dirList.map(() => '?').join(',')})`;
                    params.push(...dirList);
                }
            } else if (!direction) {
                try {
                    const username = req.user.username;
                    if (username) {
                        const userDirections = await pgDb.all('SELECT direction FROM direction_emails WHERE email LIKE ? OR email LIKE ?', [`${username}@%`, `${username}%`]);
                        if (userDirections && userDirections.length > 0) {
                            const dirList = userDirections.map(d => d.direction);
                            sql += ` AND direction IN (${dirList.map(() => '?').join(',')})`;
                            params.push(...dirList);
                        }
                    }
                } catch (e) {
                    console.warn('Impossible de récupérer les directions:', e.message);
                }
            } else if (direction) {
                sql += ' AND direction = ?';
                params.push(direction);
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

            // CSV parsing
            const content = req.file.buffer.toString('utf-8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            if (lines.length < 2) return res.status(400).json({ error: 'Fichier CSV vide' });

            const headerLine = lines[0];
            const headers = headerLine.split(';').map(h => h.trim().replace(/^"|"$/g, ''));
            const suiviIndex = headers.findIndex(h => h.toLowerCase() === 'suivi');

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(';').map(v => v.trim().replace(/^"|"$/g, ''));
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
                    let coutTTC = 0;
                    if (row['Cout TTC'] && row['Cout TTC'] !== '') {
                        coutTTC = parseFloat(String(row['Cout TTC']).replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
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
                    const suivi = suiviRaw && suiviRaw.toLowerCase() !== 'undefined' && suiviRaw.toLowerCase() !== 'null' && suiviRaw !== '' ? suiviRaw : '';

                    await pgDb.run(
                        `INSERT INTO rencontres_budgetaires
                        (direction, service, date_reunion, annee, type, titre, description, cout_ttc,
                         arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, suivi, statut)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importée')`,
                        [direction, service, dateReunion, annee, type, titre, description, coutTTC, arbitrage, responsableDsi, ticketGlpi, lienReference, commentaires, suivi]
                    );
                    imported++;
                } catch (lineError) {
                    errors.push(`Ligne ${i + 2}: ${lineError.message}`);
                }
            }

            await db.run('INSERT INTO import_logs (type, username) VALUES (?, ?)', ['rencontres_budgetaires', req.user.username]);

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
            const { titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires } = req.body;
            if (!titre || !direction) return res.status(400).json({ error: 'Titre et Direction sont obligatoires' });

            const result = await pgDb.run(
                `INSERT INTO rencontres_budgetaires (titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planifiée')`,
                [titre, direction, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires]
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
            const { titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut } = req.body;
            await pgDb.run(
                `UPDATE rencontres_budgetaires SET titre=?, direction=?, service=?, date_reunion=?, annee=?, type=?, description=?, cout_ttc=?, arbitrage=?, responsable_dsi=?, ticket_glpi=?, lien_reference=?, commentaires=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                [titre, direction, service, date_reunion, annee, type, description, cout_ttc, arbitrage, responsable_dsi, ticket_glpi, lien_reference, commentaires, statut, id]
            );
            res.json({ message: 'Rencontre mise à jour' });
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

    // GLPI Link
    glpiLink: async (req, res) => {
        try {
            const db = getSqlite();
            const { id } = req.params;
            const rencontre = await pgDb.get('SELECT ticket_glpi FROM rencontres_budgetaires WHERE id=?', [id]);
            if (!rencontre || !rencontre.ticket_glpi) return res.json({ exists: false, message: 'Aucun ticket GLPI associé' });

            const ticketId = rencontre.ticket_glpi;
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url || !settings.is_enabled) return res.json({ exists: true, url: null, message: `Ticket #${ticketId} (GLPI non configuré)` });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            const baseUrl = url.replace(/\/apirest\.php$/, '');
            const commonHeaders = { 'App-Token': settings.app_token.trim(), 'Content-Type': 'application/json', 'Accept': 'application/json' };
            const authHeader = (settings.login && settings.password) ? `Basic ${Buffer.from(`${settings.login}:${settings.password}`).toString('base64')}` : `user_token ${settings.user_token}`;

            try {
                const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader }, timeout: 8000 });
                const sessionToken = sessionRes.data?.session_token;
                if (!sessionToken) return res.json({ exists: true, url: `${baseUrl}/front/ticket.form.php?id=${ticketId}`, message: `Ticket #${ticketId}` });
                try {
                    await axios.get(`${url}/Ticket/${ticketId}?session_token=${sessionToken}`, { headers: commonHeaders, timeout: 8000 });
                    await axios.get(`${url}/killSession`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } }).catch(() => {});
                    return res.json({ exists: true, url: `${baseUrl}/front/ticket.form.php?id=${ticketId}`, message: `Ticket #${ticketId}` });
                } catch (e) {
                    await axios.get(`${url}/killSession`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } }).catch(() => {});
                    if (e.response?.status === 404) {
                        await pgDb.run('UPDATE rencontres_budgetaires SET ticket_glpi=NULL WHERE id=?', [id]);
                        return res.json({ exists: false, message: `Ticket #${ticketId} introuvable dans GLPI — lien supprimé` });
                    }
                    return res.json({ exists: true, url: `${baseUrl}/front/ticket.form.php?id=${ticketId}`, message: `Ticket #${ticketId}` });
                }
            } catch {
                return res.json({ exists: true, url: `${baseUrl}/front/ticket.form.php?id=${ticketId}`, message: `Ticket #${ticketId}` });
            }
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
                    dirSet.add(row.direction);
                    if (!dirServicesMap[row.direction]) dirServicesMap[row.direction] = new Set();
                    if (row.service) { svcSet.add(row.service); dirServicesMap[row.direction].add(row.service); }
                }
            }

            const dirServicesFinal = {};
            for (const [dir, svcs] of Object.entries(dirServicesMap)) {
                dirServicesFinal[dir] = [...svcs].filter(Boolean).sort();
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
