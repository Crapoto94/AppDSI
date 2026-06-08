const { pgDb } = require('../../../shared/database');

module.exports = {
    async findAll(status) {
        const rows = await pgDb.all(`
            SELECT tp.*, u.displayName, u.email, u.username, u.role,
                   u.service_code, u.service_complement,
                   (SELECT COUNT(*)
                      FROM hub_tickets.ticket_assignments ta
                      JOIN hub_tickets.tickets t ON t.glpi_id = ta.ticket_id
                      WHERE ta.technician_id = tp.user_id
                        AND t.status NOT IN (6, 7, 8)) as active_tickets,
                   (SELECT COUNT(*)
                      FROM hub_tickets.ticket_assignments ta
                      WHERE ta.technician_id = tp.user_id) as total_tickets
            FROM hub_tickets.technician_profiles tp
            JOIN hub.users u ON tp.user_id = u.id
            WHERE ($1 IS NULL OR tp.status = $1)
            ORDER BY u.displayName
        `, [status || null]);
        return rows;
    },

    async findById(userId) {
        return pgDb.get(`
            SELECT tp.*, u.displayName, u.email, u.username, u.role,
                   (SELECT COUNT(*) FROM hub_tickets.ticket_assignments ta WHERE ta.technician_id = tp.user_id) as active_tickets
            FROM hub_tickets.technician_profiles tp
            JOIN hub.users u ON tp.user_id = u.id
            WHERE tp.user_id = $1
        `, [userId]);
    },

    async create(userId, username) {
        await pgDb.run(
            `INSERT INTO hub_tickets.technician_profiles (user_id, username, module_role)
             VALUES ($1, $2, 'technician')
             ON CONFLICT (user_id) DO UPDATE SET
               module_role = COALESCE(technician_profiles.module_role, 'technician'),
               username    = COALESCE($2, technician_profiles.username)`,
            [userId, username || null]
        );
        await pgDb.run(
            `UPDATE hub.users SET role = 'technician' WHERE id = $1 AND role NOT IN ('admin','superadmin')`,
            [userId]
        );
        // Note: no magapp.users update — hub users live in SQLite, magapp.users IDs differ
    },

    async updateStatus(userId, status, pausedUntil, notes) {
        const pausedAt = status === 'paused' ? new Date().toISOString() : null;
        await pgDb.run(`
            UPDATE hub_tickets.technician_profiles
            SET status = $2, paused_at = $3, paused_until = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
        `, [userId, status, pausedAt, pausedUntil || null, notes || null]);
        if (status === 'inactive') {
            await pgDb.run(
                `UPDATE hub.users SET role = 'user' WHERE id = $1 AND role NOT IN ('admin','superadmin')`,
                [userId]
            );
        }
    },

    async delete(userId) {
        await pgDb.run(
            `UPDATE hub_tickets.technician_profiles SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
            [userId]
        );
        await pgDb.run(
            `UPDATE hub.users SET role = 'user' WHERE id = $1 AND role NOT IN ('admin','superadmin')`,
            [userId]
        );
    },

    async findAvailable() {
        return pgDb.all(`
            SELECT tp.user_id, tp.module_role, tp.status,
                   u.displayName, u.email,
                   (SELECT COUNT(*) FROM hub_tickets.ticket_assignments ta
                    JOIN hub_tickets.tickets t ON ta.ticket_id = t.glpi_id
                    WHERE ta.technician_id = tp.user_id AND t.status NOT IN (5,6,8)) as active_tickets
            FROM hub_tickets.technician_profiles tp
            JOIN hub.users u ON tp.user_id = u.id
            WHERE tp.status = 'active'
               OR (tp.status = 'paused' AND tp.paused_until IS NOT NULL AND tp.paused_until <= CURRENT_TIMESTAMP)
            ORDER BY active_tickets ASC
        `);
    },

    // Techniciens disponibles appartenant au GROUPE PAR DÉFAUT (équipe de premier niveau).
    // Ce sont les seuls visibles à l'assignation tant qu'aucune escalade n'est faite.
    // Repli : si aucun groupe par défaut n'est configuré, on renvoie tous les disponibles.
    async findAvailableInDefaultGroup() {
        const defaultGroup = await pgDb.get(
            `SELECT id FROM hub_tickets.technician_groups WHERE is_default = true AND is_active = true ORDER BY id LIMIT 1`
        );
        if (!defaultGroup) return this.findAvailable();
        return pgDb.all(`
            SELECT tp.user_id, tp.module_role, tp.status,
                   u.displayName, u.email,
                   (SELECT COUNT(*) FROM hub_tickets.ticket_assignments ta
                    JOIN hub_tickets.tickets t ON ta.ticket_id = t.glpi_id
                    WHERE ta.technician_id = tp.user_id AND t.status NOT IN (5,6,8)) as active_tickets
            FROM hub_tickets.technician_profiles tp
            JOIN hub.users u ON tp.user_id = u.id
            JOIN hub_tickets.technician_group_members tgm
                 ON tgm.user_id = tp.user_id AND tgm.group_id = $1
            WHERE tp.status = 'active'
               OR (tp.status = 'paused' AND tp.paused_until IS NOT NULL AND tp.paused_until <= CURRENT_TIMESTAMP)
            ORDER BY active_tickets ASC
        `, [defaultGroup.id]);
    },

    async getTicketsByTechnician(userId) {
        return pgDb.all(`
            SELECT t.glpi_id, t.title, t.status, ts.label as status_label
            FROM hub_tickets.tickets t
            JOIN hub_tickets.ticket_assignments ta ON t.glpi_id = ta.ticket_id
            LEFT JOIN hub_tickets.ticket_status ts ON t.status = ts.id
            WHERE ta.technician_id = $1 AND t.status NOT IN (6, 7, 8)
            ORDER BY t.date_creation DESC
        `, [userId]);
    },

    async reassignTickets(fromUserId, mode, targetId) {
        if (mode === 'single' && targetId) {
            await pgDb.run(
                `UPDATE hub_tickets.ticket_assignments SET technician_id = $1 WHERE technician_id = $2`,
                [targetId, fromUserId]
            );
        } else if (mode === 'group' && targetId) {
            // Réassigne les tickets du technicien à un groupe : on retire le technicien
            // et on rattache au groupe cible (technician_id → NULL, group_id → cible).
            await pgDb.run(
                `UPDATE hub_tickets.ticket_assignments SET technician_id = NULL, group_id = $1 WHERE technician_id = $2`,
                [targetId, fromUserId]
            );
        } else if (mode === 'unassign') {
            await pgDb.run(
                `UPDATE hub_tickets.ticket_assignments SET technician_id = NULL WHERE technician_id = $1`,
                [fromUserId]
            );
        } else if (mode === 'dispatch') {
            const avail = await this.findAvailable();
            const active = avail.filter(t => t.user_id !== fromUserId);
            if (active.length > 0) {
                const tickets = await this.getTicketsByTechnician(fromUserId);
                for (let i = 0; i < tickets.length; i++) {
                    const tech = active[i % active.length];
                    await pgDb.run(
                        `UPDATE hub_tickets.ticket_assignments SET technician_id = $1 WHERE ticket_id = $2`,
                        [tech.user_id, tickets[i].glpi_id]
                    );
                }
            }
        }
    },

    async getConfig(key) {
        const row = await pgDb.get(
            `SELECT value FROM hub_tickets.module_config WHERE key = $1`, [key]
        );
        return row ? row.value : null;
    },

    async setConfig(key, value) {
        await pgDb.run(
            `INSERT INTO hub_tickets.module_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
        );
    }
};
