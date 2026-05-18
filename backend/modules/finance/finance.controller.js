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

const recalculateAllOperations = async () => {
    try {
        const links = await pgDb.all("SELECT target_id, operation_id FROM oracle.oracle_links WHERE target_table = 'orders' AND operation_id IS NOT NULL");

        const orderTotals = {};
        for (const link of links) {
            try {
                const order = await pool.query(`SELECT "COMMANDE_MONTANT_TTC" FROM oracle.gf_oracle_commande WHERE "COMMANDE_COMMANDE" = $1`, [link.target_id.trim()]);
                if (order.rows.length > 0) {
                    orderTotals[link.target_id.trim()] = parseNum(order.rows[0].COMMANDE_MONTANT_TTC);
                }
            } catch (e) { /* skip */ }
        }

        const operations = await pgDb.all('SELECT id FROM oracle.operations');
        for (const op of operations) {
            const linkedOrders = links.filter(l => String(l.operation_id) === String(op.id));
            const used = linkedOrders.reduce((acc, l) => acc + (orderTotals[l.target_id.trim()] || 0), 0);
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
            let query = 'SELECT * FROM oracle.operations';
            const params = [];
            if (fiscalYear) {
                query += ' WHERE exercice = $1';
                params.push(String(fiscalYear));
            }
            const operations = await pgDb.all(query, params);
            res.json(operations);
        } catch (error) {
            console.error('[Finance] getOperations error:', error);
            res.status(500).json({ message: 'Erreur lors de la lecture des opérations', error: error.message });
        }
    },

    createOperation: async (req, res) => {
        const data = req.body;
        try {
            const cols = Object.keys(data).filter(k => data[k] !== undefined);
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
            const cols = Object.keys(data).filter(k => data[k] !== undefined);
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

            let imported = 0;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const row of rows) {
                    const code = row['Code'] || row.code || row['Numéro de compte'] || '';
                    if (!code) continue;

                    const keys = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null);
                    const values = keys.map(k => row[k]);
                    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
                    const quotedKeys = keys.map(k => `"${k}"`).join(',');
                    await client.query(`INSERT INTO oracle.budget_lines (${quotedKeys}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
                    imported++;
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            res.json({ message: `${imported} lignes importées ou mises à jour.` });
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
        const { fiscalYear, budgetScope } = req.query;
        try {
            // For now, return empty array as budget_lines sync is not yet implemented
            // TODO: Implement budget lines sync from Oracle
            res.json([]);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture lignes', error: error.message });
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
                l.operation_id
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

                const cleaned = {
                    id: orderId,
                    operation_id: operationId,
                    operation_label: operationId ? opMap[operationId] : null,
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
    }
};