const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { parseSfrZip } = require('./telecom.sfr-parser');
const { pgDb, pool } = require('../../shared/database');
const storage = require('../../shared/storage');

const MODULE = 'telecom';

// Convertit une date opérateur "JJ-MM-AAAA" (ou "JJ/MM/AAAA") en ISO 'AAAA-MM-JJ', sinon null
function parseFrDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // déjà ISO ?
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
}

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

    // ─── Lignes fixes & accès internet ──────────────────────────────────────
    // Liste filtrable des lignes (téléphonie fixe + accès data/internet)
    getLines: async (req, res) => {
        try {
            const { category, status, to_migrate, search } = req.query;
            const where = [];
            const params = [];
            if (category && category !== 'all') { params.push(category); where.push(`category = $${params.length}`); }
            if (status) { params.push(status); where.push(`status = $${params.length}`); }
            if (to_migrate === 'true') where.push(`to_migrate = TRUE`);
            if (search) {
                params.push(`%${search.toLowerCase()}%`);
                const i = params.length;
                where.push(`(LOWER(site_name) LIKE $${i} OR LOWER(mid) LIKE $${i} OR LOWER(ndi) LIKE $${i} OR LOWER(billing_account) LIKE $${i} OR LOWER(address) LIKE $${i})`);
            }
            const sql = `SELECT * FROM hub_telecom.lines
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY site_name, access_type`;
            const r = await pool.query(sql, params);
            res.json(r.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture lignes', error: error.message });
        }
    },

    // Import d'un fichier Excel opérateur (upsert idempotent par MID).
    // Le même fichier peut être ré-importé : les lignes existantes sont mises à jour.
    importLines: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            const sourceFile = storage.fixUploadName(req.file.originalname || 'import.xlsx');
            let inserted = 0, updated = 0, skipped = 0;

            for (const row of rows) {
                const mid = String(row['Identifiant (MID)'] || '').trim();
                if (!mid) { skipped++; continue; }

                const offer = String(row['Offre'] || '').trim();
                // Téléphonie fixe = offre "Office" (lignes analogiques, T0, T2) ; sinon accès data/internet
                const category = /office/i.test(offer) ? 'fixe' : 'internet';
                const toMigrate = /^oui$/i.test(String(row['A migrer'] || '').trim());

                const vals = [
                    category,
                    String(row['Numéro de site'] || '').trim(),
                    String(row['Site'] || '').trim(),
                    String(row['Adresse'] || '').trim(),
                    String(row['Code Postal'] || '').trim(),
                    String(row['Ville'] || '').trim(),
                    String(row['Contrat'] || '').trim(),
                    String(row['Compte de facturation'] || '').trim(),
                    mid,
                    offer,
                    String(row["Type d'accès"] || '').trim(),
                    toMigrate,
                    String(row['Fin du cuivre lot'] || '').trim(),
                    String(row['Fermeture commerciale'] || '').trim(),
                    String(row['Fermeture technique'] || '').trim(),
                    String(row['NDI'] || '').trim(),
                    String(row['Statut'] || '').trim(),
                    parseFrDate(row['Date de Mise en service']),
                    parseFrDate(row['Date de Création']),
                    String(row['Raison sociale'] || '').trim(),
                    String(row['Siren'] || '').trim(),
                    sourceFile,
                ];

                const result = await pool.query(`
                    INSERT INTO hub_telecom.lines
                      (category, site_number, site_name, address, postal_code, city, contract,
                       billing_account, mid, offer, access_type, to_migrate, copper_end_lot,
                       commercial_closure, technical_closure, ndi, status, service_date,
                       creation_date, company_name, siren, source_file)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                    ON CONFLICT (mid) DO UPDATE SET
                      category=$1, site_number=$2, site_name=$3, address=$4, postal_code=$5, city=$6,
                      contract=$7, billing_account=$8, offer=$10, access_type=$11, to_migrate=$12,
                      copper_end_lot=$13, commercial_closure=$14, technical_closure=$15, ndi=$16,
                      status=$17, service_date=$18, creation_date=$19, company_name=$20, siren=$21,
                      source_file=$22, updated_at=NOW()
                    RETURNING (xmax = 0) AS inserted
                `, vals);

                if (result.rows[0] && result.rows[0].inserted) inserted++; else updated++;
            }

            res.json({
                message: `Import terminé : ${inserted} ajoutée(s), ${updated} mise(s) à jour, ${skipped} ignorée(s).`,
                inserted, updated, skipped, total: rows.length,
            });
        } catch (error) {
            console.error('[Telecom] importLines error:', error);
            res.status(500).json({ message: 'Erreur import Excel', error: error.message });
        }
    },

    deleteLine: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM hub_telecom.lines WHERE id = ?', [req.params.id]);
            res.json({ message: 'Ligne supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression ligne', error: error.message });
        }
    },

    // Statistiques d'exploitation des lignes (analytics + widget dashboard)
    getLinesStats: async (req, res) => {
        try {
            const { rows } = await pool.query('SELECT * FROM hub_telecom.lines');
            const inService = (l) => /en service/i.test(l.status || '');

            const stats = {
                total: rows.length,
                fixe: rows.filter(l => l.category === 'fixe').length,
                internet: rows.filter(l => l.category === 'internet').length,
                inService: rows.filter(inService).length,
                resiliation: rows.filter(l => !inService(l)).length,
                toMigrate: rows.filter(l => l.to_migrate).length,
                byAccessType: {},
                byOffer: {},
                byStatus: {},
                topSites: [],
                byCity: {},
                migrationList: [],
                resiliationList: [],
                trunkList: [],   // têtes de ligne mutualisées (T2, T0, groupements)
            };

            // Identifie les liens mutualisés (1 NDI = plusieurs canaux/numéros SDA)
            const trunkCapacity = (t) => {
                const s = (t || '').toLowerCase();
                if (s.includes('t2')) return 'T2 / PRA — jusqu’à 30 communications simultanées (+ SDA)';
                if (s.includes('t0')) return 'T0 — 2 canaux (numéris)';
                if (s.includes('groupement')) return 'Groupement — plusieurs lignes derrière une tête de ligne';
                return '';
            };
            const isTrunk = (t) => /groupement|t2|t0/i.test(t || '');

            const bump = (obj, k) => { const key = k || '(non renseigné)'; obj[key] = (obj[key] || 0) + 1; };
            const sites = {};
            for (const l of rows) {
                bump(stats.byAccessType, l.access_type);
                bump(stats.byOffer, l.offer);
                bump(stats.byStatus, l.status);
                bump(stats.byCity, l.city);
                const s = l.site_name || '(inconnu)';
                if (!sites[s]) sites[s] = { site: s, total: 0, fixe: 0, internet: 0 };
                sites[s].total++;
                sites[s][l.category === 'fixe' ? 'fixe' : 'internet']++;
                if (l.to_migrate) stats.migrationList.push({
                    site_name: l.site_name, city: l.city, access_type: l.access_type,
                    offer: l.offer, copper_end_lot: l.copper_end_lot, ndi: l.ndi, mid: l.mid,
                });
                if (!inService(l)) stats.resiliationList.push({
                    site_name: l.site_name, city: l.city, access_type: l.access_type,
                    offer: l.offer, status: l.status, ndi: l.ndi, mid: l.mid,
                });
                if (isTrunk(l.access_type)) stats.trunkList.push({
                    site_name: l.site_name, city: l.city, access_type: l.access_type,
                    ndi: l.ndi, mid: l.mid, billing_account: l.billing_account,
                    capacity: trunkCapacity(l.access_type),
                });
            }
            stats.trunkList.sort((a, b) => (a.site_name || '').localeCompare(b.site_name || ''));
            stats.topSites = Object.values(sites).sort((a, b) => b.total - a.total).slice(0, 10);

            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: 'Erreur statistiques lignes', error: error.message });
        }
    },

    // ─── Facturation par ligne (import ZIP SFR) ─────────────────────────────
    // Importe l'export de facturation SFR (ZIP de ZIPs). Upsert idempotent par
    // (period, line_number, cf_id) + remplacement de la tendance 13 mois.
    importBilling: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        const client = await pool.connect();
        try {
            const parsed = parseSfrZip(req.file.buffer);
            if (!parsed.period) return res.status(400).json({ message: "Impossible de déterminer la période de facturation depuis l'export." });
            const sourceFile = storage.fixUploadName(req.file.originalname || 'export_sfr.zip');

            await client.query('BEGIN');

            // Remplace la facturation de cette période (idempotent)
            await client.query('DELETE FROM hub_telecom.line_billing WHERE period = $1', [parsed.period]);
            for (const b of parsed.billing) {
                await client.query(`
                    INSERT INTO hub_telecom.line_billing
                      (period, invoice_number, invoice_date, org_id, company, contract_id, cf_id, cf_label,
                       site_id, site_name, list_id, list_label, line_number, mobile_name, user_name, plan,
                       is_mobile, resiliation, amt_subscriptions, amt_other, amt_discounts, amt_third_party,
                       amt_voix_fixe, amt_voix_mobile, amt_data_fixe, amt_data_mobile, amt_conso_autre,
                       amt_contenu, amt_total, source_file)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
                    ON CONFLICT (period, line_number, cf_id) DO UPDATE SET
                      invoice_number=$2, invoice_date=$3, org_id=$4, company=$5, contract_id=$6, cf_label=$8,
                      site_id=$9, site_name=$10, list_id=$11, list_label=$12, mobile_name=$14, user_name=$15,
                      plan=$16, is_mobile=$17, resiliation=$18, amt_subscriptions=$19, amt_other=$20,
                      amt_discounts=$21, amt_third_party=$22, amt_voix_fixe=$23, amt_voix_mobile=$24,
                      amt_data_fixe=$25, amt_data_mobile=$26, amt_conso_autre=$27, amt_contenu=$28,
                      amt_total=$29, source_file=$30, imported_at=NOW()
                `, [
                    parsed.period, b.invoice_number, b.invoice_date, b.org_id, b.company, b.contract_id,
                    b.cf_id, b.cf_label, b.site_id, b.site_name, b.list_id, b.list_label, b.line_number,
                    b.mobile_name, b.user_name, b.plan, b.is_mobile, b.resiliation, b.amt_subscriptions,
                    b.amt_other, b.amt_discounts, b.amt_third_party, b.amt_voix_fixe, b.amt_voix_mobile,
                    b.amt_data_fixe, b.amt_data_mobile, b.amt_conso_autre, b.amt_contenu, b.amt_total, sourceFile,
                ]);
            }

            // Tendance 13 mois : upsert par (category, sub_category, offer, month)
            for (const t of parsed.trend) {
                await client.query(`
                    INSERT INTO hub_telecom.billing_trend (category, sub_category, offer, month, amount)
                    VALUES ($1,$2,$3,$4,$5)
                    ON CONFLICT (category, sub_category, offer, month) DO UPDATE SET amount=$5, imported_at=NOW()
                `, [t.category, t.sub_category, t.offer, t.month, t.amount]);
            }

            await client.query('COMMIT');
            res.json({
                message: `Facturation importée pour ${parsed.period} : ${parsed.billing.length} ligne(s), ${parsed.trend.length} point(s) de tendance.`,
                period: parsed.period,
                ...parsed.counts,
                billing: parsed.billing.length,
                trend: parsed.trend.length,
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[Telecom] importBilling error:', error);
            res.status(500).json({ message: 'Erreur import facturation', error: error.message });
        } finally {
            client.release();
        }
    },

    // Périodes de facturation disponibles
    getBillingPeriods: async (req, res) => {
        try {
            const r = await pool.query(`SELECT DISTINCT period FROM hub_telecom.line_billing ORDER BY period DESC`);
            res.json(r.rows.map(x => x.period));
        } catch (error) {
            res.status(500).json({ message: 'Erreur périodes', error: error.message });
        }
    },

    // Détail facturation par ligne (filtrable) pour une période
    getBillingLines: async (req, res) => {
        try {
            const { period, type, search } = req.query;
            const where = [];
            const params = [];
            if (period) { params.push(period); where.push(`period = $${params.length}`); }
            else where.push(`period = (SELECT MAX(period) FROM hub_telecom.line_billing)`);
            if (type === 'mobile') where.push(`is_mobile = TRUE`);
            if (type === 'fixe') where.push(`is_mobile = FALSE`);
            if (search) {
                params.push(`%${search.toLowerCase()}%`);
                const i = params.length;
                where.push(`(LOWER(line_number) LIKE $${i} OR LOWER(user_name) LIKE $${i} OR LOWER(site_name) LIKE $${i} OR LOWER(plan) LIKE $${i} OR LOWER(list_label) LIKE $${i})`);
            }
            const r = await pool.query(`
                SELECT * FROM hub_telecom.line_billing
                WHERE ${where.join(' AND ')}
                ORDER BY amt_total DESC`, params);
            res.json(r.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur détail facturation', error: error.message });
        }
    },

    // Statistiques de coûts (analytics + widget dashboard)
    getBillingStats: async (req, res) => {
        try {
            const { period } = req.query;
            const periodClause = period ? `period = $1` : `period = (SELECT MAX(period) FROM hub_telecom.line_billing)`;
            const params = period ? [period] : [];
            const { rows } = await pool.query(`SELECT * FROM hub_telecom.line_billing WHERE ${periodClause}`, params);

            const n = (v) => parseFloat(v) || 0;
            const stats = {
                period: rows[0] ? rows[0].period : null,
                totalLines: rows.length,
                mobileLines: rows.filter(r => r.is_mobile).length,
                fixeLines: rows.filter(r => !r.is_mobile).length,
                totalHT: 0, totalMobile: 0, totalFixe: 0,
                totalSubscriptions: 0, totalConso: 0, totalDiscounts: 0,
                dormant: 0,           // lignes mobiles facturées sans conso
                topLines: [],         // lignes les plus coûteuses
                byPlan: {},           // répartition forfaits mobiles
                bySite: {},           // coût par site
                byList: {},           // coût par direction/service
                annualEstimate: 0,
            };

            for (const r of rows) {
                const tot = n(r.amt_total);
                stats.totalHT += tot;
                if (r.is_mobile) stats.totalMobile += tot; else stats.totalFixe += tot;
                stats.totalSubscriptions += n(r.amt_subscriptions);
                stats.totalDiscounts += n(r.amt_discounts);
                stats.totalConso += n(r.amt_voix_fixe) + n(r.amt_voix_mobile) + n(r.amt_data_fixe) + n(r.amt_data_mobile) + n(r.amt_conso_autre);
                const conso = n(r.amt_voix_fixe) + n(r.amt_voix_mobile) + n(r.amt_data_fixe) + n(r.amt_data_mobile);
                if (r.is_mobile && conso === 0 && tot > 0) stats.dormant++;
                if (r.is_mobile && r.plan) stats.byPlan[r.plan] = (stats.byPlan[r.plan] || 0) + 1;
                const site = r.site_name || '(inconnu)';
                stats.bySite[site] = (stats.bySite[site] || 0) + tot;
                const list = r.list_label || '(non affecté)';
                stats.byList[list] = (stats.byList[list] || 0) + tot;
            }

            stats.topLines = rows
                .map(r => ({ line_number: r.line_number, user_name: r.user_name, site_name: r.site_name, plan: r.plan, is_mobile: r.is_mobile, amt_total: n(r.amt_total) }))
                .sort((a, b) => b.amt_total - a.amt_total).slice(0, 15);
            stats.bySite = Object.entries(stats.bySite).map(([k, v]) => ({ site: k, amount: Math.round(v * 100) / 100 })).sort((a, b) => b.amount - a.amount).slice(0, 10);
            stats.byList = Object.entries(stats.byList).map(([k, v]) => ({ list: k, amount: Math.round(v * 100) / 100 })).sort((a, b) => b.amount - a.amount).slice(0, 12);
            stats.annualEstimate = Math.round(stats.totalHT * 12 * 100) / 100;
            ['totalHT', 'totalMobile', 'totalFixe', 'totalSubscriptions', 'totalConso', 'totalDiscounts'].forEach(k => stats[k] = Math.round(stats[k] * 100) / 100);

            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: 'Erreur statistiques facturation', error: error.message });
        }
    },

    // Tendance 13 mois (totaux par mois, et par catégorie)
    getBillingTrend: async (req, res) => {
        try {
            const r = await pool.query(`
                SELECT month, SUM(amount) AS total
                FROM hub_telecom.billing_trend
                GROUP BY month ORDER BY month`);
            res.json(r.rows.map(x => ({ month: x.month, total: Math.round(parseFloat(x.total) * 100) / 100 })));
        } catch (error) {
            res.status(500).json({ message: 'Erreur tendance', error: error.message });
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
