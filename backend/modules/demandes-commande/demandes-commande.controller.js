const { pool } = require('../../shared/database');
const storage = require('../../shared/storage');
const sedit = require('./sedit-commandes.service');
const mentionsSvc = require('../mentions/mentions.service');

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

// Modification d'une demande : son demandeur tant qu'aucune validation n'a eu lieu ; les gestionnaires
// (admin / finances) et les validateurs (directeur / RAF) à tout moment.
async function canEdit(user, demande) {
    if (isManager(user) || (await getValidateurRole(user))) return true;
    return demande.demandeur_username === user?.username && demande.statut === STATUT_DEVIS;
}

const eur = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

async function savePieces(demande, files, user, designation) {
    for (const file of files) {
        file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(MODULE, demande.id, file);
        await pool.query(
            `INSERT INTO finance.demandes_commande_pj (demande_id, file_path, file_name, size, mimetype, uploaded_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [demande.id, saved.dbPath, file.originalname, file.size, file.mimetype, user.username]
        );
        try {
            await require('../../shared/documents.service').registerExternalUpload({
                module: 'budget', entityType: 'demande_commande', entityId: demande.id,
                title: file.originalname, filename: saved.filename, originalName: file.originalname,
                mimetype: file.mimetype, size: file.size, storageRef: saved.dbPath,
                metadata: { designation }, uploadedBy: user.username || null,
            });
        } catch (e) { console.warn('[DOCS] register failed:', e.message); }
    }
}

const authorName = (user) => user?.displayName || user?.username || '';

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
            const r = await pool.query(`
                SELECT d.*, (SELECT COUNT(*)::int FROM finance.demandes_commande_commentaires c WHERE c.demande_id = d.id AND NOT c.is_system) AS comment_count
                FROM finance.demandes_commande d ORDER BY d.created_at DESC`);
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

            await savePieces(demande, files, req.user, designation);
            res.status(201).json({ id: demande.id, message: 'Demande enregistrée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur création de la demande', error: e.message });
        }
    },

    // Modification d'une demande (désignation, description, montant, devis ajoutés / retirés). Chaque
    // modification est tracée dans le fil de commentaires.
    async update(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const cur = (await pool.query('SELECT * FROM finance.demandes_commande WHERE id = $1', [id])).rows[0];
            if (!cur) return res.status(404).json({ message: 'Demande introuvable' });
            if (!(await canEdit(req.user, cur))) return res.status(403).json({ message: "Vous ne pouvez plus modifier cette demande" });

            const designation = String(req.body.designation ?? cur.designation).trim();
            const description = String(req.body.description ?? cur.description ?? '').trim();
            const montant = req.body.montant !== undefined ? Number(String(req.body.montant).replace(',', '.')) : Number(cur.montant);
            if (!designation) return res.status(400).json({ message: 'La désignation est obligatoire' });
            if (!Number.isFinite(montant) || montant < 0) return res.status(400).json({ message: 'Montant invalide' });

            let removeIds = [];
            try { removeIds = JSON.parse(req.body.remove_piece_ids || '[]').map(Number).filter(Number.isFinite); } catch (e) { removeIds = []; }
            const files = req.files || [];
            const pjs = (await pool.query('SELECT id, file_path, file_name FROM finance.demandes_commande_pj WHERE demande_id = $1', [id])).rows;
            const toRemove = pjs.filter(p => removeIds.includes(p.id));
            if (pjs.length - toRemove.length + files.length < 1) return res.status(400).json({ message: 'Conserver ou joindre au moins un devis' });

            await pool.query(
                `UPDATE finance.demandes_commande SET designation=$1, description=$2, montant=$3, modifie_par=$4, modifie_at=NOW() WHERE id=$5`,
                [designation, description, montant, req.user.username, id]
            );
            for (const p of toRemove) {
                await pool.query('DELETE FROM finance.demandes_commande_pj WHERE id = $1', [p.id]);
                try { await storage.deleteFile(p.file_path); } catch (e) { console.warn('[DEMANDES] suppression fichier:', e.message); }
            }
            await savePieces({ id }, files, req.user, designation);

            // Trace dans le fil de commentaires
            const changes = [];
            if (designation !== cur.designation) changes.push(`désignation « ${cur.designation} » → « ${designation} »`);
            if (montant !== Number(cur.montant)) changes.push(`montant ${eur(cur.montant)} → ${eur(montant)}`);
            if (description !== String(cur.description || '')) changes.push('description modifiée');
            if (toRemove.length) changes.push(`${toRemove.length} devis retiré(s)`);
            if (files.length) changes.push(`${files.length} devis ajouté(s)`);
            if (changes.length) {
                await pool.query(
                    `INSERT INTO finance.demandes_commande_commentaires (demande_id, author_username, author_name, content, is_system)
                     VALUES ($1,$2,$3,$4,TRUE)`,
                    [id, req.user.username, authorName(req.user), `Demande modifiée : ${changes.join(' ; ')}`]
                );
            }
            res.json({ message: 'Demande modifiée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur modification de la demande', error: e.message });
        }
    },

    // --- Commentaires (fil à 2 niveaux : commentaire / réponses), avec @mentions ---
    async listComments(req, res) {
        try {
            const r = await pool.query(
                `SELECT id, demande_id, parent_id, author_username, author_name, content, mentions, is_system, created_at, edited_at
                 FROM finance.demandes_commande_commentaires WHERE demande_id = $1 ORDER BY created_at, id`,
                [req.params.id]
            );
            res.json(r.rows);
        } catch (e) {
            res.status(500).json({ message: 'Erreur chargement des commentaires', error: e.message });
        }
    },

    async addComment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const content = String(req.body.content || '').trim();
            if (!content) return res.status(400).json({ message: 'Commentaire vide' });
            const demande = (await pool.query('SELECT id, designation FROM finance.demandes_commande WHERE id = $1', [id])).rows[0];
            if (!demande) return res.status(404).json({ message: 'Demande introuvable' });

            // Réponse : rattachée au commentaire racine (fil à 2 niveaux, comme Teams)
            let parentId = null;
            if (req.body.parent_id) {
                const parent = (await pool.query(
                    'SELECT id, parent_id FROM finance.demandes_commande_commentaires WHERE id = $1 AND demande_id = $2',
                    [parseInt(req.body.parent_id, 10), id]
                )).rows[0];
                if (!parent) return res.status(404).json({ message: 'Commentaire parent introuvable' });
                parentId = parent.parent_id || parent.id;
            }

            const mentioned = await mentionsSvc.extractMentions(content);
            const ins = await pool.query(
                `INSERT INTO finance.demandes_commande_commentaires (demande_id, parent_id, author_username, author_name, content, mentions)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [id, parentId, req.user.username, authorName(req.user), content, mentioned.map(u => u.display_name)]
            );
            mentionsSvc.notifyMentions({
                content, actor: req.user, source: 'demande_commande', entityId: id,
                title: `Demande de commande « ${demande.designation} »`,
                link: `/budget?view=demandes&demande=${id}`,
            });
            res.status(201).json(ins.rows[0]);
        } catch (e) {
            res.status(500).json({ message: "Erreur lors de l'ajout du commentaire", error: e.message });
        }
    },

    async editComment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const cid = parseInt(req.params.cid, 10);
            const content = String(req.body.content || '').trim();
            if (!content) return res.status(400).json({ message: 'Commentaire vide' });
            const cur = (await pool.query(
                'SELECT * FROM finance.demandes_commande_commentaires WHERE id = $1 AND demande_id = $2', [cid, id]
            )).rows[0];
            if (!cur || cur.is_system) return res.status(404).json({ message: 'Commentaire introuvable' });
            if (cur.author_username !== req.user.username && !['superadmin', 'admin'].includes(req.user.role)) {
                return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres commentaires' });
            }
            const before = (await mentionsSvc.extractMentions(cur.content)).map(u => u.username);
            const mentioned = await mentionsSvc.extractMentions(content);
            const r = await pool.query(
                `UPDATE finance.demandes_commande_commentaires SET content = $1, mentions = $2, edited_at = NOW() WHERE id = $3 RETURNING *`,
                [content, mentioned.map(u => u.display_name), cid]
            );
            const demande = (await pool.query('SELECT designation FROM finance.demandes_commande WHERE id = $1', [id])).rows[0];
            // Seules les personnes nouvellement taguées sont notifiées
            mentionsSvc.notifyMentions({
                content, actor: req.user, source: 'demande_commande', entityId: id, exclude: before,
                title: `Demande de commande « ${demande?.designation || id} »`,
                link: `/budget?view=demandes&demande=${id}`,
            });
            res.json(r.rows[0]);
        } catch (e) {
            res.status(500).json({ message: 'Erreur modification du commentaire', error: e.message });
        }
    },

    async deleteComment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const cid = parseInt(req.params.cid, 10);
            const cur = (await pool.query(
                'SELECT * FROM finance.demandes_commande_commentaires WHERE id = $1 AND demande_id = $2', [cid, id]
            )).rows[0];
            if (!cur || cur.is_system) return res.status(404).json({ message: 'Commentaire introuvable' });
            if (cur.author_username !== req.user.username && !isManager(req.user)) {
                return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres commentaires' });
            }
            await pool.query('DELETE FROM finance.demandes_commande_commentaires WHERE id = $1', [cid]); // les réponses suivent (CASCADE)
            res.json({ message: 'Commentaire supprimé' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur suppression du commentaire', error: e.message });
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
