const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { getSqlite, pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');

const MODULE = 'telecom';

module.exports = {
    // --- Operators ---
    getOperators: async (req, res) => {
        try {
            const db = getSqlite();
            const operators = await db.all('SELECT * FROM telecom_operators ORDER BY name');
            res.json(operators);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching operators', error: error.message });
        }
    },

    createOperator: async (req, res) => {
        const { name, logo_url } = req.body;
        try {
            const db = getSqlite();
            const result = await db.run('INSERT INTO telecom_operators (name, logo_url) VALUES (?, ?)', [name, logo_url]);
            res.json({ id: result.lastID, message: 'Opérateur créé' });
        } catch (error) {
            res.status(500).json({ message: 'Error creating operator', error: error.message });
        }
    },

    updateOperator: async (req, res) => {
        const { name, logo_url } = req.body;
        try {
            const db = getSqlite();
            await db.run('UPDATE telecom_operators SET name = ?, logo_url = ? WHERE id = ?', [name, logo_url, req.params.id]);
            res.json({ message: 'Opérateur mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating operator', error: error.message });
        }
    },

    deleteOperator: async (req, res) => {
        try {
            const db = getSqlite();
            await db.run('DELETE FROM telecom_operators WHERE id = ?', [req.params.id]);
            res.json({ message: 'Opérateur supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting operator', error: error.message });
        }
    },

    // --- Billing Accounts ---
    getBillingAccounts: async (req, res) => {
        try {
            const db = getSqlite();
            const { operator_id } = req.query;
            let query = `
                SELECT a.*, o.name as operator_name,
                       (SELECT COUNT(*) FROM telecom_invoices WHERE billing_account_id = a.id) as invoice_count,
                       (SELECT COALESCE(SUM(amount_ttc), 0) FROM telecom_invoices WHERE billing_account_id = a.id) as total_invoiced
                FROM telecom_billing_accounts a
                JOIN telecom_operators o ON a.operator_id = o.id
            `;
            let params = [];

            if (operator_id) {
                query += " WHERE a.operator_id = ?";
                params.push(operator_id);
            }

            query += " ORDER BY o.name, a.account_number";

            const accounts = await db.all(query, params);
            res.json(accounts);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching accounts', error: error.message });
        }
    },

    getOperatorAccounts: async (req, res) => {
        try {
            const db = getSqlite();
            const accounts = await db.all(`
                SELECT a.*, o.name as operator_name,
                       (SELECT COUNT(*) FROM telecom_invoices WHERE billing_account_id = a.id) as invoice_count,
                       (SELECT COALESCE(SUM(amount_ttc), 0) FROM telecom_invoices WHERE billing_account_id = a.id) as total_invoiced
                FROM telecom_billing_accounts a
                JOIN telecom_operators o ON a.operator_id = o.id
                WHERE a.operator_id = ?
                ORDER BY a.account_number
            `, [req.params.operatorId]);
            res.json(accounts);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching operator accounts', error: error.message });
        }
    },

    createBillingAccount: async (req, res) => {
        const {
            operator_id, account_number, type, designation,
            customer_number, market_number, function_code, commitment_number
        } = req.body;
        try {
            const db = getSqlite();
            const result = await db.run(`
                INSERT INTO telecom_billing_accounts 
                (operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number]);
            res.json({ id: result.lastID, message: 'Compte créé' });
        } catch (error) {
            res.status(500).json({ message: 'Error creating account', error: error.message });
        }
    },

    updateBillingAccount: async (req, res) => {
        const {
            operator_id, account_number, type, designation,
            customer_number, market_number, function_code, commitment_number
        } = req.body;
        try {
            const db = getSqlite();
            await db.run(`
                UPDATE telecom_billing_accounts 
                SET operator_id = ?, account_number = ?, type = ?, designation = ?, 
                    customer_number = ?, market_number = ?, function_code = ?, commitment_number = ? 
                WHERE id = ?
            `, [operator_id, account_number, type, designation, customer_number, market_number, function_code, commitment_number, req.params.id]);
            res.json({ message: 'Compte mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating account', error: error.message });
        }
    },

    deleteBillingAccount: async (req, res) => {
        try {
            const db = getSqlite();
            await db.run('DELETE FROM telecom_billing_accounts WHERE id = ?', [req.params.id]);
            res.json({ message: 'Compte supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting account', error: error.message });
        }
    },

    // --- Commitments ---
    getCommitments: async (req, res) => {
        try {
            const db = getSqlite();
            const commitments = await db.all(`
                SELECT c.*, o.name as operator_name, a.account_number
                FROM telecom_commitments c
                JOIN telecom_operators o ON c.operator_id = o.id
                LEFT JOIN telecom_billing_accounts a ON c.billing_account_id = a.id
                ORDER BY c.commitment_number
            `);
            res.json(commitments);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching commitments', error: error.message });
        }
    },

    createCommitment: async (req, res) => {
        const { commitment_number, label, amount, year, operator_name, function_code } = req.body;
        try {
            const db = getSqlite();
            const result = await db.run(`
                INSERT INTO telecom_commitments 
                (commitment_number, label, amount, year, operator_name, function_code) 
                VALUES (?, ?, ?, ?, ?, ?)
            `, [commitment_number, label, amount, year, operator_name, function_code]);
            res.json({ id: result.lastID, message: 'Engagement créé' });
        } catch (error) {
            res.status(500).json({ message: 'Error creating commitment', error: error.message });
        }
    },

    updateCommitment: async (req, res) => {
        const { commitment_number, label, amount, year, operator_name, function_code } = req.body;
        try {
            const db = getSqlite();
            await db.run(`
                UPDATE telecom_commitments 
                SET commitment_number = ?, label = ?, amount = ?, year = ?, operator_name = ?, function_code = ? 
                WHERE id = ?
            `, [commitment_number, label, amount, year, operator_name, function_code, req.params.id]);
            res.json({ message: 'Engagement mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating commitment', error: error.message });
        }
    },

    deleteCommitment: async (req, res) => {
        try {
            const db = getSqlite();
            await db.run('DELETE FROM telecom_commitments WHERE id = ?', [req.params.id]);
            res.json({ message: 'Engagement supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting commitment', error: error.message });
        }
    },

    // --- Invoices ---
    getInvoices: async (req, res) => {
        try {
            const db = getSqlite();
            const invoices = await db.all(`
                SELECT i.*, o.name as operator_name, a.account_number,
                (SELECT "Etat" FROM invoices WHERE LOWER(TRIM("N° Facture fournisseur")) = LOWER(TRIM(i.invoice_number)) LIMIT 1) as general_status
                FROM telecom_invoices i
                JOIN telecom_operators o ON i.operator_id = o.id
                LEFT JOIN telecom_billing_accounts a ON i.billing_account_id = a.id
                ORDER BY i.invoice_date DESC
            `);
            res.json(invoices);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching invoices', error: error.message });
        }
    },

    uploadInvoice: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        try {
            const db = getSqlite();
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            const content = pdfData.text;

            // Stratégie d'extraction 1 : Suppression de tous les espaces pour les libellés collés
            const flatContent = content.replace(/\s+/g, '');

            // Recherche du numéro de compte
            let account_number = null;
            const accountPatterns = [
                /N°decomptedefacturation[:\s]*(\d+)/i,
                /Compte[:\s]*(\d+)/i,
                /N°decompte[:\s]*(\d+)/i,
                /Facturationn°[:\s]*(\d+)/i
            ];

            for (const pattern of accountPatterns) {
                const match = flatContent.match(pattern);
                if (match) {
                    account_number = match[1];
                    break;
                }
            }

            // Extraction numéro de facture
            const invNumRegex = /(?:Facture\s*n°|FactureN°|N°defacture)[:\s]*([A-Z0-9\-_]{3,20})/i;
            const invNumMatch = content.match(invNumRegex) || flatContent.match(invNumRegex);
            let invoice_number = invNumMatch ? invNumMatch[1] : 'Inconnu';

            if (invoice_number.endsWith('N')) {
                invoice_number = invoice_number.slice(0, -1);
            }

            // Extraction Montant TTC
            const amountRegex = /(?:Total\s*TTC|Montant\s*à\s*payer|MontantTTC)[:\s]*(\d+[.,]\d{2})/i;
            const amountMatch = content.match(amountRegex) || flatContent.match(amountRegex);
            let amount_ttc = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;

            // Extraction Date
            const dateMatch = content.match(/Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                flatContent.match(/Date:(\d{2}\/\d{2}\/\d{4})/i) ||
                content.match(/(\d{2}\/\d{2}\/\d{4})/);

            let invoice_date = null;
            if (dateMatch) {
                const [d, m, y] = dateMatch[1].split('/');
                invoice_date = `${y}-${m}-${d}`;
            }

            const { overwrite } = req.body;
            const existingInvoice = await db.get('SELECT id, file_path FROM telecom_invoices WHERE invoice_number = ?', [invoice_number]);

            if (existingInvoice && overwrite !== 'true') {
                return res.status(409).json({
                    message: `La facture n°${invoice_number} existe déjà. Souhaitez-vous la remplacer ?`,
                    invoice_number
                });
            }

            let operator_id = null;
            let billing_account_id = null;

            const allAccounts = await db.all('SELECT id, operator_id, account_number FROM telecom_billing_accounts');

            // 1. Essayer le numéro de compte extrait explicitement
            if (account_number) {
                const acc = allAccounts.find(a => a.account_number === account_number);
                if (acc) {
                    billing_account_id = acc.id;
                    operator_id = acc.operator_id;
                }
            }

            // 2. Si pas trouvé, chercher si un des numéros de compte connus apparaît dans le texte (flatContent)
            if (!billing_account_id) {
                for (const acc of allAccounts) {
                    if (flatContent.includes(acc.account_number)) {
                        billing_account_id = acc.id;
                        operator_id = acc.operator_id;
                        break;
                    }
                }
            }

            // 3. Si toujours pas de compte, essayer de matcher au moins l'opérateur par son nom
            if (!operator_id) {
                const operators = await db.all('SELECT id, name FROM telecom_operators');
                for (const op of operators) {
                    if (content.toUpperCase().includes(op.name.toUpperCase())) {
                        operator_id = op.id;
                        break;
                    }
                }
            }

            // Corrige l'encodage et sauvegarde via storage
            if (req.file && req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);
            const saved = await storage.saveFile(MODULE, invoice_number || Date.now(), req.file);

            let finalId = existingInvoice ? existingInvoice.id : null;

            if (existingInvoice && overwrite === 'true') {
                if (existingInvoice.file_path) {
                    if (storage.isStoragePath(existingInvoice.file_path)) {
                        await storage.deleteFile(existingInvoice.file_path);
                    } else {
                        const oldPath = path.join(__dirname, '..', '..', existingInvoice.file_path);
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    }
                }
                await db.run(
                    'UPDATE telecom_invoices SET operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ?, file_path = ?, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [operator_id, billing_account_id, amount_ttc, invoice_date, saved.dbPath, existingInvoice.id]
                );
            } else {
                const result = await db.run(
                    'INSERT INTO telecom_invoices (invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, file_path) VALUES (?, ?, ?, ?, ?, ?)',
                    [invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, saved.dbPath]
                );
                finalId = result.lastID;
            }

            // Dual-write hub_docs (viewer central)
            try {
                const docsService = require('../../shared/documents.service');
                await docsService.registerExternalUpload({
                    module: 'telecom',
                    entityType: 'invoice',
                    entityId: finalId,
                    title: invoice_number || req.file.originalname,
                    filename: saved.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    storageRef: saved.dbPath,
                    metadata: { invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date },
                    uploadedBy: req.user?.username || null,
                });
            } catch (e) { console.warn('[DOCS] register failed:', e.message); }

            res.json({
                id: finalId,
                invoice_number,
                account_number,
                amount_ttc,
                invoice_date,
                operator_id,
                billing_account_id,
                file_path: saved.dbPath,
                message: existingInvoice ? 'Facture mise à jour' : 'Analyse terminée'
            });
        } catch (error) {
            res.status(500).json({ message: 'Error processing PDF', error: error.message });
        }
    },

    updateInvoice: async (req, res) => {
        let { invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date } = req.body;
        if (invoice_number && invoice_number.endsWith('N')) {
            invoice_number = invoice_number.slice(0, -1);
        }
        try {
            const db = getSqlite();
            await db.run(
                'UPDATE telecom_invoices SET invoice_number = ?, operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ? WHERE id = ?',
                [invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, req.params.id]
            );
            res.json({ message: 'Facture mise à jour avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating invoice', error: error.message });
        }
    },

    deleteInvoice: async (req, res) => {
        try {
            const db = getSqlite();
            const inv = await db.get('SELECT file_path FROM telecom_invoices WHERE id = ?', [req.params.id]);
            if (inv && inv.file_path) {
                if (storage.isStoragePath(inv.file_path)) {
                    await storage.deleteFile(inv.file_path);
                } else {
                    const fullPath = path.join(__dirname, '..', '..', inv.file_path);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
            }
            await db.run('DELETE FROM telecom_invoices WHERE id = ?', [req.params.id]);
            res.json({ message: 'Facture supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting invoice', error: error.message });
        }
    }
};
