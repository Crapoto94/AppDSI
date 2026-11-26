/**
 * Identification des pages d'un CREP numérisé SANS QR code (option de campagne désactivée, QR illisible, CREP imprimé avant son activation) :
 *   1. l'IA (vision) lit, pour chaque page, le titre imprimé et le nom de l'agent s'il y figure ;
 *   2. le titre donne le numéro de page (les modèles de CREP ont des titres fixes) : les pages sont ainsi remises dans l'ordre ;
 *   3. les pages sont regroupées en CREP dans l'ordre du fichier (une page 1 ouvre un nouveau CREP) ;
 *   4. le nom lu est rapproché des agents de la campagne : agent proposé, taux de certitude et autres candidats.
 * Tout est une PROPOSITION : l'administrateur vérifie et peut affecter le CREP à un autre agent avant de valider.
 */
const { pgDb } = require('../../shared/database');
const prompts = require('./prompts');

const EXPECTED_PAGES = 4;
const READ_WIDTH_PX = 1700;
const MIN_ASSIGN_CONFIDENCE = 0.45;   // en dessous : l'agent n'est pas affecté, seulement suggéré

const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (t) => fold(t).split(' ').filter(w => w.length > 1);

/** Numéro de page d'un CREP d'après le titre imprimé (null si le titre n'est pas reconnu). */
function pageFromTitle(titre) {
    const t = fold(titre);
    if (!t) return null;
    if (/perspectives d evolution|evolution en termes|observations de l agent|visa de l autorite/.test(t)) return 4;
    if (/volet 2|echanges sur les perspectives|perspectives de l annee a venir|objectifs individuels de travail de l annee a venir/.test(t)) return 3;
    if (/appreciation de la valeur|bilan de l annee ecoulee/.test(t)) return 2;
    if (/compte rendu d entretien professionnel|entretien professionnel/.test(t)) return 1;
    return null;
}

function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}
const tokenSim = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length);

/** Ressemblance d'un nom lu avec un nom d'agent, de 0 à 1 (jetons comparés avec tolérance aux fautes de lecture, quel que soit l'ordre nom / prénom). */
function nameScore(read, candidate) {
    const R = tokens(read), C = tokens(candidate);
    if (!R.length || !C.length) return 0;
    let sum = 0;
    const used = new Set();
    for (const r of R) {
        let best = 0, bi = -1;
        C.forEach((c, i) => { if (used.has(i)) return; const s = tokenSim(r, c); if (s > best) { best = s; bi = i; } });
        if (bi >= 0 && best >= 0.6) { used.add(bi); sum += best; }
    }
    return sum / Math.max(R.length, C.length);
}

/** Meilleurs agents pour un nom lu, avec une certitude tenant compte de l'écart avec le second (deux agents proches = moins de certitude). */
function rank(read, agents) {
    const scored = agents.map(a => ({ id: a.id, name: a.name, score: nameScore(read, a.name) })).filter(x => x.score > 0.3).sort((a, b) => b.score - a.score);
    if (!scored.length) return { best: null, candidates: [] };
    const s1 = scored[0].score, s2 = scored[1] ? scored[1].score : 0;
    const gap = s1 - s2;
    const confidence = Math.max(0, Math.min(s1, gap >= 0.2 ? s1 : s1 * (0.75 + gap * 1.25)));
    return { best: scored[0], confidence, candidates: scored.slice(0, 3).map(x => ({ id: x.id, name: x.name, score: Math.round(x.score * 100) })) };
}

/** Lit une page avec l'IA : { titre, agent, rot } ; essaie les autres orientations si rien n'est lisible. */
async function readPage(ctx, canvas) {
    const { apm, model, askVision, extractJson, rotated } = ctx;
    for (const deg of [0, 180, 90, 270]) {
        let json = {};
        try {
            const c = rotated(canvas, deg);
            const out = await askVision(apm, model, prompts.get('crep.identification'), c.toBuffer('image/jpeg', 85), 400);
            json = extractJson(String(out)) || {};
        } catch (e) { json = {}; }
        const titre = String(json.titre || '').trim();
        const page = pageFromTitle(titre);
        if (titre && (page || deg === 270)) return { titre, page, agent: String(json.agent || '').trim(), rot: deg };
        if (titre && json.sens_correct !== false && deg === 0) return { titre, page, agent: String(json.agent || '').trim(), rot: 0 };
    }
    return { titre: '', page: null, agent: '', rot: 0 };
}

