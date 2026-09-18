/**
 * Accès base de données du module « Mes Notes » (schéma hub_notes).
 *
 * Rappels pgDb :
 *  - toujours qualifier les tables (hub_notes.notes…) : « notes » n'est pas
 *    mappé par convertSqliteToPostgres ;
 *  - pgDb.run ajoute automatiquement « RETURNING id » aux INSERT.
 */
const { pgDb } = require('../../shared/database');

const INBOX_TITLE = 'Boîte de réception';
const INBOX_SECTION = 'Non classé';

// ── Reprise des jobs interrompus par un redémarrage ────────────────────────
let _recovered = null;
function ensureRecovered() {
    if (_recovered) return _recovered;
    _recovered = (async () => {
        try {
            await pgDb.run(
                `UPDATE hub_notes.notes SET ai_status = 'error', ai_error = 'Analyse interrompue par un redémarrage du serveur'
                 WHERE ai_status IN ('pending', 'running')`
            );
            await pgDb.run(
                `UPDATE hub_notes.ai_jobs SET status = 'error', error = 'Interrompu par un redémarrage du serveur', finished_at = NOW()
                 WHERE status IN ('pending', 'running')`
            );
        } catch (e) {
            console.error('[NOTES] recover:', e.message);
        }
    })();
    return _recovered;
}

// ── Carnets ────────────────────────────────────────────────────────────────
async function listNotebooks(username) {
    await ensureRecovered();
    return pgDb.all(
        `SELECT * FROM hub_notes.notebooks WHERE username = ? ORDER BY is_inbox DESC, position, title`,
        [username]
    );
}

async function getNotebook(id, username) {
    return pgDb.get('SELECT * FROM hub_notes.notebooks WHERE id = ? AND username = ?', [id, username]);
}

