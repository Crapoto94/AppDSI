/**
 * Service IA du module « Mes Notes ».
 *
 * Toute l'intelligence passe par l'API IA Ville (APM) via shared/apm_ai.js —
 * modèle local choisi en admin (/admin/notes → notes_apm_model).
 *
 * Pipeline d'analyse d'une note (déclenché après sauvegarde ou bouton) :
 *   1. extraction du texte (HTML → texte brut) + arborescence existante,
 *   2. appel APM avec le prompt d'analyse (correction + reformulation + résumé
 *      + tags + classement proposé),
 *   3. stockage : la note ORIGINALE n'est jamais écrasée (content), la version
 *      IA est rangée dans content_ai, la suggestion dans ai_suggestion.
 */
const { getSqlite } = require('../../shared/database');
const apmAi = require('../../shared/apm_ai');
const repo = require('./notes.repository');
const { SETTING_DEFAULTS, renderTemplate, DEFAULT_STOPWORDS } = require('./notes-prompts');

// ── Réglages ───────────────────────────────────────────────────────────────
async function getSetting(key) {
    try {
        const sqlite = getSqlite();
        if (!sqlite) return SETTING_DEFAULTS[key];
        const row = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        return row && row.setting_value !== null && row.setting_value !== undefined ? row.setting_value : SETTING_DEFAULTS[key];
    } catch {
        return SETTING_DEFAULTS[key];
    }
}

async function getNotesSettings() {
    const out = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) out[key] = await getSetting(key);
    return out;
}

/** Modèle APM pour l'analyse unitaire (repli sur le défaut global). */
function analysisModel(settings) {
    return (settings.notes_analysis_model || settings.notes_apm_model || '').trim() || undefined;
}
/** Modèle APM pour le classement global (repli sur le défaut global). */
function classifyModel(settings) {
    return (settings.notes_classify_model || settings.notes_apm_model || '').trim() || undefined;
}

const crypto = require('crypto');
/** Empreinte du contenu (pour ne pas réanalyser une note inchangée). */
function contentHash(content) {
    const text = htmlToText(content).replace(/\s+/g, ' ').trim();
    return crypto.createHash('sha1').update(text).digest('hex');
}

// ── Tags ───────────────────────────────────────────────────────────────────
// Tags génériques sans valeur de recherche : filtrés même si l'IA les propose.
const USELESS_TAGS = new Set([
    'note', 'notes', 'info', 'infos', 'information', 'informations', 'divers', 'diverse', 'diverses',
    'general', 'generale', 'generales', 'important', 'importante', 'importantes', 'urgent', 'urgente',
    'tache', 'taches', 'reunion', 'reunions', 'sujet', 'sujets', 'point', 'points', 'action', 'actions',
    'suivi', 'dossier', 'dossiers', 'idee', 'idees', 'detail', 'details', 'resume', 'synthese',
    'discussion', 'conversation', 'echange', 'echanges', 'message', 'messages', 'mail', 'mails',
    'email', 'emails', 'courriel', 'courriels', 'appel', 'appels', 'telephone', 'demande', 'demandes',
    'question', 'questions', 'probleme', 'problemes', 'solution', 'solutions', 'retour',
    'rdv', 'rendez-vous', 'rendezvous', 'rendez vous', 'organisation', 'organisations',
    'direction', 'directions', 'usage', 'usages', 'evenement', 'evenements', 'interne', 'externe',
    'equipe', 'equipes', 'service', 'services', 'agent', 'agents', 'site', 'sites', 'dsi', 'hub',
]);

/**
 * Nombre de tags autorisé, proportionnel à la richesse du contenu : une note de
 * 3 lignes ne doit pas générer 8 tags.
 */
function tagBudget(text) {
    const words = String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0;
    if (words < 40) return 2;
    if (words < 120) return 3;
    if (words < 400) return 5;
    return 8;
}

