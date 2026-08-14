const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { pgDb, pool } = require('../../shared/database');
const storage = require('../../shared/storage');

const MODULE = 'contrats';

// Helpers
function excelDateToISO(value) {
    if (!value) return null;
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
        const s = value.trim();
        const frMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (frMatch) {
            const day = parseInt(frMatch[1]);
            const month = parseInt(frMatch[2]);
            const year = parseInt(frMatch[3]);
            // Validate date components
            if (day < 1 || day > 31 || month < 1 || month > 12) return null;
            // Validate against actual month max days
            const testDate = new Date(year, month - 1, day);
            if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;
            return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
}

function toFloat(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseInt(String(v));
    return isNaN(n) ? null : n;
}

function toStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

// Miroir des colonnes de lien mono sur le contrat (dernière liaison ajoutée),
// pour garder la compat avec les vues/exports qui lisent les anciennes colonnes.
async function syncLinkMirror(db, contratId) {
    const latest = await db.get(`
        SELECT commande_type, commande_sedit, commande_numero, commande_libelle,
               commande_montant, engagement_code, engagement_libelle, lien_annee
        FROM hub_contrats.contrats_liaisons
        WHERE contrat_id = ?
        ORDER BY id DESC LIMIT 1`, [contratId]);
    await db.run(`UPDATE contrats SET
        commande_type = ?, commande_sedit = ?, commande_numero = ?,
        commande_libelle = ?, commande_montant = ?,
        engagement_code = ?, engagement_libelle = ?, lien_annee = ?
        WHERE id = ?`, [
        toStr(latest?.commande_type), toStr(latest?.commande_sedit), toStr(latest?.commande_numero),
        toStr(latest?.commande_libelle), latest?.commande_montant ?? null,
        toStr(latest?.engagement_code), toStr(latest?.engagement_libelle), latest?.lien_annee ?? null,
        contratId
    ]);
}

// Controller
module.exports = {
    // Compteur contrats expirés / expirant bientôt (pour badge dashboard)
    async getExpiryCount(req, res, db) {
        try {
            const [expiredRow, soonRow] = await Promise.all([
                db.get(`SELECT COUNT(*) as count FROM contrats
                        WHERE statut != 'archivé'
                        AND date_fin IS NOT NULL
                        AND date_fin < CURRENT_DATE`),
                db.get(`SELECT COUNT(*) as count FROM contrats
                        WHERE statut != 'archivé'
                        AND date_fin IS NOT NULL
                        AND date_fin >= CURRENT_DATE
                        AND date_fin <= CURRENT_DATE + INTERVAL '90 days'`)
            ]);
            res.json({ expired: Number(expiredRow.count), soon: Number(soonRow.count) });
        } catch (error) {
            console.error('Error getting contrat expiry count:', error);
            res.status(500).json({ expired: 0, soon: 0 });
        }
    },

    // Récupérer tous les contrats
    async getAll(req, res, db) {
        try {
            const contrats = await db.all(`
                SELECT
                    c.*,
                    t."TIERS_POBJ_EXTRACT_2" as tiers_nom,
                    a.name as app_nom,
                    COALESCE((
                        SELECT json_agg(json_build_object(
                            'id', l.id,
                            'commande_type', l.commande_type,
                            'commande_sedit', l.commande_sedit,
                            'commande_numero', l.commande_numero,
                            'commande_libelle', l.commande_libelle,
                    'commande_montant', l.commande_montant,
                    'date_commande', l.date_commande,
                    'engagement_code', l.engagement_code,
                            'engagement_libelle', l.engagement_libelle,
                            'lien_annee', l.lien_annee
                        ) ORDER BY l.id DESC)
                        FROM hub_contrats.contrats_liaisons l WHERE l.contrat_id = c.id
                    ), '[]') AS liaisons
                FROM contrats c
                LEFT JOIN LATERAL (
                    SELECT t2."TIERS_POBJ_EXTRACT_2"
                    FROM oracle.gf_oracle_tiers t2
                    WHERE TRIM(t2."TIERS_TIERS") = TRIM(COALESCE(c.tiers, ''))
                    ORDER BY t2."TIERS_DATEVALID" ASC NULLS LAST, TRIM(COALESCE(t2."TIERS_POBJ_EXTRACT_2", '')) ASC
                    LIMIT 1
                ) t ON TRUE
                LEFT JOIN magapp.apps a ON c.app_id = a.id
                ORDER BY c.date_fin ASC NULLS LAST, c.objet ASC
            `);
            res.json(contrats);
        } catch (error) {
            res.status(500).json({ message: 'Erreur', error: error.message });
        }
    },

    // Rechercher des bons de commande Sedit (filtres : libellé, tiers, montant, année).
    async searchCommandes(req, res) {
        try {
            const { q, tiers, montantMin, montantMax, year, limit } = req.query;
            const params = [];
            const where = [];

            if (q) {
                params.push(`%${q}%`, `%${q}%`);
                where.push(`(c."COMMANDE_COMMANDE" ILIKE $${params.length - 1} OR TRIM(CONCAT(COALESCE(c."COMMANDE_LIBELLE", ''), ' ', COALESCE(c."COMMANDE_CMD_LIBELLE2", ''))) ILIKE $${params.length})`);
            }
            if (tiers) {
                params.push(`%${tiers}%`, `%${tiers}%`);
                where.push(`(c."TIERS_TIERS" ILIKE $${params.length - 1} OR t."TIERS_POBJ_EXTRACT_2" ILIKE $${params.length})`);
            }
            const minF = parseFloat(montantMin);
            if (montantMin && !isNaN(minF)) { params.push(minF); where.push(`c."COMMANDE_MONTANT_TTC" >= $${params.length}`); }
            const maxF = parseFloat(montantMax);
            if (montantMax && !isNaN(maxF)) { params.push(maxF); where.push(`c."COMMANDE_MONTANT_TTC" <= $${params.length}`); }
            const y = parseInt(year);
            if (year && !isNaN(y)) { params.push(y); where.push(`EXTRACT(YEAR FROM c."COMMANDE_CMD_DATECOMMANDE") = $${params.length}`); }

            params.push(Math.min(parseInt(limit) || 100, 300));

            const sql = `
                SELECT
                    TRIM(c."COMMANDE_COMMANDE") AS numero,
                    TRIM(c."COMMANDE_ROO_IMA_REF") AS sedit_id,
                    TRIM(CONCAT(COALESCE(c."COMMANDE_LIBELLE", ''), ' ', COALESCE(c."COMMANDE_CMD_LIBELLE2", ''))) AS libelle,
                    TO_CHAR(c."COMMANDE_CMD_DATECOMMANDE", 'YYYY-MM-DD') AS date_commande,
                    c."COMMANDE_MONTANT_HT" AS montant_ht,
                    c."COMMANDE_MONTANT_TTC" AS montant_ttc,
                    TRIM(c."TIERS_TIERS") AS tiers_code,
                    t."TIERS_POBJ_EXTRACT_2" AS tiers_nom,
                    c."BUDGET_LIBELLE" AS budget_libelle,
                    c."SERVICEFI_LIBELLE" AS service_fi,
                    c.section
                FROM oracle.commandes_with_section c
                LEFT JOIN LATERAL (
                    SELECT t2."TIERS_POBJ_EXTRACT_2"
                    FROM oracle.gf_oracle_tiers t2
                    WHERE TRIM(t2."TIERS_TIERS") = TRIM(c."TIERS_TIERS")
                    ORDER BY t2."TIERS_DATEVALID" ASC NULLS LAST, TRIM(COALESCE(t2."TIERS_POBJ_EXTRACT_2", '')) ASC
                    LIMIT 1
                ) t ON TRUE
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY c."COMMANDE_CMD_DATECOMMANDE" DESC NULLS LAST
                LIMIT $${params.length}`;

            const result = await pool.query(sql, params);
            const rows = result.rows.map(r => ({
                numero: r.numero,
                sedit_id: r.sedit_id,
                libelle: r.libelle,
                date_commande: r.date_commande,
                montant_ht: r.montant_ht != null ? parseFloat(r.montant_ht) : null,
                montant_ttc: r.montant_ttc != null ? parseFloat(r.montant_ttc) : null,
                tiers_code: r.tiers_code,
                tiers_nom: r.tiers_nom || null,
                budget_libelle: r.budget_libelle || '',
                service_fi: r.service_fi || '',
                section: r.section || ''
            }));
            res.json(rows);
        } catch (error) {
            console.error('[Contrats] searchCommandes error:', error.message);
            res.status(500).json({ message: 'Erreur recherche commandes', error: error.message });
        }
    },

    // Rechercher des engagements budgétaires (agrégés par code mouvement).
    async searchEngagements(req, res) {
        try {
            const { q, tiers, year, montantMin, montantMax, limit } = req.query;
            const params = [];
            const where = [];

            if (q) {
                params.push(`%${q}%`, `%${q}%`);
                where.push(`(TRIM("Code mouvement") ILIKE $${params.length - 1} OR TRIM(COALESCE("Libellé mouvement", '') || ' ' || COALESCE("Libellé", '')) ILIKE $${params.length})`);
            }
            if (tiers) { params.push(`%${tiers}%`); where.push(`"Nom tiers" ILIKE $${params.length}`); }
            if (year) { params.push(String(year)); where.push(`TRIM("Exercice") = $${params.length}`); }
            const minF = parseFloat(montantMin);
            if (montantMin && !isNaN(minF)) { params.push(minF); where.push(`COALESCE("Montant TTC", 0) >= $${params.length}`); }
            const maxF = parseFloat(montantMax);
            if (montantMax && !isNaN(maxF)) { params.push(maxF); where.push(`COALESCE("Montant TTC", 0) <= $${params.length}`); }

            params.push(Math.min(parseInt(limit) || 100, 300));

            const sql = `
                SELECT
                    TRIM("Code mouvement") AS code,
                    TRIM(MAX(COALESCE("Libellé mouvement", ''))) AS libelle,
                    MAX("Nom tiers") AS tiers_nom,
                    MAX("Section") AS section,
                    MAX(TRIM("Imputation")) AS imputation,
                    MAX(TRIM("Exercice")) AS exercice,
                    MAX(TRIM(COALESCE("Commande", ''))) AS commande,
                    MAX("Article par nature") AS nature,
                    SUM(COALESCE("Montant TTC", 0)) AS montant,
                    SUM(COALESCE("Reste engagé", 0)) AS solde
                FROM oracle.budget_engagements
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                GROUP BY TRIM("Code mouvement")
                ORDER BY TRIM("Code mouvement")
                LIMIT $${params.length}`;

            const result = await pool.query(sql, params);
            const round2 = (x) => Math.round(x * 100) / 100;
            const rows = result.rows.map(r => {
                const montant = round2(parseFloat(r.montant) || 0);
                const solde = round2(parseFloat(r.solde) || 0);
                return {
                    code: r.code,
                    libelle: r.libelle || '',
                    tiers_nom: r.tiers_nom || '',
                    section: r.section || '',
                    imputation: r.imputation || '',
                    exercice: r.exercice || '',
                    commande: r.commande || '',
                    nature: r.nature || '',
                    montant,
                    solde,
                    realise: round2(montant - solde)
                };
            });
            res.json(rows);
        } catch (error) {
            console.error('[Contrats] searchEngagements error:', error.message);
            res.status(500).json({ message: 'Erreur recherche engagements', error: error.message });
        }
    },

    // Lier un bon de commande Sedit ou un engagement au contrat (plusieurs liens possibles).
    async linkCommande(req, res, db) {
        try {
            const b = req.body || {};
            const type = b.commande_type === 'engagement' ? 'engagement' : (b.commande_type === 'bc' ? 'bc' : '');
            if (!type) return res.status(400).json({ message: 'Type de lien invalide (bc ou engagement)' });

            const contrat = await db.get('SELECT id, tiers, raison_sociale FROM contrats WHERE id = ?', [req.params.id]);
            if (!contrat) return res.status(404).json({ message: 'Contrat non trouvé' });

            // Éviter de lier deux fois le même BC / engagement
            if (type === 'bc' && toStr(b.commande_sedit)) {
                const dup = await db.get('SELECT id FROM hub_contrats.contrats_liaisons WHERE contrat_id = ? AND commande_type = ? AND commande_sedit = ?', [req.params.id, 'bc', toStr(b.commande_sedit)]);
                if (dup) return res.status(400).json({ message: 'Ce bon de commande est déjà lié à ce contrat' });
            }
            if (type === 'engagement' && toStr(b.engagement_code)) {
                const dup = await db.get('SELECT id FROM hub_contrats.contrats_liaisons WHERE contrat_id = ? AND commande_type = ? AND engagement_code = ?', [req.params.id, 'engagement', toStr(b.engagement_code)]);
                if (dup) return res.status(400).json({ message: 'Cet engagement est déjà lié à ce contrat' });
            }

            const montantN = (b.montant_2026 !== undefined && b.montant_2026 !== null && b.montant_2026 !== '')
                ? toFloat(b.montant_2026) : null;

            // Normaliser la date (ISO complet ou timestamp -> YYYY-MM-DD) car la colonne est VARCHAR(20)
            const dateCmd = toStr(b.date_commande).slice(0, 10);

            await db.run(`INSERT INTO hub_contrats.contrats_liaisons (
                contrat_id, commande_type, commande_sedit, commande_numero, commande_libelle,
                commande_montant, date_commande, engagement_code, engagement_libelle, lien_annee
            ) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
                req.params.id, type,
                toStr(b.commande_sedit), toStr(b.commande_numero), toStr(b.commande_libelle),
                (b.commande_montant !== undefined && b.commande_montant !== null && b.commande_montant !== '')
                    ? toFloat(b.commande_montant) : null,
                dateCmd,
                toStr(b.engagement_code), toStr(b.engagement_libelle),
                new Date().getFullYear()
            ]);

            // Associer automatiquement le tiers de la commande / de l'engagement au contrat
            // (uniquement si le contrat n'en a pas déjà, pour ne pas écraser une saisie manuelle).
            const tiersCode = toStr(b.tiers_code);
            const tiersNom = toStr(b.tiers_nom);
            if (tiersCode && !contrat.tiers) await db.run('UPDATE contrats SET tiers = ? WHERE id = ?', [tiersCode, req.params.id]);
            if (tiersNom && !contrat.raison_sociale) await db.run('UPDATE contrats SET raison_sociale = ? WHERE id = ?', [tiersNom, req.params.id]);

            if (montantN !== null) await db.run('UPDATE contrats SET montant_2026 = ? WHERE id = ?', [montantN, req.params.id]);

            await syncLinkMirror(db, req.params.id);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Lien commande enregistré', contrat: updated });
        } catch (error) {
            console.error('[Contrats] linkCommande error:', error.message);
            res.status(500).json({ message: 'Erreur enregistrement lien', error: error.message });
        }
    },

    // Retirer une liaison précise (le montant 2026 est conservé).
    async unlinkLiaison(req, res, db) {
        try {
            const liaison = await db.get('SELECT id, contrat_id FROM hub_contrats.contrats_liaisons WHERE id = ?', [req.params.liaisonId]);
            if (!liaison) return res.status(404).json({ message: 'Lien non trouvé' });
            await db.run('DELETE FROM hub_contrats.contrats_liaisons WHERE id = ?', [req.params.liaisonId]);
            await syncLinkMirror(db, liaison.contrat_id);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [liaison.contrat_id]);
            res.json({ message: 'Lien commande retiré', contrat: updated });
        } catch (error) {
            console.error('[Contrats] unlinkLiaison error:', error.message);
            res.status(500).json({ message: 'Erreur retrait lien', error: error.message });
        }
    },

    // Créer un contrat
    async create(req, res, db) {
        try {
            const b = req.body;
            const result = await db.run(
                `INSERT INTO contrats (
                    svc, objet, budget, raison_sociale, tiers, app_id, type_contrat, type_bien, numero, annee_initiale,
                    direction, service, perimetre, nature, fonction,
                    date_debut, duree_annees, nb_reconductions, date_fin,
                    marche_contrat, piece, date_reconduction, reconduction,
                    montant_2022, montant_2023, montant_2024, montant_2025, montant_2026,
                    prevision_2026, prevision_2027, prevision_2028, prevision_2029, commentaires,
                    gti, gtr, penalite, indice_revision, formule_revision, sla_niveaux, numero_facture, contrat_renouvellement_id,
                    renouvellement_actuel, dates_verifiees
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    toStr(b.svc), toStr(b.objet), toStr(b.budget), toStr(b.raison_sociale), toStr(b.tiers), toInt(b.app_id), toStr(b.type_contrat), toStr(b.type_bien || 'logiciel'), toStr(b.numero),
                    toInt(b.annee_initiale), toStr(b.direction), toStr(b.service), toStr(b.perimetre),
                    toStr(b.nature), toStr(b.fonction), b.date_debut || null, toFloat(b.duree_annees),
                    toInt(b.nb_reconductions), b.date_fin || null, toStr(b.marche_contrat), toStr(b.piece),
                    toStr(b.date_reconduction), toStr(b.reconduction),
                    toFloat(b.montant_2022), toFloat(b.montant_2023), toFloat(b.montant_2024),
                    toFloat(b.montant_2025), toFloat(b.montant_2026),
                    toFloat(b.prevision_2026), toFloat(b.prevision_2027), toFloat(b.prevision_2028), toFloat(b.prevision_2029),
                    toStr(b.commentaires),
                    toStr(b.gti), toStr(b.gtr), toStr(b.penalite), toStr(b.indice_revision), toStr(b.formule_revision),
                    JSON.stringify(Array.isArray(b.sla_niveaux) ? b.sla_niveaux : []), toStr(b.numero_facture),
                    toInt(b.contrat_renouvellement_id), toInt(b.renouvellement_actuel ?? 0), toInt(b.dates_verifiees ?? 0)
                ]
            );
            const newContrat = await db.get('SELECT * FROM contrats WHERE id = ?', [result.lastID]);
            res.status(201).json(newContrat);
        } catch (error) {
            res.status(500).json({ message: 'Erreur création', error: error.message });
        }
    },

    // Mettre à jour un contrat
    async update(req, res, db) {
        try {
            const allowed = [
                'svc', 'objet', 'budget', 'raison_sociale', 'tiers', 'app_id', 'type_contrat', 'type_bien', 'numero', 'annee_initiale',
                'direction', 'service', 'perimetre', 'nature', 'fonction',
                'date_debut', 'duree_annees', 'nb_reconductions', 'date_fin',
                'marche_contrat', 'piece', 'date_reconduction', 'reconduction',
                'montant_2022', 'montant_2023', 'montant_2024', 'montant_2025', 'montant_2026',
                'prevision_2026', 'prevision_2027', 'prevision_2028', 'prevision_2029', 'commentaires',
                'gti', 'gtr', 'penalite', 'indice_revision', 'formule_revision', 'sla_niveaux', 'numero_facture',
                'commande_sedit', 'commande_numero', 'commande_type', 'commande_libelle',
                'commande_montant', 'engagement_code', 'engagement_libelle', 'lien_annee',
                'renouvellement_actuel', 'dates_verifiees'
            ];
            const updates = [];
            const values = [];
            allowed.forEach(f => {
                if (req.body[f] !== undefined) {
                    updates.push(`${f} = ?`);
                    if (f === 'app_id' || f === 'annee_initiale' || f === 'nb_reconductions' || f === 'lien_annee' || f === 'renouvellement_actuel' || f === 'dates_verifiees') {
                        values.push(toInt(req.body[f]));
                    } else if (f === 'duree_annees' || f.startsWith('montant_') || f.startsWith('prevision_') || f === 'commande_montant') {
                        values.push(toFloat(req.body[f]));
                    } else if (f === 'date_debut' || f === 'date_fin') {
                        // Colonnes DATE : une chaîne vide fait échouer l'UPDATE côté Postgres ("invalid input syntax for type date").
                        values.push(req.body[f] || null);
                    } else if (f === 'sla_niveaux') {
                        values.push(JSON.stringify(Array.isArray(req.body[f]) ? req.body[f] : []));
                    } else {
                        values.push(toStr(req.body[f]));
                    }
                }
            });
            if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ modifiable' });
            values.push(req.params.id);
            const updateSQL = `UPDATE contrats SET ${updates.join(', ')} WHERE id = ?`;
            await db.run(updateSQL, values);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Mis à jour', contrat: updated });
        } catch (error) {
            console.error('[Contrats] update error:', error.message);
            res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
        }
    },

    // Supprimer un contrat
    async delete(req, res, db) {
        try {
            const contrat = await db.get('SELECT id FROM contrats WHERE id = ?', [req.params.id]);
            if (!contrat) return res.status(404).json({ message: 'Contrat non trouvé' });
            await db.run('DELETE FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Contrat supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression', error: error.message });
        }
    },

    // Import Excel
    async uploadExcel(req, res, db) {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });

        try {
            const workbook = xlsx.read(req.file.buffer, { cellDates: true });

            const sheetName = workbook.SheetNames.find(n =>
                n.toLowerCase() === 'maintenances'
            ) || workbook.SheetNames[0];

            if (!sheetName) {
                return res.status(400).json({ message: 'Onglet "Maintenances" introuvable dans le fichier.' });
            }

            const sheet = workbook.Sheets[sheetName];

            // La ligne d'en-tête n'est pas toujours la ligne 1 : certains exports
            // ajoutent des lignes de synthèse (taux de reconduction, etc.) au-dessus
            // du tableau. On repère la vraie ligne d'en-tête en cherchant la cellule
            // "SVC", qui n'apparaît jamais ailleurs que dans l'en-tête.
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
            let headerRowIndex = rawRows.findIndex(r =>
                Array.isArray(r) && r.some(cell => typeof cell === 'string' && cell.trim().toUpperCase() === 'SVC')
            );
            if (headerRowIndex === -1) headerRowIndex = 0;

            const rows = xlsx.utils.sheet_to_json(sheet, { defval: null, range: headerRowIndex });

            const results = [];
            let inserted = 0, updated = 0, skipped = 0, errors = 0;

            for (const [index, row] of rows.entries()) {
                const objet = toStr(row['Objet (nom du logiciel)'] ?? row['Objet'] ?? '');
                const svcVal = toStr(row['SVC']);
                if (svcVal.toUpperCase() === 'SVC' || objet.toUpperCase() === 'OBJET') {
                    skipped++;
                    results.push({ row: index + 2, status: 'skipped', message: 'Ligne d\'en-tête ignorée' });
                    continue;
                }
                if (!objet) {
                    skipped++;
                    results.push({ row: index + 2, status: 'skipped', message: 'Objet manquant' });
                    continue;
                }

                const data = {
                    svc: toStr(row['SVC']),
                    objet,
                    budget: toStr(row['Budget']),
                    raison_sociale: toStr(row['RAISON SOCIALE']),
                    type_contrat: toStr(row['Type']),
                    annee_initiale: toInt(row['Année initiale']),
                    direction: toStr(row['Direction']),
                    service: toStr(row['Service']),
                    perimetre: toStr(row['Périmètre']),
                    nature: toStr(row['Nature']),
                    fonction: toStr(row['Fonction']),
                    date_debut: excelDateToISO(row['Date de début de contrat']),
                    duree_annees: toFloat(row['Durée (années)']),
                    nb_reconductions: toInt(row['Nb Reconduc.']),
                    date_fin: excelDateToISO(row['Date de fin de contrat']),
                    marche_contrat: toStr(row['Marché / Contrat'] ?? row['Marché / Contrat / D']),
                    piece: toStr(row['Pièce']),
                    date_reconduction: toStr(row['Date de reconduction']),
                    reconduction: toStr(row['Reconduction']),
                    montant_2022: toFloat(row['2022']),
                    montant_2023: toFloat(row['2023']),
                    montant_2024: toFloat(row['2024']),
                    montant_2025: toFloat(row['2025']),
                    montant_2026: toFloat(row['2026']),
                    prevision_2026: toFloat(row['Prévision 2026']),
                    prevision_2027: toFloat(row['Prévision 2027']),
                    prevision_2028: toFloat(row['Prévision 2028']),
                    prevision_2029: toFloat(row['Prévision 2029']),
                    commentaires: toStr(row['Commentaires'])
                };

                try {
                    // Check if contrat already exists by objet
                    const existing = await db.get('SELECT id FROM contrats WHERE objet = ?', [data.objet]);

                    if (existing) {
                        // UPDATE existing contrat (preserve tiers and app_id)
                        const updateFields = [
                            'svc', 'budget', 'raison_sociale', 'type_contrat', 'annee_initiale',
                            'direction', 'service', 'perimetre', 'nature', 'fonction',
                            'date_debut', 'duree_annees', 'nb_reconductions', 'date_fin',
                            'marche_contrat', 'piece', 'date_reconduction', 'reconduction',
                            'montant_2022', 'montant_2023', 'montant_2024', 'montant_2025', 'montant_2026',
                            'prevision_2026', 'prevision_2027', 'prevision_2028', 'prevision_2029', 'commentaires'
                        ];
                        const updateClauses = updateFields.map(f => `${f} = ?`);
                        const updateValues = updateFields.map(f => data[f]);
                        updateValues.push(existing.id);

                        await db.run(`UPDATE contrats SET ${updateClauses.join(', ')} WHERE id = ?`, updateValues);
                        updated++;
                        results.push({ row: index + 2, status: 'ok', action: 'updated', objet });
                    } else {
                        // INSERT new contrat
                        const query = `INSERT INTO contrats (
                                svc, objet, budget, raison_sociale, type_contrat, annee_initiale,
                                direction, service, perimetre, nature, fonction,
                                date_debut, duree_annees, nb_reconductions, date_fin,
                                marche_contrat, piece, date_reconduction, reconduction,
                                montant_2022, montant_2023, montant_2024, montant_2025, montant_2026,
                                prevision_2026, prevision_2027, prevision_2028, prevision_2029, commentaires
                            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
                        const values = [
                                data.svc, data.objet, data.budget, data.raison_sociale, data.type_contrat,
                                data.annee_initiale, data.direction, data.service, data.perimetre, data.nature, data.fonction,
                                data.date_debut, data.duree_annees, data.nb_reconductions, data.date_fin,
                                data.marche_contrat, data.piece, data.date_reconduction, data.reconduction,
                                data.montant_2022, data.montant_2023, data.montant_2024, data.montant_2025, data.montant_2026,
                                data.prevision_2026, data.prevision_2027, data.prevision_2028, data.prevision_2029, data.commentaires
                            ];
                        await db.run(query, values);
                        inserted++;
                        results.push({ row: index + 2, status: 'ok', action: 'inserted', objet });
                    }
                } catch (error) {
                    errors++;
                    console.error(`[Excel Import] Row ${index + 2} ERROR:`, error.message);
                    results.push({ row: index + 2, status: 'error', message: error.message, objet });
                }
            }

            res.json({ inserted, updated, skipped, errors, total: rows.length, results });
        } catch (error) {
            console.error('Erreur import Excel:', error.message);
            res.status(500).json({ message: 'Erreur traitement Excel', error: error.message });
        }
    },

    // Documents - Lister
    async getDocuments(req, res, db) {
        try {
            const docs = await db.all('SELECT * FROM contrat_documents WHERE contrat_id = ? ORDER BY est_principal DESC, uploaded_at DESC', [req.params.id]);
            res.json(docs);
        } catch (error) {
            res.status(500).json({ message: 'Erreur', error: error.message });
        }
    },

    // Documents - Ajouter
    async addDocument(req, res, db) {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const contrat = await db.get('SELECT id FROM contrats WHERE id = ?', [req.params.id]);
            if (!contrat) return res.status(404).json({ message: 'Contrat non trouvé' });

            const { nature = '', est_principal = '0' } = req.body;
            const isPrincipal = est_principal === '1' || est_principal === true;

            if (isPrincipal) {
                await db.run('UPDATE contrat_documents SET est_principal = 0 WHERE contrat_id = ?', [req.params.id]);
            }

            // Corrige l'encodage du nom de fichier
            if (req.file && req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);

            // Sauvegarde via le service de stockage unifié
            const saved = await storage.saveFile(MODULE, req.params.id, req.file);

            const result = await db.run(
                'INSERT INTO contrat_documents (contrat_id, file_path, file_name, nature, est_principal) VALUES (?,?,?,?,?)',
                [req.params.id, saved.dbPath, saved.filename, nature, isPrincipal ? 1 : 0]
            );

            // Dual-write hub_docs (viewer central)
            try {
                const docsService = require('../../shared/documents.service');
                await docsService.registerExternalUpload({
                    module: 'contrats',
                    entityType: 'attachment',
                    entityId: req.params.id,
                    title: nature || req.file.originalname,
                    filename: saved.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    storageRef: saved.dbPath,
                    metadata: { nature, est_principal: isPrincipal },
                    uploadedBy: req.user?.username || null,
                });
            } catch (e) { console.warn('[DOCS] register failed:', e.message); }

            if (isPrincipal) {
                await db.run(
                    'UPDATE contrats SET doc_principal_path = ?, doc_principal_nom = ? WHERE id = ?',
                    [saved.dbPath, req.file.originalname, req.params.id]
                );
            }

            const doc = await db.get('SELECT * FROM contrat_documents WHERE id = ?', [result.lastID]);
            res.status(201).json(doc);
        } catch (error) {
            res.status(500).json({ message: 'Erreur upload document', error: error.message });
        }
    },

    // Documents - Supprimer
    async deleteDocument(req, res, db) {
        try {
            const doc = await db.get('SELECT * FROM contrat_documents WHERE id = ? AND contrat_id = ?', [req.params.docId, req.params.id]);
            if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

            // Supprime via le service de stockage (nouveau ou legacy)
            if (storage.isStoragePath(doc.file_path)) {
                await storage.deleteFile(doc.file_path);
            } else {
                const fullPath = path.join(__dirname, '../../', doc.file_path);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }

            await db.run('DELETE FROM contrat_documents WHERE id = ?', [doc.id]);
            if (doc.est_principal) {
                await db.run('UPDATE contrats SET doc_principal_path = ?, doc_principal_nom = ? WHERE id = ?', ['', '', req.params.id]);
            }
            res.json({ message: 'Document supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression document', error: error.message });
        }
    },

    // Documents - Archiver / désarchiver
    async archiveDocument(req, res, db) {
        try {
            const doc = await db.get('SELECT * FROM contrat_documents WHERE id = ? AND contrat_id = ?', [req.params.docId, req.params.id]);
            if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
            const archive = req.body.archive ? 1 : 0;
            await db.run('UPDATE contrat_documents SET archive = ? WHERE id = ?', [archive, doc.id]);
            const updated = await db.get('SELECT * FROM contrat_documents WHERE id = ?', [doc.id]);
            res.json(updated);
        } catch (error) {
            res.status(500).json({ message: 'Erreur archivage document', error: error.message });
        }
    },

    // Renouvellement
    async updateRenewal(req, res, db) {
        const { renouvellement_statut, renouvellement_commentaire, nouvelle_date_fin } = req.body;
        try {
            const updates = ['renouvellement_statut = ?', 'renouvellement_commentaire = ?'];
            const values = [renouvellement_statut, renouvellement_commentaire || ''];
            if (nouvelle_date_fin) { updates.push('date_fin = ?'); values.push(nouvelle_date_fin); }
            values.push(req.params.id);
            await db.run(`UPDATE contrats SET ${updates.join(', ')} WHERE id = ?`, values);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Renouvellement mis à jour', contrat: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur renouvellement', error: error.message });
        }
    },

    // Archivage
    async updateStatus(req, res, db) {
        const { statut } = req.body;
        if (!['actif', 'archivé'].includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
        try {
            await db.run('UPDATE contrats SET statut = ? WHERE id = ?', [statut, req.params.id]);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: `Contrat ${statut}`, contrat: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur archivage', error: error.message });
        }
    },

    // ── Vues de colonnes partagées ("général") ─────────────────────────────────
    async listViews(req, res, db) {
        try {
            const rows = await db.all('SELECT id, nom, columns FROM hub_contrats.contrat_views ORDER BY nom ASC');
            res.json(rows.map(r => ({
                id: r.id,
                nom: r.nom,
                columns: typeof r.columns === 'string' ? (() => { try { return JSON.parse(r.columns); } catch { return []; } })() : (Array.isArray(r.columns) ? r.columns : [])
            })));
        } catch (error) {
            console.error('[Contrats] listViews error:', error.message);
            res.status(500).json({ message: 'Erreur liste vues', error: error.message });
        }
    },

    async saveView(req, res, db) {
        try {
            const nom = String(req.body?.nom || '').trim();
            if (!nom) return res.status(400).json({ message: 'Nom de vue requis' });
            const columns = Array.isArray(req.body?.columns) ? req.body.columns.filter(k => typeof k === 'string') : [];
            const colsJson = JSON.stringify(columns);
            const existing = await db.get('SELECT id FROM hub_contrats.contrat_views WHERE LOWER(nom) = LOWER(?)', [nom]);
            let view;
            if (existing) {
                await db.run('UPDATE hub_contrats.contrat_views SET columns = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [colsJson, existing.id]);
                view = { id: existing.id, nom, columns };
            } else {
                const result = await db.run('INSERT INTO hub_contrats.contrat_views (nom, columns) VALUES (?, ?)', [nom, colsJson]);
                view = { id: result.lastID, nom, columns };
            }
            res.json(view);
        } catch (error) {
            console.error('[Contrats] saveView error:', error.message);
            res.status(500).json({ message: 'Erreur sauvegarde vue', error: error.message });
        }
    },

    async deleteView(req, res, db) {
        try {
            await db.run('DELETE FROM hub_contrats.contrat_views WHERE id = ?', [req.params.id]);
            res.json({ message: 'Vue supprimée' });
        } catch (error) {
            console.error('[Contrats] deleteView error:', error.message);
            res.status(500).json({ message: 'Erreur suppression vue', error: error.message });
        }
    }
};
