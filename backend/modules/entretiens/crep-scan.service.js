/**
 * Numérisation d'un compte rendu papier (PDF scanné ou photo) : lecture de l'écriture manuscrite par l'IA INTERNE, puis proposition de
 * contenu pour le formulaire — que l'évaluateur relit et corrige avant de l'appliquer (rien n'est enregistré ici).
 *
 * Chaîne de lecture :
 *  1. rendu des pages en images (pdfjs-dist + @napi-rs/canvas pour un PDF ; l'image telle quelle sinon) ;
 *  2. transcription : modèle de vision local (Ollama : llava, qwen-vl, minicpm-v, llama3.2-vision…) s'il y en a un ; à défaut OCR
 *     tesseract (reconnaissance imprimée : mauvaise sur le manuscrit, d'où l'étape suivante de remise en forme) ;
 *  3. structuration : l'IA interne (API IA Ville, sinon Ollama) range le texte lu dans les rubriques du compte rendu.
 * Les données RH ne quittent jamais le réseau de la Ville.
 */
const path = require('path');
const axios = require('axios');
const { normalizeCrep } = require('./crep.definition');

const MAX_PAGES = 6;
const SCALE = 2.2; // ~160 dpi : lisible pour un modèle de vision, sans images énormes

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise || (pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')));

/** Pages du document en PNG (Buffer). */
async function renderPages(buffer, mimetype) {
    if (/^image\//i.test(mimetype || '')) return [buffer];
    const pdfjs = await loadPdfjs();
    const { createCanvas } = require('@napi-rs/canvas');
    const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
    const out = [];
    try {
        for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: SCALE });
            const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            out.push(canvas.toBuffer('image/png'));
        }
    } finally { try { await doc.destroy(); } catch { /* ignore */ } }
    return out;
}

// ─── Ollama (vision + texte) ─────────────────────────────────────────────────
async function ollama() {
    const ai = require('./ai.service');
    const host = await ai.ollamaHost();
    let names = [];
    try { names = ((await axios.get(`${host}/api/tags`, { timeout: 6000 })).data?.models || []).map(m => m.name).filter(Boolean); } catch { /* injoignable */ }
    return { host, names, visionModel: names.find(n => /vision|llava|minicpm-v|qwen[0-9.]*-?vl|moondream|granite3\.2-vision|gemma3/i.test(n)) || null };
}

const TRANSCRIBE_PROMPT = 'Tu lis la photo d’un compte rendu d’entretien professionnel (formulaire imprimé, rempli à la main). '
    + 'Transcris fidèlement TOUT le texte manuscrit et imprimé de cette page, dans l’ordre, en français, en conservant les intitulés des rubriques. '
    + 'N’invente rien ; si un mot est illisible, écris [illisible]. Réponds uniquement par la transcription.';

async function transcribeWithVision(o, pages, log) {
    const texts = [];
    for (let i = 0; i < pages.length; i++) {
        const r = await axios.post(`${o.host}/api/chat`, {
            model: o.visionModel, stream: false, options: { temperature: 0.1, num_predict: 3000 },
            messages: [{ role: 'user', content: TRANSCRIBE_PROMPT, images: [pages[i].toString('base64')] }],
        }, { timeout: 300000 });
        texts.push(`--- Page ${i + 1} ---\n${String(r.data?.message?.content || '').trim()}`);
        log(`page ${i + 1}/${pages.length} lue`);
    }
    return texts.join('\n\n');
}

async function transcribeWithTesseract(pages, log) {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('fra', undefined, process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH } : {});
    const texts = [];
    try {
        for (let i = 0; i < pages.length; i++) {
            const { data } = await worker.recognize(pages[i]);
            texts.push(`--- Page ${i + 1} ---\n${(data && data.text || '').trim()}`);
            log(`OCR page ${i + 1}/${pages.length}`);
        }
    } finally { await worker.terminate(); }
    return texts.join('\n\n');
}

// ─── Structuration par l'IA interne ──────────────────────────────────────────
const SCHEMA = `{
  "missions": "",
  "objectifs_ecoules": [{"objectif": "", "observations": "", "niveau": "A, PA, NA ou vide"}],
  "observations_complementaires": "",
  "appreciation_generale": "",
  "objectifs_service": "",
  "objectifs_futurs": [{"descriptif": "", "moyens": ""}],
  "formations": {"obligatoires": "", "metiers": "", "parcours": ""},
  "evolution": "",
  "mobilite": "",
  "obs_agent_conditions": "",
  "obs_agent_entretien": "",
  "visa_autorite": "",
  "date_convocation": "AAAA-MM-JJ ou vide",
  "date_entretien": "AAAA-MM-JJ ou vide",
  "date_notification": "AAAA-MM-JJ ou vide"
}`;

