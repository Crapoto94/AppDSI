/**
 * Requête vers l'API RH Studio — statut de présence d'un agent.
 *
 * Source : hub.infra_apis WHERE key='rh_studio_presence' (URL + clé + header).
 * GET {base_url}{endpoint}?email=... | ?q=... | ?nom=...&prenom=...
 */

async function fetchAgentPresence(cfg, { email, q, nom, prenom } = {}) {
    const url = new URL(`${(cfg.base_url || '').replace(/\/+$/, '')}${cfg.endpoint || ''}`);
    if (email) url.searchParams.set('email', email);
    if (q) url.searchParams.set('q', q);
    if (nom) url.searchParams.set('nom', nom);
    if (prenom) url.searchParams.set('prenom', prenom);

    const headerName = cfg.header_name || 'x-api-key';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
        const resp = await fetch(url, {
            headers: { [headerName]: cfg.api_key || '', Accept: 'application/json' },
            signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} depuis ${url}`);
        return await resp.json();
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { fetchAgentPresence };