/** Normalise, dédoublonne (singulier/pluriel), écarte les tags inutiles et garde les plus importants. */
function sanitizeTags(tags, max = 8) {
    const out = [];
    const seen = new Set();
    for (const raw of (tags || [])) {
        const t = String(raw || '')
            .trim().toLowerCase()
            .replace(/^#+/, '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, ' ').trim();
        if (!t || t.length < 3 || t.length > 40) continue;
        const key = t.replace(/[^a-z0-9]/g, '').replace(/s$/, '');
        if (USELESS_TAGS.has(t) || USELESS_TAGS.has(t.replace(/s$/, '')) || seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}

// ── Utilitaires texte ──────────────────────────────────────────────────────
function decodeEntities(s) {
    return String(s)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function htmlToText(html) {
    if (!html) return '';
    return decodeEntities(
        String(html)
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[’']/g, ' ')
        .replace(/[^a-z0-9àâäéèêëïîôöùûüç\s-]/gi, ' ')
        .split(/\s+/)
        .map(w => w.replace(/^-+|-+$/g, ''))
        .filter(w => w.length > 1);
}

/** Extrait un objet JSON d'une réponse IA, même entourée de texte / ```json. */
function extractJson(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try { return JSON.parse(t); } catch { /* fallback */ }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(t.slice(start, end + 1)); } catch { /* ignore */ }
    }
    return null;
}

// ── Détection déterministe des actions explicites ──────────────────────────
// Filet de sécurité indépendant de l'IA : une ligne « Action à mener : … »,
// « À faire : … », « Todo : … », « Prochaine étape : … » EST une tâche, même
// si le modèle local l'oublie. On la détecte par expression régulière.
const ACTION_MARKER_RE = /(?:^|[\s\-•*>])(?:action[s]?\s*[àa]\s*mener|actions?\s*[àa]\s*(?:faire|mener|prévoir|prevoir|traiter)|[àa]\s*faire|[àa]\s*prévoir|[àa]\s*prevoir|[àa]\s*traiter|[àa]\s*suivre|todo|to\s*do|prochaine[s]?\s*[ée]tape[s]?|next\s*step[s]?|rappel|suivi\s*[àa]\s*faire)\s*[:\-–—]\s*/i;

function extractActionItems(text) {
    if (!text) return [];
    const items = [];
    for (const rawLine of String(text).split(/\n+/)) {
        const line = rawLine.replace(/^\s*(?:[-•*>]|\d+[.)])\s*/, '').trim();
        if (!line) continue;
        const m = ACTION_MARKER_RE.exec(line);
        if (!m) continue;
        const desc = line.slice(m.index + m[0].length).trim().replace(/^[-–—:.\s]+/, '').replace(/[.;\s]+$/, '');
        if (desc.length >= 4) items.push({ description: desc });
    }
    return items;
}

function normalizeForCompare(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Le modèle local renvoie souvent du texte brut (avec des \n). Une fois injecté
 * en HTML, les retours à la ligne disparaissent. On convertit donc le texte brut
 * en HTML simple (paragraphes + <br>), ou on laisse le HTML tel quel s'il y en a.
 */
function plainToHtml(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return '';
    if (/<\/?[a-z][\s\S]*>/i.test(s)) return s;
    const escaped = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

/** Fusionne actions explicites + actions IA, sans doublon (comparaison normalisée). */
function dedupeTasks(tasks) {
    const out = [];
    const seen = new Set();
    for (const t of (tasks || [])) {
        const description = String(t?.description || '').trim();
        if (!description) continue;
        const key = normalizeForCompare(description).slice(0, 70);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ ...t, description });
    }
    return out.slice(0, 20);
}

// ── Arborescence ───────────────────────────────────────────────────────────
async function buildTreeText(username) {
    const notebooks = await repo.listNotebooks(username);
    if (!notebooks.length) return '(aucun carnet pour le moment)';
    const sections = await repo.listSections(username);
    return notebooks.map(nb => {
        const secs = sections.filter(s => s.notebook_id === nb.id).map(s => s.title);
        return `- ${nb.title}${secs.length ? ' > ' + secs.join(', ') : ' (sans section)'}`;
    }).join('\n');
}

// ── Application d'une suggestion de classement ─────────────────────────────
async function resolveNotebookSection(username, carnetName, sectionName) {
    let notebookId = null;
    let sectionId = null;
    if (carnetName && String(carnetName).trim()) {
        const title = String(carnetName).trim().slice(0, 120);
        let nb = await repo.findNotebookByTitle(username, title);
        if (!nb) {
            notebookId = await repo.createNotebook({ username, title, description: '', icon: 'NotebookPen', ai_generated: true });
        } else {
            notebookId = nb.id;
        }
    }
    if (notebookId && sectionName && String(sectionName).trim()) {
        const stitle = String(sectionName).trim().slice(0, 120);
        let sec = await repo.findSectionByTitle(username, notebookId, stitle);
        if (!sec) {
            sectionId = await repo.createSection({ notebook_id: notebookId, username, title: stitle, ai_generated: true });
        } else {
            sectionId = sec.id;
        }
    }
    return { notebookId, sectionId };
}

async function applySuggestion(note, username, suggestion) {
    if (!suggestion) return;
    const fields = {};
    const { notebookId, sectionId } = await resolveNotebookSection(username, suggestion.carnet, suggestion.section);
    if (notebookId) fields.notebook_id = notebookId;
    if (sectionId) fields.section_id = sectionId;
    if (!note.title || note.title === 'Sans titre') {
        if (suggestion.titre) fields.title = String(suggestion.titre).slice(0, 200);
    }
    if (Array.isArray(suggestion.tags) && suggestion.tags.length) {
        await repo.replaceTags(note.id, sanitizeTags(suggestion.tags, tagBudget(htmlToText(note.content))), 'ia');
    }
    if (Object.keys(fields).length) await repo.updateNote(note.id, username, fields);
}

// ── Analyse d'une note ─────────────────────────────────────────────────────
async function analyzeNote(noteId, username, { jobId = null, force = false } = {}) {
    const note = await repo.getNote(noteId, username);
    if (!note) throw new Error('Note introuvable');

    // Pas de nouvelle analyse si le contenu n'a pas changé depuis la dernière fois.
    const hash = contentHash(note.content);
    if (!force && note.ai_status === 'done' && note.last_analyzed_hash === hash) {
        return { skipped: true };
    }

    const settings = await getNotesSettings();
    const model = analysisModel(settings);
    const maxChars = parseInt(settings.notes_analysis_max_chars, 10) || 12000;

    const contentText = htmlToText(note.content).slice(0, maxChars);
    const tree = await buildTreeText(username);
    const prompt = renderTemplate(settings.notes_analysis_prompt, {
        TITLE: note.title || 'Sans titre',
        CONTENT: contentText,
        NOTEBOOKS: tree,
        DATE: new Date().toLocaleDateString('fr-FR'),
    });

    await repo.updateNote(noteId, username, { ai_status: 'running', ai_error: null, ai_source: 'apm' });
    if (jobId) await repo.setJobStatus(jobId, 'running');

    let raw;
    try {
        raw = await apmAi.queryAi(prompt, model);
    } catch (e) {
        await repo.updateNote(noteId, username, { ai_status: 'error', ai_error: e.message });
        if (jobId) await repo.setJobStatus(jobId, 'error', e.message);
        throw e;
    }

    const parsed = extractJson(raw);
    const fields = {
        ai_raw: String(raw || '').slice(0, 200000),
        ai_model: model || null,
        ai_source: 'apm',
        ai_processed_at: new Date().toISOString(),
        word_count: repo.countWords(note.content),
        ai_status: 'done',
        ai_error: null,
        last_analyzed_hash: hash,
    };

    let suggestion = null;
    if (parsed && typeof parsed === 'object') {
        suggestion = {
            titre: parsed.titre || '',
            resume: parsed.resume || '',
            corrige: plainToHtml(parsed.corrige || ''),
            reformule: plainToHtml(parsed.reformule || ''),
            tags: sanitizeTags(parsed.tags, tagBudget(contentText)),
            carnet: parsed.carnet || '',
            section: parsed.section || '',
            mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
        };
        fields.summary_ai = suggestion.resume || null;
        fields.content_ai = suggestion.reformule || suggestion.corrige || null;
        fields.ai_suggestion = suggestion;
    } else {
        fields.content_ai = plainToHtml(raw) || null;
        fields.ai_error = "Réponse IA non structurée : la correction/reformulation brute est conservée.";
    }

    await repo.updateNote(noteId, username, fields);

    if (suggestion && suggestion.tags.length) await repo.replaceTags(noteId, sanitizeTags(suggestion.tags, tagBudget(contentText)), 'ia');

    // Tâches proposées : on fusionne TOUJOURS les actions explicites détectées
    // dans le texte (« Action à mener : … ») avec celles renvoyées par l'IA.
    // Filet de sécurité si le modèle local oublie une action évidente.
    const aiTasks = (parsed && typeof parsed === 'object' && Array.isArray(parsed.taches)) ? parsed.taches : null;
    const explicitTasks = extractActionItems(contentText);
    const mergedTasks = dedupeTasks([...explicitTasks, ...(aiTasks || [])]);
    if (mergedTasks.length) {
        await repo.replaceProposedTasks(noteId, mergedTasks);
    } else if (aiTasks === null) {
        // Le prompt d'analyse n'a rien dit sur les tâches → détection dédiée, en arrière-plan.
        try { await proposeTasks(noteId, username); }
        catch (e) { console.error(`[NOTES] détection des tâches #${noteId} échouée :`, e.message); }
    } else {
        await repo.replaceProposedTasks(noteId, []);
    }

    // Classement automatique : l'IA propose carnet + section, et l'application
    // se fait d'elle-même (création des carnets/sections manquants). Le réglage
    // notes_auto_classify permet à l'admin de désactiver ce comportement.
    const autoClassify = String(settings.notes_auto_classify) !== 'false';
    if (autoClassify && suggestion) {
        await applySuggestion(note, username, suggestion);
    }

    if (jobId) await repo.setJobStatus(jobId, 'done');
    return { suggestion };
}

// ── File d'attente en mémoire (séquentielle) ───────────────────────────────
const queue = [];
const queuedIds = new Set();
let running = false;

function enqueueAnalyze(noteId, username, { force = false } = {}) {
    if (queuedIds.has(noteId)) return false;
    queuedIds.add(noteId);
    queue.push({ noteId, username, force });
    processQueue();
    return true;
}

async function processQueue() {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            const { noteId, username, force } = queue.shift();
            queuedIds.delete(noteId);
            let jobId = null;
            try {
                jobId = await repo.createJob({ noteId, username, kind: 'analyze' });
                await analyzeNote(noteId, username, { jobId, force });
            } catch (e) {
                console.error(`[NOTES] analyse #${noteId} échouée :`, e.message);
                try { await repo.updateNote(noteId, username, { ai_status: 'error', ai_error: e.message }); } catch { /* ignore */ }
                if (jobId) { try { await repo.setJobStatus(jobId, 'error', e.message); } catch { /* ignore */ } }
            }
        }
    } finally {
        running = false;
    }
}

function isProcessing(noteId) {
    return queuedIds.has(noteId);
}

// ── Planification différée (anti-surcharge IA) ─────────────────────────────
// Analyse unitaire : 3 min après la DERNIÈRE modification de la note.
// Classement global : 1 h après la dernière modification de l'une des notes.
const NOTE_ANALYSIS_DELAY_MS = 3 * 60 * 1000;
const GLOBAL_CLASSIFY_DELAY_MS = 60 * 60 * 1000;

const noteTimers = new Map();   // `${username}:${noteId}` -> timer
const globalTimers = new Map(); // username -> timer

/** (Re)programme l'analyse unitaire d'une note 3 min après sa dernière modif. */
function scheduleNoteAnalysis(noteId, username, delay = NOTE_ANALYSIS_DELAY_MS) {
    const key = `${username}:${noteId}`;
    const prev = noteTimers.get(key);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
        noteTimers.delete(key);
        enqueueAnalyze(noteId, username);
    }, delay);
    noteTimers.set(key, timer);
}

