/**
 * Aide à la rédaction et relecture du compte-rendu d'entretien par une IA INTERNE (jamais un fournisseur cloud) :
 *  1. API IA Ville (APM) sur les DGX, modèle « mistral RGPD++ » (réglage `ai_model` du module, sinon détection) ;
 *  2. à défaut (APM indisponible), Ollama local (hôte `ollama_host`, comme le reste d'AppDSI).
 * Les données RH ne quittent donc jamais le réseau de la Ville.
 */
const axios = require('axios');
const { getSqlite } = require('../../shared/database');
const svc = require('./entretiens.service');
const { draftIssues, sentimentIssues } = require('./crep.coherence');

const TIMEOUT_MS = 240000;
const clip = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

// ─── API IA Ville (APM) ──────────────────────────────────────────────────────
let apmModelCache = { at: 0, name: null };

/** Modèle APM : réglage `ai_model` du module, sinon un modèle « mistral » (de préférence RGPD++), sinon un modèle RGPD++. */
async function pickApmModel(apm) {
    const configured = (await svc.getSetting('ai_model')).trim();
    if (configured) return configured;
    if (apmModelCache.name && Date.now() - apmModelCache.at < 10 * 60 * 1000) return apmModelCache.name;
    const models = await apm.listModels();
    const name = models.find(m => /mistral/i.test(m) && /rgpd/i.test(m))
        || models.find(m => /mistral/i.test(m))
        || models.find(m => /rgpd/i.test(m));
    if (!name) throw new Error('Aucun modèle interne adapté (mistral / RGPD++) sur l’API IA Ville.');
    apmModelCache = { at: Date.now(), name };
    return name;
}

async function completeViaApm({ system, exIn, exOut, question }) {
    const apm = require('../../shared/apm_ai');
    const model = await pickApmModel(apm);
    const prompt = `${system}\n\nExemple :\n${exIn}\nRéponse : ${exOut}\n\nÀ présent :\n${question}\nRéponse :`;
    const out = await apm.queryAi(prompt, model);
    return { out: String(out || ''), model: `${model} (API Ville)` };
}

// ─── Ollama local (repli) ────────────────────────────────────────────────────
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

async function pickOllamaModel(host) {
    const r = await axios.get(`${host}/api/tags`, { timeout: 8000 });
    const names = (r.data?.models || []).map(m => m.name).filter(Boolean);
    if (!names.length) throw new Error('Aucun modèle n’est installé sur le serveur Ollama.');
    return names.find(n => /mistral/i.test(n)) || names.find(n => /^llama3/i.test(n)) || names.find(n => /llama|qwen|gemma/i.test(n)) || names[0];
}

async function completeViaOllama({ system, exIn, exOut, question, temperature = 0.4 }) {
    const host = await ollamaHost();
    const model = await pickOllamaModel(host);
    try {
        let out;
        if (/qwen3/i.test(model)) {
            // Qwen3 « thinking » : bloc <think> vide et texte amorcé par « : réponse directe, arrêt à »».
            const raw = `<|im_start|>system\n${system}<|im_end|>\n`
                + `<|im_start|>user\n${exIn}<|im_end|>\n<|im_start|>assistant\n${exOut}<|im_end|>\n`
                + `<|im_start|>user\n${question}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n««`;
            const r = await axios.post(`${host}/api/generate`,
                { model, prompt: raw, raw: true, stream: false, options: { temperature, num_predict: 500, num_ctx: 8192, stop: ['»»', '<|im_end|>'] } },
                { timeout: TIMEOUT_MS });
            out = `««${String(r.data?.response || '')}`;
        } else {
            const r = await axios.post(`${host}/api/generate`,
                { model, prompt: `${system}\n\nExemple :\n${exIn}\nRéponse : ${exOut}\n\nÀ présent :\n${question}\nRéponse : ««`, stream: false, options: { temperature, num_predict: 500, stop: ['»»'] } },
                { timeout: TIMEOUT_MS });
            out = `««${String(r.data?.response || '').replace(/<think>[\s\S]*?<\/think>/g, '')}`;
        }
        return { out, model: `${model} (Ollama)` };
    } catch (e) {
        if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') throw new Error(`Serveur d’IA locale (Ollama) injoignable sur ${host}.`);
        if (e.code === 'ECONNABORTED') throw new Error('Délai dépassé : l’IA locale met trop de temps à répondre.');
        if (e.response?.status === 404) throw new Error(`Le modèle « ${model} » n’est pas installé sur le serveur Ollama.`);
        throw new Error(e.response?.data?.error || e.message);
    }
}

