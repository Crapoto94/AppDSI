const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');

const recalculateAllOperations = async () => {
    try {
        const db = getSqlite();
        const operations = await db.all('SELECT * FROM operations');
        const oracle_commande = await db.all('SELECT operation_id, "Montant TTC" FROM v_orders WHERE operation_id IS NOT NULL');

        for (const op of operations) {
            const linkedOrders = oracle_commande.filter(o => String(o.operation_id) === String(op.id));
            const used = linkedOrders.reduce((acc, o) => {
                let val = o["Montant TTC"];
                if (!val) return acc;
                const num = parseFloat(String(val).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
                return acc + num;
            }, 0);

            await db.run('UPDATE operations SET used_amount = ? WHERE id = ?', [used, op.id]);
        }
        console.log('[Finance] Synchronisation montants terminée.');
    } catch (error) {
        console.error('[Finance] Erreur synchronisation:', error);
    }
};

module.exports = {
    recalculateAllOperations,

    getOperations: async (req, res) => {
        const { fiscalYear } = req.query;
        let query = 'SELECT * FROM operations';
        const params = [];
        const where = [];

        if (fiscalYear) {
            where.push('exercice = ?');
            params.push(fiscalYear);
        }

        if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

        try {
            const db = getSqlite();
            const operations = await db.all(query, params);
            res.json(operations);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la lecture des opérations', error: error.message });
        }
    },

    createOperation: async (req, res) => {
        const data = req.body;
        try {
            const db = getSqlite();
            const tableCols = (await db.all('PRAGMA table_info(operations)')).map(c => c.name).filter(c => c !== 'id');
            const placeholders = tableCols.map(() => '?').join(',');
            const values = tableCols.map(c => data[c]);

            const result = await db.run(`INSERT INTO operations (${tableCols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, values);
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
            const db = getSqlite();
            const tableCols = (await db.all('PRAGMA table_info(operations)')).map(c => c.name).filter(c => c !== 'id');
            const sets = tableCols.map(c => `"${c}" = ?`).join(',');
            const values = [...tableCols.map(c => data[c]), id];

            await db.run(`UPDATE operations SET ${sets} WHERE id = ?`, values);
            res.json({ message: 'Opération mise à jour' });
        } catch (error) {
            console.error(`[Finance] PUT /operations/${id} error:`, error);
            res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
        }
    },

    deleteOperation: async (req, res) => {
        const id = req.params.id;
        logMouchard(`EXECUTION SQL: DELETE FROM operations WHERE id = ${id}`);
        try {
            const db = getSqlite();
            const result = await db.run('DELETE FROM operations WHERE id = ?', [id]);
            if (result.changes > 0) {
                logMouchard(`SUCCÈS: ${result.changes} ligne supprimée.`);
                res.json({ message: 'Opération supprimée' });
            } else {
                logMouchard(`ÉCHEC: Aucun enregistrement trouvé pour l'ID ${id}`);
                res.status(404).json({ message: 'Opération non trouvée' });
            }
        } catch (error) {
            logMouchard(`ERREUR SQL: ${error.message}`);
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
        const budgetId = req.body.budgetId;
        if (!budgetId) return res.status(400).send('budgetId is required.');

        try {
            const db = getSqlite();
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length > 0) {
                const firstRow = rows[0];
                for (const col of Object.keys(firstRow)) {
                    try {
                        await db.run(`ALTER TABLE budget_lines ADD COLUMN "${col}" TEXT`);
                    } catch (e) { }
                }
            }

            const tableColsInfo = await db.all("PRAGMA table_info(budget_lines)");
            const tableCols = tableColsInfo.map(c => c.name);

            let imported = 0;
            for (const row of rows) {
                const code = row['Code'] || row.code || row['Numéro de compte'] || '';
                const year = row.Exercice || row.exercice || row.Annee || row.year || '';
                if (!code) continue;

                const mappedRow = { budgetId };
                for (const col of tableCols) {
                    if (row[col] !== undefined) {
                        mappedRow[col] = row[col];
                    }
                }

                if (mappedRow.amount === undefined) {
                    let amount = row['Budget voté'] || row['Mt. prévision'] || row.Montant || row.allocated_amount || 0;
                    if (typeof amount === 'string') amount = parseFloat(amount.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
                    mappedRow.amount = amount;
                }

                const exists = await db.get('SELECT id FROM budget_lines WHERE ("Code" = ? OR code = ?) AND year = ? AND budgetId = ?', [code, code, year, budgetId]);
                const keys = Object.keys(mappedRow);
                const values = Object.values(mappedRow);
                const placeholders = keys.map(() => '?').join(',');

                if (exists) {
                    const updateStr = keys.map(k => `"${k}" = ?`).join(',');
                    await db.run(`UPDATE budget_lines SET ${updateStr} WHERE id = ?`, [...values, exists.id]);
                } else {
                    await db.run(`INSERT INTO budget_lines (${keys.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, values);
                }
                imported++;
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
        const budgetId = req.body.budgetId;
        if (!budgetId) return res.status(400).send('budgetId is required.');

        try {
            const db = getSqlite();
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            await db.run('DELETE FROM gf.invoices WHERE budgetId = ?', [budgetId]);

            if (rows.length > 0) {
                const firstRow = rows[0];
                for (const col of Object.keys(firstRow)) {
                    try {
                        await db.run(`ALTER TABLE gf.invoices ADD COLUMN "${col}" TEXT`);
                    } catch (e) { }
                }
            }

            const tableColsInfo = await db.all("PRAGMA table_info(invoices)", [], { database: 'gf' });
            const tableCols = tableColsInfo.map(c => c.name);

            let imported = 0;
            for (const row of rows) {
                const mappedRow = { budgetId };
                for (const col of tableCols) {
                    if (row[col] !== undefined) mappedRow[col] = row[col];
                }

                const keys = Object.keys(mappedRow);
                const values = Object.values(mappedRow);
                const placeholders = keys.map(() => '?').join(',');
                await db.run(`INSERT INTO gf.invoices (${keys.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`, values);
                imported++;
            }

            res.json({ message: `${imported} factures importées avec succès pour ce budget` });
        } catch (error) {
            console.error('[Finance] Import Invoices error:', error);
            res.status(500).json({ message: 'Erreur import invoices', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    importOrders: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        const budgetId = req.body.budgetId;
        if (!budgetId) return res.status(400).send('budgetId is required.');

        try {
            const db = getSqlite();
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            await db.run('DELETE FROM gf.oracle_commande WHERE budgetId = ?', [budgetId]);

            if (rows.length > 0) {
                const firstRow = rows[0];
                for (const col of Object.keys(firstRow)) {
                    try {
                        await db.run(`ALTER TABLE gf.oracle_commande ADD COLUMN "${col}" TEXT`);
                    } catch (e) { }
                }
            }

            const tableColsInfo = await db.all("PRAGMA table_info(oracle_commande)", [], { database: 'gf' });
            const tableCols = tableColsInfo.map(c => c.name).filter(c => c !== 'id' && c !== 'operation_id' && c !== 'budgetId');

            let imported = 0;
            for (const row of rows) {
                const keys = [];
                const values = [];
                for (const col of tableCols) {
                    if (row[col] !== undefined) {
                        keys.push(`"${col}"`);
                        values.push(row[col]);
                    }
                }

                const finalKeys = [...keys, 'budgetId'];
                const finalValues = [...values, budgetId];
                const placeholders = finalKeys.map(() => '?').join(',');
                await db.run(`INSERT INTO gf.oracle_commande (${finalKeys.join(',')}) VALUES (${placeholders})`, finalValues);
                imported++;
            }

            await recalculateAllOperations();
            res.json({ message: `${imported} commandes importées avec succès pour ce budget` });
        } catch (error) {
            console.error('[Finance] Import Orders error:', error);
            res.status(500).json({ message: 'Erreur import orders', error: error.message });
        } finally {
            if (req.file) fs.unlinkSync(req.file.path);
        }
    },

    getInvoices: async (req, res) => {
        const { fiscalYear, budgetScope } = req.query;
        let query = 'SELECT * FROM v_invoices';
        const params = [];
        const where = [];

        try {
            const db = getSqlite();
            const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
            const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';

            if (budgetScope === 'Ville' && fiscalYear) {
                where.push('TRIM(BUDGET_CODE) = ?');
                params.push(principalBudgetRef);
                where.push('("Exercice" = ? OR substr("Arrivée", 1, 4) = ?)');
                params.push(String(fiscalYear), String(fiscalYear));
            } else if (fiscalYear) {
                where.push('("Exercice" = ? OR substr("Arrivée", 1, 4) = ? OR budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
                params.push(String(fiscalYear), String(fiscalYear), parseInt(fiscalYear));
            }

            if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

            const invoices = await db.all(query, params);
            res.json(invoices);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture factures', error: error.message });
        }
    },

    getLines: async (req, res) => {
        const { fiscalYear, budgetScope } = req.query;
        let query = 'SELECT * FROM budget_lines';
        const params = [];
        const where = [];

        try {
            const db = getSqlite();
            const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
            const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';

            if (budgetScope === 'Ville' && fiscalYear) {
                where.push('TRIM("Code") = ?');
                params.push(principalBudgetRef);
                where.push('year = ?');
                params.push(fiscalYear);
            } else if (fiscalYear) {
                where.push('(year = ? OR budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
                params.push(fiscalYear, parseInt(fiscalYear));
            }

            if (where.length > 0) query += ' WHERE ' + where.join(' AND ');

            const lines = await db.all(query, params);
            res.json(lines);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture lignes', error: error.message });
        }
    },

    getOrders: async (req, res) => {
        const { fiscalYear, budgetScope } = req.query;
        try {
            const db = getSqlite();
            const viewColsInfo = await db.all("PRAGMA table_info(v_orders)");
            const excludedInternal = ['id', 'operation_id', 'budgetId', 'order_number', 'description', 'provider', 'amount_ht', 'date'];

            for (const col of viewColsInfo) {
                if (!excludedInternal.includes(col.name)) {
                    await db.run('INSERT OR IGNORE INTO column_settings (page, column_key, label, is_visible) VALUES (?, ?, ?, 1)', ['orders', col.name, col.name]);
                }
            }

            const settings = await db.all("SELECT column_key FROM column_settings WHERE page = 'orders' AND is_visible = 1");
            const validKeys = settings.map(s => s.column_key);

            let query = `
                SELECT o.*, op.LIBELLE as operation_label 
                FROM v_orders o 
                LEFT JOIN operations op ON o.operation_id = op.id
            `;
            const params = [];
            const whereClauses = [];

            const principalBudgetSetting = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = "budget_principal"');
            const principalBudgetRef = principalBudgetSetting ? principalBudgetSetting.setting_value.trim() : '00001000000000001901000';

            if (budgetScope === 'Ville' && fiscalYear) {
                whereClauses.push('TRIM(o.BUDGET_ROO_IMA_REF) = ?');
                params.push(principalBudgetRef);
                whereClauses.push('o.date LIKE ?');
                params.push(`${fiscalYear}%`);
            } else if (fiscalYear) {
                whereClauses.push('(o.date LIKE ? OR o.budgetId IN (SELECT id FROM budgets WHERE Annee = ?))');
                params.push(`${fiscalYear}%`, parseInt(fiscalYear));
            }

            if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ');
            query += ' ORDER BY o.id';

            const results = await db.all(query, params);
            const cleanedOrders = results.map(order => {
                const cleaned = {
                    id: order.id,
                    operation_id: order.operation_id,
                    operation_label: order.operation_label,
                    section: order.section || order.Section || ''
                };
                viewColsInfo.forEach(c => { cleaned[c.name] = order[c.name]; });
                validKeys.forEach(key => { if (!cleaned.hasOwnProperty(key)) cleaned[key] = order[key]; });
                return cleaned;
            });

            res.json(cleanedOrders);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture commandes', error: error.message });
        }
    },

    getOrderYears: async (req, res) => {
        try {
            const db = getSqlite();
            const rows = await db.all("SELECT DISTINCT substr(date, 1, 4) as year FROM v_orders WHERE date IS NOT NULL AND date != '' ORDER BY year DESC");
            const years = rows.map(r => parseInt(r.year)).filter(y => !isNaN(y) && y > 2000);
            res.json(years);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    },

    assignOperation: async (req, res) => {
        const { operation_id } = req.body;
        const order_id = req.params.id;
        try {
            const db = getSqlite();
            const order = await db.get('SELECT "N° Commande" FROM v_orders WHERE id = ?', [order_id]);
            if (!order) return res.status(404).json({ message: 'Commande non trouvée' });

            const nr = order['N° Commande'];

            if (operation_id) {
                await db.run(`
                    INSERT INTO oracle_links (target_table, target_id, operation_id) 
                    VALUES ('orders', ?, ?)
                    ON CONFLICT(target_table, target_id) DO UPDATE SET operation_id = excluded.operation_id
                `, [nr, operation_id]);
            } else {
                await db.run('UPDATE oracle_links SET operation_id = NULL WHERE target_table = "orders" AND target_id = ?', [nr]);
            }

            await recalculateAllOperations();
            res.json({ message: 'Affectation réussie' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur affectation', error: error.message });
        }
    },

    bulkAssign: async (req, res) => {
        const { order_numbers, operation_id } = req.body;
        if (!Array.isArray(order_numbers)) return res.status(400).json({ message: 'Données invalides' });
        try {
            const db = getSqlite();
            await db.run('BEGIN TRANSACTION');
            for (const nr of order_numbers) {
                if (operation_id) {
                    await db.run(`
                        INSERT INTO oracle_links (target_table, target_id, operation_id) 
                        VALUES ('orders', ?, ?)
                        ON CONFLICT(target_table, target_id) DO UPDATE SET operation_id = excluded.operation_id
                    `, [nr, operation_id]);
                } else {
                    await db.run('UPDATE oracle_links SET operation_id = NULL WHERE target_table = "orders" AND target_id = ?', [nr]);
                }
            }
            await db.run('COMMIT');
            await recalculateAllOperations();
            res.json({ message: 'Affectation groupée réussie' });
        } catch (error) {
            const db = getSqlite();
            await db.run('ROLLBACK');
            res.status(500).json({ message: 'Erreur affectation groupée' });
        }
    }
};
