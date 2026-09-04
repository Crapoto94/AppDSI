const { pgDb, getSqlite } = require('../../shared/database');
const service = require('./mailboxes.service');
const { searchADRecipientMembers } = require('../../shared/ad_helper');

module.exports = {
    // GET /api/mailboxes — toutes les boîtes mail partagées, quel que soit
    // l'arbitrage (en attente/favorable/défavorable). Lecture ouverte à tout
    // utilisateur connecté (module public).
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

    // POST /api/mailboxes — ajout manuel (sans ticket), depuis le module.
    async create(req, res) {
        try {
            if (!req.body?.nom?.trim()) return res.status(400).json({ message: 'Le nom de la boîte est requis' });
            const id = await service.createManual(req.body, req.user);
            const row = await pgDb.get('SELECT * FROM hub.shared_mailboxes WHERE id = ?', [id]);
            res.status(201).json(row);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la création de la boîte', error: error.message });
        }
    },

    // PUT /api/mailboxes/:id
    async update(req, res) {
        try {
            const existing = await pgDb.get('SELECT id FROM hub.shared_mailboxes WHERE id = ?', [req.params.id]);
            if (!existing) return res.status(404).json({ message: 'Boîte introuvable' });
            await service.updateRecord(req.params.id, req.body || {});
            const row = await pgDb.get('SELECT * FROM hub.shared_mailboxes WHERE id = ?', [req.params.id]);
            res.json(row);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la modification de la boîte', error: error.message });
        }
    },

    // GET /api/mailboxes/ad-members?email=… — relit en direct dans l'annuaire
    // AD les membres réels d'une boîte partagée (délégués Accès total) ou
    // d'une liste de diffusion (membres du groupe), identifiée par son
    // adresse mail. Best-effort : ne modifie rien, le résultat est appliqué
    // par le front (bouton "Récupérer depuis l'AD" dans la fiche).
    async getAdMembers(req, res) {
        try {
            const email = (req.query.email || '').trim();
            if (!email) return res.status(400).json({ message: 'Adresse mail requise' });
            const db = getSqlite();
            const adSettings = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
            if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
                return res.status(400).json({ message: "Annuaire AD non configuré" });
            }
            const result = await searchADRecipientMembers(email, adSettings);
            if (!result.found) {
                return res.status(404).json({ message: result.error || `Aucun objet AD ne correspond à ${email}`, ...result });
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la lecture AD', error: error.message });
        }
    },

    // DELETE /api/mailboxes/:id
    async remove(req, res) {
        try {
            await service.deleteRecord(req.params.id);
            res.json({ message: 'Boîte supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression de la boîte', error: error.message });
        }
    },
};
