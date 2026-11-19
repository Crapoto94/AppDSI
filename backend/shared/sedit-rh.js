/**
 * Client de l'API SEDIT RH (agents et organisation de la Ville, lecture seule).
 *
 * Porté de C:\dev\suiviconges\backend\sedit_rh.py. URL et clé : SEDITRH_API_URL / SEDITRH_API_KEY (.env à la racine,
 * transmises au conteneur par docker-compose). La clé part en `Authorization: Bearer` et n'est jamais journalisée.
 * Droits requis sur la clé : agents:read (+ organisation:read pour la liste des directions).
 *
 * Les agents (données personnelles) ne sont gardés qu'en mémoire, quelques minutes.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class SeditError extends Error {
    constructor(message, status) { super(message); this.status = status || null; }
}

/** Le backend ne charge pas dotenv : en développement local, on lit SEDITRH_* dans le .env de la racine du dépôt. */
let envFileCache = null;
function fromEnvFile(name) {
    if (envFileCache === null) {
        envFileCache = {};
        try {
            const txt = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
            for (const line of txt.split(/\r?\n/)) {
                const m = line.match(/^\s*(SEDITRH_[A-Z_]+)\s*=\s*(.*)\s*$/);
                if (m) envFileCache[m[1]] = m[2].replace(/^["']|["']$/g, '');
            }
        } catch { /* pas de .env : seules les variables d'environnement comptent */ }
    }
    return envFileCache[name] || '';
}
const cfg = (name) => process.env[name] || fromEnvFile(name);

const configured = () => !!(cfg('SEDITRH_API_URL') && cfg('SEDITRH_API_KEY'));

async function get(apiPath, params, timeout = 30000) {
    if (!configured()) throw new SeditError("L'API SEDIT RH n'est pas configurée (SEDITRH_API_URL et SEDITRH_API_KEY dans le .env).");
    let resp;
    try {
        resp = await axios.get(cfg('SEDITRH_API_URL').replace(/\/+$/, '') + apiPath, {
            params, timeout,
            headers: { Authorization: `Bearer ${cfg('SEDITRH_API_KEY')}` },
            validateStatus: () => true,
        });
    } catch (e) {
        throw new SeditError(`API SEDIT RH injoignable (${e.code || e.message})`);
    }
    if (resp.status === 200) return resp.data;
    const detail = resp.data && resp.data.detail ? ` : ${resp.data.detail}` : '';
    if (resp.status === 401) throw new SeditError('Clé refusée par l\'API SEDIT RH (invalide, expirée ou suspendue).', 401);
    if (resp.status === 403) throw new SeditError(`Accès refusé par l'API SEDIT RH${detail}`, 403);
    if (resp.status === 404) throw new SeditError('Agent introuvable dans SEDIT RH.', 404);
    throw new SeditError(`Erreur de l'API SEDIT RH (HTTP ${resp.status})${detail}`, resp.status);
}

const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-']/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const clean = (v) => String(v || '').trim();
const lab = (a, key) => clean((a[key] || {}).libelle);
const code = (a, key) => clean((a[key] || {}).code);
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\S)/g, (m, p, c) => p + c.toUpperCase());

/** Poste de directeur d'une direction (ni adjoint, ni direction générale). */
function estDirecteur(a) {
    const poste = fold(((a.poste || {}).libelle || '').replace(/·/g, ' ')).toUpperCase();
    return /^\s*DIRECT(EUR|RICE)\b/.test(poste) && !/ADJOINT|GENERAL/.test(poste);
}
const estDgDga = (a) => {
    const poste = fold(((a.poste || {}).libelle || '').replace(/·/g, ' ')).toUpperCase();
    return /DIRECT(EUR|RICE) GENERAL|\bDGA?\b|DIRECTEUR.* GENERAL/.test(poste);
};

