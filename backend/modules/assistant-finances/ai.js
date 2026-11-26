/**
 * Accès à l'IA de l'assistant finances : modèles LOCAUX uniquement.
 *
 * L'API IA Ville (APM) mêle des modèles hébergés sur le réseau de la Ville (Ollama, vLLM, Faster-Whisper)
 * et des fournisseurs externes (Groq, NVIDIA). Trois garde-fous :
 *   1. le modèle choisi doit être annoncé par l'APM chez un fournisseur local ;
 *   2. chaque appel impose `providers: ['ollama','vllm']` (aucune bascule vers l'extérieur) ;
 *   3. le fournisseur ayant réellement répondu est vérifié.
 * À défaut d'APM, repli sur l'Ollama local (réglage `ollama_host`). Jamais de fournisseur cloud.
 *
 * Seuls la question, le catalogue des données et la liste des services de l'agent sont envoyés au modèle :
 * aucun montant ni aucune pièce Sedit.
 */
const axios = require('axios');
const { getSqlite } = require('../../shared/database');
const apm = require('../../shared/apm_ai');
const { ollamaHost } = require('../entretiens/ai.service');

const LOCAL_CHAT = ['ollama', 'vllm'];
const SETTING_MODEL = 'assistant_finances.ai_model';
// Ordre de préférence pour traduire une question en demande structurée
const PREFERRED = [/qwen3.*local/i, /mistral.*rgpd/i, /gemma.*rgpd/i, /deepseek.*rgpd/i];

async function setting(key) {
    try {
        const row = await getSqlite().get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        return String(row?.setting_value || '').trim();
    } catch { return ''; }
}

async function apmCall(path, init = {}, timeoutMs = 180000) {
    const cfg = await apm.getConfig();
    const base = String(cfg.base_url).replace(/\/+$/, '') + String(cfg.endpoint || '/api/v1/ai').replace(/\/+$/, '');
    const resp = await fetch(`${base}${path}`, {
        ...init,
        headers: { [cfg.header_name || 'X-API-KEY']: cfg.api_key, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* corps non JSON */ }
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status} depuis l'API IA Ville`);
    return data;
}

const isLocalName = (m) => !/cloud/i.test(`${m.name} ${m.model}`);

let modelsCache = { at: 0, list: [] };
async function localModels() {
    if (Date.now() - modelsCache.at < 5 * 60 * 1000) return modelsCache.list;
    const data = await apmCall('/models', {}, 15000);
    const all = Array.isArray(data) ? data : data?.models || data?.data || [];
    const list = all.filter(m => m && LOCAL_CHAT.includes(m.provider) && m.active !== false && isLocalName(m));
    modelsCache = { at: Date.now(), list };
    return list;
}

async function candidates() {
    const models = await localModels();
    const wanted = await setting(SETTING_MODEL);
    const ordered = [];
    const push = (m) => { if (m && !ordered.includes(m)) ordered.push(m); };
    if (wanted) push(models.find(m => m.name === wanted || m.model === wanted));
    for (const re of PREFERRED) push(models.find(m => re.test(m.name)));
    if (!ordered.length) throw new Error('Aucun modèle local actif sur l’API IA Ville.');
    return ordered.slice(0, 2);
}

async function viaApm(prompt) {
    let last;
    for (const m of await candidates()) {
        try {
            const data = await apmCall('/query', {
                method: 'POST',
                body: JSON.stringify({ prompt, model: m.name, providers: LOCAL_CHAT, temperature: 0, max_tokens: 1500 }),
            });
            if (!LOCAL_CHAT.includes(data?.provider)) throw new Error('Réponse refusée : le fournisseur n’est pas identifié comme local.');
            return { text: String(data.response || ''), model: data.model_name || data.model || m.name };
        } catch (e) { last = e; console.warn(`[AssistantFinances] modèle ${m.name} : ${e.message}`); }
    }
    throw last;
}

async function viaOllama(prompt, { json = true } = {}) {
    const host = await ollamaHost();
    const tags = await axios.get(`${host}/api/tags`, { timeout: 8000 });
    const names = (tags.data?.models || []).map(m => m.name).filter(n => n && !/cloud|embed/i.test(n));
    const model = names.find(n => /mistral|qwen/i.test(n)) || names.find(n => /llama|gemma/i.test(n));
    if (!model) throw new Error('Aucun modèle de conversation sur le serveur Ollama.');
    const r = await axios.post(`${host}/api/generate`, { model, prompt, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0, num_predict: 1500, num_ctx: 12288 } }, { timeout: 180000 });
    return { text: String(r.data?.response || ''), model: `${model} (Ollama)` };
}

async function complete(prompt, options) {
    try {
        return await viaApm(prompt);
    } catch (e) {
        console.warn('[AssistantFinances] API IA Ville indisponible, repli sur Ollama :', e.message);
        try { return await viaOllama(prompt, options); } catch (e2) {
            const err = new Error(`IA locale indisponible (API Ville : ${e.message} ; Ollama : ${e2.message})`);
            err.status = 503;
            throw err;
        }
    }
}

/** Dictée : transcription par Faster-Whisper, hébergé sur le réseau de la Ville (route /ai/transcribe de l'APM). */
async function transcribe(buffer, filename) {
    try {
        const data = await apmCall('/transcribe', {
            method: 'POST',
            body: JSON.stringify({
                audio: buffer.toString('base64'), filename, language: 'fr',
                prompt: 'Question sur les finances de la Ville : budget de fonctionnement, investissement, engagements, mandats, titres, commandes, factures, DSI, Sedit.',
            }),
        }, 120000);
        if (data?.provider && data.provider !== 'whisper') throw new Error('Fournisseur de transcription inattendu.');
        return String(data?.text || '').trim();
    } catch (e) {
        console.warn('[AssistantFinances] transcription :', e.message);
        const err = new Error('La dictée vocale est indisponible : le service local de transcription ne répond pas. Saisissez votre question au clavier.');
        err.status = 503;
        throw err;
    }
}

module.exports = { complete, transcribe };
