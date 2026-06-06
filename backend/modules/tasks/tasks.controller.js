const { pool, pgDb } = require('../../shared/database');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const storage = require('../../shared/storage');

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
            // Use noon UTC so the date never shifts ±1 day due to local timezone offsets
            const datePart = String(echeance).split('T')[0].split(' ')[0]; // YYYY-MM-DD
            payload.dueDateTime = { dateTime: `${datePart}T12:00:00.000`, timeZone: 'UTC' };
        } catch { /* ignore bad dates */ }
    }
    return payload;
}

/** Run an axios call silently (swallow errors for non-critical operations) */
async function safeCall(fn) {
    try { return await fn(); } catch { /* ignore */ }
}

/** Strip HTML tags and decode entities from a Todo body (contentType:'html') */
function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
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

// Prévient par mail le créateur d'une tâche qu'un membre l'a refusée.
// Ne bloque pas les autres membres (refus individuel). Silencieux si pas de mail/destinataire.
async function notifyCreatorOfRefusal({ createdBy, refuserUsername, description, isTeamTask, raison }) {
    if (!sendMailFn || !createdBy) return;
    // Inutile de se notifier soi-même.
    if (createdBy.toLowerCase() === (refuserUsername || '').toLowerCase()) return;

    const creator = await pool.query(
        'SELECT email, displayname FROM hub.users WHERE LOWER(username) = LOWER($1)',
        [createdBy]
    );
    const to = creator.rows[0]?.email;
    if (!to) return;

    const refuserName = await getUserDisplayName(refuserUsername);
    const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const teamNote = isTeamTask
        ? '<p style="color:#64748b;font-size:13px;">Il s\'agit d\'une tâche d\'équipe : les autres membres ne sont pas bloqués et peuvent toujours la réaliser.</p>'
        : '';
    const html = `
        <h2 style="margin:0 0 8px;">Tâche refusée</h2>
        <p><strong>${esc(refuserName)}</strong> a refusé la tâche suivante :</p>
        <blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #ef4444;background:#fef2f2;">${esc(description) || '(sans description)'}</blockquote>
        <p><strong>Raison du refus :</strong> ${esc(raison)}</p>
        ${teamNote}
    `;
    await sendMailFn(to, '❌ Tâche refusée — DSI Hub', html, [], 'task_alert');
}