/** (Re)programme le classement global d'un utilisateur 1 h après sa dernière modif. */
function scheduleGlobalClassification(username, delay = GLOBAL_CLASSIFY_DELAY_MS) {
    if (globalTimers.has(username)) clearTimeout(globalTimers.get(username));
    const timer = setTimeout(() => {
        globalTimers.delete(username);
        runGlobalClassification(username).catch((e) => console.error('[NOTES] classement global:', e.message));
    }, delay);
    globalTimers.set(username, timer);
}

/** Appelé après une modification de note : programme analyse unitaire + classement global selon les réglages. */
async function scheduleForSave(noteId, username) {
    const s = await getNotesSettings();
    if (String(s.notes_auto_analyze) !== 'false') scheduleNoteAnalysis(noteId, username);
    if (String(s.notes_auto_classify) !== 'false') scheduleGlobalClassification(username);
}

/** Classement global immédiat : propose une organisation de TOUTES les notes et l'applique. */
async function runGlobalClassification(username) {
    const result = await proposeReorganization(username, {});
    const proposal = result && result.proposal;
    if (!proposal || !Array.isArray(proposal.carnets) || !proposal.carnets.length) {
        return { moved: 0, createdNotebooks: 0, createdSections: 0, count: 0 };
    }
    const applied = await applyClassification(username, proposal);
    return { ...applied, count: result.count || 0 };
}

