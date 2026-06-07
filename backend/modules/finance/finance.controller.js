const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getSqlite, pool, pgDb } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');

function findVal(obj, keys) {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        const lower = k.toLowerCase();
        if (obj[lower] !== undefined && obj[lower] !== null) return obj[lower];
    }
    return '';
}

function parseNum(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = parseFloat(String(val).trim().replace(',', '.').replace(/[^\d.\-]/g, ''));
    return isNaN(num) ? 0 : num;
}

// --- Lignes d'exécution budgétaires (oracle.budget_lines) ---
// Colonnes telles qu'exportées depuis SEDIT (« Liste des lignes d'exécution »).
const BUDGET_LINE_TEXT_COLS = [
    'Code', 'Libellé', 'Masque', 'Sens', 'Section', 'Article par nature',
    'Chapitre par nature', 'Référence Fonctionnelle', "Opération d'équipement",
    'Service Gestionnaire', 'EQUIPEMENT', 'TVA', 'JE'
];
const BUDGET_LINE_NUM_COLS = [
    'Budget voté', 'Disponible', 'Mt. prévision', 'Mt. pré-engagé', 'Mt. engagé',
    'Mt. facturé', 'Mt. pré-mandaté', 'Mt. mandaté', 'Mt. payé'
];

async function ensureBudgetLinesTable(client) {
    const cols = [
        '"id" SERIAL PRIMARY KEY',
        ...BUDGET_LINE_TEXT_COLS.map(c => `"${c}" TEXT`),
        ...BUDGET_LINE_NUM_COLS.map(c => `"${c}" NUMERIC`),
        '"imported_at" TIMESTAMPTZ DEFAULT now()'
    ].join(', ');
    const runner = client || pool;
    await runner.query('CREATE SCHEMA IF NOT EXISTS oracle');
    await runner.query(`CREATE TABLE IF NOT EXISTS oracle.budget_lines (${cols})`);
}

// --- Engagements budgétaires (oracle.budget_engagements) ---
// Colonnes telles qu'exportées depuis SEDIT (« Liste des engagements »).
const ENGAGEMENT_NUM_COLS = [
    'Reste engagé', 'Montant initial', 'Montant HT', 'Montant TVA', 'Montant TTC',
    'Montant budgétaire', 'Montant service fait', 'Montant rattachement'
];
const ENGAGEMENT_TEXT_COLS = [
    'Organisme', 'Budget', 'Exercice', 'Type', 'Code mouvement', 'Libellé mouvement',
    'Code tiers', 'Nom tiers', 'Complément tiers', 'Prénom tiers', 'Références bancaires',
    'N° ligne', 'Libellé', 'Imputation', 'Sens', 'Section', 'Article par nature',
    'Chapitre par nature', 'Référence Fonctionnelle', "Opération d'équipement",
    'Service Gestionnaire', 'EQUIPEMENT', 'TVA', 'JE', 'Régime TVA', 'Avancement',
    'Taux TVA', 'Coefficient de déduction TVA', 'Date service fait', 'Immobilisation',
    'Facture', 'Facture tiers', 'Commande', 'Marché', 'Tranche',
    "Code nomenclature d'achat", "Libellé nomenclature d'achat", 'Mvt. provisionnel/Anticipé',
    'type Prov/Ant', 'Mandat', 'Bordereau', 'Date mandat', 'Type mandat',
    'Mandat rattachement', 'Exercice de rattachement', 'Contrepassation'
];

async function ensureEngagementsTable(client) {
    const cols = [
        '"id" SERIAL PRIMARY KEY',
        ...ENGAGEMENT_TEXT_COLS.map(c => `"${c}" TEXT`),
        ...ENGAGEMENT_NUM_COLS.map(c => `"${c}" NUMERIC`),
        '"imported_at" TIMESTAMPTZ DEFAULT now()'
    ].join(', ');
    const runner = client || pool;
    await runner.query('CREATE SCHEMA IF NOT EXISTS oracle');
    await runner.query(`CREATE TABLE IF NOT EXISTS oracle.budget_engagements (${cols})`);
}

// Déduit le type d'engagement à partir du libellé mouvement / code mouvement.
// Reports (investissement) et rattachements (fonctionnement) sont les engagements
// repris de l'exercice précédent (codes 24D…, 25D…).
function deriveEngagementType(row) {
    const lib = (row['Libellé mouvement'] || row['Libellé'] || '').toString().toUpperCase();
    if (lib.includes('REPORT')) return 'Report';
    if (lib.includes('RATTACH')) return 'Rattachement';
    return 'Engagement';
}

