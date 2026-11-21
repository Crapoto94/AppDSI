/**
 * Demandes de formation issues des entretiens professionnels (vue ADMINISTRATEUR, globale et NON NOMINATIVE).
 *
 * Source : les trois rubriques « Actions de formation à envisager » du compte rendu (formations obligatoires, autres formations métiers,
 * formations liées au parcours / projet professionnel). On ne restitue ici ni nom ni identifiant d'agent : seulement le texte de la demande,
 * son type, et la direction / le service d'origine. L'analyse globale est confiée à l'IA locale, qui REGROUPE les demandes par thème
 * (ex. « management » et « encadrement » ; « Word » et « Excel » → bureautique) ; les comptes sont recalculés ici, pas par l'IA.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');

const TYPES = [
    { key: 'obligatoires', label: 'Formations obligatoires (statutaires et réglementaires)' },
    { key: 'metiers', label: 'Autres formations métiers' },
    { key: 'parcours', label: 'Formations liées au parcours / projet professionnel' },
];

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const isVide = (t) => !t || /^(n[ée]ant|ras|rien|aucune?|non|-|\/|\.)$/i.test(t.trim());

/** Demandes de la campagne : [{ type, direction, service, texte }], sans aucune donnée nominative. */
async function listDemandes(campaignId) {
    const rows = await pgDb.all(
        `SELECT e.id, e.source, e.direction, e.service, e.agent_matricule, e.crep, e.evaluation_statut
         FROM hub_entretiens.entretiens e
         WHERE e.campaign_id = ? AND e.deleted_at IS NULL AND e.crep IS NOT NULL`, [campaignId]);
    let withInfo = rows;
    try { withInfo = await require('../ep-base/ep-base.service').attachInfo(rows); } catch (e) { /* repli : colonnes de l'entretien */ }
    const out = [];
    for (const r of withInfo) {
        const crep = typeof r.crep === 'string' ? JSON.parse(r.crep) : (r.crep || {});
        const f = crep.formations || {};
        // direction \ service \ secteur (base des agents) sinon colonnes de l'entretien
        const seg = String(r.chemin || '').split('\\').map(x => x.trim()).filter(Boolean);
        const direction = seg[0] || clean(r.direction) || 'Non renseignée';
        const service = seg[1] || (clean(r.service) && clean(r.service) !== direction ? clean(r.service) : '') || '(sans service)';
        for (const t of TYPES) {
            const texte = clean(f[t.key]);
            if (!isVide(texte)) out.push({ type: t.key, direction, service, texte, valide: r.evaluation_statut === 'soumis' });
        }
    }
    // Mode simulation : demandes fictives (jamais enregistrées) pour pouvoir tester la vue et l'analyse.
    try {
        const sim = require('./simulation');
        if (await sim.isOn()) out.push(...await sim.demandesFictives());
    } catch (e) { console.warn('[ENTRETIENS] demandes fictives:', e.message); }
    return out;
}

/** Agrège par direction → service → type (comptes et textes). */
function grouper(demandes) {
    const dirs = new Map();
    for (const d of demandes) {
        if (!dirs.has(d.direction)) dirs.set(d.direction, { direction: d.direction, total: 0, services: new Map() });
        const D = dirs.get(d.direction);
        if (!D.services.has(d.service)) D.services.set(d.service, { service: d.service, total: 0, types: { obligatoires: [], metiers: [], parcours: [] } });
        const S = D.services.get(d.service);
        S.types[d.type].push(d.texte);
        S.total++; D.total++;
    }
    return [...dirs.values()].sort((a, b) => a.direction.localeCompare(b.direction, 'fr')).map(D => ({
        direction: D.direction, total: D.total,
        services: [...D.services.values()].sort((a, b) => a.service.localeCompare(b.service, 'fr')),
    }));
}

// ─── Analyse globale par l'IA locale (tâche de fond, résultat conservé) ──────────────────────────────────────
const SETTING = 'formations_analysis';
let running = null;

async function lastAnalysis(campaignId) {
    try {
        const raw = await svc.getSetting(SETTING);
        const a = raw ? JSON.parse(raw) : null;
        if (a && a.campaign_id === campaignId) return a;
    } catch (e) { /* aucune analyse */ }
    return null;
}

