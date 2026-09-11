/**
 * Rapprochement d'un nom libre (champ "who" renvoyé par l'IA dans le plan
 * d'action) avec un agent de la DSI (hub_calendrier.agents_dsi, la même liste
 * que /calendrier-dsi). Même logique de tolérance aux fautes de frappe que
 * infra/agent-presence.js#matchAgent (nameSimilarity).
 */
const { pgDb } = require('../../shared/database');
const { nameSimilarity } = require('../infra/name-match');

const MATCH_THRESHOLD = 0.55;

async function listDsiAgents() {
    return pgDb.all('SELECT username, nom, email, service FROM hub_calendrier.agents_dsi ORDER BY nom');
}

/**
 * @param {string} rawName Nom tel que renvoyé par l'IA (ex. "Marc CHEVALIER", "M. Chevalier")
 * @param {Array<{username,nom,email,service}>} agents
 * @returns {{ username, nom, email, service, score } | null}
 */
function matchDsiAgent(rawName, agents) {
    const name = (rawName || '').trim();
    if (!name || !agents?.length) return null;

    let best = null;
    let bestScore = 0;
    for (const agent of agents) {
        const score = nameSimilarity(name, agent.nom || '');
        if (score > bestScore) {
            bestScore = score;
            best = agent;
        }
    }
    if (!best || bestScore < MATCH_THRESHOLD) return null;
    return { ...best, score: Math.round(bestScore * 100) / 100 };
}

module.exports = { listDsiAgents, matchDsiAgent, MATCH_THRESHOLD };