// Calcule le montant consommé (TTC des commandes liées) par opération.
// Source unique de vérité, utilisée à la fois pour l'affichage dynamique
// (getOperations) et pour la persistance (recalculateAllOperations).
// → { [operation_id]: used_amount }
const computeUsedMap = async () => {
    const usedMap = {};
    const links = await pgDb.all("SELECT target_id, operation_id FROM oracle.oracle_links WHERE target_table = 'orders' AND operation_id IS NOT NULL");
    if (links.length === 0) return usedMap;

    // Récupère les montants TTC en une seule requête (plutôt qu'un appel par lien).
    const ids = [...new Set(links.map(l => String(l.target_id).trim()))];
    const orderTotals = {};
    try {
        const { rows } = await pool.query(
            `SELECT TRIM("COMMANDE_COMMANDE") AS num, "COMMANDE_MONTANT_TTC" AS ttc
             FROM oracle.gf_oracle_commande WHERE TRIM("COMMANDE_COMMANDE") = ANY($1)`,
            [ids]
        );
        for (const r of rows) orderTotals[r.num] = parseNum(r.ttc);
    } catch (e) {
        console.error('[Finance] computeUsedMap montants:', e.message);
    }

    for (const link of links) {
        const opId = String(link.operation_id);
        const amt = orderTotals[String(link.target_id).trim()] || 0;
        usedMap[opId] = (usedMap[opId] || 0) + amt;
    }
    return usedMap;
};

const recalculateAllOperations = async () => {
    try {
        const usedMap = await computeUsedMap();
        const operations = await pgDb.all('SELECT id FROM oracle.operations');
        for (const op of operations) {
            const used = usedMap[String(op.id)] || 0;
            await pgDb.run('UPDATE oracle.operations SET used_amount = $1 WHERE id = $2', [used, op.id]);
        }
        console.log('[Finance] Synchronisation montants terminée.');
    } catch (error) {
        console.error('[Finance] Erreur synchronisation:', error);
    }
};

const deduplicateOperations = async () => {
    try {
        // Find duplicates grouped by the business key (LIBELLE, Section, exercice)
        const dupes = await pool.query(`
            SELECT LOWER(TRIM("LIBELLE")) AS lib, COALESCE("Section",'') AS sec, COALESCE(exercice,'') AS ex,
                   COUNT(*) AS cnt, ARRAY_AGG(id ORDER BY id) AS ids
            FROM oracle.operations
            GROUP BY LOWER(TRIM("LIBELLE")), COALESCE("Section",''), COALESCE(exercice,'')
            HAVING COUNT(*) > 1
        `);
        if (dupes.rows.length === 0) {
            console.log('[Migration] Aucun doublon trouvé dans oracle.operations');
            return;
        }
        let totalDeleted = 0;
        for (const group of dupes.rows) {
            const ids = group.ids; // sorted by id asc
            // Check which duplicates have linked orders
            const linkCounts = {};
            for (const id of ids) {
                const res = await pool.query(
                    `SELECT COUNT(*) AS cnt FROM oracle.oracle_links WHERE operation_id = $1 AND target_table = 'orders'`,
                    [id]
                );
                linkCounts[id] = parseInt(res.rows[0].cnt);
            }
            // Keep the one with the most links (or the first/lowest id if tie)
            const sorted = [...ids].sort((a, b) => linkCounts[b] - linkCounts[a] || a - b);
            const keep = sorted[0];
            const toDelete = sorted.slice(1);
            // Reassign all oracle_links from deleted to kept operation
            await pool.query(
                `UPDATE oracle.oracle_links SET operation_id = $1 WHERE operation_id = ANY($2)`,
                [keep, toDelete]
            );
            // Remove the duplicates
            const del = await pool.query('DELETE FROM oracle.operations WHERE id = ANY($1)', [toDelete]);
            totalDeleted += del.rowCount;
            console.log(`[Migration] Doublon "${group.lib}": gardé id=${keep}, supprimé ids=${toDelete.join(',')}`);
        }
        console.log(`[Migration] ${totalDeleted} opérations en double supprimées.`);
    } catch (error) {
        console.error('[Migration] Erreur déduplication opérations:', error);
    }
};

