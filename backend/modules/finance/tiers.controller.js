const { pool } = require('../../shared/pg_db');

module.exports = {
    getTiers: async (req, res) => {
        try {
            const { search, limit, offset } = req.query;
            const searchNum = parseInt(limit, 10) || 0;
            const searchOffset = parseInt(offset, 10) || 0;

            let sql = 'SELECT * FROM oracle.gf_oracle_tiers';
            const params = [];
            let paramIdx = 1;

            if (search) {
                sql += ` WHERE (
                    CAST("TIERS_TIERS" AS TEXT) ILIKE $${paramIdx++}
                    OR CAST("TIERS_POBJ_EXTRACT_2" AS TEXT) ILIKE $${paramIdx++}
                    OR CAST("TIERS_POBJ_EXTRACT_1" AS TEXT) ILIKE $${paramIdx++}
                    OR CAST("TIERS_POBJ_EXTRACT_3" AS TEXT) ILIKE $${paramIdx++}
                    OR CAST("TIE_NATUREJURIDIQUE_LIBELLE" AS TEXT) ILIKE $${paramIdx++}
                    OR CAST("TIERS_POBJ_EXTRACT" AS TEXT) ILIKE $${paramIdx++}
                )`;
                const like = `%${search}%`;
                params.push(like, like, like, like, like, like);
            }

            let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
            const countResult = await pool.query(countSql, params);
            const total = parseInt(countResult.rows[0].total, 10);

            sql += ` ORDER BY "TIERS_POBJ_EXTRACT_2"`;

            if (searchNum > 0) {
                sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
                params.push(searchNum, searchOffset);
            }

            const result = await pool.query(sql, params);
            const tiers = result.rows.map(r => ({
                code: r.TIERS_TIERS || r.tiers_tiers || '',
                nom: r.TIERS_POBJ_EXTRACT_2 || r.tiers_pobj_extract_2 || '',
                complement_nom: r.TIERS_POBJ_EXTRACT_3 || r.tiers_pobj_extract_3 || '',
                siret: r.TIERS_POBJ_EXTRACT_4 || r.tiers_pobj_extract_4 || '',
                nature_juridique: r.TIE_NATUREJURIDIQUE_LIBELLE || r.tie_naturejuridique_libelle || '',
                date_validite: r.TIERS_DATEVALID || r.tiers_datevalid || '',
                ...r
            }));
            res.json({ tiers, total, stats: null });
        } catch (error) {
            console.error('[TIERS ERROR]', error.message, error.stack);
            res.status(500).json({ message: 'Erreur lors de la récupération des tiers', error: error.message });
        }
    },

    getContacts: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM oracle.contacts WHERE tier_code = $1', [req.params.code]);
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur contacts', error: error.message });
        }
    },

    getHistory: async (req, res) => {
        try {
            const tier = await pool.query(
                'SELECT "TIERS_POBJ_EXTRACT_2" FROM oracle.gf_oracle_tiers WHERE "TIERS_TIERS" = $1',
                [req.params.code]
            );
            if (!tier.rows.length) return res.status(404).json({ message: 'Tiers non trouvé' });

            const tierNom = tier.rows[0].TIERS_POBJ_EXTRACT_2.trim();

            const orders = await pool.query(
                `SELECT *, "COMMANDE_COMMANDE" as id, "COMMANDE_COMMANDE" as "N° Commande",
                 "COMMANDE_LIBELLE" as "Libellé",
                 "COMMANDE_CMD_DATECOMMANDE" as "Date de la commande",
                 "COMMANDE_MONTANT_TTC" as "Montant TTC",
                 "SERVICEFI_LIBELLE" as "Fournisseur",
                 "COMMANDE_MONTANT_HT" as "Montant HT",
                 "COMMANDE_MONTANT_HT" as amount_ht,
                 "COMMANDE_LIBELLE" as description,
                 "COMMANDE_CMD_DATECOMMANDE" as date
                 FROM oracle.gf_oracle_commande
                 WHERE TRIM(UPPER("SERVICEFI_LIBELLE")) = TRIM(UPPER($1))
                    OR "SERVICEFI_LIBELLE" LIKE $2`,
                [tierNom, `%${tierNom}%`]
            );

            const invoices = await pool.query(
                `SELECT *, "FACTURE_FACTURE" as id,
                 "FACTURE_FACTURE" as "N° Facture interne",
                 "FACTURE_REFERENCE" as "N° Facture fournisseur",
                 "FACTURE_LIBELLE2" as "Fournisseur",
                 "FACTURE_LIBELLE1" as "Libellé",
                 "FACTURE_MONTANTTC_E" as "Montant TTC",
                 "FACETAT_LIBELLE" as "Etat",
                 "FACTURE_DATENTREE" as "Emission",
                 "FACTURE_DATENTREE" as "Arrivée",
                 "FACTURE_MONTANTTC_E" as total_ttc,
                 substr("FACTURE_DATENTREE", 1, 4) as "Exercice"
                 FROM oracle.gf_oracle_facture
                 WHERE TRIM(UPPER("FACTURE_LIBELLE2")) = TRIM(UPPER($1))
                    OR "FACTURE_LIBELLE2" LIKE $2`,
                [tierNom, `%${tierNom}%`]
            );

            const invoicesList = invoices.rows.map(inv => ({
                number: inv['N° Facture fournisseur'] || inv['N° Facture interne'] || 'Inconnu',
                total_ttc: parseFloat(String(inv.total_ttc || 0).replace(',', '.').replace(/[^\d.-]/g, '')) || 0,
                lines: [inv],
                hasFile: false,
                filePath: null
            }));

            res.json({
                oracle_commande: orders.rows.map(o => ({ ...o, matchedInvoices: [] })),
                invoices: invoicesList
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur historique', error: error.message });
        }
    },

    addContact: async (req, res) => {
        const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO oracle.contacts (tier_code, nom, prenom, role, telephone, email, commentaire, is_order_recipient) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [req.params.code, nom, prenom, role, telephone, email, commentaire, is_order_recipient ? true : false]
            );
            res.json({ id: result.rows[0].id, message: 'Contact ajouté' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur ajout contact', error: error.message });
        }
    },

    updateContact: async (req, res) => {
        const { nom, prenom, role, telephone, email, commentaire, is_order_recipient } = req.body;
        try {
            await pool.query(
                'UPDATE oracle.contacts SET nom = $1, prenom = $2, role = $3, telephone = $4, email = $5, commentaire = $6, is_order_recipient = $7 WHERE id = $8',
                [nom, prenom, role, telephone, email, commentaire, is_order_recipient ? true : false, req.params.id]
            );
            res.json({ message: 'Contact mis à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur mise à jour contact', error: error.message });
        }
    },

    deleteContact: async (req, res) => {
        const id = req.params.id;
        try {
            const result = await pool.query('DELETE FROM oracle.contacts WHERE id = $1', [id]);
            if (result.rowCount > 0) {
                res.json({ message: 'Contact supprimé' });
            } else {
                res.status(404).json({ message: 'Contact non trouvé' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression contact', error: error.message });
        }
    }
};