async function createNotebook({ username, title, description = '', color = '#3b82f6', icon = 'NotebookPen', is_inbox = false, ai_generated = false }) {
    const r = await pgDb.run(
        `INSERT INTO hub_notes.notebooks (username, title, description, color, icon, is_inbox, ai_generated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, title, description, color, icon, !!is_inbox, !!ai_generated]
    );
    return r.lastID;
}

async function updateNotebook(id, username, fields) {
    const allowed = ['title', 'description', 'color', 'icon', 'position'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
    }
    if (!sets.length) return 0;
    sets.push('updated_at = NOW()');
    params.push(id, username);
    const r = await pgDb.run(
        `UPDATE hub_notes.notebooks SET ${sets.join(', ')} WHERE id = ? AND username = ?`,
        params
    );
    return r.changes;
}

async function deleteNotebook(id, username) {
    const r = await pgDb.run('DELETE FROM hub_notes.notebooks WHERE id = ? AND username = ?', [id, username]);
    return r.changes;
}

async function findNotebookByTitle(username, title) {
    return pgDb.get(
        `SELECT * FROM hub_notes.notebooks
         WHERE username = ? AND unaccent(LOWER(TRIM(title))) = unaccent(LOWER(TRIM(?))) LIMIT 1`,
        [username, title]
    );
}

/** Renvoie l'id du carnet « Boîte de réception », en le créant au besoin. */
async function ensureInbox(username) {
    let nb = await pgDb.get('SELECT * FROM hub_notes.notebooks WHERE username = ? AND is_inbox = TRUE LIMIT 1', [username]);
    if (!nb) {
        const id = await createNotebook({ username, title: INBOX_TITLE, description: 'Notes non classées en attente du classement IA', icon: 'Inbox', is_inbox: true });
        nb = await pgDb.get('SELECT * FROM hub_notes.notebooks WHERE id = ?', [id]);
    }
    await ensureDefaultSection(nb.id, username);
    return nb;
}

// ── Sections ───────────────────────────────────────────────────────────────
async function listSections(username) {
    return pgDb.all(
        `SELECT * FROM hub_notes.sections WHERE username = ? ORDER BY position, title`,
        [username]
    );
}

async function getSection(id, username) {
    return pgDb.get('SELECT * FROM hub_notes.sections WHERE id = ? AND username = ?', [id, username]);
}

async function createSection({ notebook_id, username, title, description = '', ai_generated = false }) {
    const r = await pgDb.run(
        `INSERT INTO hub_notes.sections (notebook_id, username, title, description, ai_generated)
         VALUES (?, ?, ?, ?, ?)`,
        [notebook_id, username, title, description, !!ai_generated]
    );
    return r.lastID;
}

async function updateSection(id, username, fields) {
    const allowed = ['title', 'description', 'position', 'notebook_id'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
    }
    if (!sets.length) return 0;
    sets.push('updated_at = NOW()');
    params.push(id, username);
    const r = await pgDb.run(`UPDATE hub_notes.sections SET ${sets.join(', ')} WHERE id = ? AND username = ?`, params);
    return r.changes;
}

async function deleteSection(id, username) {
    const r = await pgDb.run('DELETE FROM hub_notes.sections WHERE id = ? AND username = ?', [id, username]);
    return r.changes;
}

async function findSectionByTitle(username, notebookId, title) {
    return pgDb.get(
        `SELECT * FROM hub_notes.sections
         WHERE username = ? AND notebook_id = ? AND unaccent(LOWER(TRIM(title))) = unaccent(LOWER(TRIM(?))) LIMIT 1`,
        [username, notebookId, title]
    );
}

async function ensureDefaultSection(notebookId, username) {
    const existing = await pgDb.get('SELECT id FROM hub_notes.sections WHERE notebook_id = ? LIMIT 1', [notebookId]);
    if (existing) return existing.id;
    return createSection({ notebook_id: notebookId, username, title: INBOX_SECTION, description: '' });
}

// ── Notes ──────────────────────────────────────────────────────────────────
async function listNotes(username, { notebookId, sectionId, includeArchived = false, limit = 500, q = '', tag = '' } = {}) {
    const where = ['n.username = ?'];
    const params = [username];
    if (notebookId) { where.push('n.notebook_id = ?'); params.push(notebookId); }
    if (sectionId) { where.push('n.section_id = ?'); params.push(sectionId); }
    if (q) { where.push('(n.title ILIKE ? OR n.content ILIKE ? OR n.summary_ai ILIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (tag) { where.push('EXISTS (SELECT 1 FROM hub_notes.note_tags t WHERE t.note_id = n.id AND t.tag = ?)'); params.push(tag); }
    if (!includeArchived) where.push('COALESCE(n.is_archived, FALSE) = FALSE');
    params.push(Math.min(Number(limit) || 500, 2000));
    return pgDb.all(
        `SELECT n.id, n.username, n.notebook_id, n.section_id, n.title, n.summary_ai, n.ai_status, n.ai_error,
                n.is_pinned, n.is_archived, n.word_count, n.position, n.created_at, n.updated_at,
                n.ai_processed_at, n.content_ai IS NOT NULL AS has_ai_content,
                LEFT(regexp_replace(COALESCE(n.content, ''), '<[^>]*>', ' ', 'g'), 300) AS excerpt
         FROM hub_notes.notes n
         WHERE ${where.join(' AND ')}
         ORDER BY n.is_pinned DESC, n.updated_at DESC
         LIMIT ?`,
        params
    );
}

async function getNote(id, username) {
    return pgDb.get('SELECT * FROM hub_notes.notes WHERE id = ? AND username = ?', [id, username]);
}

async function createNote({ username, notebook_id, section_id, title = 'Sans titre', content = '', content_origin = 'manual' }) {
    const r = await pgDb.run(
        `INSERT INTO hub_notes.notes (username, notebook_id, section_id, title, content, content_origin, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, notebook_id || null, section_id || null, title, content, content_origin, countWords(content)]
    );
    return r.lastID;
}

async function updateNote(id, username, fields) {
    const allowed = [
        'title', 'content', 'content_ai', 'summary_ai', 'ai_suggestion', 'ai_raw', 'ai_status',
        'ai_error', 'ai_model', 'ai_source', 'ai_processed_at', 'content_origin', 'notebook_id',
        'section_id', 'is_pinned', 'is_archived', 'position', 'word_count', 'last_analyzed_hash',
    ];
    const sets = [];
    const params = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            let placeholder = '?';
            if (key === 'ai_suggestion' && fields[key] !== null && typeof fields[key] === 'object') {
                placeholder = '?::jsonb';
                params.push(JSON.stringify(fields[key]));
                sets.push(`${key} = ${placeholder}`);
                continue;
            }
            sets.push(`${key} = ${placeholder}`);
            params.push(fields[key]);
        }
    }
    if (!sets.length) return 0;
    sets.push('updated_at = NOW()');
    params.push(id, username);
    const r = await pgDb.run(`UPDATE hub_notes.notes SET ${sets.join(', ')} WHERE id = ? AND username = ?`, params);
    return r.changes;
}

