const { getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const xlsx = require('xlsx');
const updateTierStats = require('../../update_tier_stats');
const fs = require('fs');
const path = require('path');

module.exports = {
    getTiers: async (req, res) => {
        try {
            const db = getSqlite();
            const showAll = req.query.all === 'true';

            let query = `
                SELECT t.*, 
                       COALESCE(ts.order_count, 0) as order_count, 
                       COALESCE(ts.invoice_count, 0) as invoice_count,
                       (SELECT COUNT(*) FROM contacts c WHERE c.tier_id = t.id AND c.is_order_recipient = 1) as has_order_recipient
                FROM tiers t
                LEFT JOIN tier_stats ts ON t.id = ts.tier_id
            `;
            if (!showAll) {
                query += `
                    WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM v_orders)
                       OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)
                `;
            }

            query += ` ORDER BY t.nom`;

            const tiers = await db.all(query);

            const globalStats = await db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM v_orders) as total_orders,
                    (SELECT COUNT(*) FROM invoices) as total_invoices,
                    (SELECT COUNT(*) FROM tiers) as total_tiers_all,
                    (SELECT COUNT(DISTINCT LOWER(TRIM(t.nom))) FROM tiers t WHERE LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM v_orders) OR LOWER(TRIM(t.nom)) IN (SELECT DISTINCT LOWER(TRIM(Fournisseur)) FROM invoices)) as total_tiers_dsi
            `);

            res.json({ tiers, stats: globalStats || { total_orders: 0, total_invoices: 0, total_tiers_all: 0, total_tiers_dsi: 0 } });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des tiers', error: error.message });
        }
    },

    importTiers: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });

        try {
            const db = getSqlite();
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            let updated = 0;
            let created = 0;

            for (const row of data) {
                const code = row['Code'];
                if (!code) continue;

                const existing = await db.get('SELECT id FROM tiers WHERE code = ?', [code]);

                if (existing) {
                    await db.run(`
                        UPDATE tiers SET 
                            nom = ?, activite = ?, siret = ?, adresse = ?, banque = ?, 
                            guichet = ?, compte = ?, cle_rib = ?, date_creation = ?, 
                            telephone = ?, fax = ?, tva_intra = ?, email = ?, origine = ?
                        WHERE id = ?
                    `, [
                        row['Nom'] ? row['Nom'].trim() : null,
                        row['Activité'],
                        row['SIRET'],
                        row['Adresse (Usuelle)'],
                        row['Banque'],
                        row['Guichet'],
                        row['N° compte'],
                        row['Clé RIB'],
                        row['Date de création'],
                        row['Téléphone'],
                        row['Fax'],
                        row['Tva Intra'],
                        row['Email'],
                        row['Origine'],
                        existing.id
                    ]);
                    updated++;
                } else {
                    await db.run(`
                        INSERT INTO tiers (
                            code, nom, activite, siret, adresse, banque, guichet, 
                            compte, cle_rib, date_creation, telephone, fax, 
                            tva_intra, email, origine
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        code,
                        row['Nom'] ? row['Nom'].trim() : null,
                        row['Activité'],
                        row['SIRET'],
                        row['Adresse (Usuelle)'],
                        row['Banque'],
                        row['Guichet'],
                        row['N° compte'],
                        row['Clé RIB'],
                        row['Date de création'],
                        row['Téléphone'],
                        row['Fax'],
                        row['Tva Intra'],
                        row['Email'],
                        row['Origine']
                    ]);
                    created++;
                }
            }

            await updateTierStats(db);

            const msg = `Import Excel tiers: ${created} créés, ${updated} mis à jour`;
            logMouchard(`POST /api/tiers/import - par ${req.user.username}: ${msg}`);

            res.json({ message: 'Import réussi', created, updated });
        } catch (error) {
            console.error('Import error:', error);
            res.status(500).json({ message: "Erreur lors de l'import", error: error.message });
        }
    },

    getContacts: async (req, res) => {
        try {
            const db = getSqlite();
            const contacts = await db.all('SELECT * FROM contacts WHERE tier_id = ?', [req.params.id]);
            res.json(contacts);
        } catch (error) {
            res.status(500).json({ message: 'Erreur contacts', error: error.message });
        }
    },

    getHistory: async (req, res) => {
        try {
            const db = getSqlite();
            const tier = await db.get('SELECT nom FROM tiers WHERE id = ?', [req.params.id]);
            if (!tier) return res.status(404).json({ message: 'Tiers non trouvé' });

            const tierNom = tier.nom.trim();
            const oracle_commande = await db.all('SELECT * FROM v_orders WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);
            const invoices = await db.all('SELECT * FROM invoices WHERE TRIM(UPPER("Fournisseur")) = TRIM(UPPER(?)) OR "Fournisseur" LIKE ?', [tierNom, `%${tierNom}%`]);

            const invoicesList = invoices.map(inv => ({
                number: inv['N° Facture fournisseur'] || inv['N° Facture interne'] || 'Inconnu',
                total_ttc: parseFloat(String(inv['Montant TTC']).replace(',', '.').replace(/[^\d.-]/g, '')) || 0,
                lines: [inv],
                hasFile: false,
                filePath: null
            }));

            res.json({
                oracle_commande: oracle_commande.map(o => ({ ...o, matchedInvoices: [] })),
                invoices: invoicesList
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur historique', error: error.message });
        }
    },

    addContact: async (req, res) => {
        const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
        try {
            const db = getSqlite();
            const result = await db.run(
                'INSERT INTO contacts (tier_id, nom, prenom, role, telephone, email, commentaire, is_order_recipient) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.params.tierId, nom, prenom, role, telephone, email, commentaire, is_order_recipient ? 1 : 0]
            );
            res.json({ id: result.lastID, message: 'Contact ajouté' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur ajout contact', error: error.message });
        }
    },

    updateContact: async (req, res) => {
        const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
        try {
            const db = getSqlite();
            await db.run(
                'UPDATE contacts SET nom = ?, prenom = ?, role = ?, telephone = ?, email = ?, commentaire = ?, is_order_recipient = ? WHERE id = ?',
                [nom, prenom, role, telephone, email, commentaire, is_order_recipient ? 1 : 0, req.params.id]
            );
            res.json({ message: 'Contact mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur mise à jour contact', error: error.message });
        }
    },

    deleteContact: async (req, res) => {
        const id = req.params.id;
        try {
            const db = getSqlite();
            const result = await db.run('DELETE FROM contacts WHERE id = ?', [id]);
            if (result.changes > 0) {
                res.json({ message: 'Contact supprimé' });
            } else {
                res.status(404).json({ message: 'Contact non trouvé' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression contact', error: error.message });
        }
    }
};
