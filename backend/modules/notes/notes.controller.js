/**
 * Contrôleur HTTP du module « Mes Notes ».
 * Toutes les routes sont authentifiées ; les notes sont strictement
 * personnelles (filtrées par req.user.username). Les réglages IA sont
 * réservés aux administrateurs.
 */
const { pgDb, getSqlite } = require('../../shared/database');
const path = require('path');
const storage = require('../../shared/storage');
const repo = require('./notes.repository');
const ai = require('./notes-ai.service');
const { NOTES_SETTING_KEYS, SETTING_DEFAULTS } = require('./notes-prompts');

const NOTES_MODULE = 'notes';
let docsService = null;
try { docsService = require('../../shared/documents.service'); } catch { docsService = null; }

function attachmentUrl(row) {
    return `/api/notes/${row.note_id}/attachments/${row.id}/download`;
}
/** URL servie sans JWT (mount /api/storage du serveur) — pratique pour <img>/<a download>. */
function attachmentPublicUrl(row) {
    const ref = String(row.storage_ref || '').replace(/\\/g, '/');
    const rel = ref.startsWith('storage/') ? ref.slice('storage/'.length) : ref;
    return rel ? `/api/storage/${rel}` : null;
}
function decorateAttachment(row) {
    return { ...row, url: attachmentUrl(row), public_url: attachmentPublicUrl(row) };
}

async function getAdSettings() {
    try {
        const sqlite = getSqlite();
        if (!sqlite) return null;
        return await sqlite.get('SELECT * FROM ad_settings WHERE id = 1');
    } catch {
        return null;
    }
}

