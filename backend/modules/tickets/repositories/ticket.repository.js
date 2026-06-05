const { pgDb, pool } = require('../../../shared/database');
const { toParisSql } = require('../../../shared/utils');

const BASE_SELECT = `
SELECT t.*,
           -- Email demandeur fiable : GLPI champ 22 (requester_email_22) contient parfois
           -- l'email du technicien ; le champ 34 (email_alt) porte alors le vrai demandeur.
           COALESCE(NULLIF(t.email_alt, ''), t.requester_email_22) AS requester_email_resolved,
           ta.technician_id, tga.group_id,
           tca.category_id as assigned_category_id,
           ts.label as status_label,
           tu.displayName as technician_name,
           tg2.name as assignee_group_name,
           tp.status as technician_status,
           mu.service_code as requester_service_code,
           mu.service_complement as requester_service,
            tgm_sub.bundle_id,
            tgm_sub.bundle_name,
            tgm_sub.bundle_problem_ticket_id,
            tgm_sub.bundle_members,
            problem_sub.problem_linked_tickets,
           ma.name as software_name,
           tc.name as category_name,
           tsc.name as subcategory_name,
             (SELECT vu.is_elu FROM hub_tickets.vip_users vu
              WHERE LOWER(vu.email) = LOWER(COALESCE(NULLIF(t.email_alt, ''), t.requester_email_22)) LIMIT 1) as requester_is_elu,
             (SELECT COUNT(*) FROM hub_tickets.observers o WHERE o.ticket_id = t.glpi_id AND o.is_active = 1) as observer_count,
            (SELECT COUNT(*) FROM hub_tickets.ticket_history h WHERE h.ticket_id = t.glpi_id) as history_count,
            (SELECT COUNT(*) FROM hub_tickets.ticket_followups tf WHERE tf.ticket_id = t.glpi_id) as followups_count,
            (SELECT COUNT(*) FROM hub.user_tasks ut WHERE ut.context_source = 'ticket' AND ut.context_id = t.glpi_id AND ut.statut != 'terminé') as tasks_count,
             (SELECT h2.comment FROM hub_tickets.ticket_history h2
              WHERE h2.ticket_id = t.glpi_id AND h2.action = 'status_changed' AND h2.new_value = '4'
              ORDER BY h2.created_at DESC LIMIT 1) as waiting_reason,
             tsla.sla_status
     FROM hub_tickets.tickets t
-- Technicien principal : une seule ligne par ticket (évite les doublons quand
     -- plusieurs techniciens/membres de groupe sont affectés au même ticket).
     LEFT JOIN LATERAL (
         SELECT technician_id FROM hub_tickets.ticket_assignments
         WHERE ticket_id = t.glpi_id AND technician_id IS NOT NULL
         ORDER BY (is_primary = true) DESC, technician_id ASC
         LIMIT 1
     ) ta ON true
     LEFT JOIN hub_tickets.technician_profiles tp ON ta.technician_id = tp.user_id
     LEFT JOIN hub.users tu ON ta.technician_id = tu.id
     -- Groupe assigné : récupéré depuis n'importe quelle ligne d'assignation du ticket
     -- (la transposition des groupes insère avec is_primary = false, donc hors du JOIN ta ci-dessus)
     LEFT JOIN LATERAL (
         SELECT group_id FROM hub_tickets.ticket_assignments
         WHERE ticket_id = t.glpi_id AND group_id IS NOT NULL
         ORDER BY (is_primary = true) DESC
         LIMIT 1
     ) tga ON true
     LEFT JOIN hub_tickets.technician_groups tg2 ON tga.group_id = tg2.id
     LEFT JOIN (SELECT DISTINCT ON (LOWER(email)) email, service_code, service_complement FROM magapp.users ORDER BY LOWER(email)) mu ON LOWER(mu.email) = LOWER(COALESCE(NULLIF(t.email_alt, ''), t.requester_email_22))
     LEFT JOIN (SELECT DISTINCT ON (ticket_id) ticket_id, category_id FROM hub_tickets.ticket_category_assignments ORDER BY ticket_id) tca ON tca.ticket_id = t.glpi_id
     LEFT JOIN hub_tickets.ticket_status ts ON t.status = ts.id
      LEFT JOIN (
          SELECT DISTINCT ON (tgm.ticket_id)
              tgm.ticket_id,
              tgm.group_id AS bundle_id,
              tg.name AS bundle_name,
              tg.problem_ticket_id AS bundle_problem_ticket_id,
              (SELECT COALESCE(json_agg(json_build_object('ticket_id', m.ticket_id, 'title', mt.title, 'status', mt.status, 'priority', mt.priority, 'type', mt.type, 'date_creation', mt.date_creation, 'impact', mt.impact, 'source', mt.source)), '[]'::json)
               FROM hub_tickets.ticket_group_members m
               JOIN hub_tickets.tickets mt ON mt.glpi_id = m.ticket_id
               WHERE m.group_id = tgm.group_id
                 AND m.ticket_id != tgm.ticket_id) AS bundle_members
          FROM hub_tickets.ticket_group_members tgm
          LEFT JOIN hub_tickets.ticket_groups tg ON tg.id = tgm.group_id
          ORDER BY tgm.ticket_id
      ) tgm_sub ON tgm_sub.ticket_id = t.glpi_id
      LEFT JOIN (
          SELECT
              tg.problem_ticket_id,
              COALESCE(json_agg(json_build_object('ticket_id', m.ticket_id, 'title', mt.title, 'status', mt.status, 'priority', mt.priority, 'type', mt.type, 'date_creation', mt.date_creation, 'impact', mt.impact, 'source', mt.source)), '[]'::json) AS problem_linked_tickets
          FROM hub_tickets.ticket_groups tg
          JOIN hub_tickets.ticket_group_members m ON m.group_id = tg.id
          JOIN hub_tickets.tickets mt ON mt.glpi_id = m.ticket_id
          GROUP BY tg.problem_ticket_id
      ) problem_sub ON problem_sub.problem_ticket_id = t.glpi_id AND t.type = '3'
     LEFT JOIN magapp.apps ma ON t.software_id = ma.id
     LEFT JOIN hub_tickets.ticket_categories tc ON t.category_id = tc.id
     LEFT JOIN hub_tickets.ticket_categories tsc ON t.subcategory_id = tsc.id
     LEFT JOIN (
         SELECT DISTINCT ON (ts2.ticket_id) ts2.ticket_id, ts2.sla_status
         FROM hub_tickets.ticket_sla ts2
         JOIN hub_tickets.sla_definitions sd2 ON ts2.sla_definition_id = sd2.id AND sd2.is_active = true
         ORDER BY ts2.ticket_id
     ) tsla ON tsla.ticket_id = t.glpi_id
`;