/** Champs utiles seulement (jamais l'enregistrement complet). Le grade vient de la fiche SEDIT RH (AGT_GRADE_L). */
function summary(a) {
    return {
        matricule: clean(a.matricule),
        nom: clean(a.nom).toUpperCase(),
        prenom: titleCase(clean(a.prenom)),
        grade: lab(a, 'grade'),
        grade_code: code(a, 'grade'),
        poste: lab(a, 'poste'),
        fonction: lab(a, 'fonction'),
        direction_code: code(a, 'direction'),
        direction: lab(a, 'direction'),
        service_code: code(a, 'service'),
        service: lab(a, 'service'),
        secteur: lab(a, 'secteur'),
        affectation: lab(a, 'affectation'),
        statut: lab(a, 'statut'),
        date_arrivee: clean(a.date_arrivee).slice(0, 10),
        date_depart: clean(a.date_depart).slice(0, 10),
        est_directeur: estDirecteur(a),
        est_dg_dga: estDgDga(a),
    };
}

// ─── Cache mémoire des agents en poste (5 min) ──────────────────────────────
const TTL = 300000;
let agentsCache = { at: 0, agents: null, inflight: null };

async function allAgents(force = false) {
    if (!force && agentsCache.agents && Date.now() - agentsCache.at < TTL) return agentsCache.agents;
    if (agentsCache.inflight) return agentsCache.inflight;
    agentsCache.inflight = (async () => {
        const agents = [];
        let offset = 0;
        for (let i = 0; i < 100; i++) {
            const data = await get('/api/v1/agents', { limit: 500, en_poste: 'true', offset }, 120000);
            agents.push(...(data.data || []));
            const meta = data.meta || {};
            if (!meta.has_more) break;
            offset = meta.next_offset ?? offset + 500;
        }
        agentsCache = { at: Date.now(), agents, inflight: null };
        return agents;
    })().catch((e) => { agentsCache.inflight = null; throw e; });
    return agentsCache.inflight;
}

/** Saisie prédictive : agents en poste dont nom, prénom ou matricule contient tous les mots saisis. */
async function searchAgents(query, limit = 15) {
    const words = fold(query).split(' ').filter(Boolean);
    if (!words.length || Math.max(...words.map(w => w.length)) < 2) return [];
    const lead = words.reduce((a, b) => (b.length > a.length ? b : a));
    const data = await get('/api/v1/agents', { q: lead, en_poste: 'true', limit: 100 });
    return (data.data || [])
        .filter(a => { const hay = fold(`${a.nom} ${a.prenom} ${a.matricule}`); return words.every(w => hay.includes(w)); })
        .map(summary)
        .sort((x, y) => (x.nom + x.prenom).localeCompare(y.nom + y.prenom))
        .slice(0, limit);
}

/** Fiche d'un agent par matricule (même s'il n'est plus en poste) ; null s'il est inconnu. */
async function getAgent(matricule) {
    const m = clean(matricule);
    if (!m) return null;
    try {
        const data = await get(`/api/v1/agents/${encodeURIComponent(m)}`, undefined, 60000);
        return data.data ? summary(data.data) : null;
    } catch (e) {
        if (e.status === 404) return null;
        throw e;
    }
}

/** Agents en poste des directions données (codes), triés par nom : périmètre proposé à un valideur. */
async function agentsOfDirections(directionCodes) {
    const set = new Set((directionCodes || []).map(clean).filter(Boolean));
    if (!set.size) return [];
    return (await allAgents()).filter(a => set.has(code(a, 'direction'))).map(summary)
        .sort((x, y) => (x.nom + x.prenom).localeCompare(y.nom + y.prenom));
}

/** Directeurs / DG / DGA en poste : candidats à la fonction de valideur. */
async function candidatsValideurs() {
    return (await allAgents()).filter(a => estDirecteur(a) || estDgDga(a)).map(summary)
        .sort((x, y) => (x.nom + x.prenom).localeCompare(y.nom + y.prenom));
}

/** Directions de la Ville : [{code, libelle}] déduites des agents en poste (évite d'exiger le droit organisation:read). */
async function directions() {
    const map = new Map();
    for (const a of await allAgents()) {
        const c = code(a, 'direction');
        if (c && !map.has(c)) map.set(c, lab(a, 'direction'));
    }
    return [...map.entries()].map(([c, l]) => ({ code: c, libelle: l })).sort((x, y) => x.libelle.localeCompare(y.libelle));
}

module.exports = { SeditError, configured, searchAgents, getAgent, agentsOfDirections, candidatsValideurs, directions, summary };