const ctrl = {
    // ── Arborescence / méta ────────────────────────────────────────────────
    async getTree(req, res) {
        try {
            const username = req.user.username;
            await repo.ensureInbox(username);
            const [notebooks, sections, counts, tags] = await Promise.all([
                repo.listNotebooks(username),
                repo.listSections(username),
                repo.getCounts(username),
                repo.listAllTags(username, 60),
            ]);
            const totalNotes = counts.reduce((s, r) => s + (r.c || 0), 0);
            const tree = notebooks.map(nb => {
                const nbCount = counts.filter(c => c.notebook_id === nb.id).reduce((s, c) => s + c.c, 0);
                const secs = sections
                    .filter(s => s.notebook_id === nb.id)
                    .map(s => ({ ...s, note_count: counts.filter(c => c.section_id === s.id).reduce((a, c) => a + c.c, 0) }));
                return { ...nb, note_count: nbCount, sections: secs };
            });
            res.json({ notebooks: tree, tags, total_notes: totalNotes });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async getStats(req, res) {
        try {
            const stats = await repo.getStats(req.user.username);
            res.json(stats);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    /** Réglages non sensibles exposés aux utilisateurs (comportement auto de l'IA). */
    async getPublicSettings(req, res) {
        try {
            const settings = await ai.getNotesSettings();
            res.json({
                auto_analyze: String(settings.notes_auto_analyze) !== 'false',
                auto_classify: String(settings.notes_auto_classify) !== 'false',
                model: settings.notes_apm_model || '',
            });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async listTags(req, res) {
        try {
            res.json(await repo.listAllTags(req.user.username, 200));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async wordCloud(req, res) {
        try {
            const words = await ai.wordCloud(req.user.username, {
                notebookId: req.query.notebook_id ? parseInt(req.query.notebook_id, 10) : undefined,
                days: req.query.days ? parseInt(req.query.days, 10) : undefined,
                limit: req.query.limit ? parseInt(req.query.limit, 10) : 80,
            });
            res.json({ words });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Carnets ────────────────────────────────────────────────────────────
    async createNotebook(req, res) {
        try {
            const { title, description, color, icon } = req.body || {};
            if (!title || !String(title).trim()) return res.status(400).json({ message: 'Titre requis' });
            const id = await repo.createNotebook({ username: req.user.username, title: String(title).trim(), description: description || '', color, icon });
            res.json(await repo.getNotebook(id, req.user.username));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async updateNotebook(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const nb = await repo.getNotebook(id, req.user.username);
            if (!nb) return res.status(404).json({ message: 'Carnet introuvable' });
            await repo.updateNotebook(id, req.user.username, req.body || {});
            res.json(await repo.getNotebook(id, req.user.username));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async deleteNotebook(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const nb = await repo.getNotebook(id, req.user.username);
            if (!nb) return res.status(404).json({ message: 'Carnet introuvable' });
            if (nb.is_inbox) return res.status(400).json({ message: 'La boîte de réception ne peut pas être supprimée' });
            await repo.deleteNotebook(id, req.user.username);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Sections ───────────────────────────────────────────────────────────
    async createSection(req, res) {
        try {
            const { notebook_id, title, description } = req.body || {};
            const nb = await repo.getNotebook(parseInt(notebook_id, 10), req.user.username);
            if (!nb) return res.status(404).json({ message: 'Carnet introuvable' });
            if (!title || !String(title).trim()) return res.status(400).json({ message: 'Titre requis' });
            const id = await repo.createSection({ notebook_id: nb.id, username: req.user.username, title: String(title).trim(), description: description || '' });
            res.json(await repo.getSection(id, req.user.username));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async updateSection(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const sec = await repo.getSection(id, req.user.username);
            if (!sec) return res.status(404).json({ message: 'Section introuvable' });
            if (req.body && req.body.notebook_id !== undefined) {
                const nb = await repo.getNotebook(parseInt(req.body.notebook_id, 10), req.user.username);
                if (!nb) return res.status(404).json({ message: 'Carnet introuvable' });
            }
            await repo.updateSection(id, req.user.username, req.body || {});
            res.json(await repo.getSection(id, req.user.username));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async deleteSection(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const sec = await repo.getSection(id, req.user.username);
            if (!sec) return res.status(404).json({ message: 'Section introuvable' });
            await repo.deleteSection(id, req.user.username);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Notes ──────────────────────────────────────────────────────────────
    async listNotes(req, res) {
        try {
            const notes = await repo.listNotes(req.user.username, {
                notebookId: req.query.notebook_id ? parseInt(req.query.notebook_id, 10) : undefined,
                sectionId: req.query.section_id ? parseInt(req.query.section_id, 10) : undefined,
                q: (req.query.q || '').trim(),
                tag: (req.query.tag || '').trim(),
                includeArchived: req.query.archived === 'true',
                limit: req.query.limit ? parseInt(req.query.limit, 10) : 500,
            });
            res.json(notes);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async searchNotes(req, res) {
        try {
            const q = (req.query.q || '').trim();
            if (!q) return res.json([]);
            res.json(await repo.listNotes(req.user.username, { q, limit: 100 }));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async getNote(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const [tags, mentions, versions, notebook, section, taskSuggestions, attachments] = await Promise.all([
                repo.listTags(id),
                repo.listMentions(id),
                repo.listVersions(id, 30),
                note.notebook_id ? repo.getNotebook(note.notebook_id, req.user.username) : null,
                note.section_id ? repo.getSection(note.section_id, req.user.username) : null,
                repo.listTaskSuggestions(id),
                repo.listAttachments(id),
            ]);
            res.json({ ...note, tags, mentions, versions, notebook, section, task_suggestions: taskSuggestions, attachments: attachments.map(decorateAttachment), processing: ai.isProcessing(id) });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async createNote(req, res) {
        try {
            const username = req.user.username;
            const { title, content, notebook_id, section_id } = req.body || {};
            const inbox = await repo.ensureInbox(username);
            let nbId = notebook_id ? parseInt(notebook_id, 10) : inbox.id;
            let secId = section_id ? parseInt(section_id, 10) : null;
            const nb = await repo.getNotebook(nbId, username);
            if (!nb) { nbId = inbox.id; }
            if (!secId) {
                const sections = (await repo.listSections(username)).filter(s => s.notebook_id === nbId);
                secId = sections.length ? sections[0].id : await repo.ensureDefaultSection(nbId, username);
            }
            const id = await repo.createNote({ username, notebook_id: nbId, section_id: secId, title: title || 'Sans titre', content: content || '' });
            if (content) await repo.addVersion(id, { content, title: title || 'Sans titre', origin: 'original', createdBy: username });
            if (Array.isArray(req.body?.tags)) await repo.setTags(id, req.body.tags, 'manual');
            if (Array.isArray(req.body?.mentions)) await repo.replaceMentions(id, req.body.mentions);
            const note = await repo.getNote(id, username);
            res.json({ ...note, tags: await repo.listTags(id), mentions: await repo.listMentions(id) });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async updateNote(req, res) {
        try {
            const username = req.user.username;
            const id = parseInt(req.params.id, 10);
            const existing = await repo.getNote(id, username);
            if (!existing) return res.status(404).json({ message: 'Note introuvable' });

            const body = req.body || {};
            const fields = {};
            for (const key of ['title', 'content', 'notebook_id', 'section_id', 'is_pinned', 'is_archived', 'position', 'content_ai']) {
                if (body[key] !== undefined) fields[key] = body[key];
            }
            if (fields.content !== undefined && fields.content !== existing.content) {
                await repo.addVersion(id, { content: existing.content, title: existing.title, origin: 'manual', createdBy: username });
                fields.word_count = repo.countWords(fields.content);
            }
            if (body.notebook_id !== undefined && body.notebook_id !== null) {
                const nb = await repo.getNotebook(parseInt(body.notebook_id, 10), username);
                if (!nb) return res.status(404).json({ message: 'Carnet introuvable' });
            }
            if (body.section_id !== undefined && body.section_id !== null) {
                const sec = await repo.getSection(parseInt(body.section_id, 10), username);
                if (!sec) return res.status(404).json({ message: 'Section introuvable' });
            }
            await repo.updateNote(id, username, fields);
            if (Array.isArray(body.tags)) await repo.setTags(id, body.tags, 'manual');
            if (Array.isArray(body.mentions)) await repo.replaceMentions(id, body.mentions);
            const note = await repo.getNote(id, username);
            res.json({ ...note, tags: await repo.listTags(id), mentions: await repo.listMentions(id) });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async deleteNote(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            await repo.deleteNote(id, req.user.username);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Versions ───────────────────────────────────────────────────────────
    async listVersions(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            res.json(await repo.listVersions(id, 50));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async restoreVersion(req, res) {
        try {
            const username = req.user.username;
            const id = parseInt(req.params.id, 10);
            const versionId = parseInt(req.params.versionId, 10);
            const note = await repo.getNote(id, username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const version = await repo.getVersion(versionId, id);
            if (!version) return res.status(404).json({ message: 'Version introuvable' });
            await repo.addVersion(id, { content: note.content, title: note.title, origin: 'manual', createdBy: username });
            await repo.updateNote(id, username, { content: version.content, title: version.title || note.title, word_count: repo.countWords(version.content), content_origin: 'manual' });
            res.json(await repo.getNote(id, username));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Pièces jointes ─────────────────────────────────────────────────────
    async listAttachments(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const rows = await repo.listAttachments(id);
            res.json(rows.map(decorateAttachment));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async uploadAttachment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'Aucun fichier reçu' });

            req.file.originalname = storage.fixUploadName(req.file.originalname);
            const saved = await storage.saveFile(NOTES_MODULE, id, req.file);

            const attId = await repo.addAttachment({
                noteId: id,
                filename: saved.filename,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                storageRef: saved.dbPath,
                uploadedBy: req.user.username,
            });

            if (docsService) {
                try {
                    await docsService.registerExternalUpload({
                        module: NOTES_MODULE,
                        entityType: 'note_attachment',
                        entityId: id,
                        title: req.file.originalname,
                        filename: saved.filename,
                        originalName: req.file.originalname,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        storageRef: saved.dbPath,
                        uploadedBy: req.user.username,
                    });
                } catch (e) {
                    console.error('[NOTES] hub_docs register:', e.message);
                }
            }

            const row = await repo.getAttachment(attId, id);
            res.json(decorateAttachment(row));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async downloadAttachment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const attId = parseInt(req.params.attId, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const att = await repo.getAttachment(attId, id);
            if (!att) return res.status(404).json({ message: 'Pièce jointe introuvable' });

            const f = await storage.getFileForServe(att.storage_ref);
            if (!f) return res.status(404).json({ message: 'Fichier introuvable sur le stockage' });

            const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
            const name = att.original_name || att.filename || 'fichier';
            res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
            res.type(att.mimetype || path.extname(name) || 'application/octet-stream');
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            return res.send(f.buffer);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async deleteAttachment(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const attId = parseInt(req.params.attId, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const att = await repo.getAttachment(attId, id);
            if (!att) return res.status(404).json({ message: 'Pièce jointe introuvable' });

            if (storage.isStoragePath(att.storage_ref)) {
                try { await storage.deleteFile(att.storage_ref); } catch { /* ignore */ }
            }
            await repo.deleteAttachment(attId, id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── IA ─────────────────────────────────────────────────────────────────
    async analyzeNote(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            await repo.updateNote(id, req.user.username, { ai_status: 'pending', ai_error: null });
            ai.enqueueAnalyze(id, req.user.username);
            res.status(202).json({ queued: true, status: 'pending' });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async analyzeAll(req, res) {
        try {
            const username = req.user.username;
            const notes = await repo.listNotes(username, { limit: 2000 });
            const force = req.body?.force === true;
            const targets = notes.filter(n => force || n.ai_status !== 'done');
            for (const n of targets) {
                await repo.updateNote(n.id, username, { ai_status: 'pending', ai_error: null });
                ai.enqueueAnalyze(n.id, username);
            }
            res.status(202).json({ queued: targets.length, total: notes.length });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async aiStatus(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            res.json({
                id: note.id,
                ai_status: note.ai_status,
                ai_error: note.ai_error,
                ai_processed_at: note.ai_processed_at,
                ai_model: note.ai_model,
                summary_ai: note.summary_ai,
                content_ai: note.content_ai,
                ai_suggestion: note.ai_suggestion,
                title: note.title,
                notebook_id: note.notebook_id,
                section_id: note.section_id,
                processing: ai.isProcessing(id),
                tags: await repo.listTags(id),
                task_suggestions: await repo.listTaskSuggestions(id),
            });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async applySuggestion(req, res) {
        try {
            const username = req.user.username;
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const suggestion = req.body?.suggestion || note.ai_suggestion;
            if (!suggestion) return res.status(400).json({ message: 'Aucune suggestion IA disponible' });
            await ai.applySuggestion(note, username, suggestion);
            const updated = await repo.getNote(id, username);
            res.json({ ok: true, note: updated });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Tâches suggérées par l'IA ──────────────────────────────────────────
    async listTaskSuggestions(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            res.json(await repo.listTaskSuggestions(id));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async proposeTasks(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const result = await ai.proposeTasks(id, req.user.username);
            res.json(result);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    async updateTaskSuggestion(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            const sid = parseInt(req.params.sid, 10);
            const note = await repo.getNote(id, req.user.username);
            if (!note) return res.status(404).json({ message: 'Note introuvable' });
            const existing = await repo.getTaskSuggestion(sid, id);
            if (!existing) return res.status(404).json({ message: 'Suggestion introuvable' });
            const body = req.body || {};
            const fields = {};
            if (body.description !== undefined) fields.description = String(body.description).trim();
            if (body.assignee !== undefined) fields.assignee = body.assignee;
            if (body.deadline !== undefined) fields.deadline = body.deadline;
            if (body.app_task_id !== undefined) fields.app_task_id = body.app_task_id;
            if (body.status !== undefined) {
                if (!['proposed', 'accepted', 'rejected'].includes(body.status)) {
                    return res.status(400).json({ message: 'Statut invalide' });
                }
                fields.status = body.status;
            }
            await repo.updateTaskSuggestion(sid, id, fields);
            res.json(await repo.getTaskSuggestion(sid, id));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async classify(req, res) {
        try {
            const result = await ai.proposeClassification(req.user.username, {
                notebookId: req.body?.notebook_id ? parseInt(req.body.notebook_id, 10) : undefined,
            });
            res.json(result);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    async reorganize(req, res) {
        try {
            const result = await ai.proposeReorganization(req.user.username, {
                notebookId: req.body?.notebook_id ? parseInt(req.body.notebook_id, 10) : undefined,
            });
            res.json(result);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    async applyClassification(req, res) {
        try {
            const result = await ai.applyClassification(req.user.username, req.body?.proposal);
            res.json(result);
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ── Recherche d'agents pour @mentions ──────────────────────────────────
    async searchAgents(req, res) {
        try {
            const q = (req.query.q || '').trim();
            if (q.length < 2) return res.json([]);
            const like = `%${q}%`;
            const results = [];
            const seen = new Set();
            const pushUser = (u) => {
                if (!u) return;
                const email = (u.email || '').toLowerCase();
                const name = u.displayName || u.display_name || u.name || u.username || '';
                const key = email || name.toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                results.push({ username: u.username || '', displayName: name, email: u.email || '', service: u.service || '' });
            };

            try {
                const rows = await pgDb.all(
                    `SELECT username, "displayName", email, service_code AS service FROM hub.users
                     WHERE LOWER(COALESCE("displayName", '')) LIKE LOWER(?) OR LOWER(COALESCE(email, '')) LIKE LOWER(?) OR LOWER(COALESCE(username, '')) LIKE LOWER(?)
                     LIMIT 20`,
                    [like, like, like]
                );
                rows.forEach(pushUser);
            } catch { /* hub.users indisponible */ }

            try {
                const adSettings = await getAdSettings();
                if (adSettings && adSettings.is_enabled) {
                    const { searchADUsersByQuery } = require('../../shared/ad_helper');
                    const adUsers = await searchADUsersByQuery(q, adSettings);
                    (adUsers || []).forEach(pushUser);
                }
            } catch { /* AD indisponible */ }

            res.json(results.slice(0, 20));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ── Réglages IA (admin) ────────────────────────────────────────────────
    async getAiSettings(req, res) {
        try {
            const config = {};
            const sqlite = getSqlite();
            for (const key of NOTES_SETTING_KEYS) {
                let value = SETTING_DEFAULTS[key];
                if (sqlite) {
                    const row = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
                    if (row && row.setting_value !== null && row.setting_value !== undefined) value = row.setting_value;
                }
                config[key] = value;
            }
            res.json(config);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async saveAiSettings(req, res) {
        try {
            const sqlite = getSqlite();
            if (!sqlite) return res.status(503).json({ message: 'Base de configuration indisponible' });
            const payload = req.body || {};
            for (const key of NOTES_SETTING_KEYS) {
                if (payload[key] === undefined) continue;
                const existing = await sqlite.get('SELECT 1 FROM app_settings WHERE setting_key = ?', [key]);
                if (existing) {
                    await sqlite.run('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [String(payload[key]), key]);
                } else {
                    await sqlite.run('INSERT INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)', [key, String(payload[key]), 'Mes Notes IA']);
                }
            }
            res.json({ message: 'Paramètres enregistrés' });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async listModels(req, res) {
        try {
            const apmAi = require('../../shared/apm_ai');
            res.json({ models: await apmAi.listModels() });
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    async getAiDefaults(req, res) {
        res.json(SETTING_DEFAULTS);
    },
};

module.exports = ctrl;