module.exports = {
    async findById(id) {
        return pgDb.get(`${BASE_SELECT} WHERE t.glpi_id = $1`, [id]);
    },

    async findAll(filters = {}, pagination = { page: 1, limit: 25, sort: 'date_creation', order: 'desc' }, user = null) {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (filters.status_in) {
            const ids = filters.status_in.split(',').map(Number).filter(n => !isNaN(n));
            if (ids.length) {
                conditions.push(`t.status IN (${ids.map(() => `$${idx++}`).join(',')})`);
                params.push(...ids);
            }
        } else if (filters.status) {
            conditions.push(`t.status = $${idx++}`);
            params.push(parseInt(filters.status));
        }
        if (filters.priority) {
            conditions.push(`t.priority = $${idx++}`);
            params.push(parseInt(filters.priority));
        }
        if (filters.technician_id) {
            // Sous-requête : indépendante du JOIN ta (is_primary), matche toute affectation tech.
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE technician_id = $${idx++})`);
            params.push(parseInt(filters.technician_id));
        }
        if (filters.group_id) {
            // Les groupes sont insérés avec is_primary = false (hors du JOIN ta) → sous-requête obligatoire.
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE group_id = $${idx++})`);
            params.push(parseInt(filters.group_id));
        }
        if (filters.type) {
            conditions.push(`t.type = $${idx++}`);
            params.push(String(filters.type));
        }
        if (filters.search) {
            conditions.push(`(t.title ILIKE $${idx} OR t.content ILIKE $${idx} OR t.glpi_id::text ILIKE $${idx})`);
            params.push(`%${filters.search}%`);
            idx++;
        }
        if (filters.my) {
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE technician_id = $${idx++})`);
            params.push(parseInt(filters.my));
        }
        if (filters.my_username) {
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE technician_id = (SELECT id FROM hub.users WHERE LOWER(username) = LOWER($${idx++})))`);
            params.push(filters.my_username);
        }
        if (filters.requester_email) {
            conditions.push(`LOWER(COALESCE(NULLIF(t.email_alt, ''), t.requester_email_22)) = LOWER($${idx++})`);
            params.push(filters.requester_email);
        }
        if (filters.exclude_id) {
            conditions.push(`t.glpi_id != $${idx++}`);
            params.push(parseInt(filters.exclude_id));
        }
        if (filters.unassigned) {
            conditions.push(`t.glpi_id NOT IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE technician_id IS NOT NULL)`);
        }
        if (filters.vip) {
            conditions.push('t.is_vip = true');
        }
        if (filters.category_id === 'none' || filters.no_category === '1' || filters.no_category === 'true') {
            // "Sans catégorie" : aucun rattachement de catégorie
            conditions.push(`t.category_id IS NULL`);
        } else if (filters.category_id) {
            conditions.push(`t.category_id = $${idx++}`);
            params.push(parseInt(filters.category_id));
        }
        if (filters.subcategory_id) {
            conditions.push(`t.subcategory_id = $${idx++}`);
            params.push(parseInt(filters.subcategory_id));
        }
        if (filters.software_id) {
            conditions.push(`t.software_id = $${idx++}`);
            params.push(parseInt(filters.software_id));
        }
        if (filters.favorites && user) {
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_favorites WHERE user_id = $${idx++})`);
            params.push(user.id);
        }
        if (filters.sla_breached) {
            // Sous-requête autonome : le CTE n'a pas besoin du LEFT JOIN tsla complexe.
            conditions.push(`t.glpi_id IN (SELECT ts2.ticket_id FROM hub_tickets.ticket_sla ts2 JOIN hub_tickets.sla_definitions sd2 ON ts2.sla_definition_id = sd2.id AND sd2.is_active = true WHERE ts2.sla_status IN ('warning', 'breached'))`);
        }
        if (filters.date_from) {
            conditions.push(`t.date_creation >= $${idx++}`);
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            conditions.push(`t.date_creation <= $${idx++}`);
            params.push(filters.date_to);
        }
        if (filters.is_live === 'true' || filters.is_live === '1') {
            conditions.push(`t.is_live = true`);
        } else if (filters.is_live === 'false' || filters.is_live === '0') {
            conditions.push(`t.is_live IS NOT TRUE`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const sortCol = ['priority', 'date_creation', 'date_mod', 'status', 'type'].includes(pagination.sort)
            ? pagination.sort : 'date_creation';
        const sortDir = pagination.order === 'asc' ? 'ASC' : 'DESC';

        // COUNT : requête légère sur hub_tickets.tickets uniquement (indexes seuls).
        // Le LEFT JOIN tsla n'est plus nécessaire car sla_breached est désormais une sous-requête.
        const countSql = `SELECT COUNT(*) as total FROM hub_tickets.tickets t ${where}`;
        const totalResult = await pgDb.get(countSql, params);
        const total = parseInt(totalResult?.total || 0);

        const offset = (pagination.page - 1) * pagination.limit;
        // CTE two-pass : 1) récupère les N IDs avec indexes (rapide),
        // 2) enrichit seulement ces N lignes avec BASE_SELECT (sous-requêtes × 25 au lieu de × total).
        const cte = `WITH page_ids AS (
          SELECT t.glpi_id FROM hub_tickets.tickets t
          ${where}
          ORDER BY t.${sortCol} ${sortDir}
          LIMIT $${idx++} OFFSET $${idx++}
        )`;
        params.push(pagination.limit, offset);
        const idWhere = `WHERE t.glpi_id IN (SELECT glpi_id FROM page_ids)`;
        const sql = `${cte} ${BASE_SELECT} ${idWhere} ORDER BY t.${sortCol} ${sortDir}`;

        const rows = await pgDb.all(sql, params);

        return {
            data: rows,
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total,
                totalPages: Math.ceil(total / pagination.limit),
            }
        };
    },

    async create(data) {
        // Check for duplicate: same title + requester within 2 minutes
        if (data.title && data.requester_email) {
            const dup = await pgDb.get(
                `SELECT glpi_id FROM hub_tickets.tickets WHERE title = $1 AND requester_email_22 = $2 AND date_creation > NOW() - INTERVAL '2 minutes' LIMIT 1`,
                [data.title, data.requester_email]
            );
            if (dup) {
                console.log('[TICKET] Duplicate detected: title=%s email=%s existing_id=%d', data.title, data.requester_email, dup.glpi_id);
                return dup.glpi_id;
            }
        }

        // Atomic ID generation using sequence
        const seqResult = await pgDb.get(`SELECT nextval('hub_tickets.ticket_id_seq') as next_id`);
        const id = seqResult.next_id;

        await pgDb.run(`
            INSERT INTO hub_tickets.tickets
                (glpi_id, title, content, status, priority, urgency, impact,
                 type, category, date_creation, date_mod, source,
                 requester_name, requester_email_22, location, solution, is_vip,
                 resolution_method, knowledge_article, category_id, subcategory_id, software_id,
                 requester_phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        `, [
            id, data.title, data.content || '', data.status || 1,
            data.priority || 3, data.urgency || 3, data.impact || 2,
            String(data.type || 1), data.category || '',
            data.date_creation ? toParisSql(data.date_creation) : toParisSql(), data.source || 'hub',
            data.requester_name || '', data.requester_email || '',
            data.location || '', data.solution || '', !!data.is_vip,
            data.resolution_method || null, data.knowledge_article || null,
            data.category_id || null, data.subcategory_id || null, data.software_id || null,
            data.requester_phone || null
        ]);

        return id;
    },

    async update(id, data) {
        const fields = [];
        const params = [];
        let idx = 1;

        for (const key of ['title', 'content', 'priority', 'urgency', 'impact', 'type', 'category', 'location', 'solution', 'is_vip', 'resolution_method', 'knowledge_article', 'category_id', 'subcategory_id', 'software_id']) {
            if (data[key] !== undefined) {
                fields.push(`${key} = $${idx++}`);
                params.push(data[key]);
            }
        }
        if (data.status !== undefined) {
            fields.push(`status = $${idx++}`);
            params.push(data.status);
        }

        fields.push(`date_mod = $${idx++}`);
        params.push(toParisSql());

        if (data.status === 5) {
            fields.push(`date_solved = $${idx++}`);
            params.push(toParisSql());
        }
        if (data.status === 6) {
            fields.push(`date_closed = $${idx++}`);
            params.push(toParisSql());
        }

        if (fields.length === 0) return;

        params.push(id);
        await pgDb.run(
            `UPDATE hub_tickets.tickets SET ${fields.join(', ')} WHERE glpi_id = $${idx}`,
            params
        );
    },

    async softDelete(id) {
        await pgDb.run(
            `UPDATE hub_tickets.tickets SET status = 8, date_mod = $1 WHERE glpi_id = $2`,
            [toParisSql(), id]
        );
    },

    async getDashboardStats(filters = {}) {
        // Construit un WHERE optionnel à partir des mêmes filtres que la liste.
        const esc = (v) => String(v).replace(/'/g, "''");
        const conds = [];
        if (filters.category_id === 'none') {
            conds.push(`t.category_id IS NULL`);
        } else if (filters.category_id) {
            conds.push(`t.category_id = ${parseInt(filters.category_id, 10)}`);
        }
        if (filters.subcategory_id) conds.push(`t.subcategory_id = ${parseInt(filters.subcategory_id, 10)}`);
        if (filters.software_id) conds.push(`t.software_id = ${parseInt(filters.software_id, 10)}`);
        if (filters.group_id) conds.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE group_id = ${parseInt(filters.group_id, 10)})`);
        if (filters.technician_id) conds.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE technician_id = ${parseInt(filters.technician_id, 10)})`);
        if (filters.requester_email) conds.push(`LOWER(COALESCE(NULLIF(t.email_alt,''), t.requester_email_22)) = LOWER('${esc(filters.requester_email)}')`);
        if (filters.search) {
            const s = esc(filters.search);
            conds.push(`(t.title ILIKE '%${s}%' OR CAST(t.glpi_id AS TEXT) ILIKE '%${s}%')`);
        }
        const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const stats = await pgDb.get(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 1) as new,
                -- incident = tout nouveau ticket qui n'est pas une demande explicite
                -- (inclut les tickets live non classés, type NULL) → inc + dem = new
                COUNT(*) FILTER (WHERE status = 1 AND type::text IS DISTINCT FROM '2') as new_incident,
                COUNT(*) FILTER (WHERE status = 1 AND type::text = '2') as new_request,
                COUNT(*) FILTER (WHERE status IN (1,2,3)) as open,
                COUNT(*) FILTER (WHERE status = 5) as resolved,
                COUNT(*) FILTER (WHERE status = 6) as closed,
                COUNT(*) FILTER (WHERE status IN (2,3)) as in_progress,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3)) as critical_open,
                COUNT(*) FILTER (WHERE status = 4) as waiting,
                COUNT(*) FILTER (WHERE type::text = '1') as total_incident,
                COUNT(*) FILTER (WHERE type::text = '2') as total_request,
                COUNT(*) FILTER (WHERE status IN (1,2,3) AND type::text = '1') as open_incident,
                COUNT(*) FILTER (WHERE status IN (1,2,3) AND type::text = '2') as open_request,
                COUNT(*) FILTER (WHERE status IN (2,3) AND type::text = '1') as in_progress_incident,
                COUNT(*) FILTER (WHERE status IN (2,3) AND type::text = '2') as in_progress_request,
                COUNT(*) FILTER (WHERE status = 4 AND type::text = '1') as waiting_incident,
                COUNT(*) FILTER (WHERE status = 4 AND type::text = '2') as waiting_request,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3) AND type::text = '1') as critical_incident,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3) AND type::text = '2') as critical_request,
                COUNT(*) FILTER (WHERE status = 5 AND type::text = '1') as resolved_incident,
                COUNT(*) FILTER (WHERE status = 5 AND type::text = '2') as resolved_request,
                COUNT(*) FILTER (WHERE is_vip = true) as vip_total,
                COUNT(*) FILTER (WHERE type::text = '3' AND status IN (1,2,3,4,5)) as problems,
                COUNT(*) FILTER (WHERE tsla.sla_status = 'breached' AND tsla.sla_definition_id IN (SELECT id FROM hub_tickets.sla_definitions WHERE is_active = true)) as sla_breached,
                COUNT(*) FILTER (WHERE tsla.sla_status = 'warning' AND tsla.sla_definition_id IN (SELECT id FROM hub_tickets.sla_definitions WHERE is_active = true)) as sla_warning
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_sla tsla ON tsla.ticket_id = t.glpi_id
            ${whereClause}
        `);
        return stats;
    },

    async getMyStats(username) {
        return pgDb.get(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE t.status IN (1,2,3)) as active,
                COUNT(*) FILTER (WHERE t.status IN (2,3)) as in_progress,
                COUNT(*) FILTER (WHERE t.status = 4) as waiting,
                COUNT(*) FILTER (WHERE t.priority = 5 AND t.status IN (1,2,3)) as critical
            FROM hub_tickets.tickets t
            JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
            WHERE ta.technician_id = (SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1))
        `, [username]);
    },

    async getDashboardUserCounts(user) {
        const requesterEmail = user?.email || '';
        const username = user?.username || '';
        return pgDb.get(`
            SELECT
                COUNT(*) FILTER (WHERE ta.technician_id = (SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1))) as assigned_to_me,
                COUNT(*) FILTER (WHERE LOWER(t.requester_email_22) = LOWER($2)) as requested_by_me,
                COUNT(*) FILTER (WHERE t.is_vip = true) as vip
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
            WHERE t.status IN (1,2,3,4,5)
        `, [username, requesterEmail]);
    },

    async getTimeStats() {
        return pgDb.get(`
            SELECT
                COALESCE(AVG(total_waiting_seconds), 0)::integer as avg_waiting_seconds_active,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (
                            COALESCE(date_solved, CURRENT_TIMESTAMP)
                            - date_creation
                        )) - COALESCE(total_waiting_seconds, 0)
                    ) FILTER (WHERE date_creation IS NOT NULL), 0
                )::integer as avg_active_seconds_resolved_week,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - date_creation))
                    ) FILTER (WHERE status IN (1,2,3) AND date_creation IS NOT NULL), 0
                )::integer as avg_age_open_seconds
            FROM hub_tickets.tickets
            WHERE status IN (1,2,3,4,5)
        `);
    },

    async getResolvedWeekTimeStats() {
        return pgDb.get(`
            SELECT
                COUNT(*) as resolved_count,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (
                            COALESCE(date_solved, date_closed, CURRENT_TIMESTAMP)
                            - date_creation
                        )) - COALESCE(total_waiting_seconds, 0)
                    ) FILTER (WHERE date_creation IS NOT NULL), 0
                )::integer as avg_active_seconds_week
            FROM hub_tickets.tickets
            WHERE status = 5
              AND date_solved >= DATE_TRUNC('week', CURRENT_TIMESTAMP)::date
        `);
    },

    async saveKpiSnapshot(data) {
        await pool.query(`
            INSERT INTO hub_tickets.kpi_history (
                snapshot_date, total, open, in_progress, waiting, critical_open,
                resolved, closed, problems, vip_total, open_incident, open_request,
                avg_age_open_seconds, avg_waiting_seconds_active,
                avg_active_seconds_week, resolved_week_count
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ON CONFLICT (snapshot_date) DO UPDATE SET
                total = EXCLUDED.total,
                open = EXCLUDED.open,
                in_progress = EXCLUDED.in_progress,
                waiting = EXCLUDED.waiting,
                critical_open = EXCLUDED.critical_open,
                resolved = EXCLUDED.resolved,
                closed = EXCLUDED.closed,
                problems = EXCLUDED.problems,
                vip_total = EXCLUDED.vip_total,
                open_incident = EXCLUDED.open_incident,
                open_request = EXCLUDED.open_request,
                avg_age_open_seconds = EXCLUDED.avg_age_open_seconds,
                avg_waiting_seconds_active = EXCLUDED.avg_waiting_seconds_active,
                avg_active_seconds_week = EXCLUDED.avg_active_seconds_week,
                resolved_week_count = EXCLUDED.resolved_week_count
        `, [
            data.snapshot_date,
            data.total || 0, data.open || 0, data.in_progress || 0, data.waiting || 0, data.critical_open || 0,
            data.resolved || 0, data.closed || 0, data.problems || 0, data.vip_total || 0,
            data.open_incident || 0, data.open_request || 0,
            data.avg_age_open_seconds || 0, data.avg_waiting_seconds_active || 0,
            data.avg_active_seconds_week || 0, data.resolved_week_count || 0,
        ]);
    },

    async getKpiHistory(days = 30) {
        const res = await pool.query(`
            SELECT * FROM hub_tickets.kpi_history
            WHERE snapshot_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
            ORDER BY snapshot_date ASC
        `, [days]);
        return res.rows;
    },

    async backfillKpiHistory(days = 30) {
        // Reconstitue un snapshot par jour à partir des métadonnées existantes.
        // Un ticket est considéré "ouvert" sur la date D si :
        //   - il a été créé avant D
        //   - il n'est pas supprimé (status != 8)
        //   - il n'a pas encore été résolu/fermé à cette date
        // Les tickets encore ouverts aujourd'hui (sans date_solved) sont supposés
        // avoir été ouverts sur tous les jours depuis leur création.
        const res = await pool.query(`
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - ($1 || ' days')::interval,
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS snap_date
            ),
            ticket_on_date AS (
                SELECT
                    ds.snap_date,
                    t.glpi_id,
                    t.type,
                    t.priority,
                    t.is_vip,
                    t.date_creation AS created_at,
                    t.date_solved   AS solved_at,
                    t.date_closed   AS closed_at,
                    COALESCE(t.total_waiting_seconds, 0) AS wait_sec,
                    -- Le ticket était-il ouvert (non encore résolu/fermé) ce jour-là ?
                    CASE WHEN
                        t.date_creation::date <= ds.snap_date
                        AND t.status != 8
                        AND (t.date_solved IS NULL OR t.date_solved::date > ds.snap_date)
                        AND (t.date_closed IS NULL OR t.date_closed::date > ds.snap_date)
                    THEN true ELSE false END AS was_open,
                    -- Le ticket était-il résolu ce jour-là ?
                    CASE WHEN
                        t.date_solved IS NOT NULL
                        AND t.date_solved::date <= ds.snap_date
                    THEN true ELSE false END AS was_resolved,
                    -- Le ticket était-il fermé (mais pas résolu) ce jour-là ?
                    CASE WHEN
                        t.date_closed IS NOT NULL
                        AND t.date_closed::date <= ds.snap_date
                        AND (t.date_solved IS NULL OR t.date_solved::date > ds.snap_date)
                    THEN true ELSE false END AS was_closed
                FROM date_series ds
                CROSS JOIN hub_tickets.tickets t
                WHERE t.date_creation::date <= ds.snap_date
                  AND t.status != 8
            )
            INSERT INTO hub_tickets.kpi_history (
                snapshot_date,
                total, open, resolved, closed,
                open_incident, open_request,
                critical_open, vip_total,
                avg_age_open_seconds
            )
            SELECT
                snap_date,
                COUNT(*) FILTER (WHERE was_open OR was_resolved OR was_closed)        AS total,
                COUNT(*) FILTER (WHERE was_open)                                       AS open,
                COUNT(*) FILTER (WHERE was_resolved)                                   AS resolved,
                COUNT(*) FILTER (WHERE was_closed)                                     AS closed,
                COUNT(*) FILTER (WHERE was_open AND type::text = '1')                  AS open_incident,
                COUNT(*) FILTER (WHERE was_open AND type::text = '2')                  AS open_request,
                COUNT(*) FILTER (WHERE was_open AND priority = 5)                      AS critical_open,
                COUNT(*) FILTER (WHERE was_open AND is_vip = true)                     AS vip_total,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (snap_date::timestamp - created_at))
                    ) FILTER (WHERE was_open), 0
                )::integer AS avg_age_open_seconds
            FROM ticket_on_date
            GROUP BY snap_date
            ON CONFLICT (snapshot_date) DO UPDATE SET
                total              = EXCLUDED.total,
                open               = EXCLUDED.open,
                resolved           = EXCLUDED.resolved,
                closed             = EXCLUDED.closed,
                open_incident      = EXCLUDED.open_incident,
                open_request       = EXCLUDED.open_request,
                critical_open      = EXCLUDED.critical_open,
                vip_total          = EXCLUDED.vip_total,
                avg_age_open_seconds = EXCLUDED.avg_age_open_seconds
            RETURNING snapshot_date
        `, [days]);
        return res.rowCount;
    },

    async getDailyMetricsWithRollingAverage() {
        // Get metrics for today and the last 60 days
        const result = await pgDb.get(`
            WITH today_created AS (
                SELECT COUNT(*) as count
                FROM hub_tickets.tickets
                WHERE DATE(date_creation) = CURRENT_DATE
                  AND status != 8
            ),
            today_moved_to_progress AS (
                SELECT COUNT(DISTINCT ticket_id) as count
                FROM hub_tickets.ticket_history
                WHERE DATE(created_at) = CURRENT_DATE
                  AND action = 'status_changed'
                  AND new_value = '3'
            ),
            today_moved_to_waiting AS (
                SELECT COUNT(DISTINCT ticket_id) as count
                FROM hub_tickets.ticket_history
                WHERE DATE(created_at) = CURRENT_DATE
                  AND action = 'status_changed'
                  AND new_value IN ('4','5')
            ),
            today_resolved AS (
                SELECT COUNT(DISTINCT ticket_id) as count
                FROM hub_tickets.ticket_history
                WHERE DATE(created_at) = CURRENT_DATE
                  AND action = 'status_changed'
                  AND new_value = '5'
            ),
            today_closed AS (
                SELECT COUNT(DISTINCT ticket_id) as count
                FROM hub_tickets.ticket_history
                WHERE DATE(created_at) = CURRENT_DATE
                  AND action = 'status_changed'
                  AND new_value = '6'
            ),
            -- Business days for rolling average calculation (weekdays only, no holidays for now)
            business_days AS (
                SELECT ds::date as calc_date
                FROM generate_series(
                    (CURRENT_DATE - 60)::timestamp,
                    (CURRENT_DATE)::timestamp,
                    '1 day'::interval
                ) ds
                WHERE EXTRACT(DOW FROM ds) NOT IN (0, 6) -- Exclude Sunday (0) and Saturday (6)
            ),
            rolling_stats AS (
                SELECT
                    COALESCE(AVG(COALESCE(kh.open, 0))::integer, 0) as avg_open_60d,
                    COALESCE(AVG(COALESCE(kh.in_progress, 0))::integer, 0) as avg_in_progress_60d,
                    COALESCE(AVG(COALESCE(kh.waiting, 0))::integer, 0) as avg_waiting_60d,
                    COALESCE(AVG(COALESCE(kh.resolved, 0))::integer, 0) as avg_resolved_60d,
                    COUNT(*) as biz_days_count
                FROM business_days bd
                LEFT JOIN hub_tickets.kpi_history kh ON kh.snapshot_date = bd.calc_date
            )
            SELECT
                COALESCE(tcp.count, 0) as today_created,
                COALESCE(tmp.count, 0) as today_in_progress,
                COALESCE(tmw.count, 0) as today_waiting,
                COALESCE(tr.count, 0) as today_resolved,
                COALESCE(tc.count, 0) as today_closed,
                rs.avg_open_60d,
                rs.avg_in_progress_60d,
                rs.avg_waiting_60d,
                rs.avg_resolved_60d,
                rs.biz_days_count
            FROM (SELECT 1) x
            LEFT JOIN today_created tcp ON true
            LEFT JOIN today_moved_to_progress tmp ON true
            LEFT JOIN today_moved_to_waiting tmw ON true
            LEFT JOIN today_resolved tr ON true
            LEFT JOIN today_closed tc ON true
            LEFT JOIN rolling_stats rs ON true
        `);
        return result;
    },

    // ── Stats pilotage ────────────────────────────────────────
    async getTicketsStats(filters = {}) {
        // Plage de dates optionnelle (année / mois / période glissante) appliquée à tous les KPI.
        const isoDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) ? s.slice(0, 10) : null;
        const from = isoDate(filters.from);
        const to = isoDate(filters.to);
        const range = !!(from && to);
        // Filtre groupe optionnel (id numérique validé → pas d'injection)
        const groupId = /^\d+$/.test(String(filters.group_id ?? '')) ? parseInt(filters.group_id, 10) : null;
        // Conditions composables (dates validées en YYYY-MM-DD, group_id entier → pas d'injection)
        const dateAnd = range ? ` AND t.date_creation >= '${from} 00:00:00' AND t.date_creation <= '${to} 23:59:59'` : '';
        const grpAnd = groupId ? ` AND t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE group_id = ${groupId})` : '';
        const grpBare = groupId ? ` AND glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_assignments WHERE group_id = ${groupId})` : '';
        const filtAnd = dateAnd + grpAnd; // date + groupe (SANS exclusion des rejetés)
        // Tous les KPI excluent les tickets rejetés (statut 8), sauf la répartition/tendance par statut.
        const dcAnd = ` AND t.status::int <> 8` + filtAnd;
        const dcWhere = ` WHERE t.status::int <> 8` + filtAnd;
        // Variante date+groupe sans exclusion des rejetés (répartition par statut → compte les rejetés)
        const dcWhereDateOnly = filtAnd ? ` WHERE 1=1${filtAnd}` : '';

        const statusDist = await pgDb.all(`
            SELECT COALESCE(s.label, 'Inconnu') as name, COUNT(*)::int as value
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_status s ON t.status::integer = s.id${dcWhereDateOnly}
            GROUP BY s.label, t.status ORDER BY value DESC
        `);

        const typeDist = await pgDb.all(`
            SELECT
                CASE t.type::text
                    WHEN '1' THEN 'Incident'
                    WHEN '2' THEN 'Demande'
                    WHEN '3' THEN 'Problème'
                    ELSE 'Autre'
                END as name,
                COUNT(*)::int as value
            FROM hub_tickets.tickets t${dcWhere}
            GROUP BY t.type ORDER BY value DESC
        `);

        const priorityDist = await pgDb.all(`
            SELECT t.priority::int as priority, COUNT(*)::int as value
            FROM hub_tickets.tickets t
            WHERE t.status NOT IN ('5','6','8')${dcAnd}
            GROUP BY t.priority ORDER BY t.priority DESC
        `);

        // Tendance mensuelle :
        //  - barres = tickets CRÉÉS dans le mois, ventilés par état actuel (empilés)
        //  - ligne "resolved" = tickets RÉSOLUS/CLÔTURÉS dans le mois (par date_solved),
        //    indépendant des créations (peut dépasser le nombre de créations).
        const monthlyTrend = await pgDb.all(`
            WITH months AS (
                SELECT TO_CHAR(d, 'YYYY-MM') AS month, TO_CHAR(d, 'Mon YYYY') AS label
                FROM generate_series(
                    DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
                    DATE_TRUNC('month', CURRENT_DATE),
                    INTERVAL '1 month'
                ) d
            ),
            created AS (
                SELECT TO_CHAR(DATE_TRUNC('month', date_creation), 'YYYY-MM') AS month,
                    COUNT(*)::int AS created,
                    COUNT(*) FILTER (WHERE status::int = 1)::int      AS nouveau,
                    COUNT(*) FILTER (WHERE status::int IN (2,3))::int AS en_cours,
                    COUNT(*) FILTER (WHERE status::int = 4)::int      AS en_attente,
                    COUNT(*) FILTER (WHERE status::int = 5)::int      AS resolu,
                    COUNT(*) FILTER (WHERE status::int = 6)::int      AS clos,
                    COUNT(*) FILTER (WHERE status::int = 8)::int      AS rejete
                FROM hub_tickets.tickets
                WHERE date_creation >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'${grpBare}
                GROUP BY 1
            ),
            solved AS (
                SELECT TO_CHAR(DATE_TRUNC('month', date_solved), 'YYYY-MM') AS month,
                    COUNT(*)::int AS resolved
                FROM hub_tickets.tickets
                WHERE date_solved IS NOT NULL AND status::int IN (5,6)
                  AND date_solved >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'${grpBare}
                GROUP BY 1
            )
            SELECT m.month, m.label,
                COALESCE(c.created, 0)    AS created,
                COALESCE(c.nouveau, 0)    AS nouveau,
                COALESCE(c.en_cours, 0)   AS en_cours,
                COALESCE(c.en_attente, 0) AS en_attente,
                COALESCE(c.resolu, 0)     AS resolu,
                COALESCE(c.clos, 0)       AS clos,
                COALESCE(c.rejete, 0)     AS rejete,
                COALESCE(s.resolved, 0)   AS resolved
            FROM months m
            LEFT JOIN created c ON c.month = m.month
            LEFT JOIN solved s ON s.month = m.month
            ORDER BY m.month ASC
        `);

        const weeklyCreated = await pgDb.all(`
            SELECT
                DATE_TRUNC('week', t.date_creation)::date as week_start,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            WHERE t.date_creation >= CURRENT_DATE - INTERVAL '90 days' AND t.status::int <> 8
            GROUP BY DATE_TRUNC('week', t.date_creation)
            ORDER BY week_start ASC
        `);

        const categoryDist = await pgDb.all(`
            SELECT
                COALESCE(c.full_path, c.name, 'Sans catégorie') as name,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_categories c ON t.category_id = c.id${dcWhere}
            GROUP BY c.full_path, c.name ORDER BY count DESC LIMIT 15
        `);

        // Répartition par groupe assigné (toute ligne d'assignation avec un groupe)
        const groupDist = await pgDb.all(`
            SELECT g.id as group_id, g.name, COUNT(DISTINCT t.glpi_id)::int as count
            FROM hub_tickets.ticket_assignments ta
            JOIN hub_tickets.technician_groups g ON ta.group_id = g.id
            JOIN hub_tickets.tickets t ON ta.ticket_id = t.glpi_id
            WHERE 1=1${dcAnd}
            GROUP BY g.id, g.name
            ORDER BY count DESC
        `);

        const topRequesters = await pgDb.all(`
            SELECT
                t.requester_email_22 as email,
                t.requester_name as name,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            WHERE t.requester_email_22 IS NOT NULL AND t.requester_email_22 != ''${dcAnd}
            GROUP BY t.requester_email_22, t.requester_name
            ORDER BY count DESC LIMIT 10
        `);

        const techAssignments = await pgDb.all(`
            SELECT
                u.displayName as name,
                u.username,
                COUNT(*)::int as count
            FROM hub_tickets.ticket_assignments ta
            JOIN hub.users u ON ta.technician_id = u.id
            JOIN hub_tickets.tickets t ON ta.ticket_id = t.glpi_id
            WHERE t.status IN ('1','2','3','4','5')${dcAnd}
            GROUP BY u.displayName, u.username
            ORDER BY count DESC LIMIT 15
        `);

        // Temps de résolution : courbe QUOTIDIENNE sur les 30 derniers jours (par date de résolution).
        // Temps ouvré = délai création→résolution MOINS le temps passé "en attente".
        const resolutionTimeTrend = await pgDb.all(`
            SELECT
                TO_CHAR(t.date_solved::date, 'DD/MM') as month,
                ROUND(AVG(
                    GREATEST(EXTRACT(EPOCH FROM (t.date_solved - t.date_creation)) - COALESCE(t.total_waiting_seconds, 0), 0) / 3600.0
                )::numeric, 1)::float as avg_hours,
                COUNT(*)::int as solved_count
            FROM hub_tickets.tickets t
            WHERE t.status IN ('5','6') AND t.date_solved IS NOT NULL
              AND t.date_solved >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY t.date_solved::date
            ORDER BY t.date_solved::date ASC
        `);

        const backlogAging = await pgDb.all(`
            SELECT
                CASE
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '1 day'  THEN '< 1j'
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '3 days' THEN '1-3j'
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '7 days' THEN '3-7j'
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '14 days' THEN '1-2 sem'
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '30 days' THEN '2-4 sem'
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '90 days' THEN '1-3 mois'
                    ELSE '3+ mois'
                END as range,
                CASE
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '1 day'  THEN 0
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '3 days' THEN 1
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '7 days' THEN 2
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '14 days' THEN 3
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '30 days' THEN 4
                    WHEN AGE(CURRENT_DATE, t.date_creation::date) < INTERVAL '90 days' THEN 5
                    ELSE 6
                END as sort_order,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            -- Indicateur GLOBAL : tous les tickets ouverts (1-4), sans filtre de période ni groupe.
            WHERE t.status IN ('1','2','3','4')
            GROUP BY range, sort_order
            ORDER BY sort_order ASC
        `);

        const hourlyDist = await pgDb.all(`
            SELECT
                EXTRACT(HOUR FROM t.date_creation)::int as hour,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            WHERE t.date_creation >= ${range ? `'${from} 00:00:00'` : `CURRENT_DATE - INTERVAL '12 months'`}${range ? ` AND t.date_creation <= '${to} 23:59:59'` : ''} AND t.status::int <> 8
            GROUP BY EXTRACT(HOUR FROM t.date_creation)
            ORDER BY hour ASC
        `);

        const slaOverview = await pgDb.all(`
            SELECT
                CASE ts.sla_status
                    WHEN 'ok' THEN 'OK'
                    WHEN 'warning' THEN 'Avertissement'
                    WHEN 'breached' THEN 'Violé'
                    ELSE 'Non défini'
                END as name,
                COUNT(*)::int as value
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_sla ts ON ts.ticket_id = t.glpi_id
                AND ts.sla_definition_id IN (SELECT id FROM hub_tickets.sla_definitions WHERE is_active = true)
            WHERE t.status IN ('1','2','3','4','5')${dcAnd}
            GROUP BY ts.sla_status ORDER BY value DESC
        `);

        const overview = await pgDb.get(`
            SELECT
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE t.status IN ('1','2','3'))::int as open,
                COUNT(*) FILTER (WHERE t.status IN ('2','3'))::int as in_progress,
                COUNT(*) FILTER (WHERE t.status = '5')::int as resolved,
                COUNT(*) FILTER (WHERE t.status = '6')::int as closed,
                COUNT(*) FILTER (WHERE t.status = '4')::int as waiting,
                COUNT(*) FILTER (WHERE t.priority = '5' AND t.status IN ('1','2','3'))::int as critical_open,
                COUNT(*) FILTER (WHERE t.is_vip = true AND t.status IN ('1','2','3','4','5'))::int as vip_open,
                COUNT(*) FILTER (WHERE ts.sla_status = 'breached' AND ts.sla_definition_id IN (SELECT id FROM hub_tickets.sla_definitions WHERE is_active = true))::int as sla_breached,
                COUNT(*) FILTER (WHERE t.type::text = '1')::int as total_incidents,
                COUNT(*) FILTER (WHERE t.type::text = '2')::int as total_requests,
                COUNT(*) FILTER (WHERE t.type::text = '3' AND t.status IN ('1','2','3','4','5'))::int as open_problems
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_sla ts ON ts.ticket_id = t.glpi_id${dcWhere}
        `);

        // Reopened tickets = tickets with status 1/2/3 that were previously solved/closed
        const reopenedResult = await pgDb.get(`
            SELECT COUNT(*)::int as count
            FROM hub_tickets.ticket_history h
            WHERE h.new_value IN ('1','2','3')
              AND h.old_value IN ('5','6')
              AND h.field_name = 'status'
              AND h.created_at >= ${range ? `'${from} 00:00:00'` : `CURRENT_DATE - INTERVAL '30 days'`}${range ? ` AND h.created_at <= '${to} 23:59:59'` : ''}
        `);

        // Avg resolution time for tickets resolved this month
        const avgTimes = await pgDb.get(`
            SELECT
                ROUND(AVG(EXTRACT(EPOCH FROM (t.date_solved - t.date_creation)) / 3600.0)::numeric, 1)::float as avg_resolution_hours,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.date_solved, t.date_closed) - t.date_creation)) / 3600.0)::numeric, 1)::float as avg_closure_hours
            FROM hub_tickets.tickets t
            WHERE t.status IN ('5','6') AND t.date_solved IS NOT NULL
              AND t.date_solved >= ${range ? `'${from} 00:00:00'` : `DATE_TRUNC('month', CURRENT_DATE)`}${range ? ` AND t.date_solved <= '${to} 23:59:59'` : ''}
        `);

        const weeklyComparison = await pgDb.get(`
            WITH weeks AS (
                SELECT
                    COUNT(*) FILTER (WHERE DATE_TRUNC('week', date_creation) = DATE_TRUNC('week', CURRENT_DATE))::int as this_week,
                    COUNT(*) FILTER (WHERE DATE_TRUNC('week', date_creation) = DATE_TRUNC('week', CURRENT_DATE - INTERVAL '7 days'))::int as last_week
                FROM hub_tickets.tickets t
                WHERE t.date_creation >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '7 days') AND t.status::int <> 8
            )
            SELECT this_week, last_week,
                CASE WHEN last_week > 0 THEN ROUND((this_week::numeric - last_week) / last_week * 100, 1)::float ELSE NULL END as change_pct
            FROM weeks
        `);

        // Top logiciels
        const topSoftwares = await pgDb.all(`
            SELECT
                a.name as software,
                COUNT(*)::int as count,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.date_solved, CURRENT_TIMESTAMP) - t.date_creation)) / 3600.0)::numeric, 1)::float as avg_resolution_hours
            FROM hub_tickets.tickets t
            LEFT JOIN magapp.apps a ON t.software_id = a.id
            WHERE t.status IN ('1','2','3','4','5','6')${dcAnd}
            GROUP BY a.name
            ORDER BY count DESC LIMIT 12
        `);

        // Top demandeurs (top 15)
        const topRequestersExtended = await pgDb.all(`
            SELECT
                t.requester_email_22 as email,
                t.requester_name as name,
                COUNT(*)::int as total_count,
                COUNT(*) FILTER (WHERE t.status IN ('1','2','3','4','5'))::int as open_count,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.date_solved, CURRENT_TIMESTAMP) - t.date_creation)) / 3600.0)::numeric, 1)::float as avg_resolution_hours
            FROM hub_tickets.tickets t
            WHERE t.requester_email_22 IS NOT NULL AND t.requester_email_22 != ''${dcAnd}
            GROUP BY t.requester_email_22, t.requester_name
            ORDER BY total_count DESC LIMIT 15
        `);

        // Performance par technicien (résolution)
        const technicianPerformance = await pgDb.all(`
            SELECT
                u.displayName as name,
                u.username,
                COUNT(*)::int as tickets_count,
                COUNT(*) FILTER (WHERE t.status IN ('5','6'))::int as resolved_count,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.date_solved, CURRENT_TIMESTAMP) - t.date_creation)) / 3600.0)::numeric, 1)::float as avg_resolution_hours,
                ROUND((COUNT(*) FILTER (WHERE t.status IN ('5','6'))::numeric / COUNT(*)) * 100, 1)::float as resolution_rate
            FROM hub_tickets.ticket_assignments ta
            JOIN hub.users u ON ta.technician_id = u.id
            JOIN hub_tickets.tickets t ON ta.ticket_id = t.glpi_id
            WHERE (ta.is_primary = true OR ta.is_primary IS NULL)${dcAnd}
            GROUP BY u.displayName, u.username
            HAVING COUNT(*) >= 3
            ORDER BY avg_resolution_hours ASC LIMIT 12
        `);

        // Distribution VIP par priorité
        const vipByPriority = await pgDb.all(`
            SELECT
                t.priority::int as priority,
                COUNT(*)::int as count
            FROM hub_tickets.tickets t
            WHERE t.is_vip = true AND t.status IN ('1','2','3','4','5')${dcAnd}
            GROUP BY t.priority
            ORDER BY t.priority DESC
        `);

        // Tickets par statut sur 12 mois
        const statusTrend = await pgDb.all(`
            SELECT
                TO_CHAR(DATE_TRUNC('month', t.date_creation), 'YYYY-MM') as month,
                TO_CHAR(DATE_TRUNC('month', t.date_creation), 'MMM YY') as label,
                COUNT(*) FILTER (WHERE t.status IN ('1','2','3','4','5'))::int as open,
                COUNT(*) FILTER (WHERE t.status IN ('5','6'))::int as resolved,
                COUNT(*) FILTER (WHERE t.status = '8')::int as rejected
            FROM hub_tickets.tickets t
            WHERE t.date_creation >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', t.date_creation), label, month
            ORDER BY month ASC
        `);

        // Incidents vs Demandes par semaine (90 jours)
        const incidentVsRequestTrend = await pgDb.all(`
            SELECT
                DATE_TRUNC('week', t.date_creation)::date as week_start,
                COUNT(*) FILTER (WHERE t.type::text = '1')::int as incidents,
                COUNT(*) FILTER (WHERE t.type::text = '2')::int as requests
            FROM hub_tickets.tickets t
            WHERE t.date_creation >= CURRENT_DATE - INTERVAL '90 days' AND t.status::int <> 8
            GROUP BY DATE_TRUNC('week', t.date_creation)
            ORDER BY week_start ASC
        `);

        // Observers (top tickets being observed)
        const topObservers = await pgDb.all(`
            SELECT
                COALESCE(o.name, o.login, o.email, 'Inconnu') as name,
                o.login as username,
                COUNT(DISTINCT o.ticket_id)::int as observed_count
            FROM hub_tickets.observers o
            WHERE o.is_active = 1
            GROUP BY o.name, o.login, o.email
            ORDER BY observed_count DESC LIMIT 10
        `);

        // Temps de résolution OUVRÉ moyen par catégorie, en JOURS.
        // Temps ouvré = (date_solved - date_creation) MOINS le temps passé "en attente".
        const categoryPerformance = await pgDb.all(`
            SELECT
                COALESCE(c.full_path, c.name, 'Sans catégorie') as category,
                COUNT(*)::int as count,
                ROUND(AVG(GREATEST(EXTRACT(EPOCH FROM (t.date_solved - t.date_creation)) - COALESCE(t.total_waiting_seconds, 0), 0) / 86400.0)::numeric, 1)::float as avg_resolution_days
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_categories c ON t.category_id = c.id
            WHERE t.status IN ('5','6') AND t.date_solved IS NOT NULL${dcAnd}
            GROUP BY c.full_path, c.name
            ORDER BY count DESC LIMIT 12
        `);

        // Tendance QUOTIDIENNE (jours ouvrés) sur la fenêtre sélectionnée (défaut 30 derniers jours),
        // + comparaison sur la période précédente de même durée (ligne pointillée côté front).
        const dFrom = range ? `'${from}'::date` : `(CURRENT_DATE - INTERVAL '29 days')::date`;
        const dTo = range ? `'${to}'::date` : `CURRENT_DATE`;
        const dailyTrend = await pgDb.all(`
            WITH bounds AS (SELECT ${dFrom} AS dfrom, ${dTo} AS dto),
            n AS (SELECT (dto - dfrom + 1) AS span FROM bounds),
            days AS (
                SELECT gs::date AS day
                FROM bounds, generate_series(bounds.dfrom, bounds.dto, INTERVAL '1 day') gs
                WHERE EXTRACT(DOW FROM gs) NOT IN (0, 6)
            ),
            cur AS (
                SELECT t.date_creation::date AS d, COUNT(*)::int AS c
                FROM hub_tickets.tickets t, bounds
                WHERE t.status::int <> 8
                  AND t.date_creation::date BETWEEN bounds.dfrom AND bounds.dto${grpAnd}
                GROUP BY 1
            ),
            prev AS (
                SELECT (t.date_creation::date + (SELECT span FROM n)) AS d, COUNT(*)::int AS c
                FROM hub_tickets.tickets t, bounds, n
                WHERE t.status::int <> 8
                  AND t.date_creation::date BETWEEN (bounds.dfrom - n.span) AND (bounds.dto - n.span)${grpAnd}
                GROUP BY 1
            )
            SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
                   TO_CHAR(days.day, 'DD/MM') AS label,
                   COALESCE(cur.c, 0) AS created,
                   COALESCE(prev.c, 0) AS created_prev
            FROM days
            LEFT JOIN cur ON cur.d = days.day
            LEFT JOIN prev ON prev.d = days.day
            ORDER BY days.day ASC
        `);

        // ── Tendance adaptative ───────────────────────────────────────────────
        //  • Fenêtre ≤ 92 j  → granularité QUOTIDIENNE : histogramme des créés,
        //    ligne verte des résolus DU JOUR, fond aplati = créés 28 j auparavant
        //    (même jour de semaine, comparaison à 4 semaines).
        //  • Fenêtre > 92 j  → granularité MENSUELLE : idem, fond = mois précédent.
        //  • Vue "Tout"      → mensuelle : aire des créés + ligne verte des résolus (sans comparaison).
        let trend;
        if (range) {
            const spanDays = Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000) + 1;
            if (spanDays <= 92) {
                const data = await pgDb.all(`
                    WITH days AS (
                        SELECT gs::date AS d FROM generate_series('${from}'::date, '${to}'::date, INTERVAL '1 day') gs
                    ),
                    cr AS (SELECT t.date_creation::date d, COUNT(*) n FROM hub_tickets.tickets t WHERE t.status::int <> 8${grpAnd} GROUP BY 1),
                    rs AS (SELECT t.date_solved::date d, COUNT(*) n FROM hub_tickets.tickets t WHERE t.date_solved IS NOT NULL${grpAnd} GROUP BY 1),
                    base AS (
                        SELECT COUNT(*) n FROM hub_tickets.tickets t
                        WHERE t.status::int <> 8 AND t.date_creation::date < '${from}'::date
                          AND (t.date_solved IS NULL OR t.date_solved::date >= '${from}'::date)${grpAnd}
                    )
                    SELECT TO_CHAR(days.d,'DD/MM') AS label, TO_CHAR(days.d,'YYYY-MM-DD') AS bucket,
                           COALESCE(cr.n,0)::int AS created,
                           COALESCE(rs.n,0)::int AS resolved,
                           COALESCE(cmp.n,0)::int AS compare,
                           ((SELECT n FROM base) + SUM(COALESCE(cr.n,0) - COALESCE(rs.n,0)) OVER (ORDER BY days.d))::int AS open
                    FROM days
                    LEFT JOIN cr ON cr.d = days.d
                    LEFT JOIN rs ON rs.d = days.d
                    LEFT JOIN cr cmp ON cmp.d = days.d - 28
                    ORDER BY days.d
                `);
                trend = { granularity: 'day', compare: true, compareLabel: 'Créés (il y a 28 j)', data };
            } else {
                const data = await pgDb.all(`
                    WITH months AS (
                        SELECT gs::date AS m FROM generate_series(DATE_TRUNC('month','${from}'::date), DATE_TRUNC('month','${to}'::date), INTERVAL '1 month') gs
                    ),
                    cr AS (SELECT DATE_TRUNC('month',t.date_creation)::date m, COUNT(*) n FROM hub_tickets.tickets t WHERE t.status::int <> 8${grpAnd} GROUP BY 1),
                    rs AS (SELECT DATE_TRUNC('month',t.date_solved)::date m, COUNT(*) n FROM hub_tickets.tickets t WHERE t.date_solved IS NOT NULL${grpAnd} GROUP BY 1),
                    base AS (
                        SELECT COUNT(*) n FROM hub_tickets.tickets t
                        WHERE t.status::int <> 8 AND t.date_creation < DATE_TRUNC('month','${from}'::date)
                          AND (t.date_solved IS NULL OR t.date_solved >= DATE_TRUNC('month','${from}'::date))${grpAnd}
                    )
                    SELECT TO_CHAR(months.m,'Mon YYYY') AS label, TO_CHAR(months.m,'YYYY-MM') AS bucket,
                           COALESCE(cr.n,0)::int AS created,
                           COALESCE(rs.n,0)::int AS resolved,
                           COALESCE(cmp.n,0)::int AS compare,
                           ((SELECT n FROM base) + SUM(COALESCE(cr.n,0) - COALESCE(rs.n,0)) OVER (ORDER BY months.m))::int AS open
                    FROM months
                    LEFT JOIN cr ON cr.m = months.m
                    LEFT JOIN rs ON rs.m = months.m
                    LEFT JOIN cr cmp ON cmp.m = months.m - INTERVAL '1 month'
                    ORDER BY months.m
                `);
                trend = { granularity: 'month', compare: true, compareLabel: 'Créés (mois précédent)', data };
            }
        } else {
            const data = await pgDb.all(`
                WITH bounds AS (
                    SELECT DATE_TRUNC('month', MIN(date_creation)) mn, DATE_TRUNC('month', NOW()) mx
                    FROM hub_tickets.tickets WHERE date_creation IS NOT NULL
                ),
                months AS (
                    SELECT gs::date AS m FROM bounds, generate_series(bounds.mn, bounds.mx, INTERVAL '1 month') gs
                )
                ,
                cr AS (SELECT DATE_TRUNC('month',t.date_creation)::date m, COUNT(*) n FROM hub_tickets.tickets t WHERE t.status::int <> 8${grpAnd} GROUP BY 1),
                rs AS (SELECT DATE_TRUNC('month',t.date_solved)::date m, COUNT(*) n FROM hub_tickets.tickets t WHERE t.date_solved IS NOT NULL${grpAnd} GROUP BY 1)
                SELECT TO_CHAR(months.m,'Mon YYYY') AS label, TO_CHAR(months.m,'YYYY-MM') AS bucket,
                       COALESCE(cr.n,0)::int AS created,
                       COALESCE(rs.n,0)::int AS resolved,
                       (SUM(COALESCE(cr.n,0) - COALESCE(rs.n,0)) OVER (ORDER BY months.m))::int AS open
                FROM months
                LEFT JOIN cr ON cr.m = months.m
                LEFT JOIN rs ON rs.m = months.m
                ORDER BY months.m
            `);
            trend = { granularity: 'month', compare: false, data };
        }

        // Moyenne de tickets résolus par jour :
        //  - période : résolus dans la plage / nb de jours de la plage
        //  - global (pas de plage) : total résolus / nb de jours depuis le 1er résolu
        let resolvedAvgPerDay = 0;
        if (range) {
            const r = await pgDb.get(`SELECT COUNT(*)::int AS c FROM hub_tickets.tickets t
                WHERE t.status::int IN (5,6) AND t.date_solved >= '${from} 00:00:00' AND t.date_solved <= '${to} 23:59:59'${grpAnd}`);
            const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
            resolvedAvgPerDay = Math.round(((r?.c || 0) / days) * 10) / 10;
        } else {
            const r = await pgDb.get(`SELECT COUNT(*)::int AS c, MIN(t.date_solved)::date AS mind FROM hub_tickets.tickets t
                WHERE t.status::int IN (5,6) AND t.date_solved IS NOT NULL${grpAnd}`);
            const span = r?.mind ? Math.max(1, Math.round((Date.now() - new Date(r.mind)) / 86400000) + 1) : 1;
            resolvedAvgPerDay = Math.round(((r?.c || 0) / span) * 10) / 10;
        }

        return {
            overview,
            resolvedAvgPerDay,
            trend,
            dailyTrend,
            statusDistribution: statusDist,
            typeDistribution: typeDist,
            priorityDistribution: priorityDist,
            monthlyTrend,
            weeklyCreated,
            categoryDistribution: categoryDist,
            groupDistribution: groupDist,
            topRequesters,
            topRequestersExtended,
            technicianAssignments: techAssignments,
            technicianPerformance,
            resolutionTimeTrend,
            backlogAging,
            slaOverview,
            hourlyDistribution: hourlyDist,
            reopened30d: reopenedResult?.count || 0,
            avgResolutionHours: avgTimes?.avg_resolution_hours || 0,
            avgClosureHours: avgTimes?.avg_closure_hours || 0,
            weeklyComparison,
            topSoftwares,
            vipByPriority,
            statusTrend,
            incidentVsRequestTrend,
            topObservers,
            categoryPerformance,
        };
    },
};
