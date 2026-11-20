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

module.exports = { scanToProposal };
