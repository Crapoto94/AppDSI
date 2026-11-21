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
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const crepGrid = require('./crep-grid.service');

const PAGE_PX = 2000;          // plus grand côté envoyé au modèle (assez fin pour le manuscrit, sans images énormes)

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
 * Lit un compte rendu composé d'une ou plusieurs pages (photos JPEG/PNG ou PDF) :
 *  - redresse chaque page, lit le manuscrit page par page (modèle multimodal de l'API Ville) et fusionne ;
 *  - lit les cases cochées de la grille par traitement d'image (fiable), l'IA ne servant que de repli.
 * @param {Array<{buffer: Buffer, mimetype: string, name?: string}>} files
 */
async function scanDocuments(files, definition) {
    const warnings = [];
    const log = (m) => console.log('[ENTRETIENS] scan CREP :', m);
    const apm = require('../../shared/apm_ai');
    const model = await pickVisionModel(apm);
    const items = flatCriteria(definition);

    // 1) Pages décodées
    const pages = [];
    for (const f of files) {
        if (/pdf/i.test(f.mimetype || '') || f.buffer.slice(0, 5).toString('latin1') === '%PDF-') {
            for (const png of await renderPages(f.buffer, 'application/pdf')) pages.push(await loadImage(png));
        } else pages.push(await loadImage(f.buffer));
    }
    if (!pages.length) throw new Error('Aucune page lisible dans ce document.');
    if (pages.length > 8) throw new Error('8 pages maximum.');

    let crep = normalizeCrep({}, definition);
    const raws = [];
    let gridRows = null;
    const aiGrid = {};

    for (let i = 0; i < pages.length; i++) {
        // Sens de la page : le modèle de vision lit le texte quel que soit le sens, mais pas le traitement d'image des cases.
        // On essaie donc les 4 sens pour la grille ; celui qui donne exactement les lignes attendues est le bon sens de lecture.
        const landscape = pages[i].width > pages[i].height * 1.1;
        let deg = landscape ? 90 : 0;
        if (!gridRows && items.length) {
            for (const d of (landscape ? [90, 270, 0, 180] : [0, 180, 90, 270])) {
                try {
                    const r = crepGrid.readCheckboxRows(rotated(pages[i], d, 3000));
                    if (r && r.rows.length === items.length) { gridRows = r.rows; deg = d; log(`page ${i + 1} : grille lue, rotation ${d}° (${r.note})`); break; }
                } catch (e) { log(`lecture de la grille impossible : ${e.message}`); }
            }
        }
        log(`page ${i + 1}/${pages.length} lue (rotation ${deg}°)`);

        // 3) Manuscrit : lecture page par page
        const buf = jpeg(rotated(pages[i], deg, PAGE_PX), 88);
        try {
            const j = extractJson(await askVision(apm, model, visionPrompt(), buf));
            const t = String(j.transcription || '').trim(); delete j.transcription;
            if (t) raws.push(`--- Page ${i + 1} ---\n${t}`);
            crep = mergeCrep(crep, normalizeCrep(j, definition));
        } catch (e) { warnings.push(`Page ${i + 1} : lecture du manuscrit impossible (${e.message}).`); }

        // Repli IA pour la grille si le traitement d'image n'a rien donné sur cette page (une réponse par critère, majorité à la fin)
        if (!gridRows && items.length) {
            try {
                const j = parseObj(await askVision(apm, model, gridPrompt(items), jpeg(rotated(pages[i], deg, 2200), 88), 1500));
                if (j) for (const [k, v] of Object.entries(j)) { const idx = Number(k) - 1; if (items[idx] && ['S', 'AS', 'I'].includes(v)) (aiGrid[idx] = aiGrid[idx] || []).push(v); }
            } catch { /* grille absente de cette page */ }
        }
    }

    // 4) Cases cochées : résultat final
    let grille = '';
    if (gridRows) {
        gridRows.forEach((r, idx) => { if (r.level) crep.valeur[items[idx].key] = r.level; });
        const doubt = gridRows.map((r, idx) => (r.certain ? null : items[idx].label)).filter(Boolean);
        grille = `grille lue par traitement d’image (${gridRows.filter(r => r.level).length}/${items.length} cases cochées reconnues)`;
        if (doubt.length) warnings.push(`Cases cochées à vérifier : ${doubt.join(' ; ')}.`);
    } else if (items.length && Object.keys(aiGrid).length) {
        for (const [idx, votes] of Object.entries(aiGrid)) {
            const tally = votes.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
            crep.valeur[items[idx].key] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
        }
        grille = 'grille lue par l’IA (moins fiable)';
        warnings.push('La grille d’appréciation a été lue par l’IA faute de pouvoir détecter le tableau : vérifiez toutes les cases cochées.');
    } else if (items.length) {
        warnings.push('La grille d’appréciation n’a pas été trouvée sur les pages fournies : cochez-la dans le formulaire (ou ajoutez la page qui la contient).');
    }
    return {
        raw: raws.join('\n\n') || '(transcription non fournie par le modèle)',
        fields: crep,
        engine: { lecture: `${model} (API Ville, vision) · ${pages.length} page(s)`, structuration: grille || 'sans grille' },
        warnings,
    };
}

module.exports = { scanToProposal, scanDocuments };