function structurePrompt(raw) {
    return 'Voici le texte lu sur un compte rendu d’entretien professionnel (écriture manuscrite, donc possibles erreurs de lecture). '
        + 'Range-le dans les rubriques du compte rendu et réponds UNIQUEMENT par un objet JSON valide de cette forme (rubrique absente = chaîne vide, '
        + 'au plus 4 objectifs) :\n' + SCHEMA + '\n\nRègles : ne rien inventer ; corriger seulement les fautes de lecture évidentes ; garder le sens et le vocabulaire de l’auteur.\n\n'
        + 'TEXTE LU :\n' + raw.slice(0, 12000);
}

function extractJson(out) {
    const t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Réponse de l’IA illisible.');
    return JSON.parse(t.slice(a, b + 1));
}

async function structure(raw, o) {
    const ai = require('./ai.service');
    const prompt = structurePrompt(raw);
    try {
        const apm = require('../../shared/apm_ai');
        const model = await ai.pickApmModel(apm);
        return { json: extractJson(await apm.queryAi(prompt, model)), model: `${model} (API Ville)` };
    } catch (e) {
        if (!o.names.length) throw new Error(`IA indisponible (${e.message}).`);
        const model = o.names.find(n => /mistral/i.test(n)) || o.names.find(n => /llama|qwen|gemma/i.test(n)) || o.names[0];
        const r = await axios.post(`${o.host}/api/generate`, { model, prompt, stream: false, format: 'json', options: { temperature: 0.1, num_predict: 3500, num_ctx: 12288 } }, { timeout: 300000 });
        return { json: extractJson(r.data?.response), model: `${model} (Ollama)` };
    }
}

// ─── API IA Ville : modèle multimodal (lecture du manuscrit + structuration en un seul appel) ──────────
const VISION_RE = /omni|vision|vl|llava|minicpm-v/i;

async function pickVisionModel(apm) {
    const ai = require('./ai.service');
    const svc = require('./entretiens.service');
    const configured = String(await svc.getSetting('ai_vision_model')).trim();
    if (configured) return configured;
    const models = await apm.listModels();
    const name = models.find(m => /omni/i.test(m)) || models.find(m => VISION_RE.test(m));
    if (!name) throw new Error('Aucun modèle multimodal sur l’API IA Ville (réglage « ai_vision_model » du module pour en désigner un).');
    void ai;
    return name;
}

function visionPrompt() {
    const schema = SCHEMA.replace('{', '{"transcription": "texte complet lu, page par page", ');
    return 'Tu lis un compte rendu d’entretien professionnel (formulaire imprimé, rempli à la main) fourni en image. '
        + 'Lis TOUT le texte manuscrit et imprimé, puis réponds UNIQUEMENT par un objet JSON valide de cette forme (rubrique absente = chaîne vide, au plus 4 objectifs) :\n'
        + schema
        + '\n\nRègles : ne rien inventer ; [illisible] pour un mot illisible ; corriger seulement les fautes de lecture évidentes ; garder le sens et le vocabulaire de l’auteur ; '
        + 'ne pas déduire les cases cochées de la grille d’appréciation.';
}

/** Lecture directe par un modèle multimodal de l'API Ville (fournisseurs internes uniquement : ce sont des données RH). */
async function readWithApmVision(buffer, mimetype, name) {
    const apm = require('../../shared/apm_ai');
    const model = await pickVisionModel(apm);
    const out = await apm.queryAi(visionPrompt(), model, {
        attachments: [{ name: name || 'compte-rendu', data: buffer.toString('base64') }],
        pdf_mode: 'complet', max_tokens: 6000, temperature: 0.1, providers: ['ollama', 'vllm'],
    });
    const json = extractJson(out);
    const raw = String(json.transcription || '').trim();
    delete json.transcription;
    void mimetype;
    return { json, raw, model: `${model} (API Ville, vision)` };
}

/**
 * @returns {{ raw: string, fields: object, engine: { lecture: string, structuration: string }, warnings: string[] }}
 */
