const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { pgDb, pool } = require('../../shared/database');
const storage = require('../../shared/storage');

const MODULE = 'telecom';

module.exports = {
    // --- Operators ---
    getOperators: async (req, res) => {
        try {
            const operators = await pgDb.all('SELECT * FROM hub_telecom.operators ORDER BY name');
            res.json(operators);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching operators', error: error.message });
        }
    },

    createOperator: async (req, res) => {
        const { name, logo_url } = req.body;
        try {
            const result = await pgDb.run('INSERT INTO hub_telecom.operators (name, logo_url) VALUES (?, ?)', [name, logo_url]);
            res.json({ id: result.lastID, message: 'Opérateur créé' });
        } catch (error) {
            res.status(500).json({ message: 'Error creating operator', error: error.message });
        }
    },

    updateOperator: async (req, res) => {
        const { name, logo_url } = req.body;
        try {
            await pgDb.run('UPDATE hub_telecom.operators SET name = ?, logo_url = ? WHERE id = ?', [name, logo_url, req.params.id]);
            res.json({ message: 'Opérateur mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating operator', error: error.message });
        }
    },

    deleteOperator: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM hub_telecom.operators WHERE id = ?', [req.params.id]);
            res.json({ message: 'Opérateur supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting operator', error: error.message });
        }
    },

    // --- Billing Accounts ---
    getBillingAccounts: async (req, res) => {
        try {
            const { operator_id } = req.query;
            let query = `
                SELECT a.*, o.name as operator_name,
                       (SELECT COUNT(*) FROM hub_telecom.invoices WHERE billing_account_id = a.id) as invoice_count,
                       (SELECT COALESCE(SUM(amount_ttc), 0) FROM hub_telecom.invoices WHERE billing_account_id = a.id) as total_invoiced
                FROM hub_telecom.billing_accounts a
                JOIN hub_telecom.operators o ON a.operator_id = o.id
            `;
            let params = [];

            if (operator_id) {
                query += " WHERE a.operator_id = ?";
                params.push(operator_id);
            }

            query += " ORDER BY o.name, a.account_number";

            const accounts = await pgDb.all(query, params);
            res.json(accounts);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching accounts', error: error.message });
        }
    },

    getOperatorAccounts: async (req, res) => {
        try {
            const accounts = await pgDb.all(`
                SELECT a.*, o.name as operator_name,
                       (SELECT COUNT(*) FROM hub_telecom.invoices WHERE billing_account_id = a.id) as invoice_count,
                       (SELECT COALESCE(SUM(amount_ttc), 0) FROM hub_telecom.invoices WHERE billing_account_id = a.id) as total_invoiced
                FROM hub_telecom.billing_accounts a
                JOIN hub_telecom.operators o ON a.operator_id = o.id
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
            const result = await pgDb.run(`
                INSERT INTO hub_telecom.billing_accounts
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
            await pgDb.run(`
                UPDATE hub_telecom.billing_accounts
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
            await pgDb.run('DELETE FROM hub_telecom.billing_accounts WHERE id = ?', [req.params.id]);
            res.json({ message: 'Compte supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting account', error: error.message });
        }
    },

    // --- Commitments ---
    // Engagements télécom récupérés dynamiquement depuis les engagements budgétaires
    // (oracle.budget_engagements) : on ne garde que les engagements ayant au moins une
    // ligne de nature 6262 (télécom). Pas d'import à ce niveau.
    getTelecomEngagements: async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT "Code mouvement" AS code, "Montant TTC" AS ttc, "Reste engagé" AS reste,
                       "Article par nature" AS nat, "Libellé mouvement" AS lib, "Libellé" AS lib2,
                       "Nom tiers" AS tiers, "Exercice" AS ex, "Section" AS sec
                FROM oracle.budget_engagements
                WHERE "Code mouvement" IN (
                    SELECT "Code mouvement" FROM oracle.budget_engagements WHERE TRIM("Article par nature") = '6262'
                )
            `);

            const num = (v) => {
                if (v === null || v === undefined || v === '') return 0;
                const n = parseFloat(String(v).trim().replace(',', '.').replace(/[^\d.\-]/g, ''));
                return isNaN(n) ? 0 : n;
            };
            const round2 = (n) => Math.round(n * 100) / 100;

            const groups = {};
            for (const row of r.rows) {
                const code = (row.code || '').toString().trim();
                if (!code) continue;
                let g = groups[code];
                if (!g) g = groups[code] = { code, montant: 0, solde: 0, label: '', tiers: '', year: '', section: '' };
                g.montant += num(row.ttc);
                g.solde += num(row.reste);
                if (!g.label) g.label = (row.lib || row.lib2 || '').toString().trim();
                if (!g.tiers) g.tiers = (row.tiers || '').toString().trim();
                if (!g.year) g.year = (row.ex || '').toString().trim();
                if (!g.section) g.section = (row.sec || '').toString().trim();
            }

            const list = Object.values(groups).map(g => {
                const engaged = round2(g.montant);
                const remaining = round2(g.solde);
                const invoiced = round2(engaged - remaining); // réalisé / consommé
                return {
                    commitment_number: g.code,
                    label: g.label,
                    operator_name: g.tiers,
                    year: g.year,
                    section: g.section,
                    amount: engaged,
                    engaged_amount: engaged,
                    remaining_amount: remaining,
                    invoiced_amount: invoiced
                };
            }).sort((a, b) => a.commitment_number.localeCompare(b.commitment_number));

            res.json(list);
        } catch (error) {
            console.error('[Telecom] getTelecomEngagements error:', error);
            res.status(500).json({ message: 'Erreur lecture engagements télécom', error: error.message });
        }
    },

    // --- Invoices ---
    getInvoices: async (req, res) => {
        try {
            const invoices = await pgDb.all(`
                SELECT i.*, o.name as operator_name, a.account_number,
                (SELECT f."FACETAT_LIBELLE" FROM oracle.gf_oracle_facture f
                   WHERE LOWER(TRIM(f."FACTURE_REFERENCE")) = LOWER(TRIM(i.invoice_number)) LIMIT 1) as general_status
                FROM hub_telecom.invoices i
                JOIN hub_telecom.operators o ON i.operator_id = o.id
                LEFT JOIN hub_telecom.billing_accounts a ON i.billing_account_id = a.id
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
            const existingInvoice = await pgDb.get('SELECT id, file_path FROM hub_telecom.invoices WHERE invoice_number = ?', [invoice_number]);

            if (existingInvoice && overwrite !== 'true') {
                return res.status(409).json({
                    message: `La facture n°${invoice_number} existe déjà. Souhaitez-vous la remplacer ?`,
                    invoice_number
                });
            }

            let operator_id = null;
            let billing_account_id = null;

            const allAccounts = await pgDb.all('SELECT id, operator_id, account_number FROM hub_telecom.billing_accounts');

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
                const operators = await pgDb.all('SELECT id, name FROM hub_telecom.operators');
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
                await pgDb.run(
                    'UPDATE hub_telecom.invoices SET operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ?, file_path = ?, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [operator_id, billing_account_id, amount_ttc, invoice_date, saved.dbPath, existingInvoice.id]
                );
            } else {
                const result = await pgDb.run(
                    'INSERT INTO hub_telecom.invoices (invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, file_path) VALUES (?, ?, ?, ?, ?, ?)',
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
            await pgDb.run(
                'UPDATE hub_telecom.invoices SET invoice_number = ?, operator_id = ?, billing_account_id = ?, amount_ttc = ?, invoice_date = ? WHERE id = ?',
                [invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date, req.params.id]
            );
            res.json({ message: 'Facture mise à jour avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Error updating invoice', error: error.message });
        }
    },

    deleteInvoice: async (req, res) => {
        try {
            const inv = await pgDb.get('SELECT file_path FROM hub_telecom.invoices WHERE id = ?', [req.params.id]);
            if (inv && inv.file_path) {
                if (storage.isStoragePath(inv.file_path)) {
                    await storage.deleteFile(inv.file_path);
                } else {
                    const fullPath = path.join(__dirname, '..', '..', inv.file_path);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
            }
            await pgDb.run('DELETE FROM hub_telecom.invoices WHERE id = ?', [req.params.id]);
            res.json({ message: 'Facture supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting invoice', error: error.message });
        }
    }
};
