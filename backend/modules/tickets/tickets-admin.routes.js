const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { pgDb, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
const technicianRepo = require('./repositories/technician.repository');

// ─── Categories ─────────────────────────────────────────────────
router.get('/categories', authenticateJWT, async (req, res) => {
    try {
        const cats = await pgDb.all(`
            SELECT * FROM hub_tickets.ticket_categories WHERE is_active = true ORDER BY sort_order, name
        `);
        res.json(cats);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/categories', authenticateAdmin, async (req, res) => {
    try {
        const { name, parent_id, sort_order } = req.body;
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_categories (name, parent_id, full_path, sort_order)
            VALUES ($1, $2, $3, $4)
        `, [name, parent_id || null, name, sort_order || 0]);
        const id = result.lastID;
        if (parent_id) {
            const parent = await pgDb.get('SELECT full_path FROM hub_tickets.ticket_categories WHERE id = $1', [parent_id]);
            if (parent) {
                await pgDb.run('UPDATE hub_tickets.ticket_categories SET full_path = $1 WHERE id = $2',
                    [parent.full_path + ' / ' + name, id]);
            }
        }
        res.status(201).json({ id, message: 'Catégorie créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_categories SET name = $1, sort_order = $2 WHERE id = $3',
            [req.body.name, req.body.sort_order || 0, req.params.id]);
        res.json({ message: 'Catégorie mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_categories SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Catégorie désactivée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Tags ────────────────────────────────────────────────────────
router.get('/tags', authenticateJWT, async (req, res) => {
    try {
        const tags = await pgDb.all('SELECT * FROM hub_tickets.ticket_tags WHERE is_active = true ORDER BY name');
        res.json(tags);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tags', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.ticket_tags (name, color) VALUES ($1, $2)',
            [req.body.name, req.body.color || '#6366f1']);
        res.status(201).json({ id: result.lastID, message: 'Tag créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/tags/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_tags SET name = $1, color = $2 WHERE id = $3',
            [req.body.name, req.body.color, req.params.id]);
        res.json({ message: 'Tag mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/tags/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_tags SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Tag désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Technician Groups ──────────────────────────────────────────
router.get('/groups', authenticateJWT, async (req, res) => {
    try {
        const groups = await pgDb.all(`
            SELECT g.*,
                   COALESCE(json_agg(json_build_object('id', m.id, 'user_id', m.user_id, 'displayName', u.displayName))
                       FILTER (WHERE m.id IS NOT NULL), '[]') as members
            FROM hub_tickets.technician_groups g
            LEFT JOIN hub_tickets.technician_group_members m ON g.id = m.group_id
            LEFT JOIN hub.users u ON m.user_id = u.id
            WHERE g.is_active = true
            GROUP BY g.id
            ORDER BY g.name
        `);
        res.json(groups);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/groups', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.technician_groups (name, description) VALUES ($1, $2)',
            [req.body.name, req.body.description || '']);
        res.status(201).json({ id: result.lastID, message: 'Groupe créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/groups/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.technician_groups SET name = $1, description = $2 WHERE id = $3',
            [req.body.name, req.body.description, req.params.id]);
        res.json({ message: 'Groupe mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/groups/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.technician_groups SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Groupe désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/groups/:id/members', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(
            'INSERT INTO hub_tickets.technician_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, req.body.user_id]);
        res.status(201).json({ message: 'Membre ajouté' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/groups/:id/members/:mid', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.technician_group_members WHERE id = $1', [req.params.mid]);
        res.json({ message: 'Membre retiré' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── SLA Definitions ────────────────────────────────────────────
router.get('/sla', authenticateJWT, async (req, res) => {
    try {
        const defs = await pgDb.all(`
            SELECT sd.*, sc.name as calendar_name
            FROM hub_tickets.sla_definitions sd
            LEFT JOIN hub_tickets.sla_calendars sc ON sd.calendar_id = sc.id
            ORDER BY sd.priority NULLS LAST
        `);
        res.json(defs);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/sla', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.sla_definitions
                (name, description, calendar_id, first_response_min, resolution_min, escalation_min, priority, type, category_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [req.body.name, req.body.description, req.body.calendar_id || 1,
            req.body.first_response_min, req.body.resolution_min, req.body.escalation_min,
            req.body.priority, req.body.type, req.body.category_id || null]);
        res.status(201).json({ id: result.lastID, message: 'Définition SLA créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/sla/:id', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, calendar_id, first_response_min, resolution_min, escalation_min, priority, type, is_active } = req.body;
        await pgDb.run(`
            UPDATE hub_tickets.sla_definitions SET
                name = COALESCE($1, name), description = COALESCE($2, description),
                calendar_id = COALESCE($3, calendar_id),
                first_response_min = $4, resolution_min = $5,
                escalation_min = $6, priority = $7, type = $8,
                is_active = COALESCE($9, is_active)
            WHERE id = $10
        `, [name, description, calendar_id, first_response_min ?? null,
            resolution_min ?? null, escalation_min ?? null, priority ?? null,
            type ?? null, is_active ?? null, req.params.id]);
        res.json({ message: 'SLA mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/sla/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.sla_definitions SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'SLA désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── SLA Calendars ─────────────────────────────────────────────
router.get('/sla/calendars', authenticateJWT, async (req, res) => {
    try {
        const calendars = await pgDb.all(`
            SELECT c.*,
                   COALESCE(json_agg(json_build_object('id', h.id, 'day_of_week', h.day_of_week, 'start_time', h.start_time, 'end_time', h.end_time))
                       FILTER (WHERE h.id IS NOT NULL), '[]') as hours
            FROM hub_tickets.sla_calendars c
            LEFT JOIN hub_tickets.sla_calendar_hours h ON c.id = h.calendar_id
            GROUP BY c.id ORDER BY c.name
        `);
        res.json(calendars);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/sla/calendars', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.sla_calendars (name, description, timezone) VALUES ($1, $2, $3)',
            [req.body.name, req.body.description, req.body.timezone || 'Europe/Paris']);
        res.status(201).json({ id: result.lastID, message: 'Calendrier créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/sla/calendars/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(
            'UPDATE hub_tickets.sla_calendars SET name = $1, description = $2, timezone = $3 WHERE id = $4',
            [req.body.name, req.body.description, req.body.timezone || 'Europe/Paris', req.params.id]);
        res.json({ message: 'Calendrier mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/sla/calendars/:id/hours/:hourId', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.sla_calendar_hours WHERE id = $1', [req.params.hourId]);
        res.json({ message: 'Plage horaire supprimée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/sla/calendars/:id/hours', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(
            'INSERT INTO hub_tickets.sla_calendar_hours (calendar_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [req.params.id, req.body.day_of_week, req.body.start_time, req.body.end_time]);
        res.status(201).json({ message: 'Plage horaire ajoutée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Assignment Rules ───────────────────────────────────────────
router.get('/assignment-rules', authenticateJWT, async (req, res) => {
    try {
        const rules = await pgDb.all('SELECT * FROM hub_tickets.assignment_rules ORDER BY priority');
        res.json(rules);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/assignment-rules', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.assignment_rules
                (name, match_type, match_value, assign_type, assign_to_id, priority)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [req.body.name, req.body.match_type || 'any', req.body.match_value || '',
            req.body.assign_type, req.body.assign_to_id, req.body.priority || 0]);
        res.status(201).json({ id: result.lastID, message: 'Règle créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/assignment-rules/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(`
            UPDATE hub_tickets.assignment_rules SET
                name = $1, match_type = $2, match_value = $3,
                assign_type = $4, assign_to_id = $5, priority = $6, is_active = $7
            WHERE id = $8
        `, [req.body.name, req.body.match_type, req.body.match_value,
            req.body.assign_type, req.body.assign_to_id, req.body.priority,
            req.body.is_active ?? true, req.params.id]);
        res.json({ message: 'Règle mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/assignment-rules/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.assignment_rules WHERE id = $1', [req.params.id]);
        res.json({ message: 'Règle supprimée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Notification Templates ────────────────────────────────────
router.get('/notification-templates', authenticateJWT, async (req, res) => {
    try {
        const templates = await pgDb.all('SELECT * FROM hub_tickets.notification_templates ORDER BY slug');
        res.json(templates);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/notification-templates', authenticateAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html)
            VALUES ($1, $2, $3, $4)
        `, [req.body.slug, req.body.label, req.body.subject, req.body.body_html]);
        res.status(201).json({ id: result.lastID, message: 'Template créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/notification-templates/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(`
            UPDATE hub_tickets.notification_templates SET subject = $1, body_html = $2, label = $3 WHERE id = $4
        `, [req.body.subject, req.body.body_html, req.body.label, req.params.id]);
        res.json({ message: 'Template mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Triggers ──────────────────────────────────────────────────
router.get('/notification-triggers', authenticateAdmin, async (req, res) => {
    try {
        const triggers = await pgDb.all(`
            SELECT ntr.*, nt.label as template_label
            FROM hub_tickets.notification_triggers ntr
            JOIN hub_tickets.notification_templates nt ON ntr.template_slug = nt.slug
            ORDER BY ntr.event
        `);
        res.json(triggers);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/notification-triggers', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(`
            INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type)
            VALUES ($1, $2, $3) ON CONFLICT (event, recipient_type) DO NOTHING
        `, [req.body.event, req.body.template_slug, req.body.recipient_type]);
        res.status(201).json({ message: 'Déclencheur créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/notification-triggers/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.notification_triggers WHERE id = $1', [req.params.id]);
        res.json({ message: 'Déclencheur supprimé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Escalation Rules ──────────────────────────────────────────
router.get('/sla/escalations', authenticateJWT, async (req, res) => {
    try {
        const rules = await pgDb.all(`
            SELECT ser.*, sd.name as sla_name
            FROM hub_tickets.sla_escalation_rules ser
            JOIN hub_tickets.sla_definitions sd ON ser.sla_definition_id = sd.id
            ORDER BY sd.name, ser.escalation_level
        `);
        res.json(rules);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Technicians ────────────────────────────────────────────────
router.get('/technicians', authenticateAdmin, async (req, res) => {
    try {
        const list = await technicianRepo.findAll(req.query.status || null);
        // Enrich with service data from SQLite (hub.users doesn't store service_code)
        const db = getSqlite();
        if (list.length > 0) {
            const placeholders = list.map(() => '?').join(', ');
            const usernames = list.map(t => (t.username || '').toLowerCase());
            const rows = await db.all(
                `SELECT LOWER(username) as un, service_code, service_complement FROM users WHERE LOWER(username) IN (${placeholders})`,
                usernames
            );
            const svcMap = {};
            for (const r of rows) svcMap[r.un] = r;
            for (const t of list) {
                const s = svcMap[(t.username || '').toLowerCase()];
                if (s) { t.service_code = s.service_code; t.service_complement = s.service_complement; }
            }
        }
        res.json(list);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/technicians/available', authenticateJWT, async (req, res) => {
    try {
        const list = await technicianRepo.findAvailable();
        res.json(list.filter(t => (t.module_role || 'technician') === 'technician'));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/technicians/ad-search', authenticateAdmin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.json([]);
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.json([]);
        }
        const results = await searchADUsersByQuery(q, adSettings);
        res.json(results);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/technicians', authenticateAdmin, async (req, res) => {
    try {
        const { user_id, username, displayName, email } = req.body;
        const db = getSqlite();

        if (user_id) {
            // Legacy path: user_id is PG hub.users.id
            const existing = await pgDb.get('SELECT id, username FROM hub.users WHERE id = $1', [user_id]);
            if (!existing) return res.status(404).json({ message: 'Utilisateur non trouvé' });
            await technicianRepo.create(user_id, existing.username || null);
            // Sync technician role to SQLite (source of JWT)
            if (existing.username) {
                await db.run("UPDATE users SET role = 'technician' WHERE username = ? AND role NOT IN ('admin','superadmin')", [existing.username]);
            }
            res.status(201).json({ message: 'Technicien ajouté' });
        } else if (username) {
            // Preferred path: username from AD search
            // Normalize to lowercase to match SQLite convention
            const usernameLower = username.toLowerCase();
            // Look up or create in hub.users (PG) for the FK (case-insensitive lookup)
            let existingUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [username]);
            if (!existingUser) {
                const result = await pgDb.run(`
                    INSERT INTO hub.users (username, displayName, email, role)
                    VALUES ($1, $2, $3, 'technician') RETURNING id
                `, [usernameLower, displayName || username, email || '']);
                existingUser = { id: result.lastID || result.id };
            }
            await technicianRepo.create(existingUser.id, usernameLower);
            // Sync technician role to SQLite (source of JWT)
            await db.run("UPDATE users SET role = 'technician' WHERE LOWER(username) = LOWER(?) AND role NOT IN ('admin','superadmin')", [username]);
            res.status(201).json({ message: 'Technicien ajouté', user_id: existingUser.id });
        } else {
            res.status(400).json({ message: 'user_id ou username requis' });
        }
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/technicians/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { status, paused_until, notes } = req.body;
        const validStatuses = ['active', 'paused', 'inactive'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Statut invalide' });
        }
        await technicianRepo.updateStatus(parseInt(req.params.id), status, paused_until, notes);
        res.json({ message: 'Statut mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/technicians/:id', authenticateAdmin, async (req, res) => {
    try {
        const { notes } = req.body;
        await pgDb.run(
            'UPDATE hub_tickets.technician_profiles SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [notes, parseInt(req.params.id)]
        );
        res.json({ message: 'Technicien mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/technicians/:id', authenticateAdmin, async (req, res) => {
    try {
        await technicianRepo.delete(parseInt(req.params.id));
        res.json({ message: 'Technicien désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get('/technicians/:id/tickets', authenticateAdmin, async (req, res) => {
    try {
        const tickets = await technicianRepo.getTicketsByTechnician(parseInt(req.params.id));
        res.json(tickets);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/technicians/:id/reassign', authenticateAdmin, async (req, res) => {
    try {
        const { mode, target_id } = req.body;
        if (!['single', 'dispatch', 'unassign'].includes(mode)) {
            return res.status(400).json({ message: 'Mode invalide (single, dispatch, unassign)' });
        }
        if (mode === 'single' && !target_id) {
            return res.status(400).json({ message: 'target_id requis pour le mode single' });
        }
        await technicianRepo.reassignTickets(parseInt(req.params.id), mode, target_id ? parseInt(target_id) : null);
        res.json({ message: 'Tickets réassignés' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Escalade ────────────────────────────────────────────────────

router.get('/escalade', authenticateAdmin, async (req, res) => {
    try {
        const support = await pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'support_agent' ORDER BY display_name`);
        const targets = await pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'escalade_target' ORDER BY display_name, service_label`);
        res.json({ support_agents: support, escalade_targets: targets });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/escalade/agent-service', authenticateAdmin, async (req, res) => {
    try {
        const username = (req.query.username || '').trim();
        if (!username) return res.json({ service: null });
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) return res.json({ service: null });
        const results = await searchADUsersByQuery(username, adSettings);
        const match = results.find(u => (u.username || '').toLowerCase() === username.toLowerCase());
        res.json({ service: match?.service || null, displayName: match?.displayName || null });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/escalade/services', authenticateAdmin, async (req, res) => {
    try {
        const db = getSqlite();
        const rows = await db.all(`
            SELECT DISTINCT service_code, service_complement
            FROM users
            WHERE service_code IS NOT NULL AND service_code != ''
            ORDER BY service_code
        `);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/escalade/support-agent', authenticateAdmin, async (req, res) => {
    try {
        const { user_id, username, display_name, email } = req.body;
        const existing = await pgDb.get(`SELECT id FROM hub_tickets.escalade_config WHERE type = 'support_agent' AND user_id = $1`, [user_id]);
        if (existing) return res.status(400).json({ message: 'Agent déjà dans la liste' });
        await pgDb.run(`INSERT INTO hub_tickets.escalade_config (type, user_id, username, display_name, email) VALUES ('support_agent', $1, $2, $3, $4)`, [user_id, username, display_name, email]);
        res.json({ message: 'Agent ajouté' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/escalade/support-agent/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(`DELETE FROM hub_tickets.escalade_config WHERE id = $1 AND type = 'support_agent'`, [req.params.id]);
        res.json({ message: 'Agent retiré' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/escalade/target', authenticateAdmin, async (req, res) => {
    try {
        const { target_type, user_id, username, display_name, email, service_code, service_label } = req.body;
        await pgDb.run(
            `INSERT INTO hub_tickets.escalade_config (type, target_type, user_id, username, display_name, email, service_code, service_label) VALUES ('escalade_target', $1, $2, $3, $4, $5, $6, $7)`,
            [target_type, user_id || null, username || null, display_name || null, email || null, service_code || null, service_label || null]
        );
        res.json({ message: 'Cible ajoutée' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/escalade/target/:id', authenticateAdmin, async (req, res) => {
    try {
        await pgDb.run(`DELETE FROM hub_tickets.escalade_config WHERE id = $1 AND type = 'escalade_target'`, [req.params.id]);
        res.json({ message: 'Cible retirée' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/glpi-url', authenticateJWT, async (req, res) => {
    try {
        const db = getSqlite();
        const settings = await db.get('SELECT url FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.json({ url: null, ticketUrl: null });
        const base = settings.url.replace(/\/apirest\.php\/?$/, '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
        res.json({ url: settings.url, ticketUrl: base + '/front/ticket.form.php?id=' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/config/:key', authenticateAdmin, async (req, res) => {
    try {
        const val = await technicianRepo.getConfig(req.params.key);
        res.json({ key: req.params.key, value: val });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/config/:key', authenticateAdmin, async (req, res) => {
    try {
        await technicianRepo.setConfig(req.params.key, req.body.value);
        res.json({ message: 'Configuration mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Rôle d'un membre de l'équipe ────────────────────────────────
router.put('/technicians/:id/role', authenticateAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['technician', 'supervisor', 'admin'];
        if (!validRoles.includes(role)) return res.status(400).json({ message: 'Rôle invalide (technician, supervisor, admin)' });
        const userId = parseInt(req.params.id);
        await pgDb.run(
            `INSERT INTO hub_tickets.technician_profiles (user_id, module_role, status, updated_at)
             VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
             ON CONFLICT (user_id) DO UPDATE SET module_role = $2, updated_at = CURRENT_TIMESTAMP`,
            [userId, role]
        );
        await pgDb.run('UPDATE hub.users SET role = $1 WHERE id = $2', [role, userId]);
        // Sync role back to SQLite (source of JWT) — look up username from hub.users
        try {
            const hubUser = await pgDb.get('SELECT username FROM hub.users WHERE id = $1', [userId]);
            if (hubUser?.username) {
                const db = getSqlite();
                // Case-insensitive sync to SQLite (AD usernames may be MixedCase vs lowercase SQLite)
                await db.run("UPDATE users SET role = ? WHERE LOWER(username) = LOWER(?) AND role NOT IN ('superadmin')", [role, hubUser.username]);
                // Normalize username to lowercase in technician_profiles for future lookups
                const normalizedUsername = hubUser.username.toLowerCase();
                await pgDb.run(
                    "UPDATE hub_tickets.technician_profiles SET username = $1 WHERE user_id = $2",
                    [normalizedUsername, userId]
                );
            }
        } catch (e) { console.error('[ROLE SYNC]', e.message); }
        res.json({ message: 'Rôle mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Matrice de permissions par rôle ─────────────────────────────
router.get('/role-permissions', authenticateAdmin, async (req, res) => {
    try {
        const rows = await pgDb.all('SELECT role, permission FROM hub_tickets.role_permissions ORDER BY permission, role');
        const result = {};
        for (const row of rows) {
            if (!result[row.permission]) result[row.permission] = [];
            result[row.permission].push(row.role);
        }
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/role-permissions', authenticateAdmin, async (req, res) => {
    try {
        const { permissions } = req.body;
        if (!permissions || typeof permissions !== 'object') {
            return res.status(400).json({ message: 'permissions object requis' });
        }
        // Vider la table puis réinsérer
        const { pool } = require('../../shared/database');
        await pool.query('DELETE FROM hub_tickets.role_permissions');
        for (const [perm, roles] of Object.entries(permissions)) {
            for (const role of Array.isArray(roles) ? roles : []) {
                await pool.query(
                    'INSERT INTO hub_tickets.role_permissions (role, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [role, perm]
                );
            }
        }
        // Recharger le cache en mémoire
        const { loadPermissionsFromDb } = require('./middleware/ticket-permissions');
        await loadPermissionsFromDb();
        res.json({ message: 'Permissions mises à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Sync GLPI → hub_tickets (écrasement complet) ────────────────
router.post('/sync-glpi', authenticateJWT, async (req, res) => {
    const { pool } = require('../../shared/database');
    const { resolveTicketRole } = require('./middleware/ticket-permissions');
    try {
        const role = await resolveTicketRole(req.user);
        if (!['superadmin', 'admin', 'supervisor'].includes(role)) {
            return res.status(403).json({ message: 'Rôle superviseur requis' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lister les tickets hub qui n'existent pas dans glpi (créés dans le hub)
            const orphans = await client.query(`
                SELECT h.glpi_id FROM hub_tickets.tickets h
                LEFT JOIN glpi.tickets g ON g.glpi_id = h.glpi_id
                WHERE g.glpi_id IS NULL
            `);
            const orphanIds = orphans.rows.map(r => r.glpi_id);

            if (orphanIds.length > 0) {
                // Supprimer les données liées aux tickets hub orphelins
                const tables = [
                    'ticket_assignments', 'ticket_category_assignments', 'ticket_tag_links',
                    'ticket_attachments', 'ticket_links', 'ticket_history',
                    'ticket_group_members', 'ticket_favorites', 'ticket_sla',
                    'observers', 'ticket_followups',
                ];
                for (const table of tables) {
                    await client.query(
                        `DELETE FROM hub_tickets.${table} WHERE ticket_id = ANY($1)`,
                        [orphanIds]
                    );
                }

                // Supprimer les tâches liées (user_tasks)
                await client.query(
                    `DELETE FROM hub.user_tasks WHERE context_source = 'ticket' AND context_id = ANY($1)`,
                    [orphanIds]
                );

                // Supprimer les tickets orphelins
                await client.query(
                    'DELETE FROM hub_tickets.tickets WHERE glpi_id = ANY($1)',
                    [orphanIds]
                );
            }

            // Supprimer les lignes non GLPI des tables core avant réinsertion
            // (nettoyage des observers/followups qui référencent des tickets supprimés)
            await client.query(`
                DELETE FROM hub_tickets.observers o
                WHERE NOT EXISTS (SELECT 1 FROM hub_tickets.tickets t WHERE t.glpi_id = o.ticket_id)
            `);
            await client.query(`
                DELETE FROM hub_tickets.ticket_followups f
                WHERE NOT EXISTS (SELECT 1 FROM hub_tickets.tickets t WHERE t.glpi_id = f.ticket_id)
            `);

            // 1. ticket_status
            await client.query('DELETE FROM hub_tickets.ticket_status');
            await client.query(`
                INSERT INTO hub_tickets.ticket_status (id, label)
                SELECT id, label FROM glpi.ticket_status
            `);

            // 2. tickets — insérer/mettre à jour depuis glpi
            await client.query(`
                INSERT INTO hub_tickets.tickets
                    (glpi_id, title, content, status, priority, urgency, impact,
                     category, type, date_creation, date_mod, date_closed, date_solved,
                     location, solution, source, entity, requester_name, email_alt,
                     requester_email_22)
                SELECT glpi_id, title, content, status, priority, urgency, impact,
                       category, type, date_creation, date_mod, date_closed, date_solved,
                       location, solution, source, entity, requester_name, email_alt,
                       requester_email_22
                FROM glpi.tickets
                ON CONFLICT (glpi_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    status = EXCLUDED.status,
                    priority = EXCLUDED.priority,
                    urgency = EXCLUDED.urgency,
                    impact = EXCLUDED.impact,
                    category = EXCLUDED.category,
                    type = EXCLUDED.type,
                    date_creation = EXCLUDED.date_creation,
                    date_mod = EXCLUDED.date_mod,
                    date_closed = EXCLUDED.date_closed,
                    date_solved = EXCLUDED.date_solved,
                    location = EXCLUDED.location,
                    solution = EXCLUDED.solution,
                    entity = EXCLUDED.entity,
                    requester_name = EXCLUDED.requester_name,
                    email_alt = EXCLUDED.email_alt,
                    requester_email_22 = EXCLUDED.requester_email_22
            `);

            // 3. observers — remplacer
            await client.query('DELETE FROM hub_tickets.observers');
            await client.query(`
                INSERT INTO hub_tickets.observers
                    (ticket_id, user_id, name, login, email, is_active)
                SELECT ticket_id, user_id, name, login, email, is_active
                FROM glpi.observers
            `);

            // 4. ticket_followups — remplacer
            await client.query('DELETE FROM hub_tickets.ticket_followups');
            await client.query(`
                INSERT INTO hub_tickets.ticket_followups
                    (ticket_id, content, content_hash, author_name, author_email,
                     is_private, date_creation)
                SELECT ticket_id, content, content_hash, author_name, author_email,
                       is_private, date_creation
                FROM glpi.ticket_followups
            `);

            await client.query('COMMIT');
            const deletedCount = orphanIds.length;
            res.json({
                message: `Synchronisation GLPI terminée. ${deletedCount} ticket(s) hub supprimé(s) avec leurs données liées.`
            });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