/** Réparation d'un JSON tronqué ou mal fermé (réponse coupée par la limite de jetons) : on coupe au dernier élément complet et on referme. */
function repairJson(t) {
    const cuts = [];
    for (let k = t.length - 1; k > 0; k--) if (',}]'.includes(t[k])) cuts.push(t[k] === ',' ? k : k + 1);
    for (const cut of cuts.slice(0, 400)) {
        const head = t.slice(0, cut).replace(/,\s*$/, '');
        const stack = []; let inStr = false, esc = false;
        for (const c of head) {
            if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
            if (c === '"') inStr = true; else if (c === '{' || c === '[') stack.push(c); else if (c === '}' || c === ']') stack.pop();
        }
        if (inStr) continue;
        try { return JSON.parse(head + stack.reverse().map(c => (c === '{' ? '}' : ']')).join('')); } catch (e) { /* on coupe plus tôt */ }
    }
    return null;
}

function parseJson(out) {
    const t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = t.indexOf('{');
    if (a < 0) throw new Error('Réponse de l’IA illisible.');
    const b = t.lastIndexOf('}');
    if (b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* réparation ci-dessous */ } }
    const r = repairJson(t.slice(a));
    if (r) return r;
    // Dernier recours pour le classement : paires [numéro,"clé"] lisibles une à une
    const pairs = [...t.matchAll(/\[\s*(\d+)\s*,\s*"([a-z0-9_]+)"\s*\]/gi)].map(m => [Number(m[1]), m[2]]);
    if (pairs.length) return { r: pairs };
    throw new Error('Réponse de l’IA illisible.');
}

/** Exécute fn sur chaque élément avec au plus n appels simultanés (les DGX absorbent le parallélisme). */
async function pool(items, n, fn) {
    let next = 0;
    const out = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
    }));
    return out;
}

