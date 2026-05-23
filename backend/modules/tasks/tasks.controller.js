const { pool } = require('../../shared/database');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

// ─── MS TODO HELPERS ─────────────────────────────────────────────────────────

/** Fetch all tasks from a Todo list (auto-paginate; tries $expand=linkedResources, falls back without) */
async function fetchAllTodoTasks(axios, headers, email, listId) {
    const BASE = `https://graph.microsoft.com/v1.0/users/${email}/todo/lists/${listId}/tasks`;
    const tasks = [];
    try {
        // Try with $expand first
        let url = `${BASE}?$expand=linkedResources&$top=100`;
        while (url) {
            const res = await axios.get(url, { headers });
            tasks.push(...(res.data.value || []));
            url = res.data['@odata.nextLink'] || null;
        }
    } catch {
        // Fallback: fetch without $expand (linkedResources will be missing)
        tasks.length = 0;
        let url = `${BASE}?$top=100`;
        while (url) {
            const res = await axios.get(url, { headers });
            tasks.push(...(res.data.value || []));
            url = res.data['@odata.nextLink'] || null;
        }
    }
    return tasks;
}

/** Build a Microsoft Todo task payload */
function buildTodoPayload(title, statut, echeance, bodyContent) {
    const status = ['terminé', 'terminee', 'completed'].includes(statut)
        ? 'completed'
        : statut === 'en_cours' ? 'inProgress' : 'notStarted';
    const payload = { title, status };
    if (bodyContent?.trim()) {
        payload.body = { content: bodyContent.trim(), contentType: 'text' };
    }
    if (echeance) {
        try {
            payload.dueDateTime = { dateTime: new Date(echeance).toISOString(), timeZone: 'UTC' };
        } catch { /* ignore bad dates */ }
    }
    return payload;
}