async function scanToProposal(buffer, mimetype, definition) {
    const warnings = [];
    const log = (m) => console.log('[ENTRETIENS] scan CREP :', m);

    // 1) API IA Ville, modèle multimodal : lit le manuscrit et range le contenu en un seul appel.
    try {
        const v = await readWithApmVision(buffer, mimetype);
        const fields = normalizeCrep(v.json, definition);
        warnings.push('Les cases cochées de la grille d’appréciation ne sont pas reconnues : à renseigner dans le formulaire.');
        return { raw: v.raw || '(transcription non fournie par le modèle)', fields, engine: { lecture: v.model, structuration: v.model }, warnings };
    } catch (e) {
        log(`API Ville (vision) indisponible : ${e.message}`);
        warnings.push(`Lecture par le modèle multimodal de l’API Ville impossible (${e.message}) : lecture locale utilisée.`);
    }

    // 2) Repli : lecture locale (vision Ollama, sinon OCR) puis structuration par l'IA interne.
    const pages = await renderPages(buffer, mimetype);
    if (!pages.length) throw new Error('Aucune page lisible dans ce document.');

    const o = await ollama();
    let raw = '', lecture = '';
    if (o.visionModel) {
        try { raw = await transcribeWithVision(o, pages, log); lecture = `${o.visionModel} (vision, Ollama)`; }
        catch (e) { warnings.push(`Lecture par le modèle de vision impossible (${e.message}) : OCR classique utilisé.`); }
    } else {
        warnings.push('Aucun modèle de vision n’est installé sur le serveur d’IA locale : lecture par OCR classique, peu fiable sur l’écriture manuscrite. Relisez attentivement.');
    }
    if (!raw) { raw = await transcribeWithTesseract(pages, log); lecture = 'OCR tesseract'; }
    if (!raw.replace(/--- Page \d+ ---/g, '').trim()) throw new Error('Aucun texte n’a pu être lu sur ce document.');

    let fields = {}, structuration = '';
    try {
        const s = await structure(raw, o);
        // Sanitisation : seules les rubriques connues et valides sont conservées (le modèle de CREP de l'agent fixe la grille).
        fields = normalizeCrep(s.json, definition);
        structuration = s.model;
    } catch (e) { warnings.push(`Mise en forme par l’IA impossible (${e.message}) : le texte lu est fourni brut.`); }
    warnings.push('Les cases cochées de la grille d’appréciation ne sont pas reconnues : à renseigner dans le formulaire.');
    return { raw, fields, engine: { lecture, structuration }, warnings };
}

// ─── Lecture multi-pages (photos / scans), cases cochées comprises ───────────────────────────────────────────
const { createCanvas, loadImage } = require('../../shared/lazy').lazy('@napi-rs/canvas');
const crepGrid = require('./crep-grid.service');

const PAGE_PX = 2600;          // plus grand côté envoyé au modèle (assez fin pour le manuscrit, sans images énormes)

/** Page (image décodée) → canvas pivoté de `deg` (0/90/180/270), plus grand côté ≤ maxSide. */
function rotated(img, deg, maxSide) {
    const swap = deg === 90 || deg === 270;
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
    const c = createCanvas(swap ? dh : dw, swap ? dw : dh);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    return c;
}
const jpeg = (canvas, q = 88) => canvas.toBuffer('image/jpeg', q);

async function askVision(apm, model, prompt, buf, maxTokens = 6000) {
    return apm.queryAi(prompt, model, {
        attachments: [{ name: 'page.jpg', data: buf.toString('base64') }],
        max_tokens: maxTokens, temperature: 0.1, providers: ['ollama', 'vllm'],
    });
}

/** Critères du modèle, à plat et dans l'ordre du formulaire. */
const flatCriteria = (definition) => require('./crep.definition').groupsOf(definition).flatMap(g => g.items);

function gridPrompt(items) {
    return 'Cette photo montre la grille d’appréciation d’un compte rendu d’entretien. Chaque ligne a trois cases à cocher, de gauche à droite : colonne 1 = « satisfaisant / conforme » (S), '
        + 'colonne 2 = « assez satisfaisant / partiellement conforme » (AS), colonne 3 = « insuffisant / non conforme » (I). Une case cochée contient un trait, une croix ou est noircie ; une case vide est un carré blanc. '
        + 'Pour CHAQUE ligne visible ci-dessous, indique la colonne cochée d’après la position horizontale de la marque. Réponds UNIQUEMENT par un JSON {"1":"S","2":"AS",...} (valeurs S, AS, I, ou "" si aucune case cochée ou ligne non visible).\nLignes :\n'
        + items.map((it, i) => `${i + 1}. ${it.label}`).join('\n');
}

const parseObj = (out) => { try { const a = out.indexOf('{'), b = out.lastIndexOf('}'); return JSON.parse(out.slice(a, b + 1)); } catch { return null; } };

/** Fusionne la lecture d'une page dans le compte rendu global : une rubrique déjà trouvée n'est pas écrasée par une rubrique vide. */
function mergeCrep(acc, page) {
    const out = { ...acc };
    for (const [k, v] of Object.entries(page)) {
        if (k === 'valeur') out.valeur = { ...(out.valeur || {}), ...v };
        else if (k === 'objectifs_ecoules' || k === 'objectifs_futurs') {
            out[k] = (out[k] || []).map((cur, i) => { const n = (v || [])[i] || {}; return Object.values(cur).some(x => String(x || '').trim()) ? cur : n; });
        } else if (k === 'formations') {
            out.formations = { ...(out.formations || {}) };
            for (const [fk, fv] of Object.entries(v || {})) if (!String(out.formations[fk] || '').trim() && String(fv || '').trim()) out.formations[fk] = fv;
        } else if (!String(out[k] || '').trim() && String(v || '').trim()) out[k] = v;
    }
    return out;
}