const norm = (t) => clean(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const BATCH = 60;      // demandes par appel de classement
const PARALLEL = 6;    // appels simultanés vers les DGX

/** Lit « clé = libellé » ligne par ligne dans le prompt des catégories. */
function parseCategories(text) {
    const cats = [];
    for (const l of String(text || '').split('\n')) {
        const m = l.match(/^\s*([a-z0-9_]+)\s*=\s*(.+)$/i);
        if (m) cats.push({ key: m[1].toLowerCase(), label: clean(m[2]).split(/\s*[(:]/)[0].replace(/\s+—.*$/, '').trim() || m[1], full: clean(m[2]) });
    }
    if (!cats.some(c => c.key === 'autres')) cats.push({ key: 'autres', label: 'Autres', full: 'Autres / non classable' });
    return cats;
}

/**
 * Analyse globale en 4 phases, avec progression :
 *  1. classement des demandes (dédoublonnées) par catégorie, par lots en parallèle ;
 *  2. regroupement en sous-thèmes dans chaque catégorie, en parallèle ;
 *  3. comptes recalculés ici ; 4. synthèse pour la DRH.
 */
async function runAnalysis(campaignId, demandesOverride, progress = () => {}) {
    const t0 = Date.now();
    const P = require('./prompts');
    await P.refresh(true);
    const demandes = demandesOverride || await listDemandes(campaignId);
    if (!demandes.length) return { campaign_id: campaignId, generated_at: new Date().toISOString(), duration_ms: 0, nb_demandes: 0, themes: [], synthese: 'Aucune demande de formation dans les comptes rendus de cette campagne.' };
    const apm = require('../../shared/apm_ai');
    const model = await require('./ai.service').pickApmModel(apm);
    const cats = parseCategories(P.get('formations.categories'));
    const catByKey = new Map(cats.map(c => [c.key, c]));

    // Demandes distinctes (même texte à la casse, aux accents et à la ponctuation près) : l'IA ne classe que les textes distincts
    const uniq = new Map();
    for (const d of demandes) {
        const k = norm(d.texte);
        if (!k) continue;
        if (!uniq.has(k)) uniq.set(k, { texte: d.texte, n: 0, cat: null });
        uniq.get(k).n++;
    }
    const U = [...uniq.values()];
    progress({ phase: 'classement', label: `Classement de ${demandes.length} demandes (${U.length} formulations distinctes)`, done: 0, total: Math.ceil(U.length / BATCH), model });

    // ─── Phase 1 : classement par catégorie ───
    const catList = cats.map(c => `${c.key} = ${c.full}`).join('\n');
    const classify = async (items) => {
        const lignes = items.map((u, i) => `${i + 1} | ${u.texte.slice(0, 180)}`).join('\n');
        const prompt = P.render('formations.classement', { categories: catList, lignes });
        const j = parseJson(await apm.queryAi(prompt, model, { max_tokens: 2500, temperature: 0 }));
        for (const pair of (Array.isArray(j.r) ? j.r : [])) {
            const n = Number(pair?.[0]), key = String(pair?.[1] || '').toLowerCase().trim();
            if (n >= 1 && n <= items.length && catByKey.has(key)) items[n - 1].cat = key;
        }
    };
    const batches = []; for (let i = 0; i < U.length; i += BATCH) batches.push(U.slice(i, i + BATCH));
    let done = 0;
    await pool(batches, PARALLEL, async (b) => {
        try { await classify(b); } catch (e) { console.warn('[ENTRETIENS] classement d’un lot :', e.message); }
        progress({ phase: 'classement', done: ++done, total: batches.length });
    });
    // Reprise des lignes que l'IA a oubliées (une seule passe, lots plus petits)
    const oubliees = U.filter(u => !u.cat);
    if (oubliees.length) {
        const rb = []; for (let i = 0; i < oubliees.length; i += 25) rb.push(oubliees.slice(i, i + 25));
        progress({ phase: 'reprise', label: `Reprise de ${oubliees.length} demandes non classées`, done: 0, total: rb.length });
        let rd = 0;
        await pool(rb, PARALLEL, async (b) => { try { await classify(b); } catch (e) { /* reste « autres » */ } progress({ done: ++rd }); });
    }
    for (const u of U) if (!u.cat) u.cat = 'autres';

    // ─── Phase 2 : sous-thèmes par catégorie (en parallèle) ───
    const byCat = new Map(cats.map(c => [c.key, []]));
    for (const u of U) byCat.get(u.cat).push(u);
    const catsUsed = cats.filter(c => byCat.get(c.key).length);
    progress({ phase: 'regroupement', label: 'Regroupement des formulations proches par catégorie', done: 0, total: catsUsed.length });
    let cd = 0;
    const subs = await pool(catsUsed, 4, async (c) => {
        const us = byCat.get(c.key).slice().sort((a, b) => b.n - a.n);
        let res = null;
        if (us.length >= 4) {
            const top = us.slice(0, 220);
            try {
                const prompt = P.render('formations.sousthemes', { categorie: c.label, lignes: top.map((u, i) => `${i + 1} | ${u.texte.slice(0, 160)}`).join('\n') });
                const j = parseJson(await apm.queryAi(prompt, model, { max_tokens: 3000, temperature: 0.1 }));
                const seen = new Set();
                res = (Array.isArray(j.sous_themes) ? j.sous_themes : []).map(st => {
                    const idx = (Array.isArray(st.items) ? st.items : []).map(Number).filter(n => n >= 1 && n <= top.length && !seen.has(n));
                    idx.forEach(n => seen.add(n));
                    const its = idx.map(n => top[n - 1]);
                    return { theme: clean(st.theme) || 'Autres demandes', nb: its.reduce((s, u) => s + u.n, 0), exemples: its.slice(0, 5).map(u => u.texte) };
                }).filter(st => st.nb > 0);
                const reste = us.filter(u => !top.includes(u) || !seen.has(top.indexOf(u) + 1));
                if (reste.length) res.push({ theme: 'Autres demandes', nb: reste.reduce((s, u) => s + u.n, 0), exemples: reste.slice(0, 5).map(u => u.texte) });
            } catch (e) { console.warn('[ENTRETIENS] sous-thèmes', c.key, e.message); }
        }
        if (!res) res = us.slice(0, 12).map(u => ({ theme: u.texte, nb: u.n, exemples: [u.texte] }));
        progress({ done: ++cd });
        return res.sort((a, b) => b.nb - a.nb);
    });

    // ─── Comptes (recalculés ici : l'IA ne fait que classer) ───
    const catOfText = new Map(U.map(u => [norm(u.texte), u.cat]));
    const stats = new Map(cats.map(c => [c.key, { nb: 0, types: { obligatoires: 0, metiers: 0, parcours: 0 }, dirs: {} }]));
    for (const d of demandes) {
        const st = stats.get(catOfText.get(norm(d.texte)) || 'autres');
        st.nb++; st.types[d.type]++; st.dirs[d.direction] = (st.dirs[d.direction] || 0) + 1;
    }
    const themes = catsUsed.map((c, i) => {
        const st = stats.get(c.key);
        return {
            key: c.key, theme: c.label, description: c.full, nb: st.nb, types: st.types,
            directions: Object.entries(st.dirs).sort((a, b) => b[1] - a[1]).map(([direction, nb]) => ({ direction, nb })),
            sous_themes: subs[i], exemples: subs[i].slice(0, 4).map(s => s.theme),
        };
    }).filter(t => t.nb > 0).sort((a, b) => b.nb - a.nb);

    // ─── Synthèse ───
    progress({ phase: 'synthese', label: 'Rédaction de la synthèse pour la DRH', done: 0, total: 1 });
    let synthese = '';
    try {
        const repartition = themes.map(t => `- ${t.theme} : ${t.nb} demande(s) (obligatoires ${t.types.obligatoires}, métiers ${t.types.metiers}, parcours ${t.types.parcours}) ; sujets : ${t.sous_themes.slice(0, 4).map(s => s.theme).join(', ')} ; directions les plus concernées : ${t.directions.slice(0, 3).map(d => d.direction).join(', ') || '—'}`).join('\n');
        synthese = clean(await apm.queryAi(P.render('formations.synthese', { repartition }), model, { max_tokens: 900, temperature: 0.3 }));
    } catch (e) { synthese = ''; }
    progress({ done: 1 });
    return {
        campaign_id: campaignId, generated_at: new Date().toISOString(), duration_ms: Date.now() - t0, model,
        nb_demandes: demandes.length, nb_analysees: demandes.length, nb_formulations: U.length, themes, synthese,
        simulation: !!demandes.some(d => d.simule),
    };
}

/** Lance l'analyse en tâche de fond (une seule à la fois) ; l'état porte la progression (phase, lots faits / total, journal). */
function startAnalysis(campaignId) {
    if (running && running.status === 'en_cours') return running;
    running = { status: 'en_cours', campaign_id: campaignId, started_at: Date.now(), phase: 'preparation', label: 'Préparation des demandes', done: 0, total: 0, log: [] };
    const cur = running;
    const progress = (p) => {
        if (p.phase && p.phase !== cur.phase) cur.log.push({ at: Date.now(), phase: cur.phase, label: cur.label, ms: Date.now() - (cur.phase_at || cur.started_at) });
        if (p.phase && p.phase !== cur.phase) cur.phase_at = Date.now();
        Object.assign(cur, p);
    };
    runAnalysis(campaignId, undefined, progress)
        .then(async (res) => { await svc.setSetting(SETTING, JSON.stringify(res)); cur.status = 'termine'; cur.phase = 'termine'; cur.finished_at = Date.now(); })
        .catch((e) => { console.error('[ENTRETIENS] analyse des formations:', e.message); cur.status = 'echec'; cur.error = e.message; cur.finished_at = Date.now(); });
    return cur;
}

const state = () => (running ? {
    status: running.status, campaign_id: running.campaign_id, started_at: running.started_at, finished_at: running.finished_at || null, error: running.error || null,
    phase: running.phase, label: running.label, done: running.done, total: running.total, model: running.model || null,
    log: (running.log || []).map(l => ({ phase: l.phase, label: l.label, ms: l.ms })),
} : null);

module.exports = { parseJson, TYPES, listDemandes, grouper, lastAnalysis, startAnalysis, state, runAnalysis };
