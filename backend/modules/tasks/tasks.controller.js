const { pool } = require('../../shared/database');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

const TASK_NOTES_DIR = path.join(__dirname, '..', '..', 'file_task_notes');
if (!fs.existsSync(TASK_NOTES_DIR)) fs.mkdirSync(TASK_NOTES_DIR, { recursive: true });

// Status normalization between sources
// projet/projet_standalone native: 'terminee'  |  Mes Tâches: 'terminé'
const normalizeStatutOut = (statut) => {
    if (!statut) return 'a_faire';
    if (statut === 'terminee' || statut === 'terminée') return 'terminé';
    return statut;
};
const normalizeStatutIn = (statut, source) => {
    if ((source === 'projet' || source === 'projet_standalone') && statut === 'terminé') return 'terminee';
    return statut;
};

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
                        COALESCE(ut.context_source, 'personal') AS source,
                        ut.id,
                        ut.context_id AS source_id,
                        COALESCE(ut.context_title, 'Tâche personnelle') AS source_title,
                        ut.description,
                        ut.echeance::text AS echeance,
                        ut.statut,
                        ut.username   AS responsable,
                        ut.created_at,
                        ut.is_team_task,
                        ut.team_group_id::text AS team_group_id,
                        ut.created_by
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
                        t.created_at,
                        FALSE         AS is_team_task,
                        NULL          AS team_group_id,
                        NULL          AS created_by
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
                        CASE WHEN pt.statut IN ('terminee','terminée') THEN 'terminé' ELSE pt.statut END AS statut,
                        pt.responsable_username AS responsable,
                        pt.date_creation       AS created_at,
                        FALSE                  AS is_team_task,
                        NULL                   AS team_group_id,
                        NULL                   AS created_by
                    FROM projets.projet_taches pt
                    JOIN projets.projets p ON pt.projet_id = p.id
                    WHERE pt.statut NOT IN ('terminé','terminee','terminée')
                      AND LOWER(pt.responsable_username) = $1

                    UNION ALL

                    SELECT
                        'projet_standalone'     AS source,
                        pts.id,
                        pts.projet_id           AS source_id,
                        p.titre                 AS source_title,
                        pts.tache               AS description,
                        pts.echeance::text      AS echeance,
                        CASE WHEN pts.statut IN ('terminee','terminée') THEN 'terminé' ELSE pts.statut END AS statut,
                        pts.responsable,
                        pts.created_at,
                        FALSE                   AS is_team_task,
                        NULL                    AS team_group_id,
                        NULL                    AS created_by
                    FROM projets.projet_taches_standalone pts
                    JOIN projets.projets p ON pts.projet_id = p.id
                    WHERE pts.statut NOT IN ('terminé','terminee','terminée')
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
                        rs.updated_at          AS created_at,
                        FALSE                  AS is_team_task,
                        NULL                   AS team_group_id,
                        NULL                   AS created_by
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
                        rt.created_at,
                        FALSE                AS is_team_task,
                        NULL                 AS team_group_id,
                        NULL                 AS created_by
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
                        r.created_at,
                        FALSE                AS is_team_task,
                        NULL                 AS team_group_id,
                        NULL                 AS created_by
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

            // Enrich with note counts from hub.task_notes
            const taskIds = rows.map(r => `${r.source}:${r.id}`);
            let noteCountMap = {};
            if (taskIds.length > 0) {
                try {
                    const noteRows = await pool.query(
                        `SELECT source || ':' || task_id AS key, COUNT(*) AS cnt
                         FROM hub.task_notes
                         WHERE (source, task_id) IN (${rows.map((r, i) => `($${i*2+1}, $${i*2+2})`).join(',')})
                         GROUP BY source, task_id`,
                        rows.flatMap(r => [r.source, String(r.id)])
                    );
                    for (const nr of noteRows.rows) noteCountMap[nr.key] = parseInt(nr.cnt);
                } catch (e) { /* ignore - table may not exist yet */ }
            }

            res.json(rows.map(r => ({ ...r, note_count: noteCountMap[`${r.source}:${r.id}`] || 0 })));
        } catch (error) {
            console.error('[tasks] getMyTasks error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/count — badge dashboard
    async getMyTasksCount(req, res) {
        const username = req.user.username;
        try {
            const displayName = await getUserDisplayName(username);
            const un = username.toLowerCase();
            const dn = displayName.toLowerCase();

            const { rows } = await pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE echeance IS NOT NULL AND echeance < CURRENT_DATE) AS overdue,
                    COUNT(*) FILTER (WHERE statut = 'en_cours') AS en_cours,
                    COUNT(*) FILTER (WHERE statut = 'a_faire' AND (echeance IS NULL OR echeance >= CURRENT_DATE)) AS a_faire
                FROM (
                    SELECT statut, echeance FROM hub.user_tasks
                    WHERE statut NOT IN ('terminé','terminee') AND LOWER(username) = $1

                    UNION ALL

                    SELECT CASE WHEN is_completed=1 THEN 'terminé' ELSE 'a_faire' END, deadline::date
                    FROM transcript.tasks
                    WHERE is_completed = 0 AND (LOWER(assignee) = $1 OR LOWER(assignee) = $2)

                    UNION ALL

                    SELECT statut, date_fin FROM projets.projet_taches
                    WHERE statut NOT IN ('terminé','terminee','terminée') AND LOWER(responsable_username) = $1

                    UNION ALL

                    SELECT statut, echeance FROM projets.projet_taches_standalone
                    WHERE statut NOT IN ('terminé','terminee','terminée')
                      AND (LOWER(responsable) = $1 OR LOWER(responsable) = $2
                           OR LOWER(COALESCE(responsable_username,'')) = $1)

                    UNION ALL

                    SELECT statut, date_echeance FROM hub_rencontres.rencontres_suivi
                    WHERE statut NOT IN ('terminé','done')
                      AND (LOWER(responsable) = $1 OR LOWER(responsable) = $2)

                    UNION ALL

                    SELECT statut, echeance FROM hub_rencontres.revue_taches
                    WHERE statut != 'terminé'
                      AND (LOWER(responsable) = $1 OR LOWER(responsable) = $2)
                ) all_tasks
            `, [un, dn]);

            const r = rows[0];
            res.json({
                count: Number(r.overdue),   // backward compat (overdue = red badge)
                overdue: Number(r.overdue),
                en_cours: Number(r.en_cours),
                a_faire: Number(r.a_faire)
            });
        } catch (error) {
            res.status(500).json({ count: 0, overdue: 0, en_cours: 0, a_faire: 0 });
        }
    },

    // POST /api/tasks  — unified creation (personal, context, team)
    // Body: { description, echeance?, context_source?, context_id?, context_title?,
    //         is_team_task?, assignees?: string[], service_code?: string }
    async createTask(req, res) {
        const creator = req.user.username;
        const {
            description, echeance,
            context_source = 'personal', context_id = null, context_title = null,
            is_team_task = false, assignees = [], service_code = null
        } = req.body;
        if (!description?.trim()) return res.status(400).json({ error: 'Description requise' });
        try {
            let targets = []; // array of usernames to assign to

            if (is_team_task) {
                if (service_code) {
                    // Assign to all active users in this service
                    const { rows: svcUsers } = await pool.query(
                        `SELECT username FROM hub.users
                         WHERE LOWER(COALESCE(service_code,'')) = LOWER($1)
                           AND is_approved = 1 AND username IS NOT NULL`,
                        [service_code]
                    );
                    targets = svcUsers.map(u => u.username);
                } else if (assignees.length > 0) {
                    targets = assignees;
                }
                // If no targets found, fall back to creator
                if (targets.length === 0) targets = [creator];
            } else {
                // Single-user: use first assignee if provided, else creator
                targets = assignees.length > 0 ? [assignees[0]] : [creator];
            }

            const teamGroupId = is_team_task && targets.length > 1 ? randomUUID() : null;

            const created = [];
            for (const uname of targets) {
                const { rows } = await pool.query(
                    `INSERT INTO hub.user_tasks
                       (username, description, echeance, statut,
                        is_team_task, team_group_id, created_by,
                        context_source, context_id, context_title)
                     VALUES ($1,$2,$3,'a_faire',$4,$5,$6,$7,$8,$9)
                     RETURNING *`,
                    [uname, description.trim(), echeance || null,
                     is_team_task, teamGroupId, creator,
                     context_source, context_id, context_title]
                );
                created.push(rows[0]);
            }
            // Return single row for personal tasks, array for team
            res.status(201).json(created.length === 1 ? created[0] : created);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/services — list of services for team task assignment
    async getServices(req, res) {
        try {
            const { rows } = await pool.query(`
                SELECT service_code, COUNT(*) AS user_count
                FROM hub.users
                WHERE service_code IS NOT NULL AND service_code != ''
                  AND is_approved = 1
                GROUP BY service_code
                ORDER BY service_code
            `);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/by-context?source=X&id=Y — tasks for a module context
    async getTasksByContext(req, res) {
        const { source, id } = req.query;
        if (!source || !id) return res.status(400).json({ error: 'source et id requis' });
        try {
            const { rows } = await pool.query(
                `SELECT ut.*, tn_count.cnt AS note_count
                 FROM hub.user_tasks ut
                 LEFT JOIN (
                     SELECT task_id::integer AS tid, COUNT(*) AS cnt
                     FROM hub.task_notes WHERE source = 'personal'
                     GROUP BY task_id
                 ) tn_count ON tn_count.tid = ut.id
                 WHERE ut.context_source = $1 AND ut.context_id = $2
                 ORDER BY ut.created_at ASC`,
                [source, parseInt(id)]
            );
            res.json(rows);
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
            const dbStatut = normalizeStatutIn(statut, source);
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
                        [dbStatut, id]
                    );
                    break;
                case 'projet_standalone':
                    await pool.query(
                        'UPDATE projets.projet_taches_standalone SET statut = $1 WHERE id = $2',
                        [dbStatut, id]
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
            // cleanup notes
            await pool.query('DELETE FROM hub.task_notes WHERE source = $1 AND task_id = $2', ['personal', String(id)]);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── NOTES ──────────────────────────────────────────────────────────────────

    // GET /api/tasks/:source/:id/notes
    async getTaskNotes(req, res) {
        const { source, id } = req.params;
        try {
            const { rows } = await pool.query(
                `SELECT * FROM hub.task_notes WHERE source=$1 AND task_id=$2 ORDER BY created_at ASC`,
                [source, String(id)]
            );
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST /api/tasks/:source/:id/notes  { content }
    async addTaskNote(req, res) {
        const { source, id } = req.params;
        const { content } = req.body;
        const username = req.user.username;
        if (!content?.trim()) return res.status(400).json({ error: 'Contenu requis' });
        try {
            const { rows } = await pool.query(
                `INSERT INTO hub.task_notes (source, task_id, content, type, created_by) VALUES ($1,$2,$3,'comment',$4) RETURNING *`,
                [source, String(id), content.trim(), username]
            );
            res.status(201).json(rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST /api/tasks/:source/:id/notes/file  (multipart)
    async addTaskNoteFile(req, res) {
        const { source, id } = req.params;
        const username = req.user.username;
        if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
        try {
            const { rows } = await pool.query(
                `INSERT INTO hub.task_notes (source, task_id, content, type, filename, filepath, created_by)
                 VALUES ($1,$2,$3,'file',$4,$5,$6) RETURNING *`,
                [source, String(id), req.file.originalname, req.file.originalname, req.file.filename, username]
            );
            res.status(201).json(rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/:source/:id/notes/:noteId/file
    async downloadTaskNoteFile(req, res) {
        const { noteId } = req.params;
        try {
            const { rows } = await pool.query('SELECT * FROM hub.task_notes WHERE id=$1 AND type=$2', [noteId, 'file']);
            if (!rows[0]) return res.status(404).json({ error: 'Fichier non trouvé' });
            const filePath = path.join(TASK_NOTES_DIR, rows[0].filepath);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier manquant sur le disque' });
            res.download(filePath, rows[0].filename || rows[0].content || 'fichier');
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/tasks/:source/:id/notes/:noteId
    async deleteTaskNote(req, res) {
        const { noteId } = req.params;
        try {
            const { rows } = await pool.query('SELECT * FROM hub.task_notes WHERE id=$1', [noteId]);
            if (rows[0]?.type === 'file' && rows[0]?.filepath) {
                const fp = path.join(TASK_NOTES_DIR, rows[0].filepath);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            }
            await pool.query('DELETE FROM hub.task_notes WHERE id=$1', [noteId]);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── ALERT PREF ─────────────────────────────────────────────────────────────

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
            await sendMailFn(user.email, '✅ [Test] Vos tâches du jour — DSI Hub', html || '<p>Aucune tâche active.</p>', [], 'task_alert');
            res.json({ ok: true, to: user.email });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── MS TODO SYNC ────────────────────────────────────────────────────────────

    // GET /api/tasks/todo-sync
    async getTodoSyncPref(req, res) {
        const username = req.user.username;
        try {
            const r = await pool.query(
                'SELECT ms_todo_sync FROM hub.users WHERE LOWER(username) = LOWER($1)',
                [username]
            );
            res.json({ enabled: r.rows[0]?.ms_todo_sync === true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/todo-sync  { enabled: boolean }
    async setTodoSyncPref(req, res) {
        const username = req.user.username;
        const { enabled } = req.body;
        try {
            await pool.query(
                'UPDATE hub.users SET ms_todo_sync = $1 WHERE LOWER(username) = LOWER($2)',
                [!!enabled, username]
            );
            res.json({ ok: true, enabled: !!enabled });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // POST /api/tasks/todo-sync/run  — push tasks to Microsoft Todo
    async runTodoSync(req, res) {
        const username = req.user.username;
        try {
            // Get Azure config
            const { getSqlite } = require('../../shared/database');
            const db = getSqlite();
            const azureSettings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!azureSettings?.is_enabled || !azureSettings?.client_id || !azureSettings?.client_secret || !azureSettings?.tenant_id) {
                return res.status(503).json({ error: 'Azure AD non configuré. Contactez l\'administrateur.' });
            }

            // Get user info
            const userRow = await pool.query(
                'SELECT email, displayname FROM hub.users WHERE LOWER(username) = LOWER($1)',
                [username]
            );
            const user = userRow.rows[0];
            if (!user?.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

            // Get app-level token (client_credentials)
            const axios = require('axios');
            let accessToken;
            try {
                const tokenRes = await axios.post(
                    `https://login.microsoftonline.com/${azureSettings.tenant_id}/oauth2/v2.0/token`,
                    new URLSearchParams({
                        client_id: azureSettings.client_id,
                        client_secret: azureSettings.client_secret,
                        grant_type: 'client_credentials',
                        scope: 'https://graph.microsoft.com/.default'
                    }).toString(),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                accessToken = tokenRes.data.access_token;
            } catch (e) {
                return res.status(503).json({ error: 'Impossible d\'obtenir un token Azure AD. Vérifiez la configuration.' });
            }

            const graphHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

            // Find or create "DSI Hub" list in user's Todo
            let listId;
            try {
                const listsRes = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${user.email}/todo/lists`,
                    { headers: graphHeaders }
                );
                const lists = listsRes.data.value || [];
                const existing = lists.find(l => l.displayName === 'DSI Hub');
                if (existing) {
                    listId = existing.id;
                } else {
                    const createRes = await axios.post(
                        `https://graph.microsoft.com/v1.0/users/${user.email}/todo/lists`,
                        { displayName: 'DSI Hub' },
                        { headers: graphHeaders }
                    );
                    listId = createRes.data.id;
                }
            } catch (e) {
                const errMsg = e.response?.data?.error?.message || e.message;
                if (errMsg.includes('Authorization_RequestDenied') || errMsg.includes('Tasks.ReadWrite')) {
                    return res.status(403).json({
                        error: 'Permission refusée par Azure AD.',
                        detail: 'La permission applicative Tasks.ReadWrite.All doit être accordée à l\'application Azure dans le portail Azure AD (consentement administrateur).'
                    });
                }
                return res.status(502).json({ error: `Erreur Microsoft Graph: ${errMsg}` });
            }

            // Get current tasks for this user
            const displayName = await getUserDisplayName(username);
            const un = username.toLowerCase();
            const dn = displayName.toLowerCase();
            const { rows: tasks } = await pool.query(`
                SELECT description, echeance, statut FROM hub.user_tasks
                WHERE statut NOT IN ('terminé','terminee') AND LOWER(username) = $1
                LIMIT 50
            `, [un]);

            // Push each task to MS Todo
            let pushed = 0;
            for (const task of tasks) {
                try {
                    const todoTask = {
                        title: task.description,
                        status: task.statut === 'en_cours' ? 'inProgress' : 'notStarted',
                    };
                    if (task.echeance) {
                        const d = new Date(task.echeance);
                        todoTask.dueDateTime = {
                            dateTime: d.toISOString(),
                            timeZone: 'Europe/Paris'
                        };
                    }
                    await axios.post(
                        `https://graph.microsoft.com/v1.0/users/${user.email}/todo/lists/${listId}/tasks`,
                        todoTask,
                        { headers: graphHeaders }
                    );
                    pushed++;
                } catch (e) { /* skip individual task errors */ }
            }

            res.json({ ok: true, pushed, listId, email: user.email });
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
            WHERE pt.statut NOT IN ('terminé','terminee','terminée') AND LOWER(pt.responsable_username) = $1
            UNION ALL
            SELECT 'Projet', pts.tache, pts.echeance::text, pts.statut
            FROM projets.projet_taches_standalone pts
            WHERE pts.statut NOT IN ('terminé','terminee','terminée')
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

    if (rows.length === 0) return null;

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
