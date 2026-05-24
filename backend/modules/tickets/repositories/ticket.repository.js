const { pgDb, pool } = require('../../../shared/database');

const BASE_SELECT = `
    SELECT t.*,
           ta.technician_id, ta.group_id,
           tca.category_id,
           ts.label as status_label,
           tu.displayName as technician_name,
           tp.status as technician_status,
           tgm.group_id AS bundle_id,
           tg.name AS bundle_name,
           tg.problem_ticket_id AS bundle_problem_ticket_id,
            (SELECT COUNT(*) FROM hub_tickets.observers o WHERE o.ticket_id = t.glpi_id AND o.is_active = 1) as observer_count,
           (SELECT COUNT(*) FROM hub_tickets.ticket_history h WHERE h.ticket_id = t.glpi_id) as history_count,
           (SELECT COUNT(*) FROM hub.user_tasks ut WHERE ut.context_source = 'ticket' AND ut.context_id = t.glpi_id AND ut.statut != 'terminé') as tasks_count
    FROM hub_tickets.tickets t
    LEFT JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
    LEFT JOIN hub_tickets.technician_profiles tp ON ta.technician_id = tp.user_id
    LEFT JOIN hub.users tu ON ta.technician_id = tu.id
    LEFT JOIN hub_tickets.ticket_category_assignments tca ON t.glpi_id = tca.ticket_id
    LEFT JOIN hub_tickets.ticket_status ts ON t.status = ts.id
    LEFT JOIN hub_tickets.ticket_group_members tgm ON tgm.ticket_id = t.glpi_id
    LEFT JOIN hub_tickets.ticket_groups tg ON tg.id = tgm.group_id
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
            conditions.push(`ta.technician_id = $${idx++}`);
            params.push(parseInt(filters.technician_id));
        }
        if (filters.group_id) {
            conditions.push(`ta.group_id = $${idx++}`);
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
            conditions.push(`ta.technician_id = $${idx++}`);
            params.push(parseInt(filters.my));
        }
        if (filters.my_username) {
            conditions.push(`ta.technician_id = (SELECT id FROM hub.users WHERE LOWER(username) = LOWER($${idx++}))`);
            params.push(filters.my_username);
        }
        if (filters.requester_email) {
            conditions.push(`LOWER(t.requester_email_22) = LOWER($${idx++})`);
            params.push(filters.requester_email);
        }
        if (filters.exclude_id) {
            conditions.push(`t.glpi_id != $${idx++}`);
            params.push(parseInt(filters.exclude_id));
        }
        if (filters.unassigned) {
            conditions.push('ta.technician_id IS NULL');
        }
        if (filters.vip) {
            conditions.push('t.is_vip = true');
        }
        if (filters.favorites && user) {
            conditions.push(`t.glpi_id IN (SELECT ticket_id FROM hub_tickets.ticket_favorites WHERE user_id = $${idx++})`);
            params.push(user.id);
        }
        if (filters.date_from) {
            conditions.push(`t.date_creation >= $${idx++}`);
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            conditions.push(`t.date_creation <= $${idx++}`);
            params.push(filters.date_to);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const sortCol = ['priority', 'date_creation', 'date_mod', 'status', 'type'].includes(pagination.sort)
            ? pagination.sort : 'date_creation';
        const sortDir = pagination.order === 'asc' ? 'ASC' : 'DESC';

        const countSql = `
            SELECT COUNT(*) as total
            FROM hub_tickets.tickets t
            LEFT JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
            ${where}
        `;
        const totalResult = await pgDb.get(countSql, params);
        const total = parseInt(totalResult?.total || 0);

        const offset = (pagination.page - 1) * pagination.limit;
        const sql = `${BASE_SELECT} ${where} ORDER BY t.${sortCol} ${sortDir} LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(pagination.limit, offset);

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
        const nextId = await pgDb.get(`SELECT COALESCE(MAX(glpi_id), 10000000) + 1 as next_id FROM hub_tickets.tickets`);
        const id = nextId.next_id;

        await pgDb.run(`
            INSERT INTO hub_tickets.tickets
                (glpi_id, title, content, status, priority, urgency, impact,
                 type, category, date_creation, date_mod, source,
                 requester_name, requester_email_22, location, solution, is_vip,
                 resolution_method, knowledge_article)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
            id, data.title, data.content || '', data.status || 1,
            data.priority || 3, data.urgency || 3, data.impact || 2,
            String(data.type || 1), data.category || '',
            new Date().toISOString(), 'hub',
            data.requester_name || '', data.requester_email || '',
            data.location || '', data.solution || '', !!data.is_vip,
            data.resolution_method || null, data.knowledge_article || null
        ]);

        return id;
    },

    async update(id, data) {
        const fields = [];
        const params = [];
        let idx = 1;

        for (const key of ['title', 'content', 'priority', 'urgency', 'impact', 'type', 'category', 'location', 'solution', 'is_vip', 'resolution_method', 'knowledge_article']) {
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
        params.push(new Date().toISOString());

        if (data.status === 6) {
            fields.push(`date_solved = $${idx++}`);
            params.push(new Date().toISOString());
        }
        if (data.status === 7) {
            fields.push(`date_closed = $${idx++}`);
            params.push(new Date().toISOString());
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
            [new Date().toISOString(), id]
        );
    },

    async getDashboardStats() {
        const stats = await pgDb.get(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN (1,2,3)) as open,
                COUNT(*) FILTER (WHERE status = 6) as resolved,
                COUNT(*) FILTER (WHERE status = 7) as closed,
                COUNT(*) FILTER (WHERE status = 3) as in_progress,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3)) as critical_open,
                COUNT(*) FILTER (WHERE status IN (4,5)) as waiting,
                COUNT(*) FILTER (WHERE type::text = '1') as total_incident,
                COUNT(*) FILTER (WHERE type::text = '2') as total_request,
                COUNT(*) FILTER (WHERE status IN (1,2,3) AND type::text = '1') as open_incident,
                COUNT(*) FILTER (WHERE status IN (1,2,3) AND type::text = '2') as open_request,
                COUNT(*) FILTER (WHERE status = 3 AND type::text = '1') as in_progress_incident,
                COUNT(*) FILTER (WHERE status = 3 AND type::text = '2') as in_progress_request,
                COUNT(*) FILTER (WHERE status IN (4,5) AND type::text = '1') as waiting_incident,
                COUNT(*) FILTER (WHERE status IN (4,5) AND type::text = '2') as waiting_request,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3) AND type::text = '1') as critical_incident,
                COUNT(*) FILTER (WHERE priority = 5 AND status IN (1,2,3) AND type::text = '2') as critical_request,
                COUNT(*) FILTER (WHERE status = 6 AND type::text = '1') as resolved_incident,
                COUNT(*) FILTER (WHERE status = 6 AND type::text = '2') as resolved_request,
                COUNT(*) FILTER (WHERE is_vip = true) as vip_total,
                COUNT(*) FILTER (WHERE type::text = '3' AND status IN (1,2,3,4,5)) as problems
            FROM hub_tickets.tickets
        `);
        return stats;
    },

    async getMyStats(username) {
        return pgDb.get(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE t.status IN (1,2,3)) as active,
                COUNT(*) FILTER (WHERE t.status = 3) as in_progress,
                COUNT(*) FILTER (WHERE t.status IN (4,5)) as waiting,
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
                            COALESCE(NULLIF(date_solved, '')::timestamp, CURRENT_TIMESTAMP)
                            - NULLIF(date_creation, '')::timestamp
                        )) - COALESCE(total_waiting_seconds, 0)
                    ) FILTER (WHERE NULLIF(date_creation, '') IS NOT NULL), 0
                )::integer as avg_active_seconds_resolved_week,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NULLIF(date_creation, '')::timestamp))
                    ) FILTER (WHERE status IN (1,2,3) AND NULLIF(date_creation, '') IS NOT NULL), 0
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
                            COALESCE(NULLIF(date_solved, '')::timestamp, NULLIF(date_closed, '')::timestamp, CURRENT_TIMESTAMP)
                            - NULLIF(date_creation, '')::timestamp
                        )) - COALESCE(total_waiting_seconds, 0)
                    ) FILTER (WHERE NULLIF(date_creation, '') IS NOT NULL), 0
                )::integer as avg_active_seconds_week
            FROM hub_tickets.tickets
            WHERE status = 6
              AND NULLIF(date_solved, '')::timestamp >= DATE_TRUNC('week', CURRENT_TIMESTAMP)::date
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
                    t.date_creation::timestamp AS created_at,
                    t.date_solved::timestamp   AS solved_at,
                    t.date_closed::timestamp   AS closed_at,
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
                  AND new_value = '6'
            ),
            today_closed AS (
                SELECT COUNT(DISTINCT ticket_id) as count
                FROM hub_tickets.ticket_history
                WHERE DATE(created_at) = CURRENT_DATE
                  AND action = 'status_changed'
                  AND new_value = '7'
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
};