/**
 * Sens de lecture d'une page par l'ORDRE des intitulés imprimés : le modèle lit le texte dans tous les sens, mais à l'envers il le restitue
 * de bas en haut. On transcrit la page dans chaque sens candidat et on garde celui où les intitulés connus du formulaire apparaissent
 * dans l'ordre du document. Sans intitulé reconnu (formulaire inconnu), on garde le sens par défaut.
 */
const FORM_MARKERS = ['compte rendu d entretien', 'volet 1', 'observations complementaires', 'appreciation de la valeur', 'appreciation generale', 'volet 2',
    'objectifs individuels', 'actions de formation', 'perspectives d evolution', 'evolution des missions', 'mobilite', 'conditions de travail',
    'observations de l agent sur l entretien', 'voies de recours'];
const flat = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
function orderScore(text) {
    const t = flat(text);
    const pos = FORM_MARKERS.map(m => t.indexOf(m)).map((p, i) => ({ p, i })).filter(x => x.p >= 0);
    if (pos.length < 2) return { score: 0, n: pos.length };
    let up = 0, down = 0;
    for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) { if (pos[b].p > pos[a].p) up++; else down++; }
    return { score: (up - down) / (up + down), n: pos.length };
}
async function pickRotation(apm, model, img, candidates) {
    let best = { deg: candidates[0], score: -2, text: '' };
    for (const d of candidates) {
        let out = '';
        try { out = await askVision(apm, model, 'Transcris tous les titres et intitulés IMPRIMÉS de cette page, dans l’ordre où tu les lis, du haut vers le bas. Ne transcris pas le manuscrit.', jpeg(rotated(img, d, 1400), 82), 900); } catch { continue; }
        const r = orderScore(out);
        if (r.n >= 2 && r.score > best.score) best = { deg: d, score: r.score, text: out };
        if (!best.text) best.text = out;
        if (r.n >= 3 && r.score >= 0.99) return { deg: d, text: out };
    }
    return { deg: best.deg, text: best.text };
}

// ─── Prompts par type de page (lecture ciblée du manuscrit) ────────────────────────────────────────────────
const prompts = require('./prompts');
const reglesManuscrit = () => prompts.render('crep.regles', { glossaire: prompts.get('crep.glossaire') });

/** Document d'origine NUMÉRIQUE (compte rendu déjà saisi et validé dans l'outil, imprimé puis signé) : seuls les 2 commentaires de l'agent sont lus. */
function agentPrompt() {
    return prompts.render('crep.agent', { regles: reglesManuscrit() });
}

function pageType(printedText) {
    const t = flat(printedText);
    if (/perspectives d evolution|voies de recours|conditions de travail|evolution des missions/.test(t)) return 'perspectives';
    if (/volet 2|objectifs individuels|actions de formation/.test(t)) return 'volet2';
    if (/appreciation de la valeur|appreciation generale|sens du service public|satisfaisant/.test(t)) return 'grille';
    if (/volet 1|rappel des objectifs|compte rendu d entretien|rappel des missions/.test(t)) return 'volet1';
    return 'generique';
}

function pagePrompt(type, annee) {
    if (['volet1', 'grille', 'volet2', 'perspectives'].includes(type)) {
        return prompts.render('crep.page.' + type, { annee: annee || 'l’année en cours', regles: reglesManuscrit() });
    }
    return visionPrompt();
}

