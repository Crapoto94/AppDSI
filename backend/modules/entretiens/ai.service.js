/**
 * Aide à la rédaction du compte-rendu d'entretien par l'IA LOCALE (Ollama).
 * Les données RH ne quittent jamais le réseau : seul Ollama (hôte configuré dans
 * app_settings.ollama_host, comme pour le reste d'AppDSI) est utilisé, jamais un fournisseur cloud.
 */
const axios = require('axios');
const { getSqlite } = require('../../shared/database');
const svc = require('./entretiens.service');

const TIMEOUT_MS = 240000;

async function ollamaHost() {
    let host = '';
    try {
        const row = await getSqlite().get("SELECT setting_value FROM app_settings WHERE setting_key = 'ollama_host'");
        host = String(row?.setting_value || '').trim();
    } catch (e) { /* ignore */ }
    host = (host || 'http://localhost:11434').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
    return host;
}

/** Modèle à utiliser : réglage du module (ai_model), sinon un llama3 installé, sinon le premier modèle disponible. */
async function pickModel(host) {
    const configured = (await svc.getSetting('ai_model')).trim();
    if (configured) return configured;
    const r = await axios.get(`${host}/api/tags`, { timeout: 8000 });
    const names = (r.data?.models || []).map(m => m.name).filter(Boolean);
    if (!names.length) throw new Error('Aucun modèle n’est installé sur le serveur Ollama.');
    return names.find(n => /^llama3/i.test(n)) || names.find(n => /llama|mistral|qwen|gemma/i.test(n)) || names[0];
}

const clip = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

const SYSTEM = [
    'Tu es rédacteur RH pour une mairie. Tu rédiges le compte rendu officiel d’un entretien professionnel annuel à partir des quelques mots donnés par l’évaluateur (N+1).',
    'Écris en français correct (corrige les fautes de frappe des notes), au style professionnel, clair, factuel et bienveillant, à la troisième personne.',
    'N’ajoute aucun fait, chiffre ou date absent des notes ou du contexte. Respecte le sens et la tonalité des notes (positif, réservé, critique…).',
    'Réponds UNIQUEMENT par le texte final de la rubrique (2 à 5 phrases, sans titre, sans introduction, sans explication, sans mise en forme), placé entre «« et »».',
].join(' ');

const userMessage = ({ rubrique, agent, contexte, existant, notes }) => [
    `Rubrique : ${clip(rubrique, 200)}`,
    agent ? `Agent évalué : ${clip(agent, 120)}` : '',
    contexte ? `Contexte :\n${clip(contexte, 3500)}` : '',
    existant ? `Texte actuellement saisi (à améliorer) :\n${clip(existant, 2500)}` : '',
    `Notes de l’évaluateur : ${clip(notes, 2500)}`,
].filter(Boolean).join('\n');

// Exemple fourni au modèle pour fixer le format de sortie (texte final seul).
const EXAMPLE_IN = userMessage({
    rubrique: 'Appréciation générale sur l’exercice des missions',
    agent: 'Agent Exemple',
    notes: 'tres bon boulot, autonome, doit progresser sur suivi budget',
});
const EXAMPLE_OUT = '««Agent Exemple a accompli ses missions avec un très bon niveau de qualité et fait preuve d’une réelle autonomie dans l’organisation de son travail. Un effort reste à fournir sur le suivi budgétaire, axe de progression identifié pour l’année à venir.»»';

/**
 * @param {Object} p
 * @param {string} p.rubrique   libellé de la rubrique à rédiger (ex. « Observations sur l'objectif 2 »)
 * @param {string} p.notes      ce que l'évaluateur veut dire, en substance
 * @param {string} [p.contexte] éléments factuels (objectif, saisie de l'agent…)
 * @param {string} [p.existant] texte déjà présent dans la rubrique (à améliorer)
 * @param {string} [p.agent]    nom de l'agent
 */
async function draftComment({ rubrique, notes, contexte, existant, agent }) {
    const host = await ollamaHost();
    const model = await pickModel(host);
    const question = userMessage({ rubrique, agent, contexte, existant, notes });
    try {
        let out;
        if (/qwen3/i.test(model)) {
            // Qwen3 « thinking » : on désactive la réflexion (bloc <think> vide) et on fournit un exemple (few-shot)
            // pour que le modèle réponde directement par le texte final, en quelques secondes.
            const raw = `<|im_start|>system\n${SYSTEM}<|im_end|>\n`
                + `<|im_start|>user\n${EXAMPLE_IN}<|im_end|>\n<|im_start|>assistant\n${EXAMPLE_OUT}<|im_end|>\n`
                // Le texte est amorcé par « (marqueur ouvrant) : le modèle écrit directement le texte final et s'arrête à »».
                + `<|im_start|>user\n${question}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n««`;
            const r = await axios.post(`${host}/api/generate`,
                { model, prompt: raw, raw: true, stream: false, options: { temperature: 0.4, num_predict: 400, num_ctx: 6144, stop: ['»»', '<|im_end|>'] } },
                { timeout: TIMEOUT_MS });
            out = String(r.data?.response || '');
        } else {
            const r = await axios.post(`${host}/api/generate`,
                { model, prompt: `${SYSTEM}\n\n${question}\n\nTexte (entre «« et ») :\n««`, stream: false, options: { temperature: 0.4, num_predict: 500, stop: ['»»'] } },
                { timeout: TIMEOUT_MS });
            out = String(r.data?.response || '').replace(/<think>[\s\S]*?<\/think>/g, '');
        }
        out = out.replace(/^[\s«»]+/, '').split('»»')[0].trim().replace(/^["«»\s]+|["«»\s]+$/g, '').replace(/^\*\*|\*\*$/g, '').trim();
        if (!out) throw new Error('L’IA n’a renvoyé aucun texte.');
        return { text: out, model };
    } catch (e) {
        if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') throw new Error(`Serveur d’IA locale (Ollama) injoignable sur ${host}.`);
        if (e.code === 'ECONNABORTED') throw new Error('Délai dépassé : l’IA locale met trop de temps à répondre.');
        if (e.response?.status === 404) throw new Error(`Le modèle « ${model} » n’est pas installé sur le serveur Ollama.`);
        throw new Error(e.response?.data?.error || e.message);
    }
}

module.exports = { draftComment };
