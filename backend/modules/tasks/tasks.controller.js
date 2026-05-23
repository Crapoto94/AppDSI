const { pool } = require('../../shared/database');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

async function getUserDisplayName(username) {
    try {
        const r = await pool.query(
            'SELECT displayname FROM hub.users WHERE LOWER(username) = LOWER($1)',
            [username]
        );
        return r.rows[0]?.displayname || username;
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
                      AND (LOWER(pts.responsable) = $1 OR LOWER(pts.responsable) = $2
                           OR LOWER(COALESCE(pts.responsable_username, '')) = $1)

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
                      AND (LOWER(pts.responsable) = $1 OR LOWER(pts.responsable) = $2
                           OR LOWER(COALESCE(pts.responsable_username, '')) = $1)

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
    },

    // GET /api/tasks/alert-pref
    async getAlertPref(req, res) {
        const username = req.user.username;
        try {
            const r = await pool.query(
                'SELECT task_alert_email FROM hub.users WHERE LOWER(username) = LOWER($1)',
                [username]
            );
            res.json({ enabled: r.rows[0]?.task_alert_email === true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/alert-pref  { enabled: boolean }
    async setAlertPref(req, res) {
        const username = req.user.username;
        const { enabled } = req.body;
        try {
            await pool.query(
                'UPDATE hub.users SET task_alert_email = $1 WHERE LOWER(username) = LOWER($2)',
                [!!enabled, username]
            );
            res.json({ ok: true, enabled: !!enabled });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST /api/tasks/alert-test
    async sendTestAlert(req, res) {
        const username = req.user.username;
        try {
            const userRow = await pool.query(
                'SELECT email, displayname FROM hub.users WHERE LOWER(username) = LOWER($1)',
                [username]
            );
            const user = userRow.rows[0];
            if (!user?.email) return res.status(400).json({ error: 'Aucune adresse email trouvée pour cet utilisateur' });
            if (!sendMailFn) return res.status(503).json({ error: 'Service mail non configuré' });

            const html = await buildTasksEmail(username, user.displayname || username);
            await sendMailFn(user.email, '✅ [Test] Vos tâches du jour — DSI Hub', html, [], 'task_alert');
            res.json({ ok: true, to: user.email });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    setSendMail,

    // Called by the daily cron at 8am
    async sendDailyAlerts() {
        if (!sendMailFn) return;
        try {
            const { rows: users } = await pool.query(
                `SELECT username, email, displayname FROM hub.users
                 WHERE task_alert_email = TRUE AND email IS NOT NULL AND email != ''`
            );
            for (const user of users) {
                try {
                    const html = await buildTasksEmail(user.username, user.displayname || user.username);
                    if (html) await sendMailFn(user.email, '✅ Vos tâches du jour — DSI Hub', html, [], 'task_alert');
                } catch (e) {
                    console.error(`[tasks-alert] Erreur envoi à ${user.username}:`, e.message);
                }
            }
            console.log(`[tasks-alert] Alertes envoyées à ${users.length} utilisateur(s)`);
        } catch (e) {
            console.error('[tasks-alert] Erreur cron:', e.message);
        }
    }
};

// ─── helper : build the tasks email HTML ────────────────────────────────────
async function buildTasksEmail(username, displayName) {
    const dn = displayName.toLowerCase();
    const un = username.toLowerCase();

    const { rows } = await pool.query(`
        SELECT * FROM (
            SELECT 'Personnel' AS source, description, echeance::text, statut FROM hub.user_tasks
            WHERE statut != 'terminé' AND LOWER(username) = $1
            UNION ALL
            SELECT 'Transcript', t.description, t.deadline, CASE WHEN t.is_completed=1 THEN 'terminé' ELSE 'a_faire' END
            FROM transcript.tasks t
            WHERE t.is_completed = 0 AND (LOWER(t.assignee) = $1 OR LOWER(t.assignee) = $2)
            UNION ALL
            SELECT 'Projet', pt.titre, pt.date_fin::text, pt.statut
            FROM projets.projet_taches pt JOIN projets.projets p ON pt.projet_id = p.id
            WHERE pt.statut != 'terminé' AND LOWER(pt.responsable_username) = $1
            UNION ALL
            SELECT 'Projet', pts.tache, pts.echeance::text, pts.statut
            FROM projets.projet_taches_standalone pts
            WHERE pts.statut != 'terminé'
              AND (LOWER(pts.responsable) = $1 OR LOWER(pts.responsable) = $2
                   OR LOWER(COALESCE(pts.responsable_username,'')) = $1)
            UNION ALL
            SELECT 'Réunion BUD', rs.action_item, rs.date_echeance::text, rs.statut
            FROM hub_rencontres.rencontres_suivi rs
            WHERE rs.statut NOT IN ('terminé','done')
              AND (LOWER(rs.responsable) = $1 OR LOWER(rs.responsable) = $2)
            UNION ALL
            SELECT 'Revue', rt.titre, rt.echeance::text, rt.statut
            FROM hub_rencontres.revue_taches rt
            WHERE rt.statut != 'terminé'
              AND (LOWER(rt.responsable) = $1 OR LOWER(rt.responsable) = $2)
        ) q
        ORDER BY
            CASE WHEN echeance IS NOT NULL AND echeance::date < CURRENT_DATE THEN 0 ELSE 1 END,
            echeance ASC NULLS LAST
    `, [un, dn]);

    if (rows.length === 0) return null;  // nothing to send

    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const overdueRows = rows.filter(r => r.echeance && new Date(r.echeance) < new Date(new Date().toDateString()));
    const upcomingRows = rows.filter(r => !r.echeance || new Date(r.echeance) >= new Date(new Date().toDateString()));

    const rowHtml = (r, bg) => {
        const isOverdue = r.echeance && new Date(r.echeance) < new Date(new Date().toDateString());
        const dateStr = r.echeance ? new Date(r.echeance).toLocaleDateString('fr-FR') : '—';
        return `<tr style="background:${bg}">
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;white-space:nowrap">${r.source}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b">${r.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;white-space:nowrap;color:${isOverdue ? '#dc2626' : '#475569'};font-weight:${isOverdue ? '700' : '400'}">${isOverdue ? '⚠ ' : ''}${dateStr}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${r.statut === 'a_faire' ? 'À faire' : r.statut === 'en_cours' ? 'En cours' : r.statut}</td>
        </tr>`;
    };

    const tableHeader = `<tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Source</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Tâche</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Échéance</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Statut</th>
    </tr>`;

    let overdueSection = '';
    if (overdueRows.length > 0) {
        overdueSection = `<h3 style="margin:24px 0 8px;color:#dc2626;font-size:14px">⚠ En retard (${overdueRows.length})</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            ${tableHeader}${overdueRows.map((r, i) => rowHtml(r, i % 2 === 0 ? '#fff5f5' : '#fff')).join('')}
        </table>`;
    }

    let upcomingSection = '';
    if (upcomingRows.length > 0) {
        upcomingSection = `<h3 style="margin:24px 0 8px;color:#1e293b;font-size:14px">📋 À traiter (${upcomingRows.length})</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            ${tableHeader}${upcomingRows.map((r, i) => rowHtml(r, i % 2 === 0 ? '#f8fafc' : '#fff')).join('')}
        </table>`;
    }

    return `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
        <h2 style="color:#1e293b;margin-bottom:4px">Bonjour ${displayName},</h2>
        <p style="color:#64748b;margin-top:4px">Voici un récapitulatif de vos tâches en cours au <strong>${today}</strong>.</p>
        ${overdueSection}${upcomingSection}
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
            Vous recevez ce mail car vous avez activé les alertes dans <em>Mes Tâches</em>.
            Vous pouvez les désactiver à tout moment depuis l'application.
        </p>
    </div>`;
}