// ── Extraction de tâches ───────────────────────────────────────────────────
/**
 * Relance uniquement l'extraction de tâches à partir du contenu de la note
 * (prompt dédié notes_task_prompt), sans refaire correction/reformulation.
 * Remplace les propositions encore en attente et renvoie la liste complète.
 */
async function proposeTasks(noteId, username) {
    const note = await repo.getNote(noteId, username);
    if (!note) throw new Error('Note introuvable');
    const settings = await getNotesSettings();
    const maxChars = parseInt(settings.notes_analysis_max_chars, 10) || 12000;
    const prompt = renderTemplate(settings.notes_task_prompt, {
        CONTENT: htmlToText(note.content).slice(0, maxChars),
    });
    const raw = await apmAi.queryAi(prompt, analysisModel(settings));
    const parsed = extractJson(raw);
    const aiTasks = Array.isArray(parsed?.taches) ? parsed.taches : [];
    const explicitTasks = extractActionItems(htmlToText(note.content).slice(0, maxChars));
    const merged = dedupeTasks([...explicitTasks, ...aiTasks]);
    await repo.replaceProposedTasks(noteId, merged);
    return { tasks: await repo.listTaskSuggestions(noteId), raw };
}

// ── Classement / réorganisation d'un lot ──────────────────────────────────
function notesToLines(notes) {
    return notes.map(n => {
        const tags = (n.tags || []).join(', ');
        const text = (n.summary_ai || n.excerpt || '').replace(/\s+/g, ' ').slice(0, 220);
        return `#${n.id} | ${n.title || 'Sans titre'} | tags: ${tags || '-'} | ${text}`;
    }).join('\n');
}