// Prévient par mail chaque destinataire (≠ créateur) qu'une tâche vient de lui être
// affectée. Notification immédiate et inconditionnelle (indépendante de l'opt-in du
// récap quotidien). Silencieuse si pas de service mail / d'adresse ; non bloquante.
async function notifyTaskAssignment({ targets, creatorUsername, description, echeance, isTeamTask, contextTitle, contextSource }) {
    if (!sendMailFn) return;
    // Ne pas notifier pour les tâches personnelles
    if (contextSource === 'personal') return;
    const recipients = (targets || []).filter(u => u && u.toLowerCase() !== (creatorUsername || '').toLowerCase());
    if (recipients.length === 0) return;

    // Récupérer les préférences d'alerte pour tous les destinataires en une requête
    let prefMap = {};
    try {
        const prefRows = await pool.query(
            'SELECT LOWER(username) AS un, task_assign_alert FROM hub.user_prefs WHERE LOWER(username) = ANY($1)',
            [recipients.map(u => u.toLowerCase())]
        );
        for (const row of prefRows.rows) prefMap[row.un] = row.task_assign_alert === true;
    } catch (e) { /* ignore */ }

    const creatorName = await getUserDisplayName(creatorUsername);
    const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const echStr = echeance ? `<p><strong>Échéance :</strong> ${esc(String(echeance).slice(0, 10))}</p>` : '';
    const ctxStr = (contextTitle && contextTitle !== 'Tâche personnelle')
        ? `<p style="color:#64748b;font-size:13px;">Contexte : ${esc(contextTitle)}</p>` : '';
    const teamNote = isTeamTask
        ? '<p style="color:#64748b;font-size:13px;">Il s\'agit d\'une tâche d\'équipe : le premier qui la termine la termine pour tout le monde.</p>'
        : '';

    for (const uname of recipients) {
        try {
            // Respecter le toggle "M'avertir" de chaque destinataire
            if (prefMap[uname.toLowerCase()] === false) continue;
            const r = await pool.query('SELECT email FROM hub.users WHERE LOWER(username) = LOWER($1)', [uname]);
            const to = r.rows[0]?.email;
            if (!to) continue;
            const html = `
                <h2 style="margin:0 0 8px;">Nouvelle tâche assignée</h2>
                <p><strong>${esc(creatorName)}</strong> vous a affecté une tâche :</p>
                <blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #6366f1;background:#eef2ff;">${esc(description) || '(sans description)'}</blockquote>
                ${echStr}
                ${ctxStr}
                ${teamNote}
                <p style="color:#64748b;font-size:13px;margin-top:12px;">Retrouvez-la dans <em>Mes Tâches</em> sur DSI Hub.</p>
            `;
            await sendMailFn(to, '📋 Nouvelle tâche assignée — DSI Hub', html, [], 'task_alert');
        } catch (e) {
            console.error('[tasks] notify assignment failed for', uname, ':', e.message);
        }
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
                        ut.updated_at::text AS updated_at,
                        ut.is_team_task,
                        ut.team_group_id::text AS team_group_id,
                        ut.created_by,
                        ut.refus_raison,
                        ut.priority,
                        ut.is_public
                    FROM hub.user_tasks ut
                    WHERE LOWER(ut.username) = $1

                    UNION ALL

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
                        ut.updated_at::text AS updated_at,
                        ut.is_team_task,
                        ut.team_group_id::text AS team_group_id,
                        ut.created_by,
                        ut.refus_raison,
                        ut.priority,
                        ut.is_public
                    FROM hub.user_tasks ut
                    WHERE ut.is_public = true
                      AND LOWER(ut.username) != $1
                      AND LOWER(ut.username) IN (
                          SELECT LOWER(u2.username) FROM hub.users u2
                          WHERE u2.service_code IS NOT NULL AND u2.service_code != ''
                            AND u2.service_code = (
                                SELECT hu.service_code FROM hub.users hu
                                WHERE LOWER(hu.username) = $1
                            )
                      )

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
                        NULL::text    AS updated_at,
                        FALSE         AS is_team_task,
                        NULL          AS team_group_id,
                        NULL          AS created_by,
                        NULL          AS refus_raison,
                        NULL          AS priority,
                        FALSE         AS is_public
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
                        NULL::text             AS updated_at,
                        FALSE                  AS is_team_task,
                        NULL                   AS team_group_id,
                        NULL                   AS created_by,
                        NULL                   AS refus_raison,
                        NULL                   AS priority,
                        FALSE                  AS is_public
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
                        NULL::text              AS updated_at,
                        FALSE                   AS is_team_task,
                        NULL                    AS team_group_id,
                        NULL                    AS created_by,
                        NULL                    AS refus_raison,
                        NULL                    AS priority,
                        FALSE                   AS is_public
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
                        NULL::text             AS updated_at,
                        FALSE                  AS is_team_task,
                        NULL                   AS team_group_id,
                        NULL                   AS created_by,
                        NULL                   AS refus_raison,
                        NULL                   AS priority,
                        FALSE                  AS is_public
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
                        NULL::text           AS updated_at,
                        FALSE                AS is_team_task,
                        NULL                 AS team_group_id,
                        NULL                 AS created_by,
                        NULL                 AS refus_raison,
                        NULL                 AS priority,
                        FALSE                AS is_public
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
                        NULL::text           AS updated_at,
                        FALSE                AS is_team_task,
                        NULL                 AS team_group_id,
                        NULL                 AS created_by,
                        NULL                 AS refus_raison,
                        NULL                 AS priority,
                        FALSE                AS is_public
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
                    CASE WHEN statut IN ('terminé','refuse') THEN 1 ELSE 0 END,
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
            is_team_task = false, assignees = [], service_code = null,
            priority = 'normale', is_public = false
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
                            context_source, context_id, context_title,
                            priority, is_public)
                         VALUES ($1,$2,$3,'a_faire',$4,$5,$6,$7,$8,$9,$10,$11)
                         RETURNING *`,
                    [uname, description.trim(), echeance || null,
                     is_team_task, teamGroupId, creator,
                     context_source, context_id, context_title,
                     priority, is_public]
                    );
                created.push(rows[0]);
            }
            // Notification immédiate des destinataires (≠ créateur). Fire-and-forget :
            // n'attend pas l'envoi des mails pour répondre, et n'échoue jamais la création.
            notifyTaskAssignment({
                targets, creatorUsername: creator,
                description: description.trim(), echeance: echeance || null,
                isTeamTask: is_team_task, contextTitle: context_title,
                contextSource: context_source,
            }).catch(e => console.error('[tasks] notify assignment error:', e.message));

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
            const { rows: tasks } = await pool.query(
                `SELECT ut.*,
                    (SELECT COUNT(*) FROM hub.task_notes tn WHERE tn.source = $1 AND tn.task_id = ut.id::text) AS note_count
                 FROM hub.user_tasks ut
                 WHERE ut.context_source = $1 AND ut.context_id = $2
                 ORDER BY ut.created_at ASC`,
                [source, parseInt(id)]
            );
            // Enrich each task with its notes
            for (const task of tasks) {
                const { rows: notes } = await pool.query(
                    `SELECT * FROM hub.task_notes WHERE source = $1 AND task_id = $2 ORDER BY created_at ASC`,
                    [source, String(task.id)]
                );
                task.notes = notes || [];
            }
            res.json(tasks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/:source/:id  { statut, refus_raison? }
    async updateTaskStatus(req, res) {
        const { source, id } = req.params;
        const { statut, refus_raison } = req.body;
        if (!statut) return res.status(400).json({ error: 'statut requis' });
        try {
            const dbStatut = normalizeStatutIn(statut, source);

            // Tasks stored in hub.user_tasks (personal, ticket, todo, and any
            // assigned task created from a context like reunion/projet/etc.) all
            // carry a normal user_tasks id. Detect them up-front so they are
            // updated in place rather than mis-routed to a synthetic-id branch.
            let taskContext = null;
            const { rows: utRows } = await pool.query(
                'SELECT context_source, context_id, description, team_group_id, is_team_task, created_by FROM hub.user_tasks WHERE id = $1',
                [id]
            );
            if (utRows.length > 0) taskContext = utRows[0];
            const isUserTask = utRows.length > 0;

            switch (source) {
                case 'personal':
                case 'ticket':
                case 'todo':
                    // Both are stored in hub.user_tasks
                    if (statut === 'refuse' && refus_raison) {
                        await pool.query(
                            'UPDATE hub.user_tasks SET statut = $1, refus_raison = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                            [statut, refus_raison, id]
                        );
                        // Refus individuel (ne bloque pas les autres membres) : on prévient
                        // le créateur de la tâche par mail si ce n'est pas lui qui refuse.
                        try {
                            await notifyCreatorOfRefusal({
                                createdBy: taskContext?.created_by,
                                refuserUsername: req.user.username,
                                description: taskContext?.description,
                                isTeamTask: taskContext?.is_team_task,
                                raison: refus_raison,
                            });
                        } catch (e) { console.error('[tasks] notify refusal failed:', e.message); }
                    } else {
                        await pool.query(
                            'UPDATE hub.user_tasks SET statut = $1, refus_raison = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                            [statut, id]
                        );
                        // Tâche d'équipe : le statut est partagé. Le premier qui avance/termine
                        // la tâche la fait avancer/terminer pour tous les membres du groupe.
                        // (Le refus reste individuel — non propagé.)
                        if (taskContext?.team_group_id) {
                            await pool.query(
                                'UPDATE hub.user_tasks SET statut = $1, refus_raison = NULL, updated_at = CURRENT_TIMESTAMP WHERE team_group_id = $2',
                                [statut, taskContext.team_group_id]
                            );
                        }
                    }
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
                case 'reunion': {
                    // An assigned reunion task lives in hub.user_tasks with a
                    // normal id (context_source='reunion'); update it in place.
                    if (isUserTask) {
                        await pool.query(
                            'UPDATE hub.user_tasks SET statut = $1, refus_raison = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                            [statut, id]
                        );
                        break;
                    }
                    // Otherwise it is a synthetic JSON-derived task:
                    // composite id = reunion_id * 10000 + ordinality (1-based)
                    // liste_taches is a TEXT column holding a JSON string: read-modify-write.
                    const compositeId = parseInt(id);
                    const reunionId = Math.floor(compositeId / 10000);
                    const arrayIndex = (compositeId % 10000) - 1; // 0-based
                    const { rows } = await pool.query(
                        'SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1',
                        [reunionId]
                    );
                    if (rows.length > 0) {
                        let taches;
                        try { taches = JSON.parse(rows[0].liste_taches || '[]'); } catch { taches = []; }
                        if (Array.isArray(taches) && taches[arrayIndex]) {
                            taches[arrayIndex].statut = statut;
                            await pool.query(
                                'UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2',
                                [JSON.stringify(taches), reunionId]
                            );
                        }
                    }
                    break;
                }
                default:
                    // Fallback: any other source backed by a real hub.user_tasks row.
                    if (isUserTask) {
                        await pool.query(
                            'UPDATE hub.user_tasks SET statut = $1, refus_raison = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                            [statut, id]
                        );
                        break;
                    }
                    return res.status(400).json({ error: 'Source inconnue' });
            }

            // If the task is linked to a ticket, log the status change in ticket history
            if (taskContext && taskContext.context_source === 'ticket' && taskContext.context_id) {
                const statutLabels = { 'a_faire': 'À faire', 'en_cours': 'En cours', 'terminé': 'Terminé' };
                const newLabel = statutLabels[statut] || statut;
                const description = taskContext.description || '';
                try {
                    await pgDb.run(
                        `INSERT INTO hub_tickets.ticket_history
                            (ticket_id, user_id, action, field_name, old_value, new_value, comment)
                         VALUES ($1, $2, 'task_status_changed', 'statut', $3, $4, $5)`,
                        [taskContext.context_id, req.user?.id || null, null, statut,
                         `Tâche "${description.substring(0, 100)}" → ${newLabel}`]
                    );
                } catch (e) {
                    console.error('[HISTORY] updateTaskStatus log failed:', e.message);
                }
            }

            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /api/tasks/personal/:id
    // Supprime une tâche personnelle/assignée. Pour une tâche d'équipe (team_group_id),
    // supprime toutes les lignes du groupe afin qu'elle disparaisse en une seule action.
    async deleteTask(req, res) {
        const { id } = req.params;
        try {
            const { rows } = await pool.query('SELECT team_group_id FROM hub.user_tasks WHERE id = $1', [id]);
            if (rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });

            let ids;
            if (rows[0].team_group_id) {
                const { rows: grp } = await pool.query('SELECT id FROM hub.user_tasks WHERE team_group_id = $1', [rows[0].team_group_id]);
                ids = grp.map(r => r.id);
            } else {
                ids = [parseInt(id, 10)];
            }

            try { await pool.query("DELETE FROM hub.task_notes WHERE source = 'personal' AND task_id::integer = ANY($1)", [ids]); } catch (e) { /* notes facultatives */ }
            await pool.query('DELETE FROM hub.user_tasks WHERE id = ANY($1)', [ids]);
            res.json({ success: true, deleted: ids.length });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/edit/:id  { description?, echeance? }
    // Modifie une tâche que J'AI créée (personnelle ou affectée à d'autres). Seul le
    // créateur est autorisé. Pour une tâche d'équipe, la modification s'applique à
    // toutes les lignes du groupe (la tâche reste unique).
    async editTask(req, res) {
        const { id } = req.params;
        const { description, echeance, priority, is_public } = req.body;
        const username = req.user.username;
        try {
            const { rows } = await pool.query(
                'SELECT created_by, team_group_id FROM hub.user_tasks WHERE id = $1', [id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });
            const task = rows[0];
            if ((task.created_by || '').toLowerCase() !== username.toLowerCase()) {
                return res.status(403).json({ error: 'Seul le créateur peut modifier cette tâche' });
            }
            if (description !== undefined && !String(description).trim()) {
                return res.status(400).json({ error: 'Description requise' });
            }

            const sets = [];
            const params = [];
            let i = 1;
            if (description !== undefined) { sets.push(`description = $${i++}`); params.push(String(description).trim()); }
            if (echeance !== undefined) { sets.push(`echeance = $${i++}`); params.push(echeance || null); }
            if (priority !== undefined) { sets.push(`priority = $${i++}`); params.push(priority); }
            if (is_public !== undefined) { sets.push(`is_public = $${i++}`); params.push(!!is_public); }
            if (sets.length === 0) return res.json({ success: true, updated: 0 });
            sets.push('updated_at = CURRENT_TIMESTAMP');

            let whereSql;
            if (task.team_group_id) { whereSql = `team_group_id = $${i}`; params.push(task.team_group_id); }
            else { whereSql = `id = $${i}`; params.push(parseInt(id, 10)); }

            await pool.query(`UPDATE hub.user_tasks SET ${sets.join(', ')} WHERE ${whereSql}`, params);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async toggleFavorite(req, res) {
        const { source, id } = req.params;
        try {
            // Only 'personal' tasks are supported for favorites currently
            if (source !== 'personal') return res.status(400).json({ error: 'Favoris uniquement pour tâches personnelles' });
            
            const { rows } = await pool.query(
                'UPDATE hub.user_tasks SET is_favorite = NOT is_favorite WHERE id = $1 RETURNING is_favorite',
                [id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Tâche non trouvée' });
            res.json({ is_favorite: rows[0].is_favorite });
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
            if (req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);
            const saved = await storage.saveFile('tasks', id, req.file);
            const { rows } = await pool.query(
                `INSERT INTO hub.task_notes (source, task_id, content, type, filename, filepath, created_by)
                 VALUES ($1,$2,$3,'file',$4,$5,$6) RETURNING *`,
                [source, String(id), req.file.originalname, req.file.originalname, saved.dbPath, username]
            );

            // Dual-write : enregistre aussi dans hub_docs pour le viewer central
            try {
                const docsService = require('../../shared/documents.service');
                await docsService.registerExternalUpload({
                    module: 'tasks',
                    entityType: 'note_file',
                    entityId: id,
                    title: req.file.originalname,
                    filename: saved.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    storageRef: saved.dbPath,
                    metadata: { task_source: source },
                    uploadedBy: username,
                });
            } catch (e) { console.warn('[DOCS] register failed:', e.message); }

            res.status(201).json(rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/:source/:id/notes/:noteId/file?mode=inline|attachment
    async downloadTaskNoteFile(req, res) {
        const { noteId } = req.params;
        try {
            const { rows } = await pool.query('SELECT * FROM hub.task_notes WHERE id=$1 AND type=$2', [noteId, 'file']);
            if (!rows[0]) return res.status(404).json({ error: 'Fichier non trouvé' });
            const note = rows[0];
            const displayName = note.filename || note.content || 'fichier';
            const disposition = req.query.mode === 'inline' ? 'inline' : 'attachment';

            if (storage.isStoragePath(note.filepath)) {
                const f = await storage.getFileForServe(note.filepath);
                if (!f) return res.status(404).json({ error: 'Fichier manquant sur le stockage' });
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(displayName)}"`);
                res.type(path.extname(displayName) || 'application/octet-stream');
                if (f.absolutePath) return res.sendFile(f.absolutePath);
                return res.send(f.buffer);
            }

            // Fallback legacy : fichier local dans file_task_notes
            const filePath = path.join(TASK_NOTES_DIR, note.filepath);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier manquant sur le disque' });
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(displayName)}"`);
            res.type(path.extname(displayName) || 'application/octet-stream');
            res.sendFile(filePath);
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
                if (storage.isStoragePath(rows[0].filepath)) {
                    try { await storage.deleteFile(rows[0].filepath); } catch (e) {}
                } else {
                    const fp = path.join(TASK_NOTES_DIR, rows[0].filepath);
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                }
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
        const username = req.user.username.toLowerCase();
        try {
            const r = await pool.query(
                'SELECT task_alert_email FROM hub.user_prefs WHERE username = $1',
                [username]
            );
            res.json({ enabled: r.rows[0]?.task_alert_email === true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/alert-pref  { enabled: boolean }
    async setAlertPref(req, res) {
        const username = req.user.username.toLowerCase();
        const { enabled } = req.body;
        try {
            await pool.query(
                `INSERT INTO hub.user_prefs (username, task_alert_email, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (username) DO UPDATE SET task_alert_email = EXCLUDED.task_alert_email, updated_at = NOW()`,
                [username, !!enabled]
            );
            res.json({ ok: true, enabled: !!enabled });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── ASSIGN ALERT PREF ───────────────────────────────────────────────────────

    // GET /api/tasks/assign-alert-pref
    async getAssignAlertPref(req, res) {
        const username = req.user.username.toLowerCase();
        try {
            const r = await pool.query(
                'SELECT task_assign_alert FROM hub.user_prefs WHERE username = $1',
                [username]
            );
            res.json({ enabled: r.rows[0]?.task_assign_alert === true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/assign-alert-pref  { enabled: boolean }
    async setAssignAlertPref(req, res) {
        const username = req.user.username.toLowerCase();
        const { enabled } = req.body;
        try {
            await pool.query(
                `INSERT INTO hub.user_prefs (username, task_assign_alert, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (username) DO UPDATE SET task_assign_alert = EXCLUDED.task_assign_alert, updated_at = NOW()`,
                [username, !!enabled]
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
        const username = req.user.username.toLowerCase();
        try {
            const r = await pool.query(
                'SELECT ms_todo_sync FROM hub.user_prefs WHERE username = $1',
                [username]
            );
            res.json({ enabled: r.rows[0]?.ms_todo_sync === true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PATCH /api/tasks/todo-sync  { enabled: boolean }
    async setTodoSyncPref(req, res) {
        const username = req.user.username.toLowerCase();
        const { enabled } = req.body;
        try {
            await pool.query(
                `INSERT INTO hub.user_prefs (username, ms_todo_sync, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (username) DO UPDATE SET ms_todo_sync = EXCLUDED.ms_todo_sync, updated_at = NOW()`,
                [username, !!enabled]
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
            const userDbRow = userRow.rows[0];
            // Fallback email : hub.users → JWT → magapp.users → username@ivry94.fr
            let userEmail = userDbRow?.email || req.user?.email || null;
            if (!userEmail) {
                try {
                    const magappRow = await pool.query(
                        'SELECT email FROM magapp.users WHERE LOWER(username) = LOWER($1)', [username]
                    );
                    userEmail = magappRow.rows[0]?.email || null;
                } catch {}
            }
            if (!userEmail) {
                // Construire l'email depuis le username si le domaine est connu
                userEmail = `${username.toLowerCase()}@ivry94.fr`;
            }
            const user = { email: userEmail, displayname: userDbRow?.displayname || username };
            if (!user.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

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

            // ── 7. PUSH: hub tasks → Todo (including hub-terminated → Todo completed) ──
            for (const task of hubTasks) {
                const isTerminated = task.statut === 'terminé' || task.statut === 'terminee';
                const externalId = `hub_${task.id}`;
                const existing = task.todo_task_id ? byTodoId[task.todo_task_id] : byExternalId[externalId];

                if (existing) {
                    if (isTerminated) {
                        // Push completion to Todo if not already done
                        if (existing.status !== 'completed') {
                            await safeCall(() => axios.patch(
                                `${TASKS_BASE}/${existing.id}`,
                                { status: 'completed' },
                                { headers: graphHeaders }
                            ));
                        }
                    } else if (existing.status !== 'completed') {
                        // Sync non-terminated task details
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
                        await safeCall(() => axios.patch(`${TASKS_BASE}/${existing.id}`, payload, { headers: graphHeaders }));
                    }
                    if (!task.todo_task_id) {
                        await pool.query('UPDATE hub.user_tasks SET todo_task_id=$1 WHERE id=$2', [existing.id, task.id]);
                        knownTodoIds.add(existing.id);
                    }
                    updated++;
                } else if (!isTerminated) {
                    // Only create new Todo tasks for non-terminated hub tasks
                    try {
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
            // Uses pre-fetched byTodoId (before step-7 PATCHes) so captures notes
            // written by user in Todo before this sync. Strips HTML (contentType:'html').
            for (const task of hubTasks) {
                if (!task.todo_task_id) continue;
                const todoTask = byTodoId[task.todo_task_id];
                if (!todoTask) continue;
                const rawBody = (todoTask.body?.content || '').trim();
                if (!rawBody) continue;
                // Strip HTML tags if body is HTML-encoded (common from Todo mobile/desktop app)
                const cleanBody = todoTask.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody;
                const userLines = cleanBody.split(/\r?\n/).map(l => l.trim())
                    .filter(l => l && !l.startsWith('📌') && !l.startsWith('💬') && !l.startsWith('📎'));
                if (userLines.length === 0) continue;
                const userContent = userLines.join('\n');
                try {
                    // Upsert: keep one 'todo_sync' comment per task; update if body changed
                    const ex = await pool.query(
                        `SELECT id, content FROM hub.task_notes
                         WHERE source='personal' AND task_id=$1 AND created_by='todo_sync' AND type='comment'
                         LIMIT 1`,
                        [String(task.id)]
                    );
                    if (ex.rows.length === 0) {
                        await pool.query(
                            `INSERT INTO hub.task_notes (source,task_id,content,type,created_by)
                             VALUES ('personal',$1,$2,'comment','todo_sync')`,
                            [String(task.id), userContent]
                        );
                    } else if (ex.rows[0].content !== userContent) {
                        await pool.query(
                            `UPDATE hub.task_notes SET content=$1, created_at=NOW() WHERE id=$2`,
                            [userContent, ex.rows[0].id]
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
                    const dueDate = todoTask.dueDateTime ? todoTask.dueDateTime.dateTime.split('T')[0] : null;
                    const ins = await pool.query(`
                        INSERT INTO hub.user_tasks (username, description, echeance, statut, context_source, todo_task_id, created_by, created_at)
                        VALUES ($1,$2,$3,$4,'todo',$5,'todo_sync',NOW()) RETURNING id
                    `, [username, todoTask.title, dueDate, statut, todoTask.id]);
                    const newId = ins.rows[0].id;
                    knownTodoIds.add(todoTask.id);

                    const rawImportBody = (todoTask.body?.content || '').trim();
                    if (rawImportBody) {
                        const cleanImportBody = todoTask.body?.contentType === 'html'
                            ? stripHtml(rawImportBody) : rawImportBody;
                        if (cleanImportBody) {
                            await pool.query(
                                `INSERT INTO hub.task_notes (source,task_id,content,type,created_by) VALUES ('personal',$1,$2,'comment','todo_sync')`,
                                [String(newId), cleanImportBody]
                            );
                        }
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

    // GET /api/tasks/assigned-by-me — tasks I created for other users
    async getAssignedByMe(req, res) {
        const username = req.user.username;
        try {
            // Une tâche d'équipe est stockée en N lignes (1 par destinataire) liées par
            // team_group_id. On la présente comme UNE seule tâche, avec la liste de tous
            // les destinataires (assignees) et un statut global. Les tâches solo restent
            // groupées par leur id propre.
            const { rows } = await pool.query(
                `SELECT
                    MIN(ut.id) AS id,
                    ut.team_group_id,
                    bool_or(COALESCE(ut.is_team_task, false)) AS is_team_task,
                    MIN(ut.priority) AS priority,
                    bool_or(COALESCE(ut.is_public, false)) AS is_public,
                    MIN(ut.description) AS description,
                    MIN(ut.echeance::text) AS echeance,
                    MIN(ut.created_at) AS created_at,
                    MAX(ut.updated_at::text) AS updated_at,
                    COALESCE(MIN(ut.context_source), 'personal') AS source,
                    COALESCE(MIN(ut.context_source), 'personal') AS context_source,
                    COALESCE(MIN(ut.context_title), 'Tâche personnelle') AS source_title,
                    COALESCE(MIN(ut.context_title), 'Tâche personnelle') AS context_title,
                    COUNT(*)::int AS assignee_count,
                    string_agg(COALESCE(u.displayName, ut.username), ', ' ORDER BY COALESCE(u.displayName, ut.username)) AS responsable,
                    json_agg(json_build_object(
                        'username', ut.username,
                        'name', COALESCE(u.displayName, ut.username),
                        'statut', ut.statut,
                        'refus_raison', ut.refus_raison
                    ) ORDER BY COALESCE(u.displayName, ut.username)) AS assignees,
                    CASE
                        WHEN bool_or(ut.statut IN ('terminé','terminee')) THEN 'terminé'
                        WHEN bool_or(ut.statut = 'en_cours') THEN 'en_cours'
                        WHEN bool_or(ut.statut = 'refuse') THEN 'refuse'
                        ELSE 'a_faire'
                    END AS statut,
                    string_agg(DISTINCT ut.refus_raison, ' · ') FILTER (WHERE ut.refus_raison IS NOT NULL AND ut.refus_raison <> '') AS refus_raison
                 FROM hub.user_tasks ut
                 LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(ut.username)
                 WHERE LOWER(ut.created_by) = LOWER($1)
                   AND LOWER(ut.username) != LOWER($1)
                 GROUP BY COALESCE(ut.team_group_id::text, 'solo:' || ut.id::text), ut.team_group_id
                 ORDER BY MIN(ut.created_at) DESC`,
                [username]
            );
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /api/tasks/kpi-history — last 30 days of task activity for current user
    async getKpiHistory(req, res) {
        const username = req.user.username;
        try {
            const { rows } = await pool.query(
                `SELECT
                    DATE(created_at)::text AS date,
                    COUNT(*) FILTER (WHERE DATE(created_at) = DATE(created_at)) AS created,
                    COUNT(*) FILTER (WHERE statut IN ('terminé','terminee') AND DATE(updated_at) = DATE(created_at)) AS completed_same_day
                 FROM hub.user_tasks
                 WHERE LOWER(username) = LOWER($1)
                   AND created_at >= CURRENT_DATE - INTERVAL '30 days'
                 GROUP BY DATE(created_at)
                 ORDER BY DATE(created_at) ASC`,
                [username]
            );

            // Build series for last 30 days: créées / terminées ce jour-là
            const { rows: completedRows } = await pool.query(
                `SELECT DATE(updated_at)::text AS date, COUNT(*) AS cnt
                 FROM hub.user_tasks
                 WHERE LOWER(username) = LOWER($1)
                   AND statut IN ('terminé','terminee','refuse')
                   AND updated_at >= CURRENT_DATE - INTERVAL '30 days'
                 GROUP BY DATE(updated_at)
                 ORDER BY DATE(updated_at) ASC`,
                [username]
            );

            const completedMap = {};
            for (const r of completedRows) completedMap[r.date] = Number(r.cnt);

            const result = rows.map(r => ({
                date: r.date,
                creees: Number(r.created),
                terminees: completedMap[r.date] || 0,
            }));
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Called by the daily cron at 8am
    async sendDailyAlerts() {
        if (!sendMailFn) return;
        try {
            const { rows: users } = await pool.query(
                `SELECT p.username, u.email, u.displayname
                 FROM hub.user_prefs p
                 LEFT JOIN hub.users u ON LOWER(u.username) = p.username
                 WHERE p.task_alert_email = TRUE AND u.email IS NOT NULL AND u.email != ''`
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
