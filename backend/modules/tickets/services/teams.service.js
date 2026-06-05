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
    if (cfg.teams_enabled !== 'true') {
        console.log('[TEAMS] Skipped — teams_enabled is', cfg.teams_enabled);
        return false;
    }
    const minPriority = parseInt(cfg.teams_min_urgency || '4');
    const minImpact = parseInt(cfg.teams_min_impact || '4');
    const priority = parseInt(ticket.priority) || 0;
    const impact = parseInt(ticket.impact) || 0;
    const ok = priority >= minPriority && impact >= minImpact;
    if (!ok) console.log(`[TEAMS] Conditions not met: priority=${priority} >= ${minPriority}=${priority >= minPriority}, impact=${impact} >= ${minImpact}=${impact >= minImpact}`);
    return ok;
}

async function getTicketDetails(ticketId) {
    const { pool } = require('../../../shared/database');
    const result = await pool.query(`
        SELECT t.glpi_id, t.title, t.content, t.status, t.urgency, t.impact, t.priority,
               t.requester_name, t.date_creation, t.date_solved
        FROM hub_tickets.tickets t
        WHERE t.glpi_id = $1
    `, [ticketId]);
    return result.rows[0] || null;
}

function buildCard(ticket, config) {
    const baseUrl = config.teams_portal_url || 'https://dsihub.ivry.local';
    const ticketId = ticket.glpi_id || ticket.id;
    const ticketUrl = `${baseUrl}/tickets/${ticketId}`;
    const urgencyLabel = URGENCY_LABELS[ticket.urgency] || `Niveau ${ticket.urgency}`;
    const impactLabel = IMPACT_LABELS[ticket.impact] || `Niveau ${ticket.impact}`;
    const statusLabel = STATUS_LABELS[ticket.status] || `Statut ${ticket.status}`;
    const isResolved = ticket.status >= 5;

    const priorityColors = { 2: '0072C6', 3: '0072C6', 4: 'FF8C00', 5: 'FF0000' };
    const themeColor = priorityColors[ticket.priority] || '0072C6';

    const title = isResolved
        ? `✅ Résolu - Ticket #${ticketId}`
        : `🚨 Incident Critique - Ticket #${ticketId}`;

    const text = isResolved
        ? `Le ticket critique **#${ticketId}** a été résolu.\n\n[Voir le ticket](${ticketUrl})`
        : `Un ticket répondant aux critères d'urgence et d'impact a été ${ticket.status === 1 ? 'créé' : 'mis à jour'}.\n\n[Voir le ticket](${ticketUrl})`;

    const facts = [
        { name: 'Titre', value: ticket.title || 'Sans titre' },
        { name: 'Ticket', value: `[#${ticketId}](${ticketUrl})` },
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
        console.log('[TEAMS] notifyCrisis called for ticket #' + ticketId + ' — enabled=' + cfg.teams_enabled + ' webhook=' + (cfg.teams_webhook_url ? 'set' : 'empty'));
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
        console.log('[TEAMS] notifyResolved called for ticket #' + ticketId + ' — enabled=' + cfg.teams_enabled + ' webhook=' + (cfg.teams_webhook_url ? 'set' : 'empty'));
        if (cfg.teams_enabled !== 'true' || !cfg.teams_webhook_url) return;

        const ticket = await getTicketDetails(ticketId);
        if (!ticket) {
            console.log(`[TEAMS] Ticket #${ticketId} not found for resolution, skipping`);
            return;
        }

        // Only send resolution message if it was a crisis ticket (high urgency+impact)
        if (!meetsConditions(ticket, cfg)) {
            console.log(`[TEAMS] Resolution skipped for #${ticketId} — does not meet crisis criteria`);
            return;
        }

        const card = buildCard(ticket, cfg);
        await sendToTeams(cfg.teams_webhook_url, card);
    } catch (err) {
        console.error(`[TEAMS] notifyResolved error:`, err.message);
    }
}

module.exports = { notifyCrisis, notifyResolved, getConfig };
