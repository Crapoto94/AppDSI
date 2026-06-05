const { pgDb } = require('../../../shared/database');
const axios = require('axios');

const URGENCY_LABELS = { 2: 'Basse', 3: 'Normale', 4: 'Haute', 5: 'Très haute' };
const IMPACT_LABELS = { 2: '1 utilisateur', 3: 'Groupe de travail', 4: 'Service / Direction', 5: 'Global' };
const STATUS_LABELS = { 1: 'Nouveau', 2: 'Assigné', 3: 'En cours', 4: 'En attente', 5: 'Résolu', 6: 'Fermé', 7: 'Fermé', 8: 'Rejeté' };

async function getConfig() {
    const rows = await pgDb.all(
        `SELECT key, value FROM hub_tickets.module_config WHERE key LIKE 'teams_%'`
    );
    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;
    return cfg;
}

function meetsConditions(ticket, cfg) {
    if (cfg.teams_enabled !== 'true') return false;
    const minUrgency = parseInt(cfg.teams_min_urgency || '4');
    const minImpact = parseInt(cfg.teams_min_impact || '4');
    const urgency = parseInt(ticket.urgency) || 0;
    const impact = parseInt(ticket.impact) || 0;
    return urgency >= minUrgency && impact >= minImpact;
}

async function getTicketDetails(ticketId) {
    const { pool } = require('../../../shared/database');
    const result = await pool.query(`
        SELECT t.glpi_id, t.title, t.content, t.status, t.urgency, t.impact, t.priority,
               t.requester_name, t.technician_name, t.date_creation, t.date_solved,
               t.requester_email_resolved AS requester_email
        FROM hub_tickets.tickets t
        WHERE t.glpi_id = $1
    `, [ticketId]);
    return result.rows[0] || null;
}

function buildCard(ticket, config) {
    const baseUrl = config.teams_portal_url || 'https://dsihub.ivry.local';
    const ticketUrl = `${baseUrl}/tickets/${ticket.glpi_id || ticket.id}`;
    const urgencyLabel = URGENCY_LABELS[ticket.urgency] || `Niveau ${ticket.urgency}`;
    const impactLabel = IMPACT_LABELS[ticket.impact] || `Niveau ${ticket.impact}`;
    const statusLabel = STATUS_LABELS[ticket.status] || `Statut ${ticket.status}`;
    const isResolved = ticket.status >= 5;

    const priorityColors = { 2: '0072C6', 3: '0072C6', 4: 'FF8C00', 5: 'FF0000' };
    const themeColor = priorityColors[ticket.priority] || '0072C6';

    const title = isResolved
        ? `✅ Résolu - Ticket #${ticket.glpi_id || ticket.id}`
        : `🚨 Incident Critique - Ticket #${ticket.glpi_id || ticket.id}`;

    const text = isResolved
        ? `Le ticket critique a été résolu.`
        : `Un ticket répondant aux critères d'urgence et d'impact a été ${ticket.status === 1 ? 'créé' : 'mis à jour'}.`;

    const facts = [
        { name: 'Titre', value: ticket.title || 'Sans titre' },
        { name: 'Urgence', value: urgencyLabel },
        { name: 'Impact', value: impactLabel },
        { name: 'Priorité', value: ticket.priority === 2 ? 'Basse' : ticket.priority === 3 ? 'Normale' : ticket.priority === 4 ? 'Haute' : 'Très haute' },
        { name: 'Statut', value: statusLabel },
        { name: 'Demandeur', value: ticket.requester_name || 'Inconnu' },
    ];

    if (ticket.technician_name) {
        facts.push({ name: 'Technicien', value: ticket.technician_name });
    }

    if (!isResolved && ticket.content) {
        facts.push({ name: 'Description', value: ticket.content.substring(0, 500) });
    }

    if (isResolved && ticket.date_solved) {
        facts.push({ name: 'Résolu le', value: new Date(ticket.date_solved).toLocaleString('fr-FR') });
    }

    return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor,
        title,
        text,
        sections: [{ facts }],
        potentialAction: [
            {
                '@type': 'OpenUri',
                name: isResolved ? 'Voir le ticket' : 'Traiter le ticket',
                targets: [{ os: 'default', uri: ticketUrl }]
            }
        ]
    };
}

async function sendToTeams(webhookUrl, card) {
    try {
        const res = await axios.post(webhookUrl, card, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        console.log(`[TEAMS] Message sent successfully (status=${res.status})`);
        return true;
    } catch (err) {
        console.error(`[TEAMS] Failed to send message:`, err.response?.data || err.message);
        return false;
    }
}

async function notifyCrisis(ticketId) {
    try {
        const cfg = await getConfig();
        if (cfg.teams_enabled !== 'true' || !cfg.teams_webhook_url) return;

        const ticket = await getTicketDetails(ticketId);
        if (!ticket) {
            console.log(`[TEAMS] Ticket #${ticketId} not found, skipping`);
            return;
        }

        if (!meetsConditions(ticket, cfg)) return;

        const card = buildCard(ticket, cfg);
        await sendToTeams(cfg.teams_webhook_url, card);
    } catch (err) {
        console.error(`[TEAMS] notifyCrisis error:`, err.message);
    }
}

async function notifyResolved(ticketId) {
    try {
        const cfg = await getConfig();
        if (cfg.teams_enabled !== 'true' || !cfg.teams_webhook_url) return;

        const ticket = await getTicketDetails(ticketId);
        if (!ticket) return;

        // Only send resolution message if it was a crisis ticket (high urgency+impact)
        if (!meetsConditions(ticket, cfg)) return;

        const card = buildCard(ticket, cfg);
        await sendToTeams(cfg.teams_webhook_url, card);
    } catch (err) {
        console.error(`[TEAMS] notifyResolved error:`, err.message);
    }
}

module.exports = { notifyCrisis, notifyResolved, getConfig };
