const { pgDb } = require('../../../shared/database');

module.exports = {
    async findByTicket(ticketId) {
        return pgDb.get(`
            SELECT ts.*, sd.name as sla_name, sd.first_response_min, sd.resolution_min,
                   sc.name as calendar_name
            FROM hub_tickets.ticket_sla ts
            JOIN hub_tickets.sla_definitions sd ON ts.sla_definition_id = sd.id
            LEFT JOIN hub_tickets.sla_calendars sc ON sd.calendar_id = sc.id
            WHERE ts.ticket_id = $1
        `, [ticketId]);
    },

    async findMatchingDefinition(ticket) {
        return pgDb.get(`
            SELECT * FROM hub_tickets.sla_definitions
            WHERE is_active = true
            AND (type IS NULL OR type = $1)
            AND (category_id IS NULL OR category_id = $2)
            AND (
                (COALESCE(match_operator, 'AND') = 'OR'
                    AND ((priority IS NULL AND impact IS NULL) OR (priority IS NULL OR $3 IS NULL OR priority = $3) OR (impact IS NULL OR $4 IS NULL OR impact = $4)))
                OR
                (COALESCE(match_operator, 'AND') = 'AND'
                    AND (priority IS NULL OR $3 IS NULL OR priority = $3)
                    AND (impact IS NULL OR $4 IS NULL OR impact = $4))
            )
            ORDER BY priority ASC NULLS LAST
            LIMIT 1
        `, [
            ticket.type != null ? String(ticket.type) : null,
            ticket.category_id,
            ticket.priority,
            ticket.impact
        ]);
    },

    async createForTicket(ticketId, slaDefinitionId, firstResponseTarget, resolutionTarget, createdAt) {
        const existing = await pgDb.get('SELECT id FROM hub_tickets.ticket_sla WHERE ticket_id = $1', [ticketId]);
        if (existing) return existing.id;

        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_sla
                (ticket_id, sla_definition_id, first_response_target, resolution_target, created_at, sla_status)
            VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP), 'ok')
        `, [ticketId, slaDefinitionId, firstResponseTarget, resolutionTarget, createdAt || null]);

        return result.lastID;
    },

    async getActiveBreaches() {
        return pgDb.all(`
            SELECT ts.*, t.glpi_id, t.title, t.status, t.priority,
                   s.label as status_label,
                   sd.name as sla_name,
                   CASE
                       WHEN ts.first_response_target IS NOT NULL
                            AND ts.first_response_target < (NOW() AT TIME ZONE 'Europe/Paris')
                       THEN 'first_response'
                       WHEN ts.resolution_target IS NOT NULL
                            AND ts.resolution_target < (NOW() AT TIME ZONE 'Europe/Paris')
                       THEN 'resolution'
                       ELSE 'unknown'
                   END as breach_type
            FROM hub_tickets.ticket_sla ts
            JOIN hub_tickets.tickets t ON ts.ticket_id = t.glpi_id
            JOIN hub_tickets.sla_definitions sd ON ts.sla_definition_id = sd.id
            LEFT JOIN hub_tickets.ticket_status s ON t.status = s.id
            WHERE ts.sla_status IN ('warning', 'breached')
              AND sd.is_active = true
              AND t.status NOT IN (7)
            ORDER BY
                CASE ts.sla_status WHEN 'breached' THEN 0 ELSE 1 END,
                ts.resolution_target ASC NULLS LAST
        `);
    },

    async updateSlaStatus(slaId, status) {
        await pgDb.run(
            'UPDATE hub_tickets.ticket_sla SET sla_status = $1 WHERE id = $2',
            [status, slaId]
        );
    },

    async setFirstResponse(ticketId) {
        const sla = await pgDb.get('SELECT id, first_response_at, sla_status FROM hub_tickets.ticket_sla WHERE ticket_id = $1', [ticketId]);
        if (sla && !sla.first_response_at) {
            await pgDb.run(
                "UPDATE hub_tickets.ticket_sla SET first_response_at = $1, sla_status = 'ok' WHERE id = $2",
                [new Date(), sla.id]
            );
        }
    },

    async pauseSla(slaId, reason) {
        await pgDb.run(`
            INSERT INTO hub_tickets.ticket_sla_pauses (sla_id, paused_at, reason)
            VALUES ($1, $2, $3)
        `, [slaId, new Date(), reason]);
    },

    async resumeSla(slaId) {
        await pgDb.run(`
            UPDATE hub_tickets.ticket_sla_pauses
            SET resumed_at = $1
            WHERE sla_id = $2 AND resumed_at IS NULL
        `, [new Date(), slaId]);
    },
};
