const { pgDb, getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const { isSuperAdmin } = require('../../shared/middleware');

async function estPMO(username) {
    try {
        const db = getSqlite();
        if (!db) return false;
        const user = await db.get('SELECT u.id FROM user_tiles ut JOIN users u ON u.id = ut.user_id WHERE ut.tile_id = 24 AND u.username = ?', [username]);
        return !!user;
    } catch { return false; }
}

module.exports = {
    getAll: async (req, res) => {
        try {
            const username = req.user.username;
            // Un superadmin voit toutes les revues ; les autres voient celles dont ils
            // sont créateur ou participant.
            const seeAll = isSuperAdmin(req.user);
            const whereClause = seeAll ? '' : `
                WHERE EXISTS (
                    SELECT 1 FROM hub_rencontres.revue_participants rp2
                    WHERE rp2.revue_id = r.id AND LOWER(rp2.username) = LOWER($1)
                ) OR LOWER(r.created_by) = LOWER($1)`;
            const revues = await pgDb.all(`
                SELECT r.*,
                    COUNT(DISTINCT rp.id) as projet_count,
                    COUNT(DISTINCT part.id) as participant_count,
                    COALESCE(STRING_AGG(DISTINCT p.titre, ' | ' ORDER BY p.titre), '') as projet_codes,
                    (SELECT displayname FROM hub.users WHERE LOWER(username) = LOWER(r.created_by) LIMIT 1) as created_by_displayname,
                    (SELECT STRING_AGG(DISTINCT COALESCE(NULLIF(proj.chef_projet_display_name, ''), proj.chef_projet_username), ', ')
                     FROM projets.projets proj
                     WHERE proj.id IN (SELECT projet_id FROM hub_rencontres.revue_projets WHERE revue_id = r.id)
                       AND proj.chef_projet_username IS NOT NULL AND proj.chef_projet_username != '') as chefs_projet
                FROM hub_rencontres.revues r
                LEFT JOIN hub_rencontres.revue_projets rp ON r.id = rp.revue_id
                LEFT JOIN hub_rencontres.revue_participants part ON r.id = part.revue_id
                LEFT JOIN projets.projets p ON p.id = rp.projet_id
                ${whereClause}
                GROUP BY r.id
                ORDER BY r.date_revue DESC
            `, seeAll ? [] : [username]);
            res.json(revues);
        } catch (error) {
            console.error('Erreur GET revues:', error);
            res.status(500).json({ error: error.message });
        }
    },

    create: async (req, res) => {
        try {
            const { date_revue, lieu, participants, participant_usernames, projet_ids, commentaires, taches } = req.body;
            if (!date_revue) return res.status(400).json({ error: 'La date est obligatoire' });

            const dateObj = new Date(date_revue + (date_revue.includes('T') ? '' : 'T00:00:00'));
            const dateStr = dateObj.toLocaleDateString('fr-FR', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            const titre = `Revue de projets du ${dateStr}`;

            const result = await pgDb.run(
                `INSERT INTO hub_rencontres.revues (date_revue, lieu, titre, created_by) VALUES ($1, $2, $3, $4)`,
                [date_revue, lieu || null, titre, req.user.username]
            );
            const revueId = result.lastID;

            if (projet_ids && Array.isArray(projet_ids)) {
                for (const projet_id of projet_ids) {
                    const previousRevue = await pgDb.get(
                        `SELECT id FROM hub_rencontres.revues WHERE id IN (SELECT revue_id FROM hub_rencontres.revue_projets WHERE projet_id = $1) AND id < $2 ORDER BY date_revue DESC LIMIT 1`,
                        [projet_id, revueId]
                    );
                    const previous_revue_id = previousRevue ? previousRevue.id : null;
                    const rpResult = await pgDb.run(
                        `INSERT INTO hub_rencontres.revue_projets (revue_id, projet_id, previous_revue_id, commentaire) VALUES ($1, $2, $3, $4)`,
                        [revueId, projet_id, previous_revue_id, (commentaires && commentaires[String(projet_id)]) || null]
                    );
                    const revueProjetId = rpResult.lastID;

                    if (taches && taches[String(projet_id)] && Array.isArray(taches[String(projet_id)])) {
                        for (const tacheItem of taches[String(projet_id)]) {
                            const titreTache = typeof tacheItem === 'string' ? tacheItem : (tacheItem.titre || '');
                            const responsable = typeof tacheItem === 'string' ? null : (tacheItem.responsable || null);
                            const echeance = typeof tacheItem === 'string' ? null : (tacheItem.echeance || null);
                            await pgDb.run(
                                'INSERT INTO hub_rencontres.revue_taches (revue_id, revue_projet_id, projet_id, titre, responsable, echeance) VALUES ($1, $2, $3, $4, $5, $6)',
                                [revueId, revueProjetId, projet_id, titreTache, responsable, echeance]
                            );
                            await pgDb.run(
                                "INSERT INTO projets.projet_taches (projet_id, titre, statut, responsable_username, date_fin) VALUES ($1, $2, 'a_faire', $3, $4)",
                                [projet_id, titreTache, responsable, echeance]
                            );
                        }
                    }
                }
            }

            const usernames = Array.isArray(participants) ? participants.map(p => typeof p === 'string' ? p : p.username) : participant_usernames;
            if (usernames && Array.isArray(usernames)) {
                for (const username of usernames) {
                    const user = await pgDb.get('SELECT displayname FROM hub.users WHERE username = $1', [username]);
                    const display_name = user ? user.displayname : username;
                    await pgDb.run(
                        `INSERT INTO hub_rencontres.revue_participants (revue_id, username, display_name) VALUES ($1, $2, $3)`,
                        [revueId, username, display_name]
                    );
                }
            }

            logMouchard(`Revue de projets créée: ${titre} par ${req.user.username}`);

            const created = await pgDb.get(`
                SELECT r.*, COUNT(DISTINCT rp.id) as projet_count, COUNT(DISTINCT part.id) as participant_count
                FROM hub_rencontres.revues r
                LEFT JOIN hub_rencontres.revue_projets rp ON r.id = rp.revue_id
                LEFT JOIN hub_rencontres.revue_participants part ON r.id = part.revue_id
                WHERE r.id = $1
                GROUP BY r.id
            `, [revueId]);
            res.status(201).json(created);
        } catch (error) {
            console.error('Erreur POST revue:', error);
            res.status(500).json({ error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const revue = await pgDb.get('SELECT r.* FROM hub_rencontres.revues r WHERE r.id = $1', [id]);
            if (!revue) return res.status(404).json({ error: 'Revue non trouvée' });

            const taches = await pgDb.all(
                'SELECT rt.* FROM hub_rencontres.revue_taches rt WHERE rt.revue_id = $1',
                [id]
            );

            const projets = await pgDb.all(`
                SELECT rp.*, p.code as projet_code, p.titre as projet_titre, p.meteo as projet_meteo, p.priorite as projet_priorite, p.statut as projet_statut
                FROM hub_rencontres.revue_projets rp
                JOIN projets.projets p ON p.id = rp.projet_id
                WHERE rp.revue_id = $1
                ORDER BY p.priorite DESC
            `, [id]);

            for (const projet of projets) {
                if (projet.previous_revue_id) {
                    const prev = await pgDb.get(
                        `SELECT commentaire FROM hub_rencontres.revue_projets WHERE revue_id = $1 AND projet_id = $2`,
                        [projet.previous_revue_id, projet.projet_id]
                    );
                    projet.commentaire_precedent = prev ? prev.commentaire : null;
                } else {
                    projet.commentaire_precedent = null;
                }
                projet.taches = taches.filter(t => t.revue_projet_id === projet.id);
            }

            const participants = await pgDb.all(
                'SELECT * FROM hub_rencontres.revue_participants WHERE revue_id = $1', [id]
            );

            res.json({ ...revue, projets, participants });
        } catch (error) {
            console.error('Erreur GET revue by id:', error);
            res.status(500).json({ error: error.message });
        }
    },

    addProjets: async (req, res) => {
        try {
            const { id } = req.params;
            const { projet_ids } = req.body;
            if (!projet_ids || !Array.isArray(projet_ids) || projet_ids.length === 0) {
                return res.status(400).json({ error: 'projet_ids requis' });
            }

            const added = [];
            for (const projet_id of projet_ids) {
                const exists = await pgDb.get(
                    'SELECT id FROM hub_rencontres.revue_projets WHERE revue_id = $1 AND projet_id = $2',
                    [id, projet_id]
                );
                if (exists) continue;

                const previousRevue = await pgDb.get(
                    `SELECT revue_id FROM hub_rencontres.revue_projets WHERE projet_id = $1 AND revue_id < $2 ORDER BY revue_id DESC LIMIT 1`,
                    [projet_id, id]
                );
                const previous_revue_id = previousRevue ? previousRevue.revue_id : null;

                const rpResult = await pgDb.run(
                    `INSERT INTO hub_rencontres.revue_projets (revue_id, projet_id, previous_revue_id) VALUES ($1, $2, $3)`,
                    [id, projet_id, previous_revue_id]
                );
                added.push({ id: rpResult.lastID, projet_id, previous_revue_id });
            }

            res.status(201).json({ message: `${added.length} projet(s) ajouté(s)`, added });
        } catch (error) {
            console.error('Erreur POST revue addProjets:', error);
            res.status(500).json({ error: error.message });
        }
    },

    getPreviousCommentaires: async (req, res) => {
        try {
            const { projet_ids } = req.body;
            if (!projet_ids || !Array.isArray(projet_ids) || projet_ids.length === 0) {
                return res.json({});
            }
            const result = {};
            for (const projet_id of projet_ids) {
                const prev = await pgDb.get(`
                    SELECT rp.commentaire, r.date_revue
                    FROM hub_rencontres.revue_projets rp
                    JOIN hub_rencontres.revues r ON r.id = rp.revue_id
                    WHERE rp.projet_id = $1 AND rp.commentaire IS NOT NULL AND rp.commentaire != ''
                    ORDER BY r.date_revue DESC LIMIT 1
                `, [projet_id]);
                if (prev) {
                    result[projet_id] = {
                        commentaire: prev.commentaire,
                        date_revue: prev.date_revue
                    };
                }
            }
            res.json(result);
        } catch (error) {
            console.error('Erreur GET previous commentaires:', error);
            res.status(500).json({ error: error.message });
        }
    },

    updateProjetCommentaire: async (req, res) => {
        try {
            const { id, projetId } = req.params;
            const { commentaire } = req.body;
            await pgDb.run(
                'UPDATE hub_rencontres.revue_projets SET commentaire = $1 WHERE revue_id = $2 AND projet_id = $3',
                [commentaire, id, projetId]
            );
            res.json({ message: 'Commentaire mis à jour' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    addTache: async (req, res) => {
        try {
            const { id } = req.params;
            const { titre, responsable, echeance, projet_id, revue_projet_id } = req.body;
            if (!titre) return res.status(400).json({ error: 'Le titre est obligatoire' });

            let revueProjetId, actualProjetId;

            if (revue_projet_id) {
                const rp = await pgDb.get('SELECT id, projet_id FROM hub_rencontres.revue_projets WHERE id = $1 AND revue_id = $2', [revue_projet_id, id]);
                if (!rp) return res.status(404).json({ error: 'Projet non trouvé dans cette revue' });
                revueProjetId = rp.id;
                actualProjetId = rp.projet_id;
            } else if (projet_id) {
                const rp = await pgDb.get('SELECT id FROM hub_rencontres.revue_projets WHERE revue_id = $1 AND projet_id = $2', [id, projet_id]);
                if (!rp) return res.status(404).json({ error: 'Projet non trouvé dans cette revue' });
                revueProjetId = rp.id;
                actualProjetId = projet_id;
            } else {
                return res.status(400).json({ error: 'projet_id ou revue_projet_id requis' });
            }

            const tacheResult = await pgDb.run(
                'INSERT INTO hub_rencontres.revue_taches (revue_id, revue_projet_id, projet_id, titre, responsable, echeance) VALUES ($1, $2, $3, $4, $5, $6)',
                [id, revueProjetId, actualProjetId, titre, responsable || null, echeance || null]
            );

            await pgDb.run(
                "INSERT INTO projets.projet_taches (projet_id, titre, statut, responsable_username, date_fin) VALUES ($1, $2, 'a_faire', $3, $4)",
                [actualProjetId, titre, responsable || null, echeance || null]
            );

            const created = await pgDb.get('SELECT id, titre, statut, responsable, echeance FROM hub_rencontres.revue_taches WHERE id = $1', [tacheResult.lastID]);
            res.status(201).json(created);
        } catch (error) {
            console.error('Erreur POST tache:', error);
            res.status(500).json({ error: error.message });
        }
    },

    deleteTache: async (req, res) => {
        try {
            const { id, tacheId } = req.params;
            const tache = await pgDb.get('SELECT id, projet_id FROM hub_rencontres.revue_taches WHERE id = $1 AND revue_id = $2', [tacheId, id]);
            if (!tache) return res.status(404).json({ error: 'Tâche non trouvée' });
            await pgDb.run('DELETE FROM hub_rencontres.revue_taches WHERE id = $1', [tacheId]);
            res.json({ message: 'Tâche supprimée' });
        } catch (error) {
            console.error('Erreur DELETE tache:', error);
            res.status(500).json({ error: error.message });
        }
    },

    deleteOne: async (req, res) => {
        try {
            const { id } = req.params;
            const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'admin';
            const isPMO = await estPMO(req.user.username);
            if (!isAdmin && !isPMO) {
                return res.status(403).json({ error: 'Accès refusé' });
            }

            const revue = await pgDb.get('SELECT titre FROM hub_rencontres.revues WHERE id = $1', [id]);
            if (!revue) return res.status(404).json({ error: 'Revue non trouvée' });

            // Supprimer les tâches de revue associées
            await pgDb.run('DELETE FROM hub_rencontres.revue_taches WHERE revue_id = $1', [id]);

            await pgDb.run('DELETE FROM hub_rencontres.revues WHERE id = $1', [id]);
            logMouchard(`Revue de projets supprimée: ${revue.titre} par ${req.user.username}`);
            res.json({ message: 'Revue supprimée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};
