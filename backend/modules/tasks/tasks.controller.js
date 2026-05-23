const { pool } = require('../../shared/database');

async function getUserDisplayName(username) {
    try {
        const r = await pool.query(
            'SELECT "displayName" FROM hub.users WHERE LOWER(username) = LOWER($1)',
            [username]
        );
        return r.rows[0]?.displayName || username;
    } catch (e) {
        return username;
    }
}

module.exports = {

    // GET /api/tasks
    async getMyTasks(req, res) {
        const username = req.user.username;
        try {
            const displayName = await getUserDisplayName(username);
            const un = username.toLowerCase();
            const dn = displayName.toLowerCase();

            const { rows } = await pool.query(`
                SELECT * FROM (
                    SELECT
                        'personal'    AS source,
                        ut.id,
                        NULL::integer AS source_id,
                        'Tâche personnelle' AS source_title,
                        ut.description,
                        ut.echeance::text AS echeance,
                        ut.statut,
                        ut.username   AS responsable,
                        ut.created_at
                    FROM hub.user_tasks ut
                    WHERE ut.statut != 'terminé'
                      AND LOWER(ut.username) = $1

                    UNION ALL

                    SELECT
                        'transcript'  AS source,
                        t.id,
                        t.meeting_id  AS source_id,
                        m.title       AS source_title,
                        t.description,
                        t.deadline    AS echeance,
                        CASE WHEN t.is_completed = 1 THEN 'terminé' ELSE 'a_faire' END AS statut,
                        t.assignee    AS responsable,
                        t.created_at
                    FROM transcript.tasks t
                    JOIN transcript.meetings m ON t.meeting_id = m.id
                    WHERE t.is_completed = 0
                      AND (LOWER(t.assignee) = $1 OR LOWER(t.assignee) = $2)

                    UNION ALL

                    SELECT
                        'projet'               AS source,
                        pt.id,
                        pt.projet_id           AS source_id,
                        p.titre                AS source_title,
                        pt.titre               AS description,
                        pt.date_fin::text      AS echeance,
                        pt.statut,
                        pt.responsable_username AS responsable,
                        pt.date_creation       AS created_at
                    FROM projets.projet_taches pt
                    JOIN projets.projets p ON pt.projet_id = p.id
                    WHERE pt.statut != 'terminé'
                      AND LOWER(pt.responsable_username) = $1

                    UNION ALL

                    SELECT
                        'projet_standalone'     AS source,
                        pts.id,
                        pts.projet_id           AS source_id,
                        p.titre                 AS source_title,
                        pts.tache               AS description,
                        pts.echeance::text      AS echeance,
                        pts.statut,
                        pts.responsable,
                        pts.created_at
                    FROM projets.projet_taches_standalone pts
                    JOIN projets.projets p ON pts.projet_id = p.id
                    WHERE pts.statut != 'terminé'
                      AND (LOWER(pts.responsable) = $1 OR LOWER(pts.responsable) = $2)

                    UNION ALL

                    SELECT
                        'rencontre'            AS source,
                        rs.id,
                        rs.rencontre_id        AS source_id,
                        rb.titre               AS source_title,
                        rs.action_item         AS description,
                        rs.date_echeance::text AS echeance,
                        rs.statut,
                        rs.responsable,
                        rs.updated_at          AS created_at
                    FROM hub_rencontres.rencontres_suivi rs
                    JOIN hub_rencontres.rencontres_budgetaires rb ON rs.rencontre_id = rb.id
                    WHERE rs.statut NOT IN ('terminé', 'done')
                      AND (LOWER(rs.responsable) = $1 OR LOWER(rs.responsable) = $2)

                    UNION ALL

                    SELECT
                        'revue'              AS source,
                        rt.id,
                        rt.revue_id          AS source_id,
                        rv.titre             AS source_title,
                        rt.titre             AS description,
                        rt.echeance::text    AS echeance,
                        rt.statut,
                        rt.responsable,
                        rt.created_at
                    FROM hub_rencontres.revue_taches rt
                    JOIN hub_rencontres.revues rv ON rt.revue_id = rv.id
                    WHERE rt.statut != 'terminé'
                      AND (LOWER(rt.responsable) = $1 OR LOWER(rt.responsable) = $2)

                    UNION ALL

                    SELECT
                        'reunion'            AS source,
                        (r.id * 10000 + ord.ordinality)::integer AS id,
                        r.id                 AS source_id,
                        r.titre              AS source_title,
                        (item->>'tache')     AS description,
                        (item->>'echeance')  AS echeance,
                        COALESCE(item->>'statut', 'a_faire') AS statut,
                        (item->>'responsable') AS responsable,
                        r.created_at
                    FROM hub_rencontres.rencontres_reunions r
                    CROSS JOIN LATERAL json_array_elements(
                        CASE WHEN r.liste_taches IS NOT NULL AND r.liste_taches NOT IN ('', '[]')
                             THEN r.liste_taches::json ELSE '[]'::json END
                    ) WITH ORDINALITY AS ord(item, ordinality)
                    WHERE COALESCE(item->>'statut', 'a_faire') NOT IN ('terminee', 'terminé')
                      AND (LOWER(item->>'responsable') = $1
                           OR LOWER(item->>'responsable') = $2
                           OR LOWER(item->>'responsable_username') = $1)
                ) q
                ORDER BY
                    CASE WHEN echeance IS NOT NULL AND echeance::date < CURRENT_DATE THEN 0 ELSE 1 END,
                    echeance ASC NULLS LAST,
                    created_at DESC
            `, [un, dn]);

            res.json(rows);
        } catch (error) {
            console.error('[tasks] getMyTasks error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/count — badge dashboard (tâches en retard)
    async getMyTasksCount(req, res) {
        const username = req.user.username;
        try {
            const displayName = await getUserDisplayName(username);
            const un = username.toLowerCase();
            const dn = displayName.toLowerCase();

            const { rows } = await pool.query(`
                SELECT COUNT(*) AS count FROM (
                    SELECT 1 FROM hub.user_tasks ut
                    WHERE ut.statut != 'terminé'
                      AND ut.echeance IS NOT NULL AND ut.echeance < CURRENT_DATE
                      AND LOWER(ut.username) = $1

                    UNION ALL

                    SELECT 1 FROM transcript.tasks t
                    WHERE t.is_completed = 0
                      AND t.deadline IS NOT NULL AND t.deadline::date < CURRENT_DATE
                      AND (LOWER(t.assignee) = $1 OR LOWER(t.assignee) = $2)

                    UNION ALL

                    SELECT 1 FROM projets.projet_taches pt
                    WHERE pt.statut != 'terminé'
                      AND pt.date_fin IS NOT NULL AND pt.date_fin < CURRENT_DATE
                      AND LOWER(pt.responsable_username) = $1

                    UNION ALL

                    SELECT 1 FROM projets.projet_taches_standalone pts
                    WHERE pts.statut != 'terminé'
                      AND pts.echeance IS NOT NULL AND pts.echeance < CURRENT_DATE
                      AND (LOWER(pts.responsable) = $1 OR LOWER(pts.responsable) = $2)

                    UNION ALL

                    SELECT 1 FROM hub_rencontres.rencontres_suivi rs
                    WHERE rs.statut NOT IN ('terminé', 'done')
                      AND rs.date_echeance IS NOT NULL AND rs.date_echeance < CURRENT_DATE
                      AND (LOWER(rs.responsable) = $1 OR LOWER(rs.responsable) = $2)

                    UNION ALL

                    SELECT 1 FROM hub_rencontres.revue_taches rt
                    WHERE rt.statut != 'terminé'
                      AND rt.echeance IS NOT NULL AND rt.echeance < CURRENT_DATE
                      AND (LOWER(rt.responsable) = $1 OR LOWER(rt.responsable) = $2)
                ) overdue
            `, [un, dn]);

            res.json({ count: Number(rows[0].count) });
        } catch (error) {
            res.status(500).json({ count: 0 });
        }
    },

    // POST /api/tasks  { description, echeance }
    async createTask(req, res) {
        const username = req.user.username;
        const { description, echeance } = req.body;
        if (!description?.trim()) return res.status(400).json({ error: 'Description requise' });
        try {
            const { rows } = await pool.query(
                `INSERT INTO hub.user_tasks (username, description, echeance, statut)
                 VALUES ($1, $2, $3, 'a_faire') RETURNING *`,
                [username, description.trim(), echeance || null]
            );
            res.json(rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/:source/:id  { statut }
    async updateTaskStatus(req, res) {
        const { source, id } = req.params;
        const { statut } = req.body;
        if (!statut) return res.status(400).json({ error: 'statut requis' });
        try {
            switch (source) {
                case 'personal':
                    await pool.query(
                        'UPDATE hub.user_tasks SET statut = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [statut, id]
                    );
                    break;
                case 'transcript':
                    await pool.query(
                        'UPDATE transcript.tasks SET is_completed = $1 WHERE id = $2',
                        [statut === 'terminé' ? 1 : 0, id]
                    );
                    break;
                case 'projet':
                    await pool.query(
                        'UPDATE projets.projet_taches SET statut = $1 WHERE id = $2',
                        [statut, id]
                    );
                    break;
                case 'projet_standalone':
                    await pool.query(
                        'UPDATE projets.projet_taches_standalone SET statut = $1 WHERE id = $2',
                        [statut, id]
                    );
                    break;
                case 'rencontre':
                    await pool.query(
                        'UPDATE hub_rencontres.rencontres_suivi SET statut = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [statut, id]
                    );
                    break;
                case 'revue':
                    await pool.query(
                        'UPDATE hub_rencontres.revue_taches SET statut = $1 WHERE id = $2',
                        [statut, id]
                    );
                    break;
                default:
                    return res.status(400).json({ error: 'Source inconnue' });
            }
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/tasks/personal/:id
    async deleteTask(req, res) {
        const username = req.user.username;
        const { id } = req.params;
        try {
            await pool.query(
                'DELETE FROM hub.user_tasks WHERE id = $1 AND LOWER(username) = LOWER($2)',
                [id, username]
            );
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};