/** Une correction de lecture remplace un mot MAL LU par un mot proche : même nombre de mots et forte ressemblance de graphie. Pas de reformulation. */
function plausibleFix(avant, apres) {
    const A = flat(avant).trim().split(' '), Bw = flat(apres).trim().split(' ');
    if (A.join(' ') === Bw.join(' ')) return false;               // simple accent / casse : sans intérêt
    if (A.length !== Bw.length) return false;                      // mots ajoutés ou retirés : reformulation
    const sim = (a, b) => {
        const la = a.length, lb = b.length;
        const d = Array.from({ length: la + 1 }, (_, i) => [i, ...Array(lb).fill(0)]);
        for (let j = 1; j <= lb; j++) d[0][j] = j;
        for (let i = 1; i <= la; i++) for (let j = 1; j <= lb; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return 1 - d[la][lb] / Math.max(la, lb, 1);
    };
    // chaque mot modifié doit ressembler à l'original (graphie proche) : c'est une erreur de lecture, pas un remplacement de mot
    return A.every((w, i) => w === Bw[i] || sim(w, Bw[i]) >= 0.6);
}

/** Seconde passe : cohérence. L'IA locale relit l'ensemble avec le contexte et propose de corriger les mots manifestement mal lus. */
async function coherencePass(apm, crep, contexte, log) {
    const model = await require('./ai.service').pickApmModel(apm);
    const champs = {
        missions: crep.missions, observations_complementaires: crep.observations_complementaires, appreciation_generale: crep.appreciation_generale,
        objectifs_ecoules: (crep.objectifs_ecoules || []).map(o => ({ objectif: o.objectif, observations: o.observations })),
        objectifs_futurs: crep.objectifs_futurs, formations: crep.formations, evolution: crep.evolution, mobilite: crep.mobilite,
        obs_agent_conditions: crep.obs_agent_conditions, obs_agent_entretien: crep.obs_agent_entretien,
    };
    const prompt = prompts.render('crep.coherence', { glossaire: prompts.get('crep.glossaire'), contexte: JSON.stringify(contexte), transcription: JSON.stringify(champs) });
    const out = await apm.queryAi(prompt, model, { max_tokens: 1500, temperature: 0.1 });
    const j = parseObj(String(out)) || {};
    const list = (Array.isArray(j.corrections) ? j.corrections : []).filter(c => c && typeof c.avant === 'string' && typeof c.apres === 'string' && c.avant.trim() && c.avant !== c.apres && plausibleFix(c.avant, c.apres));
    const applied = [];
    const replaceIn = (v, c) => (typeof v === 'string' && v.includes(c.avant) ? v.replace(c.avant, c.apres) : v);
    for (const c of list) {
        let done = false;
        const touch = (obj, key) => { const n = replaceIn(obj[key], c); if (n !== obj[key]) { obj[key] = n; done = true; } };
        for (const k of ['missions', 'observations_complementaires', 'appreciation_generale', 'evolution', 'mobilite', 'obs_agent_conditions', 'obs_agent_entretien']) touch(crep, k);
        for (const o of crep.objectifs_ecoules || []) { touch(o, 'objectif'); touch(o, 'observations'); }
        for (const o of crep.objectifs_futurs || []) { touch(o, 'descriptif'); touch(o, 'moyens'); }
        for (const k of Object.keys(crep.formations || {})) touch(crep.formations, k);
        if (done) applied.push({ avant: c.avant, apres: c.apres, raison: String(c.raison || '').slice(0, 120) });
    }
    log(`cohérence : ${applied.length} correction(s) appliquée(s) sur ${list.length} proposée(s)`);
    return { applied, model };
}

/** Champs (feuilles) lus différemment entre deux lectures d'une même page. */
const LEAF_LABELS = { missions: 'Missions', observations_complementaires: 'Observations complémentaires', appreciation_generale: 'Appréciation générale', evolution: 'Évolution', mobilite: 'Mobilité',
    obs_agent_conditions: 'Observations de l’agent (conditions de travail)', obs_agent_entretien: 'Observations de l’agent (entretien)', objectifs_service: 'Objectifs du service' };
function diffLeaves(a, b) {
    const out = [];
    const cmp = (label, x, y) => { if (flat(x).trim() !== flat(y).trim() && (String(x || '').trim() || String(y || '').trim())) out.push({ champ: label, valeurs: [String(x || '').trim(), String(y || '').trim()] }); };
    for (const [k, l] of Object.entries(LEAF_LABELS)) cmp(l, a[k], b[k]);
    (a.objectifs_ecoules || []).forEach((o, i) => { const q = (b.objectifs_ecoules || [])[i] || {}; cmp(`Objectif ${i + 1} (bilan) – observations`, o.observations, q.observations); cmp(`Objectif ${i + 1} (bilan) – niveau`, o.niveau, q.niveau); });
    (a.objectifs_futurs || []).forEach((o, i) => { const q = (b.objectifs_futurs || [])[i] || {}; cmp(`Objectif ${i + 1} (à venir) – descriptif`, o.descriptif, q.descriptif); cmp(`Objectif ${i + 1} (à venir) – moyens et échéances`, o.moyens, q.moyens); });
    for (const k of ['obligatoires', 'metiers', 'parcours']) cmp(`Formations (${k})`, (a.formations || {})[k], (b.formations || {})[k]);
    return out;
}

/** Nombre de rubriques renseignées (sert à départager deux sens de lecture d'une même page). */
function filledCount(c) {
    let n = 0;
    for (const [k, v] of Object.entries(c)) {
        if (k === 'valeur') continue;
        if (typeof v === 'string') { if (v.trim()) n++; }
        else if (Array.isArray(v)) n += v.filter(o => Object.values(o).some(x => String(x || '').trim())).length;
        else if (v && typeof v === 'object') n += Object.values(v).filter(x => String(x || '').trim()).length;
    }
    return n;
}

/**
 * Lit un compte rendu composé d'une ou plusieurs pages (photos JPEG/PNG ou PDF) :
 *  - redresse chaque page, lit le manuscrit page par page (modèle multimodal de l'API Ville) et fusionne ;
 *  - lit les cases cochées de la grille par traitement d'image (fiable), l'IA ne servant que de repli.
 * @param {Array<{buffer: Buffer, mimetype: string, name?: string}>} files
 */
/** Lecture des cases d'une page dans un thread séparé (n'occupe pas le serveur). Renvoie { deg, rows, note } ou null. */
function readGridInWorker(buf, degs, nExpected) {
    return new Promise((resolve) => {
        try {
            const { Worker } = require('worker_threads');
            const w = new Worker(require('path').join(__dirname, 'crep-grid.worker.js'), { workerData: { buf, degs, nExpected } });
            let done = false;
            const end = (v) => { if (!done) { done = true; resolve(v); } };
            w.on('message', (m) => end(m && m.ok ? m : null));
            w.on('error', () => end(null));
            w.on('exit', () => end(null));
            setTimeout(() => { try { w.terminate(); } catch { /* ignore */ } end(null); }, 120000);
        } catch { resolve(null); }
    });
}

/** Exécute des tâches avec au plus `n` en parallèle (le serveur d'IA regroupe les requêtes simultanées : le débit total augmente). */
async function pool(tasks, n) {
    const out = new Array(tasks.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
        while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
    }));
    return out;
}

