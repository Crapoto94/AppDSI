/**
 * Client minimal de l'API Interact'Ivry (backend temps réel de sondages).
 *
 * Utilisé lorsqu'un agent lance un « INTERACT » depuis une réunion : on crée
 * un quiz à une question puis une session côté Interact'Ivry (API REST ouverte
 * ou protégée par clé côté DSIHub), afin que l'interaction existe aussi dans
 * l'application Interact'Ivry. L'affichage/réponse live est assuré par DSIHub.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function readRootEnv(key) {
    if (process.env[key]) return process.env[key];
    try {
        const envPath = path.join(__dirname, '..', '..', '..', '.env');
        const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.trim().startsWith(`${key}=`));
        if (line) return line.split('=').slice(1).join('=').trim();
    } catch { /* pas de .env */ }
    return '';
}

function baseUrl() {
    return String(readRootEnv('INTERACTIVRY_API_URL') || '').replace(/\/+$/, '');
}

function interactHeaders() {
    const key = readRootEnv('INTERACTIVRY_API_KEY');
    return key ? { 'X-DSIHUB-KEY': key } : {};
}

const TYPE_MAP = {
    single: 'single',
    multiple: 'multiple',
    truefalse: 'true_false',
    open: 'text',
    wordcloud: 'wordcloud',
    stars: 'scale',
    slider: 'slider',
    idea: 'idea',
};

function makeQuestion({ type, question, options, explanation, image, visibility, anonymous }) {
    const qType = TYPE_MAP[type] || 'single';
    const answers = (Array.isArray(options) ? options : []).map((text, i) => ({ id: String(i + 1), text: String(text) }));
    const q = {
        id: Math.random().toString(36).slice(2, 12),
        type: qType,
        text: question,
        answers: (qType === 'single' || qType === 'multiple' || qType === 'ordering') ? answers : [],
        correctAnswers: [],
        timeLimit: 0,
        points: 0,
        explanation: explanation || '',
        sources: [],
        multipleAnswers: qType === 'multiple',
    };
    if (qType === 'scale') { q.scaleMin = 1; q.scaleMax = 5; }
    if (qType === 'slider') { q.sliderMin = 0; q.sliderMax = 100; q.sliderStep = 1; q.sliderCorrect = null; }
    if (image) q.image = image;
    const vis = visibility || (anonymous ? 'semi_anonyme' : 'nominatif');
    const iVis = vis === 'totalement_anonyme' ? 'private' : (vis === 'semi_anonyme' ? 'anonymous' : 'public');
    if (qType === 'text' || qType === 'wordcloud') q.visibility = iVis;
    if (qType === 'idea') q.showAuthorNames = vis === 'nominatif';
    return q;
}

async function createInteract({ title, type, question, options, explanation, image, visibility, anonymous }) {
    const base = baseUrl();
    if (!base) return { ok: false, error: 'INTERACTIVRY_API_URL non configuré' };
    try {
        const quizBody = {
            title: title || `Interaction DSIHub — ${question}`,
            description: 'Interaction lancée depuis une réunion DSIHub',
            category: 'DSIHub',
            author: 'DSIHub',
            type: 'poll',
            settings: { naming: 'free', nameVisibility: 'alias' },
            questions: [makeQuestion({ type, question, options, explanation, image, visibility, anonymous })],
        };
        const quizRes = await axios.post(`${base}/api/quizzes`, quizBody, { timeout: 12000, headers: interactHeaders() });
        const quiz = quizRes.data?.data;
        if (!quiz?.id) return { ok: false, error: 'Réponse Interact\'Ivry invalide (quiz)' };
        let session = null;
        try {
            const sessionRes = await axios.post(`${base}/api/sessions`, { quizId: quiz.id, mode: 'fun' }, { timeout: 12000, headers: interactHeaders() });
            session = sessionRes.data?.data || null;
        } catch (e) {
            // Le quiz existe déjà : l'INTERACT reste utilisable dans DSIHub.
        }
        return {
            ok: true,
            quizId: quiz.id,
            sessionId: session?.id || null,
            code: session?.code || null,
        };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error || e.message };
    }
}

module.exports = { createInteract, baseUrl };