/**
 * Identifie les pages sans code d'un lot.
 * @param {{ pages: object[], campaignId: number, renderPage: Function, doc: any, deps: object, onProgress?: Function }} p
 * `pages` : entrées du lot ({ idx, code, rot… }) ; celles sans `code` sont lues. Chaque entrée reçoit `read` (lecture brute) et, si un agent est retenu, `auto`.
 */
async function identifyPages({ pages, campaignId, doc, renderPage, deps, onProgress }) {
    const apm = require('../../shared/apm_ai');
    const scan = require('./crep-scan.service');
    await prompts.refresh();
    const model = await scan.pickVisionModel(apm);
    const ctx = { apm, model, askVision: scan.askVision, extractJson: scan.extractJson, rotated: deps.rotated };

    const todo = pages.filter(p => !p.code && !(p.manual && p.manual.id));
    let done = 0;
    for (const p of todo) {
        const canvas = await renderPage(doc, p.idx, READ_WIDTH_PX);
        p.read = await readPage(ctx, canvas);
        if (p.read.rot) p.rot = p.read.rot;
        done++;
        if (onProgress) await onProgress(done, todo.length, pages);
    }

    // 3) regroupement en CREP, dans l'ordre du fichier
    const groups = [];
    let cur = null;
    for (const p of todo) {
        const num = p.read.page;
        if (!cur || num === 1 || (num && cur.nums.has(num))) { cur = { pages: [], nums: new Set() }; groups.push(cur); }
        cur.pages.push(p);
        if (num) cur.nums.add(num);
    }

    // numéros de page : lus d'après le titre ; les pages au titre illisible prennent, dans l'ordre, les numéros qui manquent (si le compte tombe juste)
    for (const g of groups) {
        const missing = [];
        for (let n = 1; n <= EXPECTED_PAGES; n++) if (!g.nums.has(n)) missing.push(n);
        const unknown = g.pages.filter(p => !p.read.page);
        g.pages.forEach(p => { p._num = p.read.page || null; });
        if (unknown.length && unknown.length === missing.length) unknown.forEach((p, i) => { p._num = missing[i]; p._numGuess = true; });
    }

    // 4) rapprochement avec les agents de la campagne
    const rows = campaignId ? await pgDb.all('SELECT id, agent_nom, agent_prenom FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL', [campaignId]) : [];
    const agents = rows.map(r => ({ id: r.id, name: `${r.agent_nom || ''} ${r.agent_prenom || ''}`.trim() }));
    groups.forEach((g, gi) => {
        const names = g.pages.map(p => p.read.agent).filter(Boolean);
        const readName = (g.pages.find(p => p.read.page === 1 && p.read.agent) || {}).read?.agent || names[0] || '';
        const r = readName ? rank(readName, agents) : { best: null, confidence: 0, candidates: [] };
        for (const p of g.pages) {
            delete p.auto; delete p.suggest;
            const info = { group: gi + 1, read_name: readName, candidates: r.candidates, confidence: Math.round((r.confidence || 0) * 100) };
            if (r.best && r.confidence >= MIN_ASSIGN_CONFIDENCE && p._num) p.auto = { id: r.best.id, page: p._num, ...info, page_guess: !!p._numGuess };
            else p.suggest = { ...info, page: p._num || null };
            delete p._num; delete p._numGuess;
        }
    });
    return { read: todo.length, groups: groups.length };
}

module.exports = { identifyPages, pageFromTitle, nameScore, rank, EXPECTED_PAGES };