const PAGES_EN_PARALLELE = 4;

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'ou', 'a', 'au', 'aux', 'en', 'd', 'l', 'un', 'une', 'son', 'sa', 'ses', 'dans', 'pour', 'sur', 'par']);
const stem = (w) => w.replace(/(ement|ations?|ation|ites?|ite|eurs?|eur|ions?|ion|ees?|ee|es|s|x)$/, '').slice(0, 7);
const words = (t) => new Set(flat(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(stem));
/** Ressemblance de deux libellés de critères : part de mots (racines) communs, rapportée au plus court. */
function labelSim(a, b) {
    const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
    let c = 0; for (const w of A) if (B.has(w)) c++;
    return c / Math.min(A.size, B.size);
}

async function scanDocuments(files, definition, opts = {}) {
    await prompts.refresh();
    const warnings = [];
    const log = (m) => console.log('[ENTRETIENS] scan CREP :', m);
    const apm = require('../../shared/apm_ai');
    const model = await pickVisionModel(apm);
    const mode = opts.mode === 'agent' ? 'agent' : 'complet';
    const items = mode === 'agent' ? [] : flatCriteria(definition);

    // 1) Pages décodées (octets conservés pour le thread de lecture des cases)
    const pageBufs = [];
    for (const f of files) {
        if (/pdf/i.test(f.mimetype || '') || f.buffer.slice(0, 5).toString('latin1') === '%PDF-') {
            for (const png of await renderPages(f.buffer, 'application/pdf')) pageBufs.push(png);
        } else pageBufs.push(f.buffer);
    }
    if (!pageBufs.length) throw new Error('Aucune page lisible dans ce document.');
    if (pageBufs.length > 8) throw new Error('8 pages maximum.');
    const pages = [];
    for (const b of pageBufs) pages.push(await loadImage(b));
    const total = pages.length;
    let done = 0;
    const tick = () => { done++; if (opts.onProgress) { try { opts.onProgress(done, total + 1); } catch { /* ignore */ } } };

    // 2) Chaque page : cases cochées (thread) + sens de lecture + type + lecture ciblée ×2 — les pages sont traitées en parallèle
    const pageTasks = pages.map((img, i) => async () => {
        const res = { i, crep: normalizeCrep({}, definition), raw: '', doubts: [], grid: null, deg: 0, type: 'generique', warns: [] };
        const landscape = img.width > img.height * 1.1;
        let deg = landscape ? 90 : 0;
        const gridP = items.length ? readGridInWorker(pageBufs[i], landscape ? [90, 270, 0, 180] : [0, 180, 90, 270], items.length) : Promise.resolve(null);
        // sens de lecture par l'IA : les deux sens candidats sont testés en même temps
        const cands = landscape ? [90, 270] : [0, 180];
        const g = await gridP;
        let printed = '';
        if (g && g.mismatch) {
            deg = g.deg; res.gridMismatch = g.found; res.gridRowsOther = g.rows;
            log(`page ${i + 1} : tableau détecté (${g.found} lignes, ${items.length} attendues), rotation ${g.deg}°`);
        } else if (g) { res.grid = g.rows; deg = g.deg; log(`page ${i + 1} : grille lue, rotation ${g.deg}° (${g.note})`); }
        else {
            const pr = await pickRotation(apm, model, img, cands);
            deg = pr.deg; printed = pr.text;
        }
        if (!printed) { try { printed = await askVision(apm, model, 'Transcris tous les titres et intitulés IMPRIMÉS de cette page, du haut vers le bas. Ne transcris pas le manuscrit.', jpeg(rotated(img, deg, 1400), 82), 900); } catch { /* type générique */ } }
        res.deg = deg; res.type = pageType(printed);
        log(`page ${i + 1} : sens de lecture ${deg}°, type « ${res.type} »`);
        if (mode === 'agent' && res.type !== 'perspectives') { res.skipped = true; tick(); return res; }
        try {
            const prompt = mode === 'agent' ? agentPrompt() : pagePrompt(res.type, opts.annee);
            const [a, b] = await Promise.all([
                askVision(apm, model, prompt, jpeg(rotated(img, deg, PAGE_PX), 90)),
                res.type !== 'generique' ? askVision(apm, model, prompt, jpeg(rotated(img, deg, 3300), 92)).catch(() => null) : Promise.resolve(null),
            ]);
            const j = extractJson(a);
            const t = String(j.transcription || '').trim(); delete j.transcription;
            if (res.type === 'perspectives') {
                try {
                    const sj = extractJson(await askVision(apm, model, prompts.get('crep.signatures'), jpeg(rotated(img, deg, 2000), 88), 300));
                    res.signatures = { agent: sj.agent_signe === true, evaluateur: sj.evaluateur_signe === true };
                } catch { /* détection facultative : le valideur vérifie de toute façon */ }
            }
            if (j.agent_identite) { res.identite = String(j.agent_identite).replace(/\s+/g, ' ').trim(); }
            delete j.agent_identite;
            res.raw = `--- Page ${i + 1} (${res.type}) ---\n${t || JSON.stringify(j)}`;
            res.crep = normalizeCrep(j, definition);
            if (b) { try { const j2 = extractJson(b); delete j2.transcription; for (const d of diffLeaves(res.crep, normalizeCrep(j2, definition))) res.doubts.push({ page: i + 1, ...d }); } catch { /* seconde lecture facultative */ } }
        } catch (e) { res.warns.push(`Page ${i + 1} : lecture du manuscrit impossible (${e.message}).`); }
        tick();
        return res;
    });
    const results = await pool(pageTasks, PAGES_EN_PARALLELE);

    // 3) Fusion dans l'ordre des pages
    let crep = normalizeCrep({}, definition);
    const raws = [], doubts = [];
    let gridRows = null;
    let gridMismatch = 0, gridRowsOther = null;
    for (const r of results) {
        if (r.gridMismatch) { gridMismatch = r.gridMismatch; gridRowsOther = r.gridRowsOther; }
        crep = mergeCrep(crep, r.crep);
        if (r.raw) raws.push(r.raw);
        doubts.push(...r.doubts); warnings.push(...r.warns);
        if (!gridRows && r.grid) gridRows = r.grid;
    }

    // 4) Cases cochées : résultat final (repli sur l'IA, une réponse par critère, si le tableau n'a pas pu être détecté)
    let grille = '';
    if (gridRows) {
        gridRows.forEach((r, idx) => { if (r.level) crep.valeur[items[idx].key] = r.level; });
        const doubt = gridRows.map((r, idx) => (r.certain ? null : items[idx].label)).filter(Boolean);
        grille = `grille lue par traitement d’image (${gridRows.filter(r => r.level).length}/${items.length} cases cochées reconnues)`;
        if (doubt.length) warnings.push(`Cases cochées à vérifier : ${doubt.join(' ; ')}.`);
    } else if (items.length && gridMismatch) {
        let autres = '', repris = 0;
        try {
            const tpls = await require('../ep-base/ep-base.service').listTemplates();
            const same = tpls.filter(t => (t.definition?.criteria_groups || []).flatMap(g => g.items || []).length === gridMismatch);
            if (same.length) autres = ` Ce papier correspond au modèle ${same.map(t => `« ${t.name} »`).join(' ou ')}.`;
            // Reprise par correspondance de libellés : chaque ligne du papier est rapprochée du critère le plus proche du modèle de l'agent
            const paperItems = same.length ? flatCriteria(same[0].definition) : [];
            if (paperItems.length === gridRowsOther?.length) {
                // Appariement global : les couples les plus ressemblants d'abord, un critère du papier pour un seul critère du modèle
                const pairs = [];
                paperItems.forEach((pi, k) => { if (gridRowsOther[k]?.level) items.forEach((it, idx) => { const sc = labelSim(pi.label, it.label); if (sc >= 0.6) pairs.push({ k, idx, sc }); }); });
                pairs.sort((a, b) => b.sc - a.sc);
                const usedK = new Set(), usedI = new Set(), proche = [];
                for (const q of pairs) {
                    if (usedK.has(q.k) || usedI.has(q.idx)) continue;
                    usedK.add(q.k); usedI.add(q.idx);
                    crep.valeur[items[q.idx].key] = gridRowsOther[q.k].level; proche.push(items[q.idx].label); repris++;
                }
                if (repris) warnings.push(`Cases reprises par correspondance de libellés (${repris} sur ${items.length}) : le papier n’est pas le formulaire de cet agent, vérifiez chacune de ces cases : ${proche.join(' ; ')}.`);
            }
        } catch { /* modèles indisponibles : message générique */ }
        if (!repris) warnings.push(`Le tableau d’appréciation du papier comporte ${gridMismatch} lignes alors que le modèle de CREP de cet agent ${definition?.name ? `(« ${definition.name} ») ` : ''}en compte ${items.length}.${autres} Ce n’est pas le formulaire prévu pour cet agent : les cases cochées n’ont volontairement pas été reprises (risque de décalage). Cochez-les dans le formulaire, ou utilisez le CREP imprimé depuis l’outil pour cet agent.`);
    } else if (items.length) {
        const aiGrid = {};
        await pool(results.filter(r => r.type === 'grille' || r.type === 'generique').map(r => async () => {
            try {
                const j = parseObj(await askVision(apm, model, gridPrompt(items), jpeg(rotated(pages[r.i], r.deg, 2200), 88), 1500));
                if (j) for (const [k, v] of Object.entries(j)) { const idx = Number(k) - 1; if (items[idx] && ['S', 'AS', 'I'].includes(v)) (aiGrid[idx] = aiGrid[idx] || []).push(v); }
            } catch { /* grille absente de cette page */ }
        }), PAGES_EN_PARALLELE);
        // Une grille « lue par l'IA » où toutes les cases ont la même valeur est une invention du modèle : on l'écarte
        const allVotes = Object.values(aiGrid).map(v => v[0]);
        if (allVotes.length >= 8 && new Set(allVotes).size === 1) { for (const k of Object.keys(aiGrid)) delete aiGrid[k]; warnings.push('La grille d’appréciation n’a pas pu être lue de façon fiable : cochez-la dans le formulaire.'); }
        if (Object.keys(aiGrid).length) {
            for (const [idx, votes] of Object.entries(aiGrid)) {
                const tally = votes.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
                crep.valeur[items[idx].key] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
            }
            grille = 'grille lue par l’IA (moins fiable)';
            warnings.push('La grille d’appréciation a été lue par l’IA faute de pouvoir détecter le tableau : vérifiez toutes les cases cochées.');
        } else warnings.push('La grille d’appréciation n’a pas été trouvée sur les pages fournies : cochez-la dans le formulaire (ou ajoutez la page qui la contient).');
    }

    // Identité : le document est-il bien celui de l'agent auquel on veut l'affecter ?
    const lu = (results.map(r => r.identite).find(Boolean) || '').trim();
    const attendu = String(opts.contexte?.agent || '').trim();
    let concordance = 'inconnu';
    if (lu && attendu) {
        const T = (x) => new Set(flat(x).replace(/[^a-z ]+/g, ' ').split(' ').filter(w => w.length > 1));
        const A = T(attendu), L = T(lu);
        const communs = [...A].filter(w => L.has(w)).length;
        if (L.size >= 2 || A.size >= 1) concordance = communs >= 1 ? 'ok' : (L.size >= 1 ? 'different' : 'inconnu');
    }
    if (mode === 'agent' && !results.some(r => r.type === 'perspectives')) warnings.push('La page contenant les observations de l’agent n’a pas été reconnue : ajoutez la dernière page du compte rendu.');
    if (mode === 'complet') crep.origine = 'manuscrit';
    // 5) Cohérence : seconde passe de l'IA locale (mots manifestement mal lus), corrections tracées et visibles du valideur
    let corrections = [];
    if (mode === 'complet') try {
        const cr = await coherencePass(apm, crep, opts.contexte || {}, log);
        corrections = cr.applied;
    } catch (e) { warnings.push(`Contrôle de cohérence indisponible (${e.message}).`); }
    tick();
    for (const d of doubts) warnings.push(`Lecture incertaine (page ${d.page}) – ${d.champ} : « ${d.valeurs[0] || '—'} » ou « ${d.valeurs[1] || '—'} »`);
    return {
        mode, corrections, incertains: doubts,
        identity: { lu, attendu, concordance }, formMismatch: !!gridMismatch,
        signatures: (results.find(r => r.signatures) || {}).signatures || null,
        raw: raws.join('\n\n') || '(transcription non fournie par le modèle)',
        fields: crep,
        engine: { lecture: `${model} (API Ville, vision) · ${total} page(s)`, structuration: grille || 'sans grille' },
        warnings,
    };
}

module.exports = { scanToProposal, scanDocuments, pagePrompt, pageType };
