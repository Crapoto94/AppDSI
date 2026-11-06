/**
 * Boîte à idées : remplace la boîte à idées physique. Tout agent connecté peut déposer une idée, avec ou sans son nom.
 *
 * ANONYMAT : une idée « anonyme » est enregistrée SANS aucune information sur son auteur (ni identifiant, ni nom) :
 * personne, administrateurs compris, ne peut la rattacher à son auteur, et son auteur ne la retrouve pas dans « mes idées ».
 * Seuls les votes (un par agent et par idée) mémorisent l'identifiant du votant, jamais lié à l'auteur d'une idée.
 */
const { pool } = require('../../shared/database');
const { isAdminLike } = require('../../shared/middleware');

const CATEGORIES = [
    { key: 'cadre_vie', label: 'Cadre de vie', emoji: '🌳', color: '#16a34a', description: 'Locaux, espaces, confort au travail' },
    { key: 'efficacite', label: 'Efficacité', emoji: '⚡', color: '#f59e0b', description: 'Organisation, process, gain de temps' },
    { key: 'numerique', label: 'Outils & numérique', emoji: '💻', color: '#3b82f6', description: 'Logiciels, matériel, services en ligne' },
    { key: 'bien_etre', label: 'Bien-être & santé', emoji: '💆', color: '#ec4899', description: 'Santé, ergonomie, qualité de vie' },
    { key: 'ambiance', label: 'Ambiance & relations', emoji: '🤝', color: '#8b5cf6', description: 'Convivialité, entraide, esprit d\'équipe' },
    { key: 'environnement', label: 'Environnement', emoji: '♻️', color: '#14b8a6', description: 'Écologie, économies d\'énergie, déchets' },
    { key: 'formation', label: 'Formation & carrière', emoji: '🎓', color: '#f97316', description: 'Compétences, évolution, mobilité' },
    { key: 'securite', label: 'Sécurité', emoji: '🦺', color: '#ef4444', description: 'Sécurité des personnes et des biens' },
    { key: 'autre', label: 'Autre', emoji: '💡', color: '#64748b', description: 'Toute autre bonne idée' },
];
const STATUTS = {
    nouvelle: 'Nouvelle', en_etude: 'En étude', retenue: 'Retenue', realisee: 'Réalisée', refusee: 'Non retenue',
};
const catKeys = new Set(CATEGORIES.map((c) => c.key));

// Limite anti-abus EN MÉMOIRE (rien n'est enregistré) : 10 dépôts par agent et par 24 h, y compris en mode anonyme
const depots = new Map();
function tooMany(username) {
    const now = Date.now();
    const list = (depots.get(username) || []).filter((t) => now - t < 24 * 3600 * 1000);
    if (list.length >= 10) { depots.set(username, list); return true; }
    list.push(now); depots.set(username, list);
    return false;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);