module.exports = {
    recalculateAllOperations,
    deduplicateOperations,

    getOperations: async (req, res) => {
        const { fiscalYear } = req.query;
        try {
            let query = `SELECT o.*, (
                SELECT COUNT(*) FROM oracle.oracle_links l
                WHERE l.target_table = 'orders' AND l.operation_id = o.id
            ) AS orders_count
            FROM oracle.operations o`;
            const params = [];
            if (fiscalYear) {
                query += ' WHERE o.exercice = $1';
                params.push(String(fiscalYear));
            }
            const operations = await pgDb.all(query, params);
            // used_amount calculé dynamiquement à chaque lecture (dégrèvement immédiat
            // après affectation d'une commande, sans redémarrage du backend).
            try {
                const usedMap = await computeUsedMap();
                for (const op of operations) {
                    op.used_amount = usedMap[String(op.id)] || 0;
                }
            } catch (e) {
                console.error('[Finance] getOperations used_amount dynamique:', e.message);
            }
            res.json(operations);
        } catch (error) {
            console.error('[Finance] getOperations error:', error);
            res.status(500).json({ message: 'Erreur lors de la lecture des opérations', error: error.message });
        }
    },

    // Commandes associées à une opération (via oracle.oracle_links — même source que le badge de comptage).
    getOperationOrders: async (req, res) => {
        const id = req.params.id;
        try {
            const result = await pool.query(`
                SELECT c."COMMANDE_COMMANDE" AS num,
                       TRIM(CONCAT(COALESCE(c."COMMANDE_LIBELLE", ''), ' ', COALESCE(c."COMMANDE_CMD_LIBELLE2", ''))) AS libelle,
                       c."COMMANDE_CMD_DATECOMMANDE" AS date_commande,
                       c."SERVICEFI_LIBELLE" AS service,
                       c."section" AS section,
                       c."COMMANDE_MONTANT_HT" AS montant_ht,
                       c."COMMANDE_MONTANT_TTC" AS montant_ttc,
                       l.app_id AS app_id,
                       a.name AS app_label
                FROM oracle.oracle_links l
                JOIN oracle.commandes_with_section c ON TRIM(c."COMMANDE_COMMANDE") = l.target_id
                LEFT JOIN magapp.apps a ON a.id = l.app_id
                WHERE l.target_table = 'orders' AND l.operation_id = $1
                ORDER BY c."COMMANDE_CMD_DATECOMMANDE" DESC NULLS LAST`, [id]);

            const parseNum = (val) => {
                if (val === null || val === undefined || val === '') return 0;
                const num = parseFloat(String(val).trim().replace(',', '.').replace(/[^\d.\-]/g, ''));
                return isNaN(num) ? 0 : num;
            };
            const fmtEur = (val) => parseNum(val).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
            const fmtDate = (val) => {
                if (!val) return '';
                const d = new Date(val);
                return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('fr-FR');
            };
            const fmtSection = (s) => s === 'Fonctionnement' ? 'F' : s === 'Investissement' ? 'I' : (s || '');

            const columns = ['N° Commande', 'Libellé', 'Date', 'Service', 'Section', 'Montant HT', 'Montant TTC', 'Logiciel'].map(name => ({ name }));
            const rows = result.rows.map(r => ({
                'N° Commande': String(r.num || '').trim(),
                'Libellé': r.libelle || '',
                'Date': fmtDate(r.date_commande),
                'Service': r.service || '',
                'Section': fmtSection(r.section),
                'Montant HT': fmtEur(r.montant_ht),
                'Montant TTC': fmtEur(r.montant_ttc),
                'Logiciel': r.app_label || '',
                // Champs techniques (non affichés comme colonnes) pour l'association logiciel.
                _num: String(r.num || '').trim(),
                _app_id: r.app_id || null,
                _app_label: r.app_label || '',
            }));
            res.json({ columns, rows });
        } catch (error) {
            console.error(`[Finance] getOperationOrders(${id}) error:`, error);
            res.status(500).json({ message: 'Erreur lors de la lecture des commandes de l\'opération', error: error.message });
        }
    },

    // Colonnes réellement présentes dans oracle.operations (évite les erreurs SQL
    // quand le front renvoie des champs calculés comme orders_count).
    OPERATION_COLUMNS: [
        'budget_id', 'Service', 'Service Complément', 'LIBELLE', 'MCO', 'C. Fonc.',
        'C. Nature', 'Montant prévu', 'Terminé', 'Commentaire', 'Section',
        'exercice', 'CODE_FONCTION', 'montant_prevu',
    ],

    createOperation: async (req, res) => {
        const data = req.body;
        try {
            const allowed = module.exports.OPERATION_COLUMNS;
            const cols = Object.keys(data).filter(k => allowed.includes(k) && data[k] !== undefined);
            const vals = cols.map(k => data[k]);
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
            const quotedCols = cols.map(c => `"${c}"`).join(',');
            const result = await pgDb.run(
                `INSERT INTO oracle.operations (${quotedCols}) VALUES (${placeholders})`,
                vals
            );
            res.json({ id: result.lastID, message: 'Opération créée' });
        } catch (error) {
            console.error('[Finance] POST /operations error:', error);
            res.status(500).json({ message: 'Erreur creation', error: error.message });
        }
    },

    updateOperation: async (req, res) => {
        const id = req.params.id;
        const data = req.body;
        try {
            const allowed = module.exports.OPERATION_COLUMNS;
            const cols = Object.keys(data).filter(k => allowed.includes(k) && data[k] !== undefined);
            if (cols.length === 0) return res.json({ message: 'Aucun champ modifiable' });
            const sets = cols.map((k, i) => `"${k}" = $${i + 1}`).join(',');
            const vals = [...cols.map(k => data[k]), id];
            await pgDb.run(`UPDATE oracle.operations SET ${sets} WHERE id = $${cols.length + 1}`, vals);
            res.json({ message: 'Opération mise à jour' });
        } catch (error) {
            console.error(`[Finance] PUT /operations/${id} error:`, error);
            res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
        }
    },

    deleteOperation: async (req, res) => {
        const id = req.params.id;
        try {
            const result = await pgDb.run('DELETE FROM oracle.operations WHERE id = $1', [id]);
            if (result.changes > 0) {
                res.json({ message: 'Opération supprimée' });
            } else {
                res.status(404).json({ message: 'Opération non trouvée' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression', error: error.message });
        }
    },

    scanExercice: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (data.length === 0) return res.json({ year: null });

            const firstRow = data.find(row => row.Exercice || row.exercice || row.Annee || row.year);
            const year = firstRow ? (firstRow.Exercice || firstRow.exercice || firstRow.Annee || firstRow.year) : null;

            res.json({ year: year ? parseInt(year) : null });
        } catch (error) {
            res.status(500).json({ message: "Erreur lors du scan du fichier", error: error.message });
        }
    },

    importLines: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length === 0) return res.json({ message: '0 lignes importées' });

            const allCols = [...BUDGET_LINE_TEXT_COLS, ...BUDGET_LINE_NUM_COLS];
            const quotedKeys = allCols.map(c => `"${c}"`).join(',');
            const placeholders = allCols.map((_, i) => `$${i + 1}`).join(',');

            let imported = 0;
            const client = await pool.connect();
            try {
                await ensureBudgetLinesTable(client);
                await client.query('BEGIN');
                // Réimport = remplacement complet du référentiel des lignes d'exécution.
                await client.query('TRUNCATE oracle.budget_lines RESTART IDENTITY');
                for (const row of rows) {
                    const code = (row['Code'] || row.code || row['Numéro de compte'] || '').toString().trim();
                    if (!code) continue;

                    const values = allCols.map(col => {
                        if (BUDGET_LINE_NUM_COLS.includes(col)) return parseNum(row[col]);
                        const v = row[col];
                        return v === undefined || v === null ? null : String(v).trim();
                    });
                    await client.query(`INSERT INTO oracle.budget_lines (${quotedKeys}) VALUES (${placeholders})`, values);
                    imported++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            res.json({ message: `${imported} lignes d'exécution importées.` });
        } catch (error) {
            console.error('[Finance] Import Lines error:', error);
            res.status(500).json({ message: 'Erreur import lines', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    importInvoices: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length === 0) return res.json({ message: '0 factures importées' });

            let imported = 0;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const row of rows) {
                    const keys = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null);
                    const values = keys.map(k => row[k]);
                    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
                    const quotedKeys = keys.map(k => `"${k}"`).join(',');
                    await client.query(`INSERT INTO oracle.gf_oracle_facture (${quotedKeys}) VALUES (${placeholders})`, values);
                    imported++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            res.json({ message: `${imported} factures importées avec succès` });
        } catch (error) {
            console.error('[Finance] Import Invoices error:', error);
            res.status(500).json({ message: 'Erreur import invoices', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    importOrders: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length === 0) return res.json({ message: '0 commandes importées' });

            let imported = 0;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const row of rows) {
                    const keys = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null && k !== 'id' && k !== 'operation_id');
                    const values = keys.map(k => row[k]);
                    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
                    const quotedKeys = keys.map(k => `"${k}"`).join(',');
                    await client.query(`INSERT INTO oracle.gf_oracle_commande (${quotedKeys}) VALUES (${placeholders})`, values);
                    imported++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            await recalculateAllOperations();
            res.json({ message: `${imported} commandes importées avec succès` });
        } catch (error) {
            console.error('[Finance] Import Orders error:', error);
            res.status(500).json({ message: 'Erreur import orders', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    getInvoices: async (req, res) => {
        const { fiscalYear, budgetScope } = req.query;
        try {
            let params = [];
            let whereClauses = [];

            if (fiscalYear) {
                whereClauses.push(`(EXTRACT(YEAR FROM f."FACTURE_DATENTREE"::date) = $${params.length + 1} OR EXTRACT(YEAR FROM f."FACTURE_DATPAIPREV"::date) = $${params.length + 1})`);
                params.push(parseInt(fiscalYear));
            }

            if (budgetScope === 'Ville') {
                whereClauses.push(`TRIM(f."FACTURE_POBJ_EXTRACT_1") = $${params.length + 1}`);
                params.push('00');
            }

            let sql = `SELECT f.*, l.operation_id, ob."BUDGET_LIBELLE", ob."BUDGET_ROO_IMA_REF" FROM oracle.gf_oracle_facture f LEFT JOIN oracle.oracle_links l ON l.target_id = TRIM(f."FACTURE_FACTURE") AND l.target_table = 'invoices' LEFT JOIN (SELECT "BUDGET_BUDGET", MIN("BUDGET_ROO_IMA_REF") as "BUDGET_ROO_IMA_REF", MIN("BUDGET_LIBELLE") as "BUDGET_LIBELLE" FROM oracle.gf_oracle_budget GROUP BY "BUDGET_BUDGET") ob ON TRIM(f."FACTURE_POBJ_EXTRACT_1") = ob."BUDGET_BUDGET"`;

            if (whereClauses.length > 0) {
                sql += ' WHERE ' + whereClauses.join(' AND ');
            }

            console.log('[getInvoices] Query:', sql, 'Params:', params);
            const result = await pool.query(sql, params);
            console.log('[getInvoices] Result count:', result.rows.length, 'fiscalYear param:', fiscalYear);

            const cleaned = result.rows.map(row => {
                const budgetCode = String(row.BUDGET_ROO_IMA_REF || '').trim();
                const parseNum = (val) => {
                    if (!val || val === null || val === undefined) return 0;
                    const num = parseFloat(String(val).trim().replace(',', '.').replace(/[^\d.\-]/g, ''));
                    return isNaN(num) ? 0 : num;
                };
                return {
                    id: String(row.FACTURE_FACTURE || '').trim(),
                    'N° Facture interne': String(row.FACTURE_FACTURE || '').trim(),
                    'N° Facture fournisseur': String(row.FACTURE_REFERENCE || '').trim(),
                    'Fournisseur': String(row.FACTURE_LIBELLE2 || '').trim(),
                    'Libellé': String(row.FACTURE_LIBELLE1 || '').trim(),
                    'Montant TTC': parseNum(row.FACTURE_MONTANTTC_E),
                    'Budget': row.BUDGET_LIBELLE,
                    'Etat': row.FACETAT_LIBELLE,
                    'Arrivée': row.FACTURE_DATENTREE,
                    'Échéance': row.FACTURE_DATPAIPREV,
                    'Exercice': row.FACTURE_DATENTREE ? String(row.FACTURE_DATENTREE).substring(0, 4) : '',
                    BUDGET_CODE: budgetCode,
                    COMMANDE_ROO_IMA_REF: String(row.FACTURE_ROO_IMA_REF || '').trim(),
                    operation_id: row.operation_id,
                    FACTURE_FACTURE: row.FACTURE_FACTURE,
                    FACTURE_REFERENCE: row.FACTURE_REFERENCE,
                    FACTURE_LIBELLE1: row.FACTURE_LIBELLE1,
                    FACTURE_LIBELLE2: row.FACTURE_LIBELLE2,
                    FACTURE_MONTANTTC_E: parseNum(row.FACTURE_MONTANTTC_E),
                    FACTURE_DATENTREE: row.FACTURE_DATENTREE,
                    FACTURE_DATPAIPREV: row.FACTURE_DATPAIPREV,
                    FACETAT_LIBELLE: row.FACETAT_LIBELLE,
                    FACETAT_BLOCAGE: row.FACETAT_BLOCAGE,
                    SERVICEFI_CLEACCES: row.SERVICEFI_CLEACCES,
                    FACTURE_POBJ_EXTRACT_1: row.FACTURE_POBJ_EXTRACT_1
                };
            });

            res.json(cleaned);
        } catch (error) {
            console.error('[getInvoices]', error);
            res.status(500).json({ message: 'Erreur lecture factures', error: error.message });
        }
    },

    getLines: async (req, res) => {
        try {
            await ensureBudgetLinesTable();
            // NB : pas encore de distinction crédits 2026 / reports 2025 dans l'export,
            // on renvoie donc l'ensemble des lignes quel que soit l'exercice demandé.
            const allCols = [...BUDGET_LINE_TEXT_COLS, ...BUDGET_LINE_NUM_COLS];
            const select = allCols.map(c => `"${c}"`).join(', ');
            const result = await pool.query(
                `SELECT ${select} FROM oracle.budget_lines ORDER BY "Chapitre par nature", "Code"`
            );
            const cleaned = result.rows.map(row => {
                const out = {};
                for (const c of BUDGET_LINE_TEXT_COLS) out[c] = (row[c] || '').toString().trim();
                for (const c of BUDGET_LINE_NUM_COLS) out[c] = parseNum(row[c]);
                return out;
            });
            res.json(cleaned);
        } catch (error) {
            console.error('[Finance] getLines error:', error);
            res.status(500).json({ message: 'Erreur lecture lignes', error: error.message });
        }
    },

    importEngagements: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length === 0) return res.json({ message: '0 engagement importé' });

            const allCols = [...ENGAGEMENT_TEXT_COLS, ...ENGAGEMENT_NUM_COLS];
            const quotedKeys = allCols.map(c => `"${c}"`).join(',');
            const placeholders = allCols.map((_, i) => `$${i + 1}`).join(',');

            let imported = 0;
            const client = await pool.connect();
            try {
                await ensureEngagementsTable(client);
                await client.query('BEGIN');
                // Réimport = remplacement complet des engagements de l'exercice.
                await client.query('TRUNCATE oracle.budget_engagements RESTART IDENTITY');
                for (const row of rows) {
                    const code = (row['Code mouvement'] || '').toString().trim();
                    if (!code) continue;

                    const values = allCols.map(col => {
                        if (ENGAGEMENT_NUM_COLS.includes(col)) return parseNum(row[col]);
                        const v = row[col];
                        return v === undefined || v === null ? null : String(v).trim();
                    });
                    await client.query(`INSERT INTO oracle.budget_engagements (${quotedKeys}) VALUES (${placeholders})`, values);
                    imported++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            res.json({ message: `${imported} engagements importés.` });
        } catch (error) {
            console.error('[Finance] Import Engagements error:', error);
            res.status(500).json({ message: 'Erreur import engagements', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    getEngagements: async (req, res) => {
        try {
            await ensureEngagementsTable();
            const allCols = [...ENGAGEMENT_TEXT_COLS, ...ENGAGEMENT_NUM_COLS];
            const select = allCols.map(c => `"${c}"`).join(', ');
            const result = await pool.query(
                `SELECT ${select} FROM oracle.budget_engagements ORDER BY "Code mouvement"`
            );

            // Un engagement (Code mouvement) est éclaté en plusieurs lignes : par code
            // fonction, et par avancement. Les lignes E1 portent le solde restant engagé,
            // les lignes TR sont les mouvements (réalisé). On agrège donc par engagement :
            //   - Montant engagé (total)  = Σ "Montant TTC" de toutes les lignes
            //   - Reste engagé (solde)    = Σ "Reste engagé" (≈ Σ TTC des lignes E1)
            //   - Réalisé (consommé)      = Montant engagé − Reste engagé (≈ Σ TTC des lignes TR)
            const groups = {};
            for (const row of result.rows) {
                const code = (row['Code mouvement'] || '').toString().trim();
                if (!code) continue;
                let g = groups[code];
                if (!g) {
                    g = groups[code] = {
                        code, montant: 0, solde: 0,
                        section: '', tiers: '', libelle: '', imputation: '', chapitre: '', exercice: '',
                        commande: '', fonctions: new Set(), natures: new Set()
                    };
                }
                g.montant += parseNum(row['Montant TTC']);
                g.solde += parseNum(row['Reste engagé']);
                const fonc = (row['Référence Fonctionnelle'] || '').toString().trim(); if (fonc) g.fonctions.add(fonc);
                const nat = (row['Article par nature'] || '').toString().trim(); if (nat) g.natures.add(nat);
                if (!g.commande) { const c = (row['Commande'] || '').toString().trim(); if (c) g.commande = c; }
                if (!g.section) g.section = (row['Section'] || '').toString().trim();
                if (!g.tiers) g.tiers = (row['Nom tiers'] || '').toString().trim();
                if (!g.libelle) g.libelle = (row['Libellé mouvement'] || row['Libellé'] || '').toString().trim();
                if (!g.imputation) g.imputation = (row['Imputation'] || '').toString().trim();
                if (!g.chapitre) g.chapitre = (row['Chapitre par nature'] || '').toString().trim();
                if (!g.exercice) g.exercice = (row['Exercice'] || '').toString().trim();
            }

            const round2 = (n) => Math.round(n * 100) / 100;
            const cleaned = Object.values(groups).map(g => {
                const montant = round2(g.montant);
                const solde = round2(g.solde);
                const realise = round2(montant - solde);
                const type = deriveEngagementType({ 'Libellé mouvement': g.libelle });
                const natures = [...g.natures];

                let etat;
                if (Math.abs(solde) < 0.01) etat = 'Soldé';
                else if (montant > 0 && Math.abs(solde - montant) < 0.01) etat = 'Entier';
                else etat = 'Partiellement soldé';

                return {
                    'Code mouvement': g.code,
                    'Type mvt': type,
                    'État': etat,
                    'Libellé': g.libelle,
                    'Nom tiers': g.tiers,
                    'Section': g.section,
                    'Imputation': g.imputation,
                    'Article par nature': natures.join(', '),
                    'Chapitre par nature': g.chapitre,
                    'Référence Fonctionnelle': [...g.fonctions].join(', '),
                    'Montant engagé': montant,
                    'Réalisé': realise,
                    'Reste engagé': solde,
                    'Bon de commande': g.commande,
                    'Exercice': g.exercice,
                    has_bc: g.commande !== '',
                    is_ens: (type === 'Report' || type === 'Rattachement') && solde > 0.01,
                    is_telecom: natures.includes('6262')
                };
            }).sort((a, b) => a['Code mouvement'].localeCompare(b['Code mouvement']));

            res.json(cleaned);
        } catch (error) {
            console.error('[Finance] getEngagements error:', error);
            res.status(500).json({ message: 'Erreur lecture engagements', error: error.message });
        }
    },

    getOrders: async (req, res) => {
        const { fiscalYear, budgetScope } = req.query;
        try {
            let params = [];
            let whereClauses = [];

            if (fiscalYear) {
                whereClauses.push(`EXTRACT(YEAR FROM "COMMANDE_CMD_DATECOMMANDE"::date) = $${params.length + 1}`);
                params.push(parseInt(fiscalYear));
            }

            // Budget scope: 'Ville' = budget principal (BUDGET_BUDGET = '00')
            if (budgetScope === 'Ville') {
                whereClauses.push(`TRIM(c."BUDGET_BUDGET") = $${params.length + 1}`);
                params.push('00');
            }

            // Optimize: select only necessary columns instead of c.*
            let sql = `SELECT
                c."COMMANDE_COMMANDE",
                c."COMMANDE_ROO_IMA_REF",
                c."COMMANDE_LIBELLE",
                c."COMMANDE_CMD_LIBELLE2",
                c."COMMANDE_CMD_DATECOMMANDE",
                c."COMMANDE_CMD_COMMENTAIRE",
                c."COMMANDE_MONTANT_HT",
                c."COMMANDE_MONTANT_TVA",
                c."COMMANDE_MONTANT_TTC",
                c."COMMANDE_NB_LIGNES_COMMANDE",
                c."BUDGET_BUDGET",
                c."BUDGET_LIBELLE",
                c."TIERS_TIERS",
                c."SERVICEFI_CLEACCES",
                c."SERVICEFI_LIBELLE",
                c."section",
                l.operation_id,
                l.app_id
            FROM oracle.commandes_with_section c
            LEFT JOIN oracle.oracle_links l ON l.target_id = TRIM(c."COMMANDE_COMMANDE") AND l.target_table = 'orders'`;

            if (whereClauses.length > 0) {
                sql += ' WHERE ' + whereClauses.join(' AND ');
            }

            const result = await pool.query(sql, params);
            const pgRows = result.rows;

            // Get operations for labels
            const opResult = await pool.query('SELECT id, "LIBELLE" FROM oracle.operations');
            const opMap = {};
            opResult.rows.forEach(o => { opMap[o.id] = o.LIBELLE; });

            // Get apps (logiciels métier) for labels
            const appMap = {};
            try {
                const appResult = await pool.query('SELECT id, name FROM magapp.apps');
                appResult.rows.forEach(a => { appMap[a.id] = a.name; });
            } catch (e) { /* magapp.apps absent : on ignore */ }

            const parseNum = (val) => {
                if (!val || val === null || val === undefined) return 0;
                const num = parseFloat(String(val).trim().replace(',', '.').replace(/[^\d.\-]/g, ''));
                return isNaN(num) ? 0 : num;
            };

            const cleanedOrders = pgRows.map(order => {
                const orderId = String(order.COMMANDE_COMMANDE || '').trim();
                const operationId = order.operation_id || null;

                // Section comes directly from commandes_with_section view
                let section = order.section || order.Section || order.TYPE_SECTION || '';
                if (section === 'Fonctionnement') section = 'F';
                if (section === 'Investissement') section = 'I';

                // Debug first order
                if (orderId === pgRows[0]?.COMMANDE_COMMANDE) {
                    console.log('[getOrders] First order section value:', section, 'raw:', order.section, order.Section, order.TYPE_SECTION);
                }

                const htAmount = parseNum(order.COMMANDE_MONTANT_HT);
                const ttcAmount = parseNum(order.COMMANDE_MONTANT_TTC);

                const appId = order.app_id || null;

                const cleaned = {
                    id: orderId,
                    operation_id: operationId,
                    operation_label: operationId ? opMap[operationId] : null,
                    app_id: appId,
                    app_label: appId ? (appMap[appId] || null) : null,
                    section,
                    _lines: [],
                    _total_ht: htAmount,
                    _total_ttc: ttcAmount,
                    'N° Commande': orderId,
                    'Libellé': String((order.COMMANDE_LIBELLE || '') + ' ' + (order.COMMANDE_CMD_LIBELLE2 || '')).trim(),
                    'Date de la commande': order.COMMANDE_CMD_DATECOMMANDE,
                    'Montant HT': htAmount,
                    'Montant TTC': ttcAmount,
                    'Fournisseur': order.SERVICEFI_LIBELLE,
                    'Service émetteur': order.SERVICEFI_LIBELLE,
                    'Budget': order.BUDGET_LIBELLE,
                    order_number: orderId,
                    description: order.COMMANDE_LIBELLE,
                    provider: order.SERVICEFI_LIBELLE,
                    amount_ht: htAmount,
                    date: order.COMMANDE_CMD_DATECOMMANDE,
                    COMMANDE_ROO_IMA_REF: order.COMMANDE_ROO_IMA_REF,
                    BUDGET_BUDGET: order.BUDGET_BUDGET,
                    BUDGET_LIBELLE: order.BUDGET_LIBELLE,
                    TIERS_TIERS: order.TIERS_TIERS,
                    SERVICEFI_CLEACCES: order.SERVICEFI_CLEACCES,
                    SERVICEFI_LIBELLE: order.SERVICEFI_LIBELLE,
                    COMMANDE_COMMANDE: order.COMMANDE_COMMANDE,
                    COMMANDE_LIBELLE: order.COMMANDE_LIBELLE,
                    COMMANDE_CMD_LIBELLE2: order.COMMANDE_CMD_LIBELLE2,
                    COMMANDE_CMD_DATECOMMANDE: order.COMMANDE_CMD_DATECOMMANDE,
                    COMMANDE_CMD_COMMENTAIRE: order.COMMANDE_CMD_COMMENTAIRE,
                    COMMANDE_MONTANT_HT: htAmount,
                    COMMANDE_MONTANT_TVA: parseNum(order.COMMANDE_MONTANT_TVA),
                    COMMANDE_MONTANT_TTC: ttcAmount,
                    'Nb lignes': order.COMMANDE_NB_LIGNES_COMMANDE
                };

                return cleaned;
            });

            res.json(cleanedOrders);
        } catch (error) {
            console.error('[getOrders]', error);
            res.status(500).json({ message: 'Erreur lecture commandes', error: error.message });
        }
    },

    getOrderYears: async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT DISTINCT EXTRACT(YEAR FROM "COMMANDE_CMD_DATECOMMANDE"::timestamp) as year
                FROM oracle.gf_oracle_commande
                WHERE "COMMANDE_CMD_DATECOMMANDE" IS NOT NULL
                  AND "COMMANDE_CMD_DATECOMMANDE" != ''
                  AND "COMMANDE_CMD_DATECOMMANDE" ~ '^\\d{4}-'
                ORDER BY year DESC
            `);
            const years = result.rows.map(r => parseInt(r.year)).filter(y => !isNaN(y) && y > 2000);
            if (years.length > 0) return res.json(years);
            const currentYear = new Date().getFullYear();
            res.json([currentYear, currentYear - 1, currentYear - 2]);
        } catch (e) {
            console.error('[getOrderYears]', e.message);
            const currentYear = new Date().getFullYear();
            res.json([currentYear, currentYear - 1, currentYear - 2]);
        }
    },

    assignOperation: async (req, res) => {
        const { operation_id } = req.body;
        const order_id = req.params.id;
        try {
            // Resolve the order number from the database
            let nr = order_id;
            try {
                const result = await pool.query(`SELECT "COMMANDE_COMMANDE" FROM oracle.gf_oracle_commande WHERE "COMMANDE_COMMANDE" = $1 LIMIT 1`, [order_id.trim()]);
                if (result.rows.length > 0) {
                    nr = String(result.rows[0].COMMANDE_COMMANDE).trim();
                }
            } catch (e) { /* fallback: use order_id as nr */ }

            if (operation_id) {
                await pgDb.run(
                    `INSERT INTO oracle.oracle_links (target_table, target_id, operation_id) VALUES ('orders', $1, $2) ON CONFLICT (target_table, target_id) DO UPDATE SET operation_id = EXCLUDED.operation_id`,
                    [nr, operation_id]
                );
            } else {
                await pgDb.run(`UPDATE oracle.oracle_links SET operation_id = NULL WHERE target_table = 'orders' AND target_id = $1`, [nr]);
            }

            await recalculateAllOperations();
            res.json({ message: 'Affectation réussie' });
        } catch (error) {
            console.error('[assignOperation]', error);
            res.status(500).json({ message: 'Erreur affectation', error: error.message });
        }
    },

    bulkAssign: async (req, res) => {
        const { order_numbers, operation_id } = req.body;
        if (!Array.isArray(order_numbers)) return res.status(400).json({ message: 'Données invalides' });
        try {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const nr of order_numbers) {
                    if (operation_id) {
                        await client.query(
                            `INSERT INTO oracle.oracle_links (target_table, target_id, operation_id) VALUES ('orders', $1, $2) ON CONFLICT (target_table, target_id) DO UPDATE SET operation_id = EXCLUDED.operation_id`,
                            [nr.trim(), operation_id]
                        );
                    } else {
                        await client.query(`UPDATE oracle.oracle_links SET operation_id = NULL WHERE target_table = 'orders' AND target_id = $1`, [nr.trim()]);
                    }
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            await recalculateAllOperations();
            res.json({ message: 'Affectation groupée réussie' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur affectation groupée', error: error.message });
        }
    },

    // Associe (ou dissocie) une commande à un logiciel métier (magapp.apps).
    // Même principe que assignOperation : on stocke app_id sur la ligne oracle_links
    // de la commande, sans toucher à operation_id.
    assignApp: async (req, res) => {
        const { app_id } = req.body;
        const order_id = req.params.id;
        try {
            let nr = order_id;
            try {
                const result = await pool.query(`SELECT "COMMANDE_COMMANDE" FROM oracle.gf_oracle_commande WHERE "COMMANDE_COMMANDE" = $1 LIMIT 1`, [order_id.trim()]);
                if (result.rows.length > 0) nr = String(result.rows[0].COMMANDE_COMMANDE).trim();
            } catch (e) { /* fallback: use order_id */ }

            if (app_id) {
                await pgDb.run(
                    `INSERT INTO oracle.oracle_links (target_table, target_id, app_id) VALUES ('orders', $1, $2)
                     ON CONFLICT (target_table, target_id) DO UPDATE SET app_id = EXCLUDED.app_id`,
                    [nr, app_id]
                );
            } else {
                await pgDb.run(`UPDATE oracle.oracle_links SET app_id = NULL WHERE target_table = 'orders' AND target_id = $1`, [nr]);
            }
            res.json({ message: 'Association logiciel réussie' });
        } catch (error) {
            console.error('[assignApp]', error);
            res.status(500).json({ message: 'Erreur association logiciel', error: error.message });
        }
    }
};