async function proposeClassification(username, { notebookId } = {}) {
    const notes = await repo.getNotesForClassify(username, { notebookId });
    if (!notes.length) return { proposal: { carnets: [] }, raw: '', count: 0 };
    const settings = await getNotesSettings();
    const prompt = renderTemplate(settings.notes_classify_prompt, { NOTES: notesToLines(notes) });
    const raw = await apmAi.queryAi(prompt, classifyModel(settings));
    return { proposal: extractJson(raw) || { carnets: [] }, raw, count: notes.length };
}

async function proposeReorganization(username, { notebookId } = {}) {
    const notes = await repo.getNotesForClassify(username, { notebookId });
    if (!notes.length) return { proposal: { carnets: [] }, raw: '', count: 0 };
    const settings = await getNotesSettings();
    const tree = await buildTreeText(username);
    const prompt = renderTemplate(settings.notes_reorganize_prompt, { TREE: tree, NOTES: notesToLines(notes) });
    const raw = await apmAi.queryAi(prompt, classifyModel(settings));
    return { proposal: extractJson(raw) || { carnets: [] }, raw, count: notes.length };
}

/** Applique une proposition {carnets:[{nom, description, sections:[{nom, notes:[ids]}]}]}. */
async function applyClassification(username, proposal) {
    if (!proposal || !Array.isArray(proposal.carnets)) {
        throw new Error('Proposition invalide : clé "carnets" attendue');
    }
    const allNotes = await repo.listNotes(username, { limit: 2000 });
    const owned = new Set(allNotes.map(n => n.id));
    let moved = 0;
    let createdNotebooks = 0;
    let createdSections = 0;

    for (const carnet of proposal.carnets) {
        const cname = String(carnet.nom || '').trim();
        if (!cname) continue;
        let nb = await repo.findNotebookByTitle(username, cname);
        let notebookId;
        if (!nb) {
            notebookId = await repo.createNotebook({ username, title: cname, description: carnet.description || '', icon: 'NotebookPen', ai_generated: true });
            createdNotebooks++;
        } else {
            notebookId = nb.id;
        }
        for (const section of (carnet.sections || [])) {
            const sname = String(section.nom || '').trim();
            let sectionId = null;
            if (sname) {
                let sec = await repo.findSectionByTitle(username, notebookId, sname);
                if (!sec) {
                    sectionId = await repo.createSection({ notebook_id: notebookId, username, title: sname, ai_generated: true });
                    createdSections++;
                } else {
                    sectionId = sec.id;
                }
            }
            const ids = (section.notes || []).map(Number).filter(id => owned.has(id));
            for (const id of ids) {
                await repo.updateNote(id, username, { notebook_id: notebookId, section_id: sectionId });
                moved++;
            }
        }
    }
    return { moved, createdNotebooks, createdSections };
}

