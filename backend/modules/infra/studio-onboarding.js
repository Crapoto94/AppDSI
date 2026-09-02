/**
 * Intégration RH Studio — écriture (création d'onboarding, acquittement de
 * tâche) et lecture (liste des futurs agents non encore onboardés).
 *
 * Source : hub.infra_apis WHERE key='rh_studio_onboarding' (URL + clé +
 * header). Clé DISTINCTE de 'rh_studio_presence' (lecture seule, utilisée par
 * agent-presence.js) : celle-ci doit avoir la permission read_write côté RH
 * Studio, par principe de moindre privilège (la clé présence n'a pas besoin
 * d'écrire, l'inverse pourrait créer des onboardings en masse par erreur).
 */
const { pgDb } = require('../../shared/database');

async function getConfig() {
    const cfg = await pgDb.get(`SELECT * FROM hub.infra_apis WHERE key = ?`, ['rh_studio_onboarding']);
    if (!cfg) throw new Error("Configuration 'rh_studio_onboarding' introuvable dans hub.infra_apis");
    if (cfg.enabled === false) throw new Error("L'intégration onboarding RH Studio est désactivée");
    return cfg;
}

async function callRhStudio(cfg, path, opts = {}) {
    const url = `${(cfg.base_url || '').replace(/\/+$/, '')}${path}`;
    const headerName = cfg.header_name || 'x-api-key';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
        const resp = await fetch(url, {
            ...opts,
            headers: {
                [headerName]: cfg.api_key || '',
                Accept: 'application/json',
                ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
                ...(opts.headers || {}),
            },
            signal: ctrl.signal,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status} depuis ${url}`);
        return data;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Crée un onboarding côté RH Studio.
 * payload : { agent_id?, nom_temp?, prenom_temp?, manager_id, date_arrivee_prevue?, dsihub_ticket_id? }
 * (manager_id obligatoire côté RH Studio ; agent_id XOR nom_temp/prenom_temp)
 */
async function createOnboarding(payload) {
    const cfg = await getConfig();
    return callRhStudio(cfg, cfg.endpoint || '/api/onboarding', { method: 'POST', body: JSON.stringify(payload) });
}

/** Liste les agents dont l'arrivée est prévue prochainement et pas encore onboardés. */
async function listFutursAgents() {
    const cfg = await getConfig();
    return callRhStudio(cfg, `${cfg.endpoint || '/api/onboarding'}?mode=futurs`, { method: 'GET' });
}

/** Acquitte (done=true) une OnboardingTask suite à la complétion de sa tâche DSI Hub miroir. */
async function acknowledgeTask(rhStudioTaskId) {
    const cfg = await getConfig();
    return callRhStudio(cfg, `/api/onboarding/tasks/${rhStudioTaskId}`, { method: 'PATCH', body: JSON.stringify({ done: true }) });
}

module.exports = { createOnboarding, listFutursAgents, acknowledgeTask };