/** API IA Ville d'abord ; si elle est indisponible, repli sur Ollama. */
async function complete(args) {
    try {
        return await completeViaApm(args);
    } catch (e) {
        console.warn('[ENTRETIENS] IA : API Ville indisponible, repli sur Ollama :', e.message);
        try {
            return await completeViaOllama(args);
        } catch (e2) {
            throw new Error(`IA indisponible (API Ville : ${e.message} ; Ollama : ${e2.message})`);
        }
    }
}

/** Texte final : contenu entre «« et »» (à défaut, la réponse nettoyée). */
function extractAnswer(out) {
    let t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const i = t.indexOf('««');
    if (i >= 0) t = t.slice(i + 2);
    return t.split('»»')[0].trim().replace(/^["«»\s]+|["«»\s]+$/g, '').replace(/^\*\*|\*\*$/g, '').trim();
}

/** « Agent Marc Chevalier » → « Marc Chevalier » (le nom seul, sans le mot « Agent »). */
function cleanName(text, agent) {
    let t = String(text || '');
    const name = String(agent || '').trim();
    if (name) {
        // On retire « Agent », « L'agent », « l’agente » juste devant le nom (recherche sans regex construite sur le nom).
        const lower = t.toLowerCase();
        const target = name.toLowerCase();
        let out = '';
        let i = 0;
        while (i < t.length) {
            const idx = lower.indexOf(target, i);
            if (idx < 0) { out += t.slice(i); break; }
            const head = t.slice(i, idx).replace(/(?:l[’']\s*)?agente?\s+$/i, '');
            out += head + t.slice(idx, idx + name.length);
            i = idx + name.length;
        }
        t = out;
    }
    return t.replace(/Agent Exemple/g, '').trim();
}

/** Retire les phrases qui reprennent le vocabulaire interne des consignes (« synthèse de la grille »…). */
function stripLeaks(text) {
    const parts = String(text || '').split(/(?<=[.!?])\s+/);
    const kept = parts.filter(p => !/synth[èe]se de la grille|consignes?|aucun point faible n/i.test(p));
    return (kept.length ? kept : parts).join(' ').trim();
}

// ─── Rédaction d'une rubrique ────────────────────────────────────────────────
const SYSTEM = [
    'Tu es rédacteur RH pour une mairie. Tu rédiges le compte rendu officiel d’un entretien professionnel annuel à partir des quelques mots donnés par l’évaluateur (N+1).',
    'Écris en français correct (corrige les fautes de frappe des notes), au style professionnel, clair, factuel et bienveillant, à la troisième personne.',
    'N’ajoute aucun fait, chiffre ou date absent des notes ou du contexte. Respecte le sens et la tonalité des notes (positif, réservé, critique…).',
    'Réponds UNIQUEMENT par le texte final de la rubrique (2 à 5 phrases, sans titre, sans introduction, sans explication, sans mise en forme), placé entre «« et »».',
].join(' ');

const userMessage = ({ rubrique, agent, contexte, existant, notes }) => [
    `Rubrique : ${clip(rubrique, 200)}`,
    agent ? `Agent évalué : ${clip(agent, 120)}` : '',
    contexte ? `Contexte :\n${clip(contexte, 7000)}` : '',
    existant ? `Texte actuellement saisi (à améliorer) :\n${clip(existant, 2500)}` : '',
    `Notes de l’évaluateur : ${clip(notes, 2500)}`,
].filter(Boolean).join('\n');

const EXAMPLE_IN = userMessage({
    rubrique: 'Appréciation générale sur l’exercice des missions',
    agent: 'Camille Martin',
    notes: 'tres bon boulot, autonome, doit progresser sur suivi budget',
});
const EXAMPLE_OUT = '««Camille Martin a accompli ses missions avec un très bon niveau de qualité et fait preuve d’une réelle autonomie dans l’organisation de son travail. Un effort reste à fournir sur le suivi budgétaire, axe de progression identifié pour l’année à venir.»»';

/**
 * @param {Object} p
 * @param {string} p.rubrique   libellé de la rubrique à rédiger
 * @param {string} p.notes      ce que l'évaluateur veut dire, en substance
 * @param {string} [p.contexte] éléments factuels (saisie de l'agent, compte rendu complet…)
 * @param {string} [p.existant] texte déjà présent dans la rubrique (à améliorer)
 * @param {string} [p.agent]    nom de l'agent
 * @param {boolean} [p.coherent] impose la cohérence avec tous les éléments du contexte (appréciation générale)
 */
async function draftComment({ rubrique, notes, contexte, existant, agent, coherent, crep }) {
    let question = userMessage({ rubrique, agent, contexte, existant, notes });
    if (coherent) {
        question += '\nExigences : (1) la tonalité du texte doit correspondre à la SYNTHÈSE DE LA GRILLE du contexte, qui fait référence ; (2) ne cite comme axes de progrès que les points faibles listés dans cette synthèse, et aucun s’il n’y en a pas ; (3) si les notes de l’évaluateur contredisent la grille ou les niveaux des objectifs, suis la grille et n’écris pas l’élément contradictoire ; (4) n’invente aucun fait ; (5) synthétise en 3 à 5 phrases, sans énumérer les critères un par un et sans citer la « synthèse » ni ces consignes.';
    }
    const warnings = [];
    // Contradiction entre les notes de l'évaluateur et la grille : signalée à l'évaluateur (le texte suit la grille).
    if (coherent && crep && sentimentIssues(crep, notes).length) {
        warnings.push('Vos notes semblent contredire la grille d’appréciation que vous avez renseignée : le texte proposé suit la grille. Corrigez la grille ou vos notes si ce n’est pas ce que vous voulez dire.');
    }
    let { out, model } = await complete({ system: SYSTEM, exIn: EXAMPLE_IN, exOut: EXAMPLE_OUT, question });
    let text = cleanName(coherent ? stripLeaks(extractAnswer(out)) : extractAnswer(out), agent);
    if (!text) throw new Error('L’IA n’a renvoyé aucun texte.');
    if (coherent && crep) {
        // Contrôle du texte proposé face à la grille ; une régénération corrective si nécessaire.
        let issues = draftIssues(crep, text);
        // Jusqu'à 3 régénérations correctives : on garde la première proposition sans écart, sinon la dernière (avec avertissement).
        for (let attempt = 0; attempt < 3 && issues.length; attempt++) {
            const retry = await complete({
                system: SYSTEM, exIn: EXAMPLE_IN, exOut: EXAMPLE_OUT,
                question: `${question}\nATTENTION : ta proposition précédente était incohérente avec la grille (${issues.join(' ')}). Propose un nouveau texte strictement conforme à la SYNTHÈSE DE LA GRILLE, sans « cependant » ni « toutefois » ni axe de progrès qui n’y figure pas.`,
            });
            const t2 = cleanName(stripLeaks(extractAnswer(retry.out)), agent);
            if (!t2) continue;
            text = t2; model = retry.model; issues = draftIssues(crep, text);
        }
        issues.forEach(i => warnings.push(`À vérifier : ${i}`));
    }
    return { text, model, warnings };
}

// ─── Relecture de cohérence ──────────────────────────────────────────────────
const REVIEW_SYSTEM = [
    'Tu es relecteur RH pour une mairie. Tu vérifies la cohérence interne d’un compte rendu d’entretien professionnel.',
    'Repère UNIQUEMENT les incohérences réelles entre les rubriques : appréciation générale qui contredit les niveaux de la grille ou des objectifs, observations qui contredisent le niveau d’un objectif, objectifs futurs sans rapport avec le bilan, etc.',
    'N’invente rien, ne reformule pas le compte rendu, ne donne pas d’avis sur la qualité du texte. Si tout est cohérent, réponds « Aucune incohérence détectée. »',
    'Réponds par une liste à puces (une incohérence par ligne, 5 au maximum, en une phrase claire), placée entre «« et »».',
].join(' ');
const REVIEW_EX_IN = 'Compte rendu :\nBilan des objectifs :\n- Objectif 1 : Migrer la messagerie → niveau : Non atteint ; observations : projet abandonné\nAppréciation de la valeur professionnelle (grille) :\n- Sens des responsabilités : Insuffisant\n- Qualités rédactionnelles : Insuffisant\n- Travail en équipe : Satisfaisant\nAppréciation générale actuelle : Agent remarquable, qui a pleinement atteint ses objectifs.';
const REVIEW_EX_OUT = '««- L’appréciation générale indique que les objectifs sont pleinement atteints alors que l’objectif 1 est « Non atteint ».\n- L’appréciation générale est très élogieuse alors que deux critères de la grille sont jugés « Insuffisants ».»»';

/**
 * Relecture de cohérence par l'IA : liste d'incohérences (vide si aucune). Complète les contrôles déterministes.
 * @param {string} summary résumé de tout le compte rendu (cf. crep.coherence.js#summarizeCrep)
 */
async function reviewCrep(summary) {
    const { out, model } = await complete({
        system: REVIEW_SYSTEM, exIn: REVIEW_EX_IN, exOut: REVIEW_EX_OUT, question: `Compte rendu :\n${clip(summary, 9000)}`, temperature: 0.2,
    });
    const text = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const i = text.indexOf('««');
    const body = (i >= 0 ? text.slice(i + 2) : text).split('»»')[0].trim();
    if (!body || /aucune incoh[ée]rence/i.test(body)) return { items: [], model };
    const items = body.split('\n')
        .map(l => l.replace(/^[\s"«»\-•*\d.)]+/, '').replace(/[\s"]+$/, '').trim())
        .filter(l => l.length > 12).slice(0, 6);
    return { items, model };
}

module.exports = { draftComment, reviewCrep };
