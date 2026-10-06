const { pool } = require('../../shared/database');
const storage = require('../../shared/storage');
const sedit = require('./sedit-commandes.service');

const MODULE = 'demandes_commande';
const STATUT_DEVIS = 'devis_pris_en_compte';
const STATUT_VALIDEE = 'validee';

const isManager = (user) => ['superadmin', 'admin', 'finances'].includes(user?.role);

// Les validateurs (directeur / RAF) sont désignés par username dans finance.demandes_commande_validateurs.
async function getValidateurRole(user) {
    if (!user?.username) return null;
    const r = await pool.query(
        'SELECT fonction FROM finance.demandes_commande_validateurs WHERE LOWER(username) = LOWER($1)',
        [user.username]
    );
    return r.rows[0]?.fonction || null;
}

// Suppression : administrateurs (admin/superadmin) et directeurs désignés.
async function canDelete(user) {
    if (['superadmin', 'admin'].includes(user?.role)) return true;
    return (await getValidateurRole(user)) === 'directeur';
}

async function loadPjs(demandeIds) {
    if (!demandeIds.length) return {};
    const r = await pool.query(
        'SELECT id, demande_id, file_path, file_name, size, uploaded_at FROM finance.demandes_commande_pj WHERE demande_id = ANY($1::int[]) ORDER BY id',
        [demandeIds]
    );
    const map = {};
    for (const row of r.rows) (map[row.demande_id] = map[row.demande_id] || []).push(row);
    return map;
}

