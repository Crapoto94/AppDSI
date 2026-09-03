const { pgDb } = require('../../shared/database');

module.exports = {
    // GET /api/mailboxes — toutes les boîtes mail partagées demandées, quel
    // que soit l'arbitrage (en attente/favorable/défavorable).
    async list(req, res) {
        try {
            const rows = await pgDb.all(`
                SELECT sm.*, t.title AS ticket_title, t.status AS ticket_status
                FROM hub.shared_mailboxes sm
                LEFT JOIN hub_tickets.tickets t ON t.glpi_id = sm.ticket_id
                ORDER BY sm.created_at DESC
            `);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des boîtes mail partagées', error: error.message });
        }
    },
};
