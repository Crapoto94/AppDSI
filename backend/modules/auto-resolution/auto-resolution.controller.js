const service = require('./services/auto-resolution.service');
const repo = require('./repositories/auto-resolution.repository');

module.exports = {
    setSendMail(fn) { service.setSendMail(fn); },

    async getSettings(req, res) {
        try {
            const settings = await service.getSettings();
            res.json(settings);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async updateSettings(req, res) {
        try {
            const settings = await service.updateSettings(req.body);
            res.json(settings);
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    async processTickets(req, res) {
        try {
            const result = await service.processTickets();
            res.json(result);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async testProcess(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: 'Email du demandeur requis' });
            const result = await service.processTickets(email);
            res.json(result);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async getLogs(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            const logs = await service.getLogs(limit, offset);
            res.json(logs);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async getTicketInfoPublic(req, res) {
        try {
            const { token } = req.params;
            const info = await service.getTicketInfoPublic(token);
            if (!info) return res.status(404).json({ message: 'Lien invalide ou expiré' });
            res.json(info);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async submitKeepAlive(req, res) {
        try {
            const { token } = req.params;
            const { comment } = req.body;
            if (!comment || !comment.trim()) return res.status(400).json({ message: 'Commentaire obligatoire' });
            const result = await service.submitKeepAlive(token, comment.trim());
            res.json(result);
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    async getPendingTickets(req, res) {
        try {
            const settings = await service.getSettings();
            const now = new Date().toISOString();
            const tickets = await repo.getTicketsPendingReminder(settings.inactivity_days || 30, now);
            const enriched = [];
            for (const t of tickets) {
                const logs = await repo.getLogs(10, 0);
                const ticketLogs = logs.filter(l => l.ticket_id === t.glpi_id);
                enriched.push({
                    id: t.glpi_id,
                    title: t.title,
                    requester_name: t.requester_name,
                    requester_email: t.requester_email_22,
                    status: t.status,
                    date_mod: t.date_mod,
                    date_creation: t.date_creation,
                    reminder_count: parseInt(t.reminder_count) || 0,
                    last_reminder_at: t.last_reminder_at,
                    logs: ticketLogs,
                });
            }
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
};