module.exports = {
    async me(req, res) {
        try {
            const fonction = await getValidateurRole(req.user);
            res.json({ can_validate: !!fonction, fonction, can_manage: isManager(req.user), can_delete: await canDelete(req.user) });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async list(req, res) {
        try {
            const r = await pool.query('SELECT * FROM finance.demandes_commande ORDER BY created_at DESC');
            const pjs = await loadPjs(r.rows.map(d => d.id));
            res.json(r.rows.map(d => ({ ...d, montant: Number(d.montant), pieces: pjs[d.id] || [] })));
        } catch (e) {
            res.status(500).json({ message: 'Erreur chargement des demandes', error: e.message });
        }
    },

    async create(req, res) {
        try {
            const designation = String(req.body.designation || '').trim();
            const description = String(req.body.description || '').trim();
            const montant = Number(String(req.body.montant ?? '').replace(',', '.'));
            if (!designation) return res.status(400).json({ message: 'La désignation est obligatoire' });
            if (!Number.isFinite(montant) || montant < 0) return res.status(400).json({ message: 'Montant invalide' });
            const files = req.files || [];
            if (!files.length) return res.status(400).json({ message: 'Joindre au moins un devis' });

            const ins = await pool.query(
                `INSERT INTO finance.demandes_commande (designation, description, montant, demandeur_username, demandeur_name, statut)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [designation, description, montant, req.user.username, req.user.username, STATUT_DEVIS]
            );
            const demande = ins.rows[0];

            for (const file of files) {
                file.originalname = storage.fixUploadName(file.originalname);
                const saved = await storage.saveFile(MODULE, demande.id, file);
                await pool.query(
                    `INSERT INTO finance.demandes_commande_pj (demande_id, file_path, file_name, size, mimetype, uploaded_by)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [demande.id, saved.dbPath, file.originalname, file.size, file.mimetype, req.user.username]
                );
                try {
                    await require('../../shared/documents.service').registerExternalUpload({
                        module: 'budget',
                        entityType: 'demande_commande',
                        entityId: demande.id,
                        title: file.originalname,
                        filename: saved.filename,
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        storageRef: saved.dbPath,
                        metadata: { designation },
                        uploadedBy: req.user.username || null,
                    });
                } catch (e) { console.warn('[DOCS] register failed:', e.message); }
            }
            res.status(201).json({ id: demande.id, message: 'Demande enregistrée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur création de la demande', error: e.message });
        }
    },

    async validate(req, res) {
        try {
            const fonction = await getValidateurRole(req.user);
            if (!fonction) return res.status(403).json({ message: 'Seuls le directeur ou la RAF peuvent valider une demande' });
            const r = await pool.query(
                `UPDATE finance.demandes_commande
                    SET statut = $1, valide_par = $2, valide_fonction = $3, valide_at = NOW(), valide_commentaire = $6
                  WHERE id = $4 AND statut = $5 RETURNING id`,
                [STATUT_VALIDEE, req.user.username, fonction, req.params.id, STATUT_DEVIS, String(req.body?.commentaire || '').trim() || null]
            );
            if (!r.rowCount) return res.status(409).json({ message: 'Demande introuvable ou déjà traitée' });
            res.json({ message: 'Demande validée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur validation', error: e.message });
        }
    },

    async remove(req, res) {
        try {
            if (!(await canDelete(req.user))) return res.status(403).json({ message: 'Suppression réservée aux administrateurs et aux directeurs' });
            const pjs = await pool.query('SELECT file_path FROM finance.demandes_commande_pj WHERE demande_id = $1', [req.params.id]);
            const r = await pool.query('DELETE FROM finance.demandes_commande WHERE id = $1 RETURNING id', [req.params.id]);
            if (!r.rowCount) return res.status(404).json({ message: 'Demande introuvable' });
            for (const p of pjs.rows) {
                try { await storage.deleteFile(p.file_path); } catch (e) { console.warn('[DEMANDES] suppression fichier:', e.message); }
            }
            res.json({ message: 'Demande supprimée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur suppression', error: e.message });
        }
    },

    // 20 dernières commandes Sedit (lecture seule), filtrables par ?search= (n° / libellé).
    async listSeditCommandes(req, res) {
        try {
            res.json(await sedit.listLastCommandes({ limit: 20, search: String(req.query.search || '').trim() }));
        } catch (e) {
            res.status(500).json({ message: 'Erreur lecture des commandes Sedit', error: e.message });
        }
    },

    async associerCommande(req, res) {
        try {
            if (!isManager(req.user) && !(await getValidateurRole(req.user))) {
                return res.status(403).json({ message: 'Droits insuffisants pour associer une commande' });
            }
            const roo = String(req.body.roo || '').trim();
            if (!roo) return res.status(400).json({ message: 'Commande requise' });
            // On relit la commande dans Sedit : on ne fait pas confiance aux valeurs envoyées par le client.
            const cmd = await sedit.getCommandeByRoo(roo);
            if (!cmd) return res.status(404).json({ message: 'Commande introuvable dans Sedit' });
            const r = await pool.query(
                `UPDATE finance.demandes_commande
                    SET commande_roo=$1, commande_numero=$2, commande_libelle=$3, commande_montant=$4,
                        commande_tiers=$5, commande_associee_par=$6, commande_associee_at=NOW()
                  WHERE id=$7 AND statut=$8 RETURNING id`,
                [cmd.ROO, cmd.NUMERO, cmd.LIBELLE, cmd.MONTANT_TTC, (cmd.TIERS_NOM || '').trim(), req.user.username, req.params.id, STATUT_VALIDEE]
            );
            if (!r.rowCount) return res.status(409).json({ message: 'Seules les demandes validées peuvent être associées à une commande' });
            res.json({ message: 'Commande associée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur association de la commande', error: e.message });
        }
    },

    async listValidateurs(req, res) {
        try {
            const r = await pool.query('SELECT username, fonction FROM finance.demandes_commande_validateurs ORDER BY fonction, username');
            res.json(r.rows);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async addValidateur(req, res) {
        try {
            const username = String(req.body.username || '').trim();
            const fonction = req.body.fonction;
            if (!username || !['directeur', 'raf'].includes(fonction)) return res.status(400).json({ message: 'Username et fonction (directeur/raf) requis' });
            await pool.query(
                `INSERT INTO finance.demandes_commande_validateurs (username, fonction) VALUES ($1,$2)
                 ON CONFLICT (username) DO UPDATE SET fonction = EXCLUDED.fonction`,
                [username, fonction]
            );
            res.status(201).json({ message: 'Validateur enregistré' });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async removeValidateur(req, res) {
        try {
            await pool.query('DELETE FROM finance.demandes_commande_validateurs WHERE username = $1', [req.params.username]);
            res.json({ message: 'Validateur retiré' });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
};