// ── Nuage de mots ──────────────────────────────────────────────────────────
async function wordCloud(username, { notebookId, days, limit = 80 } = {}) {
    const { notes, tags } = await repo.getWordCloudSource(username, { notebookId, days });
    const stopRaw = await getSetting('notes_wordcloud_stopwords');
    const stop = new Set(String(stopRaw || DEFAULT_STOPWORDS).split(/[\n,;|]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
    const freq = new Map();

    for (const n of notes) {
        const text = `${n.title || ''} ${htmlToText(n.content_ai || n.content || '')}`;
        for (const word of tokenize(text)) {
            if (word.length < 3 || stop.has(word) || /^\d+$/.test(word)) continue;
            freq.set(word, (freq.get(word) || 0) + 1);
        }
    }
    // Les tags IA pèsent plus lourd : ils résument l'intention des notes.
    for (const t of tags) {
        const tag = String(t.tag || '').trim().toLowerCase();
        if (!tag || stop.has(tag)) continue;
        freq.set(tag, (freq.get(tag) || 0) + (Number(t.count) || 0) * 3);
    }

    const sorted = [...freq.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.max(10, Math.min(limit, 200)));
    const max = sorted[0]?.count || 1;
    return sorted.map(w => ({ ...w, weight: Math.round((w.count / max) * 100) / 100 }));
}

module.exports = {
    getNotesSettings,
    htmlToText,
    extractJson,
    extractActionItems,
    dedupeTasks,
    sanitizeTags,
    tagBudget,
    buildTreeText,
    analyzeNote,
    enqueueAnalyze,
    isProcessing,
    scheduleNoteAnalysis,
    scheduleGlobalClassification,
    scheduleForSave,
    runGlobalClassification,
    proposeTasks,
    proposeClassification,
    proposeReorganization,
    applyClassification,
    applySuggestion,
    wordCloud,
};
