/**
 * Requête vers l'API RH Studio — statut de présence d'un agent.
 *
 * Source : hub.infra_apis WHERE key='rh_studio_presence' (URL + clé + header).
 * GET {base_url}{endpoint}?email=... | ?q=... | ?nom=...&prenom=...
 */

const { nameSimilarity } = require('./name-match');

// Score minimal de similarité nom saisi <-> nom renvoyé par RH Studio pour
// considérer que c'est un match (tolère les petites fautes de frappe, ex.
// "Mark CHEVALIER" -> "Marc CHEVALIER" ~ 0.9, au-dessus du seuil).
const NAME_MATCH_THRESHOLD = 0.55;

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

/**
 * Rapproche un agent saisi (nom/prénom/email, ex. ligne d'un fichier Excel
 * importé) d'un agent RH Studio : email exact en priorité, repli sur une
 * recherche par nom avec tolérance aux fautes d'orthographe (comparaison de
 * similarité faite ici — RH Studio n'expose qu'une recherche `q=` dont le
 * comportement exact, avec ou sans tolérance, n'est pas connu de ce dépôt).
 *
 * Renvoie toujours l'agent candidat trouvé (même sous le seuil de confiance)
 * afin que l'appelant puisse l'afficher pour verification humaine ; `found`
 * n'est vrai que si le match est jugé suffisamment fiable.
 */
async function matchAgent(cfg, { nom = '', prenom = '', email = '' } = {}) {
    const input = { nom: (nom || '').trim(), prenom: (prenom || '').trim(), email: (email || '').trim() };
    const base = { input, matchedBy: null, similarity: null, found: false, agent: null };

    if (input.email) {
        try {
            const r = await fetchAgentPresence(cfg, { email: input.email });
            if (r && r.found && r.agent) {
                return { ...base, found: true, matchedBy: 'email', similarity: 1, agent: r.agent };
            }
        } catch (e) { /* on tente quand meme le nom si la recherche par email echoue */ }
    }

    if (!input.nom && !input.prenom) return base;

    let candidate = null;
    try {
        const fullQuery = [input.prenom, input.nom].filter(Boolean).join(' ');
        if (fullQuery) {
            const r = await fetchAgentPresence(cfg, { q: fullQuery });
            if (r && r.found && r.agent) candidate = r.agent;
        }
        if (!candidate && input.nom) {
            const r2 = await fetchAgentPresence(cfg, { q: input.nom });
            if (r2 && r2.found && r2.agent) candidate = r2.agent;
        }
    } catch (e) { /* candidate reste null, on renvoie "non trouve" */ }

    if (!candidate) return base;

    const inputFull = `${input.prenom} ${input.nom}`;
    const candidateFull = `${candidate.prenom || ''} ${candidate.nom || ''}`;
    const score = nameSimilarity(inputFull, candidateFull);

    return {
        ...base,
        found: score >= NAME_MATCH_THRESHOLD,
        matchedBy: 'nom',
        similarity: Math.round(score * 100) / 100,
        agent: candidate,
    };
}

module.exports = { fetchAgentPresence, matchAgent };