module.exports = {
    categories(req, res) {
        res.json({ categories: CATEGORIES, statuts: STATUTS });
    },

    /** Liste des idées (filtrables) avec nombre de votes et vote de l'utilisateur ; l'auteur n'apparaît que si l'idée n'est pas anonyme. */
    async list(req, res) {
        try {
            const params = [req.user.username];
            const where = [];
            if (req.query.categorie && catKeys.has(req.query.categorie)) { params.push(req.query.categorie); where.push(`i.categorie = $${params.length}`); }
            if (req.query.statut && STATUTS[req.query.statut]) { params.push(req.query.statut); where.push(`i.statut = $${params.length}`); }
            if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 80)}%`); where.push(`(i.titre ILIKE $${params.length} OR i.contenu ILIKE $${params.length})`); }
            if (req.query.mine === '1') where.push(`i.auteur_username = $1`);
            const order = req.query.tri === 'votes' ? 'votes DESC, i.created_at DESC' : 'i.created_at DESC';
            const r = await pool.query(
                `SELECT i.id, i.categorie, i.titre, i.contenu, i.anonyme, i.auteur_nom, i.statut, i.reponse, i.reponse_par, i.reponse_at, i.created_at,
                        (SELECT COUNT(*)::int FROM hub.boite_idees_votes v WHERE v.idee_id = i.id) AS votes,
                        EXISTS (SELECT 1 FROM hub.boite_idees_votes v WHERE v.idee_id = i.id AND LOWER(v.username) = LOWER($1)) AS vote_moi,
                        (i.auteur_username IS NOT NULL AND LOWER(i.auteur_username) = LOWER($1)) AS mienne
                   FROM hub.boite_idees i
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY ${order} LIMIT 500`, params);
            res.json(r.rows.map((i) => ({ ...i, auteur_nom: i.anonyme ? null : i.auteur_nom })));
        } catch (e) {
            res.status(500).json({ message: 'Erreur de chargement des idées', error: e.message });
        }
    },

    async stats(req, res) {
        try {
            const total = (await pool.query('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE anonyme)::int AS anonymes FROM hub.boite_idees')).rows[0];
            const cats = (await pool.query('SELECT categorie, COUNT(*)::int AS n FROM hub.boite_idees GROUP BY 1')).rows;
            const sts = (await pool.query('SELECT statut, COUNT(*)::int AS n FROM hub.boite_idees GROUP BY 1')).rows;
            res.json({ ...total, par_categorie: Object.fromEntries(cats.map((c) => [c.categorie, c.n])), par_statut: Object.fromEntries(sts.map((s) => [s.statut, s.n])) });
        } catch (e) {
            res.status(500).json({ message: 'Erreur de calcul des statistiques', error: e.message });
        }
    },

    async create(req, res) {
        try {
            const categorie = catKeys.has(req.body.categorie) ? req.body.categorie : null;
            const titre = clean(req.body.titre, 150);
            const contenu = clean(req.body.contenu, 4000);
            const anonyme = req.body.anonyme === true || req.body.anonyme === 'true';
            if (!categorie) return res.status(400).json({ message: 'Choisissez une catégorie' });
            if (titre.length < 3) return res.status(400).json({ message: 'Le titre est trop court' });
            if (contenu.length < 10) return res.status(400).json({ message: 'Décrivez votre idée en quelques mots (10 caractères minimum)' });
            if (tooMany(String(req.user.username || '').toLowerCase())) return res.status(429).json({ message: 'Vous avez déposé beaucoup d\'idées aujourd\'hui : réessayez demain' });
            // Idée anonyme : AUCUNE information sur l'auteur n'est enregistrée
            const auteurUsername = anonyme ? null : req.user.username;
            const auteurNom = anonyme ? null : (req.user.displayName || req.user.username);
            const r = await pool.query(
                `INSERT INTO hub.boite_idees (categorie, titre, contenu, anonyme, auteur_username, auteur_nom) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                [categorie, titre, contenu, anonyme, auteurUsername, auteurNom]
            );
            res.status(201).json({ id: r.rows[0].id, message: anonyme ? 'Merci ! Votre idée a été déposée anonymement.' : 'Merci ! Votre idée a été déposée.' });
        } catch (e) {
            res.status(500).json({ message: "Erreur lors du dépôt de l'idée", error: e.message });
        }
    },

    /** Vote / retrait du vote (un vote par agent et par idée). */
    async vote(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const exists = (await pool.query('SELECT 1 FROM hub.boite_idees WHERE id = $1', [id])).rowCount;
            if (!exists) return res.status(404).json({ message: 'Idée introuvable' });
            const del = await pool.query('DELETE FROM hub.boite_idees_votes WHERE idee_id = $1 AND LOWER(username) = LOWER($2)', [id, req.user.username]);
            if (!del.rowCount) await pool.query('INSERT INTO hub.boite_idees_votes (idee_id, username) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user.username]);
            const votes = (await pool.query('SELECT COUNT(*)::int AS n FROM hub.boite_idees_votes WHERE idee_id = $1', [id])).rows[0].n;
            res.json({ votes, vote_moi: !del.rowCount });
        } catch (e) {
            res.status(500).json({ message: 'Erreur lors du vote', error: e.message });
        }
    },

    /** Modération : statut et réponse de la DSI (administrateurs). */
    async moderate(req, res) {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Réservé aux administrateurs' });
            const id = parseInt(req.params.id, 10);
            const sets = []; const params = [];
            if (req.body.statut !== undefined) {
                if (!STATUTS[req.body.statut]) return res.status(400).json({ message: 'Statut inconnu' });
                params.push(req.body.statut); sets.push(`statut = $${params.length}`);
            }
            if (req.body.reponse !== undefined) {
                const rep = clean(req.body.reponse, 2000);
                params.push(rep || null); sets.push(`reponse = $${params.length}`);
                params.push(rep ? (req.user.displayName || req.user.username) : null); sets.push(`reponse_par = $${params.length}`);
                sets.push(rep ? 'reponse_at = NOW()' : 'reponse_at = NULL');
            }
            if (!sets.length) return res.status(400).json({ message: 'Rien à modifier' });
            params.push(id);
            const r = await pool.query(`UPDATE hub.boite_idees SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id`, params);
            if (!r.rowCount) return res.status(404).json({ message: 'Idée introuvable' });
            res.json({ message: 'Idée mise à jour' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour', error: e.message });
        }
    },

    /** Suppression : administrateurs, ou l'auteur d'une idée NON anonyme. */
    async remove(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const idee = (await pool.query('SELECT auteur_username FROM hub.boite_idees WHERE id = $1', [id])).rows[0];
            if (!idee) return res.status(404).json({ message: 'Idée introuvable' });
            const mine = idee.auteur_username && idee.auteur_username.toLowerCase() === String(req.user.username || '').toLowerCase();
            if (!isAdminLike(req.user) && !mine) return res.status(403).json({ message: 'Vous ne pouvez pas supprimer cette idée' });
            await pool.query('DELETE FROM hub.boite_idees WHERE id = $1', [id]);
            res.json({ message: 'Idée supprimée' });
        } catch (e) {
            res.status(500).json({ message: 'Erreur lors de la suppression', error: e.message });
        }
    },
};