async function deleteNote(id, username) {
    const r = await pgDb.run('DELETE FROM hub_notes.notes WHERE id = ? AND username = ?', [id, username]);
    return r.changes;
}

async function touchNote(id, username) {
    return pgDb.run('UPDATE hub_notes.notes SET updated_at = NOW() WHERE id = ? AND username = ?', [id, username]);
}

// ── Versions ───────────────────────────────────────────────────────────────
async function addVersion(noteId, { content, title = null, origin = 'manual', createdBy = null }) {
    const r = await pgDb.run(
        `INSERT INTO hub_notes.note_versions (note_id, content, title, origin, created_by) VALUES (?, ?, ?, ?, ?)`,
        [noteId, content, title, origin, createdBy]
    );
    return r.lastID;
}

async function listVersions(noteId, limit = 50) {
    return pgDb.all(
        `SELECT id, content, title, origin, created_by, created_at FROM hub_notes.note_versions
         WHERE note_id = ? ORDER BY created_at DESC LIMIT ?`,
        [noteId, limit]
    );
}

async function getVersion(id, noteId) {
    return pgDb.get('SELECT * FROM hub_notes.note_versions WHERE id = ? AND note_id = ?', [id, noteId]);
}

// ── Tags ───────────────────────────────────────────────────────────────────
async function replaceTags(noteId, tags, origin = 'ia') {
    await pgDb.run('DELETE FROM hub_notes.note_tags WHERE note_id = ? AND origin = ?', [noteId, origin]);
    const clean = [...new Set((tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    for (const tag of clean) {
        await pgDb.run('INSERT INTO hub_notes.note_tags (note_id, tag, origin) VALUES (?, ?, ?)', [noteId, tag, origin]);
    }
    return clean;
}

async function listTags(noteId) {
    return pgDb.all('SELECT id, tag, origin FROM hub_notes.note_tags WHERE note_id = ? ORDER BY tag', [noteId]);
}

/** Remplace l'intégralité des tags d'une note (utilisé pour l'édition manuelle). */
async function setTags(noteId, tags, origin = 'manual') {
    await pgDb.run('DELETE FROM hub_notes.note_tags WHERE note_id = ?', [noteId]);
    const clean = [...new Set((tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    for (const tag of clean) {
        await pgDb.run('INSERT INTO hub_notes.note_tags (note_id, tag, origin) VALUES (?, ?, ?)', [noteId, tag, origin]);
    }
    return clean;
}

/** Compteurs de notes par carnet / section pour l'arborescence. */
async function getCounts(username) {
    return pgDb.all(
        `SELECT notebook_id, section_id, COUNT(*)::int AS c
         FROM hub_notes.notes
         WHERE username = ? AND COALESCE(is_archived, FALSE) = FALSE
         GROUP BY notebook_id, section_id`,
        [username]
    );
}

async function listAllTags(username, limit = 100) {
    return pgDb.all(
        `SELECT t.tag, COUNT(*)::int AS count
         FROM hub_notes.note_tags t
         JOIN hub_notes.notes n ON n.id = t.note_id
         WHERE n.username = ?
         GROUP BY t.tag
         ORDER BY count DESC, t.tag
         LIMIT ?`,
        [username, limit]
    );
}

// ── Mentions ───────────────────────────────────────────────────────────────
async function replaceMentions(noteId, mentions) {
    await pgDb.run('DELETE FROM hub_notes.note_mentions WHERE note_id = ?', [noteId]);
    const seen = new Set();
    for (const m of mentions || []) {
        const email = (m && (m.email || m.agent_email)) ? String(m.email || m.agent_email).trim().toLowerCase() : null;
        const name = (m && (m.name || m.agent_name)) ? String(m.name || m.agent_name).trim() : null;
        const key = `${email || ''}|${name || ''}`;
        if ((!email && !name) || seen.has(key)) continue;
        seen.add(key);
        await pgDb.run('INSERT INTO hub_notes.note_mentions (note_id, agent_name, agent_email) VALUES (?, ?, ?)', [noteId, name, email]);
    }
}

async function listMentions(noteId) {
    return pgDb.all('SELECT id, agent_name, agent_email FROM hub_notes.note_mentions WHERE note_id = ? ORDER BY id', [noteId]);
}

// ── Tâches suggérées par l'IA ──────────────────────────────────────────────
/** Remplace les propositions encore en attente (les acceptées/refusées sont conservées). */
async function replaceProposedTasks(noteId, tasks) {
    await pgDb.run(`DELETE FROM hub_notes.note_task_suggestions WHERE note_id = ? AND status = 'proposed'`, [noteId]);
    const clean = (tasks || []).filter(t => t && String(t.description || '').trim()).slice(0, 20);
    for (const t of clean) {
        await pgDb.run(
            `INSERT INTO hub_notes.note_task_suggestions (note_id, description, assignee, requester, deadline)
             VALUES (?, ?, ?, ?, ?)`,
            [noteId, String(t.description).trim(), t.responsable || t.assignee || null, t.requester || null, t.echeance || t.deadline || null]
        );
    }
    return clean.length;
}

async function listTaskSuggestions(noteId) {
    return pgDb.all(
        `SELECT id, note_id, description, assignee, requester, deadline, status, app_task_id, created_at
         FROM hub_notes.note_task_suggestions WHERE note_id = ? ORDER BY status, id`,
        [noteId]
    );
}

async function getTaskSuggestion(id, noteId) {
    return pgDb.get('SELECT * FROM hub_notes.note_task_suggestions WHERE id = ? AND note_id = ?', [id, noteId]);
}

async function updateTaskSuggestion(id, noteId, fields) {
    const allowed = ['description', 'assignee', 'requester', 'deadline', 'status', 'app_task_id'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
    }
    if (!sets.length) return 0;
    sets.push('updated_at = NOW()');
    params.push(id, noteId);
    const r = await pgDb.run(`UPDATE hub_notes.note_task_suggestions SET ${sets.join(', ')} WHERE id = ? AND note_id = ?`, params);
    return r.changes;
}

// ── File d'attente IA ──────────────────────────────────────────────────────
async function createJob({ noteId, username, kind = 'analyze' }) {
    const r = await pgDb.run(
        `INSERT INTO hub_notes.ai_jobs (note_id, username, kind, status) VALUES (?, ?, ?, 'pending')`,
        [noteId, username, kind]
    );
    return r.lastID;
}

async function setJobStatus(id, status, error = null) {
    if (status === 'running') {
        return pgDb.run('UPDATE hub_notes.ai_jobs SET status = ?, started_at = NOW() WHERE id = ?', [status, id]);
    }
    if (status === 'pending') {
        return pgDb.run('UPDATE hub_notes.ai_jobs SET status = ? WHERE id = ?', [status, id]);
    }
    return pgDb.run('UPDATE hub_notes.ai_jobs SET status = ?, error = ?, finished_at = NOW() WHERE id = ?', [status, error, id]);
}

async function getPendingJobs(limit = 50) {
    return pgDb.all(
        `SELECT * FROM hub_notes.ai_jobs WHERE status = 'pending' ORDER BY created_at LIMIT ?`,
        [limit]
    );
}

// ── Statistiques / nuage de mots ───────────────────────────────────────────
async function getStats(username) {
    const row = await pgDb.get(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE ai_status = 'done')::int AS analyzed,
           COUNT(*) FILTER (WHERE ai_status IN ('pending','running'))::int AS processing,
           COUNT(*) FILTER (WHERE ai_status = 'error')::int AS failed,
           COALESCE(SUM(word_count), 0)::int AS words
         FROM hub_notes.notes
         WHERE username = ? AND COALESCE(is_archived, FALSE) = FALSE`,
        [username]
    );
    const notebooks = await pgDb.get('SELECT COUNT(*)::int AS c FROM hub_notes.notebooks WHERE username = ?', [username]);
    const sections = await pgDb.get('SELECT COUNT(*)::int AS c FROM hub_notes.sections WHERE username = ?', [username]);
    const tags = await pgDb.get('SELECT COUNT(DISTINCT t.tag)::int AS c FROM hub_notes.note_tags t JOIN hub_notes.notes n ON n.id = t.note_id WHERE n.username = ?', [username]);
    return {
        total: row?.total || 0,
        analyzed: row?.analyzed || 0,
        processing: row?.processing || 0,
        failed: row?.failed || 0,
        words: row?.words || 0,
        notebooks: notebooks?.c || 0,
        sections: sections?.c || 0,
        tags: tags?.c || 0,
    };
}

/** Renvoie le texte brut (contenu + éventuel contenu IA) et les tags des notes d'un utilisateur. */
async function getWordCloudSource(username, { notebookId, days } = {}) {
    const where = ['n.username = ?', 'COALESCE(n.is_archived, FALSE) = FALSE'];
    const params = [username];
    if (notebookId) { where.push('n.notebook_id = ?'); params.push(notebookId); }
    if (days) { where.push(`n.updated_at >= NOW() - (? || ' days')::interval`); params.push(String(parseInt(days, 10) || 0)); }
    const limitIdx = params.length + 1;
    const notes = await pgDb.all(
        `SELECT n.id, n.title, n.content, n.content_ai
         FROM hub_notes.notes n
         WHERE ${where.join(' AND ')}
         ORDER BY n.updated_at DESC
         LIMIT $${limitIdx}`,
        [...params, 1000]
    );
    const tags = await pgDb.all(
        `SELECT t.tag, COUNT(*)::int AS count
         FROM hub_notes.note_tags t
         JOIN hub_notes.notes n ON n.id = t.note_id
         WHERE ${where.join(' AND ')}
         GROUP BY t.tag`,
        params
    ).catch(() => []);
    return { notes, tags };
}

async function getNotesForClassify(username, { notebookId, limit = 300 } = {}) {
    const where = ['n.username = ?', 'COALESCE(n.is_archived, FALSE) = FALSE'];
    const params = [username];
    if (notebookId) { where.push('n.notebook_id = ?'); params.push(notebookId); }
    params.push(Math.min(Number(limit) || 300, 500));
    const notes = await pgDb.all(
        `SELECT n.id, n.title, n.summary_ai,
                LEFT(regexp_replace(COALESCE(n.content, ''), '<[^>]*>', ' ', 'g'), 400) AS excerpt
         FROM hub_notes.notes n
         WHERE ${where.join(' AND ')}
         ORDER BY n.updated_at DESC
         LIMIT ?`,
        params
    );
    const tagRows = await pgDb.all(
        `SELECT t.note_id, t.tag FROM hub_notes.note_tags t JOIN hub_notes.notes n ON n.id = t.note_id
         WHERE ${where.join(' AND ')}`,
        params.slice(0, params.length - 1)
    ).catch(() => []);
    const tagsByNote = {};
    for (const r of tagRows) { (tagsByNote[r.note_id] = tagsByNote[r.note_id] || []).push(r.tag); }
    return notes.map(n => ({ ...n, tags: tagsByNote[n.id] || [] }));
}

function countWords(content) {
    if (!content) return 0;
    const text = String(content).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const words = text.split(/\s+/).filter(w => w.replace(/[^\p{L}\p{N}]/gu, '').length > 1);
    return words.length;
}

module.exports = {
    INBOX_TITLE,
    INBOX_SECTION,
    ensureRecovered,
    listNotebooks, getNotebook, createNotebook, updateNotebook, deleteNotebook, findNotebookByTitle, ensureInbox,
    listSections, getSection, createSection, updateSection, deleteSection, findSectionByTitle, ensureDefaultSection,
    listNotes, getNote, createNote, updateNote, deleteNote, touchNote,
    addVersion, listVersions, getVersion,
    replaceTags, listTags, listAllTags,
    setTags, getCounts,
    replaceMentions, listMentions,
    replaceProposedTasks, listTaskSuggestions, getTaskSuggestion, updateTaskSuggestion,
    createJob, setJobStatus, getPendingJobs,
    getStats, getWordCloudSource, getNotesForClassify,
    countWords,
};