/** Run an axios call silently (swallow errors for non-critical operations) */
async function safeCall(fn) {
    try { return await fn(); } catch { /* ignore */ }
}

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

    // POST /api/tasks/todo-sync/run  — bidirectional sync with Microsoft Todo
    async runTodoSync(req, res) {
        const username = req.user.username;
        try {
            // ── 1. Azure config ──────────────────────────────────────────────
            const { getSqlite } = require('../../shared/database');
            const db = getSqlite();
            const az = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!az?.is_enabled || !az?.client_id || !az?.client_secret || !az?.tenant_id) {
                return res.status(503).json({ error: 'Azure AD non configuré. Contactez l\'administrateur.' });
            }

            // ── 2. User info ─────────────────────────────────────────────────
            const userRow = await pool.query(
                'SELECT email, displayname FROM hub.users WHERE LOWER(username) = LOWER($1)', [username]
            );
            const user = userRow.rows[0];
            if (!user?.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

            // ── 3. App-level token (client_credentials) ──────────────────────
            const axios = require('axios');
            let accessToken;
            try {
                const tokenRes = await axios.post(
                    `https://login.microsoftonline.com/${az.tenant_id}/oauth2/v2.0/token`,
                    new URLSearchParams({
                        client_id: az.client_id, client_secret: az.client_secret,
                        grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default'
                    }).toString(),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                accessToken = tokenRes.data.access_token;
            } catch {
                return res.status(503).json({ error: 'Impossible d\'obtenir un token Azure AD. Vérifiez la configuration.' });
            }
            const graphHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
            const LISTS_BASE = `https://graph.microsoft.com/v1.0/users/${user.email}/todo/lists`;

            // ── 4. Find or create "DSI Hub" list ─────────────────────────────
            let listId;
            try {
                const lists = (await axios.get(LISTS_BASE, { headers: graphHeaders })).data.value || [];
                const found = lists.find(l => l.displayName === 'DSI Hub');
                listId = found ? found.id
                    : (await axios.post(LISTS_BASE, { displayName: 'DSI Hub' }, { headers: graphHeaders })).data.id;
            } catch (e) {
                const msg = e.response?.data?.error?.message || e.message;
                if (msg.includes('Authorization_RequestDenied') || msg.includes('Tasks.ReadWrite')) {
                    return res.status(403).json({ error: 'Permission refusée par Azure AD.', detail: 'La permission applicative Tasks.ReadWrite.All doit être accordée dans le portail Azure AD (consentement administrateur).' });
                }
                return res.status(502).json({ error: `Erreur Microsoft Graph: ${msg}` });
            }
            const TASKS_BASE = `${LISTS_BASE}/${listId}/tasks`;

            // ── 5. Fetch ALL current Todo tasks (with $expand fallback) ───────
            const todoTasks = await fetchAllTodoTasks(axios, graphHeaders, user.email, listId);
            const byTodoId = {};      // todoId -> todoTask
            const byExternalId = {}; // externalId -> todoTask  (if $expand worked)
            for (const t of todoTasks) {
                byTodoId[t.id] = t;
                const lr = (t.linkedResources || []).find(r => r.applicationName === 'DSI Hub');
                if (lr?.externalId) byExternalId[lr.externalId] = t;
            }

            let pushed = 0, updated = 0, imported = 0;
            const un = username.toLowerCase();

            // ── 6. Load hub tasks + pre-built set of known todo IDs ───────────
            const { rows: hubTasks } = await pool.query(`
                SELECT id, description, echeance, statut, context_source, context_title, todo_task_id
                FROM hub.user_tasks WHERE LOWER(username) = $1
            `, [un]);
            // knownTodoIds: todo IDs already tracked in hub (prevents re-import)
            const knownTodoIds = new Set(hubTasks.map(t => t.todo_task_id).filter(Boolean));

            // ── 7. PUSH: hub tasks (non-terminées) → Todo ────────────────────
            for (const task of hubTasks) {
                if (task.statut === 'terminé' || task.statut === 'terminee') continue;
                const externalId = `hub_${task.id}`;

                // Build body from hub notes
                const { rows: notes } = await pool.query(
                    `SELECT content, type, filename FROM hub.task_notes WHERE source='personal' AND task_id=$1 ORDER BY created_at`,
                    [String(task.id)]
                );
                const bodyLines = [];
                if (task.context_title) bodyLines.push(`📌 Contexte : ${task.context_title}`);
                for (const n of notes) {
                    bodyLines.push(n.type === 'file' ? `📎 ${n.filename || n.content}` : `💬 ${n.content}`);
                }
                const payload = buildTodoPayload(task.description, task.statut, task.echeance, bodyLines.join('\n'));

                const existing = task.todo_task_id ? byTodoId[task.todo_task_id] : byExternalId[externalId];
                if (existing) {
                    // *** FIX: never reset a task the user completed in Todo ***
                    if (existing.status !== 'completed') {
                        await safeCall(() => axios.patch(`${TASKS_BASE}/${existing.id}`, payload, { headers: graphHeaders }));
                    }
                    if (!task.todo_task_id) {
                        await pool.query('UPDATE hub.user_tasks SET todo_task_id=$1 WHERE id=$2', [existing.id, task.id]);
                        knownTodoIds.add(existing.id);
                    }
                    updated++;
                } else {
                    try {
                        const created = (await axios.post(TASKS_BASE, payload, { headers: graphHeaders })).data;
                        await safeCall(() => axios.post(`${TASKS_BASE}/${created.id}/linkedResources`,
                            { applicationName: 'DSI Hub', displayName: task.description, externalId },
                            { headers: graphHeaders }
                        ));
                        await pool.query('UPDATE hub.user_tasks SET todo_task_id=$1 WHERE id=$2', [created.id, task.id]);
                        knownTodoIds.add(created.id);
                        pushed++;
                    } catch { /* skip single task error */ }
                }
            }

            // ── 8. PUSH: reunion tasks → Todo ────────────────────────────────
            const { rows: reunions } = await pool.query(`
                SELECT id, titre, liste_taches FROM hub_rencontres.rencontres_reunions
                WHERE liste_taches IS NOT NULL AND liste_taches NOT IN ('', '[]')
            `);
            // Load reunion→todo mapping table
            let reunionMap = {}; // "reunionId_idx" -> todoTaskId
            try {
                const { rows: rm } = await pool.query(
                    `SELECT reunion_id, task_idx, todo_task_id FROM hub.todo_reunion_task_map WHERE LOWER(username)=$1`,
                    [un]
                );
                for (const r of rm) {
                    reunionMap[`${r.reunion_id}_${r.task_idx}`] = r.todo_task_id;
                    knownTodoIds.add(r.todo_task_id);
                }
            } catch { /* table not yet created – will be after restart */ }

            for (const reunion of reunions) {
                let taches;
                try { taches = JSON.parse(reunion.liste_taches || '[]'); } catch { continue; }
                for (let idx = 0; idx < taches.length; idx++) {
                    const t = taches[idx];
                    if (!t.responsable_username || t.responsable_username.toLowerCase() !== un) continue;
                    if (t.statut === 'terminee' || t.statut === 'terminé') continue;

                    const mapKey = `${reunion.id}_${idx}`;
                    const existingTodoId = reunionMap[mapKey] || byExternalId[`reunion_${reunion.id}_${idx}`]?.id;
                    const title = `[${reunion.titre || `Réunion #${reunion.id}`}] ${t.tache}`;
                    const payload = buildTodoPayload(title, t.statut || 'a_faire', t.echeance,
                        `📋 Réunion : ${reunion.titre || `#${reunion.id}`}`);

                    if (existingTodoId && byTodoId[existingTodoId]) {
                        if (byTodoId[existingTodoId].status !== 'completed') {
                            await safeCall(() => axios.patch(`${TASKS_BASE}/${existingTodoId}`, payload, { headers: graphHeaders }));
                        }
                        updated++;
                    } else {
                        try {
                            const created = (await axios.post(TASKS_BASE, payload, { headers: graphHeaders })).data;
                            await safeCall(() => axios.post(`${TASKS_BASE}/${created.id}/linkedResources`,
                                { applicationName: 'DSI Hub', displayName: title, externalId: `reunion_${reunion.id}_${idx}` },
                                { headers: graphHeaders }
                            ));
                            await safeCall(() => pool.query(
                                `INSERT INTO hub.todo_reunion_task_map (reunion_id, task_idx, username, todo_task_id)
                                 VALUES ($1,$2,$3,$4) ON CONFLICT (reunion_id,task_idx,username) DO UPDATE SET todo_task_id=$4`,
                                [reunion.id, idx, un, created.id]
                            ));
                            knownTodoIds.add(created.id);
                            pushed++;
                        } catch { /* skip */ }
                    }
                }
            }

            // ── 9. SYNC STATUS BACK: Todo completed → hub terminé ────────────
            // Hub tasks: use todo_task_id directly (works even without $expand)
            for (const task of hubTasks) {
                if (!task.todo_task_id) continue;
                const todoTask = byTodoId[task.todo_task_id];
                if (!todoTask || todoTask.status !== 'completed') continue;
                await pool.query(
                    `UPDATE hub.user_tasks SET statut='terminé' WHERE id=$1 AND LOWER(username)=$2 AND statut NOT IN ('terminé','terminee')`,
                    [task.id, un]
                );
            }
            // Reunion tasks: use mapping table
            for (const [mapKey, todoId] of Object.entries(reunionMap)) {
                const todoTask = byTodoId[todoId];
                if (!todoTask || todoTask.status !== 'completed') continue;
                const [reunionId, taskIdx] = mapKey.split('_').map(Number);
                try {
                    const r = await pool.query('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id=$1', [reunionId]);
                    if (!r.rows[0]) continue;
                    const taches = JSON.parse(r.rows[0].liste_taches || '[]');
                    if (taches[taskIdx] && taches[taskIdx].statut !== 'terminee') {
                        taches[taskIdx].statut = 'terminee';
                        await pool.query('UPDATE hub_rencontres.rencontres_reunions SET liste_taches=$1 WHERE id=$2',
                            [JSON.stringify(taches), reunionId]);
                    }
                } catch { /* ignore */ }
            }
            // Also handle via byExternalId for reunion tasks not yet in mapping table
            for (const [externalId, todoTask] of Object.entries(byExternalId)) {
                if (!externalId.startsWith('reunion_') || todoTask.status !== 'completed') continue;
                const parts = externalId.split('_');
                const reunionId = parseInt(parts[1], 10), taskIdx = parseInt(parts[2], 10);
                if (isNaN(reunionId) || isNaN(taskIdx)) continue;
                try {
                    const r = await pool.query('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id=$1', [reunionId]);
                    if (!r.rows[0]) continue;
                    const taches = JSON.parse(r.rows[0].liste_taches || '[]');
                    if (taches[taskIdx] && taches[taskIdx].statut !== 'terminee') {
                        taches[taskIdx].statut = 'terminee';
                        await pool.query('UPDATE hub_rencontres.rencontres_reunions SET liste_taches=$1 WHERE id=$2',
                            [JSON.stringify(taches), reunionId]);
                    }
                } catch { /* ignore */ }
            }

            // ── 10. SYNC NOTES: user-written Todo body → hub note ────────────
            for (const task of hubTasks) {
                if (!task.todo_task_id) continue;
                const todoTask = byTodoId[task.todo_task_id];
                if (!todoTask) continue;
                const rawBody = (todoTask.body?.content || '').trim();
                if (!rawBody) continue;
                const userLines = rawBody.split('\n').map(l => l.trim())
                    .filter(l => l && !l.startsWith('📌') && !l.startsWith('💬') && !l.startsWith('📎'));
                if (userLines.length === 0) continue;
                const userContent = userLines.join('\n');
                try {
                    const ex = await pool.query(
                        `SELECT id FROM hub.task_notes WHERE source='personal' AND task_id=$1 AND content=$2`,
                        [String(task.id), userContent]
                    );
                    if (ex.rows.length === 0) {
                        await pool.query(
                            `INSERT INTO hub.task_notes (source,task_id,content,type,created_by) VALUES ('personal',$1,$2,'comment','todo_sync')`,
                            [String(task.id), userContent]
                        );
                    }
                } catch { /* skip */ }
            }

            // ── 11. IMPORT: Todo tasks not yet in hub → hub.user_tasks ───────
            for (const todoTask of todoTasks) {
                if (todoTask.status === 'completed') continue;
                if (knownTodoIds.has(todoTask.id)) continue; // already tracked
                const hasOurLink = (todoTask.linkedResources || []).some(r => r.applicationName === 'DSI Hub');
                if (hasOurLink) continue; // managed but todo_task_id not set yet – skip for now
                try {
                    // Double-check DB in case knownTodoIds is stale
                    const ex = await pool.query(
                        'SELECT id FROM hub.user_tasks WHERE todo_task_id=$1 AND LOWER(username)=$2',
                        [todoTask.id, un]
                    );
                    if (ex.rows.length > 0) { knownTodoIds.add(todoTask.id); continue; }

                    const statut = todoTask.status === 'inProgress' ? 'en_cours' : 'a_faire';
                    const ins = await pool.query(`
                        INSERT INTO hub.user_tasks (username, description, statut, context_source, todo_task_id, created_by, created_at)
                        VALUES ($1,$2,$3,'todo',$4,'todo_sync',NOW()) RETURNING id
                    `, [username, todoTask.title, statut, todoTask.id]);
                    const newId = ins.rows[0].id;
                    knownTodoIds.add(todoTask.id);

                    const body = (todoTask.body?.content || '').trim();
                    if (body) {
                        await pool.query(
                            `INSERT INTO hub.task_notes (source,task_id,content,type,created_by) VALUES ('personal',$1,$2,'comment','todo_sync')`,
                            [String(newId), body]
                        );
                    }
                    await safeCall(() => axios.post(`${TASKS_BASE}/${todoTask.id}/linkedResources`,
                        { applicationName: 'DSI Hub', displayName: todoTask.title, externalId: `hub_${newId}` },
                        { headers: graphHeaders }
                    ));
                    imported++;
                } catch { /* skip individual import errors */ }
            }

            res.json({ ok: true, pushed, updated, imported, email: user.email });
        } catch (error) {
            console.error('[todo-sync]', error.message);
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
