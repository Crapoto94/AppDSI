const { pgDb, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
const { isSuperAdmin } = require('../../shared/middleware');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apmAi = require('../../shared/apm_ai');
const storage = require('../../shared/storage');
const { listDsiAgents, matchDsiAgent } = require('./agent-match');
const teamsTranscript = require('./teams_transcript.service');

// Module GED pour les pièces jointes : <root>/transcript/<meeting_id>/<fichier>
const ATTACHMENT_MODULE = 'transcript';

const DEFAULT_PROMPT_TEMPLATE = `Tu es un assistant spécialisé dans la synthèse de réunions de direction d'un service informatique (DSI) municipal.
Ta mission est de produire un compte-rendu clair, structuré et professionnel à partir de la transcription fournie.

REUNION : {REUNION}

TRANSCRIPTION :
{TRANSCRIPTION}

---

STRUCTURE DU COMPTE-RENDU (MARKDOWN) :
## Résumé exécutif
(3 à 5 phrases résumant l'essentiel de la réunion)

## Points abordés
(liste des sujets discutés avec une brève description)

## Décisions prises
(liste des décisions actées, ou « Aucune décision formelle » si applicable)

---

INSTRUCTIONS CRITIQUES :
1. Ne rédige PAS de section "Plan d'action" ou "Tâches" dans le texte Markdown.
2. Ne fais AUCUNE mention du bloc JSON à la fin.
3. Ajoute ENSUITE un bloc JSON délimité par \`\`\`json contenant la liste des tâches.

FORMAT DU JSON :
\`\`\`json
[
  {"what": "Description", "who": "Responsable", "req": "Demandeur", "when": "Échéance", "ts": "HH:MM:SS"}
]
\`\`\``;

/**
 * Controller for Transcript Manager module
 */
let importJobs = {};
// Jobs de génération IA asynchrones (POST /meeting/:id/summarize renvoie un jobId,
// le front poll /summarize-status/:jobId). Permet de ne plus jamais retenir une
// requête HTTP 20+ minutes (proxies intermédiaires → 504), le traitement continue
// en arrière-plan côté serveur.
let summarizeJobs = {};

const transcriptController = {
    /**
     * Get all meetings
     */
    getMeetings: async (req, res) => {
        try {
            const db = pgDb;
            const { username, email, role } = req.user;
            const isAdmin = isSuperAdmin(req.user);

            let meetings;
            if (isAdmin) {
                meetings = await db.all(`
                    SELECT m.*,
                    (SELECT COUNT(DISTINCT speaker_name) FROM transcript_cues WHERE meeting_id = m.id) as speaker_count,
                    (SELECT string_agg(DISTINCT speaker_email, ',') FROM transcript_cues WHERE meeting_id = m.id AND speaker_email IS NOT NULL) as speaker_emails,
                    (SELECT MAX(start_seconds) FROM transcript_cues WHERE meeting_id = m.id) as duration_seconds,
                    (SELECT COALESCE(SUM(LENGTH(text)), 0) FROM transcript_cues WHERE meeting_id = m.id) as char_count
                    FROM transcript_meetings m
                    ORDER BY meeting_date DESC NULLS LAST, created_at DESC
                `);
            } else {
                const emailLocal = (email || username || '').split('@')[0].toLowerCase();
                const emailFull = `${emailLocal}@ivry94.fr`;
                meetings = await db.all(`
                    SELECT m.*,
                    (SELECT COUNT(DISTINCT speaker_name) FROM transcript_cues WHERE meeting_id = m.id) as speaker_count,
                    (SELECT string_agg(DISTINCT speaker_email, ',') FROM transcript_cues WHERE meeting_id = m.id AND speaker_email IS NOT NULL) as speaker_emails,
                    (SELECT MAX(start_seconds) FROM transcript_cues WHERE meeting_id = m.id) as duration_seconds,
                    (SELECT COALESCE(SUM(LENGTH(text)), 0) FROM transcript_cues WHERE meeting_id = m.id) as char_count
                    FROM transcript_meetings m
                    WHERE (
                        m.reunion_id IS NOT NULL
                        AND EXISTS (
                            SELECT 1 FROM reunion_participants rp
                            WHERE rp.reunion_id = m.reunion_id
                            AND (LOWER(rp.email) = ? OR LOWER(rp.email) = ? OR LOWER(rp.ad_username) = ?)
                            AND rp.statut_presence IN ('present', 'excuse', 'info')
                        )
                    )
                    OR EXISTS (
                        SELECT 1 FROM transcript_cues tc
                        WHERE tc.meeting_id = m.id
                        AND (LOWER(tc.speaker_email) = ? OR LOWER(tc.speaker_email) = ?)
                    )
                    OR (
                        m.shared_with_direction IS NOT NULL
                        AND EXISTS (
                            SELECT 1 FROM hub_consommables.consumable_requests cr
                            WHERE LOWER(cr.username) = LOWER(?)
                            AND cr.direction = m.shared_with_direction
                        )
                    )
                    OR (
                        m.shared_with_service IS NOT NULL
                        AND EXISTS (
                            SELECT 1 FROM hub_consommables.consumable_requests cr
                            WHERE LOWER(cr.username) = LOWER(?)
                            AND cr.service = m.shared_with_service
                        )
                    )
                    ORDER BY meeting_date DESC NULLS LAST, created_at DESC
                `, [emailFull, emailLocal, emailLocal, emailFull, emailLocal, username, username]);
            }
            res.json(meetings);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get import status
     */
    getImportStatus: (req, res) => {
        const { jobId } = req.params;
        const job = importJobs[jobId];
        if (!job) return res.status(404).json({ status: 'error', message: 'Job non trouvé' });
        res.json(job);
    },

    /**
     * Liste les dernières réunions Teams (calendrier de l'utilisateur courant)
     * disposant d'un transcript Graph. Marque les transcripts déjà importés
     * (idempotence par teams_transcript_id) pour que le front puisse le gérer
     * côté utilisateur.
     */
    listTeamsTranscripts: async (req, res) => {
        try {
            const userEmail = req.user?.email || `${(req.user?.username || '').split('@')[0].toLowerCase()}@ivry94.fr`;
            if (!userEmail || !userEmail.includes('@')) {
                return res.status(400).json({ error: 'Aucune adresse email associée à votre compte.' });
            }

            const result = await teamsTranscript.listTeamsTranscripts(userEmail, 30);
            if (!result.ok) return res.status(502).json({ error: result.error });

            // Transcripts déjà présents en base (idempotence)
            const imported = new Set();
            const rows = await pgDb.all('SELECT teams_transcript_id FROM transcript_meetings WHERE teams_transcript_id IS NOT NULL');
            for (const r of rows) imported.add(r.teams_transcript_id);

            const meetings = (result.meetings || []).map(m => ({ ...m, already_imported: imported.has(m.transcriptId) }));
            res.json({ meetings, warnings: result.warnings || [] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Importe un transcript Teams Graph comme NOUVELLE réunion (sans lien avec
     * le module rencontres) : téléchargement du VTT → création du transcript →
     * pipeline d'insertion des cues (résolution AD + fusion) en job asynchrone
     * (importJobs, pollé côté front via /upload-status/:jobId).
     *
     * En cas de duplicata (même teams_transcript_id déjà importé), renvoie 409
     * avec existingMeetingId — le front demande à l'utilisateur ; si overwrite
     * vaut true, l'ancienne réunion est supprimée et on réimporte.
     */
    importTeamsTranscript: async (req, res) => {
        try {
            const { meetingId, transcriptId, subject, startDateTime, overwrite } = req.body || {};
            if (!meetingId || !transcriptId) return res.status(400).json({ error: 'meetingId et transcriptId requis' });

            const userEmail = req.user?.email || `${(req.user?.username || '').split('@')[0].toLowerCase()}@ivry94.fr`;
            if (!userEmail || !userEmail.includes('@')) {
                return res.status(400).json({ error: 'Aucune adresse email associée à votre compte.' });
            }

            const existing = await pgDb.get('SELECT id, title FROM transcript_meetings WHERE teams_transcript_id = ?', [transcriptId]);
            if (existing && !overwrite) {
                return res.status(409).json({ error: 'Ce transcript a déjà été importé.', existingMeetingId: existing.id, existingTitle: existing.title });
            }
            if (existing && overwrite) {
                await deleteMeetingById(existing.id);
            }

            const jobId = `teams_${Date.now()}`;
            importJobs[jobId] = { progress: 0, status: 'starting', source: 'teams' };
            res.json({ jobId });

            (async () => {
                try {
                    importJobs[jobId].status = 'téléchargement depuis Teams';
                    importJobs[jobId].progress = 5;
                    const content = await teamsTranscript.fetchTranscriptContent(userEmail, meetingId, transcriptId);

                    const title = (subject || `Réunion Teams ${new Date(startDateTime || Date.now()).toLocaleString('fr-FR')}`).trim();
                    const meetingDate = startDateTime ? new Date(startDateTime) : null;

                    const result = await pgDb.run(
                        'INSERT INTO transcript_meetings (title, meeting_date, source, teams_transcript_id) VALUES (?, ?, ?, ?)',
                        [title, meetingDate ? meetingDate.toISOString() : null, 'teams', transcriptId]
                    );
                    const newMeetingId = result.lastID;

                    importJobs[jobId].status = 'analyse';
                    const cues = parseTranscript(content);
                    importJobs[jobId].meetingId = newMeetingId;
                    await processCuesForMeeting(importJobs[jobId], cues, newMeetingId);
                } catch (err) {
                    console.error('[TEAMS IMPORT ERROR]', err.message);
                    importJobs[jobId].status = 'error';
                    importJobs[jobId].message = err.response?.data?.error?.message || err.message;
                }
            })();
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get meeting details with cues
     */
    getMeeting: async (req, res) => {
        try {
            const db = pgDb;
            const meetingId = req.params.id;
            const { username, email, role } = req.user;
            const isAdmin = isSuperAdmin(req.user);

            const meeting = await db.get('SELECT * FROM transcript_meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion non trouvée' });

            if (!isAdmin) {
                const emailLocal = (email || username || '').split('@')[0].toLowerCase();
                const emailFull = `${emailLocal}@ivry94.fr`;

                const canAccess = await db.get(`
                    SELECT 1 FROM transcript_meetings m
                    WHERE m.id = ?
                    AND (
                        (
                            m.reunion_id IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM reunion_participants rp
                                WHERE rp.reunion_id = m.reunion_id
                                AND (LOWER(rp.email) = ? OR LOWER(rp.email) = ? OR LOWER(rp.ad_username) = ?)
                                AND rp.statut_presence IN ('present', 'excuse', 'info')
                            )
                        )
                        OR EXISTS (
                            SELECT 1 FROM transcript_cues tc
                            WHERE tc.meeting_id = m.id
                            AND (LOWER(tc.speaker_email) = ? OR LOWER(tc.speaker_email) = ?)
                        )
                        OR (
                            m.shared_with_direction IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM hub_consommables.consumable_requests cr
                                WHERE LOWER(cr.username) = LOWER(?)
                                AND cr.direction = m.shared_with_direction
                            )
                        )
                        OR (
                            m.shared_with_service IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM hub_consommables.consumable_requests cr
                                WHERE LOWER(cr.username) = LOWER(?)
                                AND cr.service = m.shared_with_service
                            )
                        )
                    )
                `, [meetingId, emailFull, emailLocal, emailLocal, emailFull, emailLocal, username, username]);

                if (!canAccess) return res.status(403).json({ error: 'Accès refusé' });
            }

            const cues = await db.all('SELECT * FROM transcript_cues WHERE meeting_id = ? ORDER BY start_seconds', [meetingId]);
            res.json({ ...meeting, cues });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Upload and parse transcript
     */
    uploadTranscript: async (req, res) => {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Aucun fichier fourni' });

        const jobId = Date.now().toString();
        importJobs[jobId] = { progress: 0, status: 'starting' };

        // Réponse immédiate au client
        res.json({ jobId });

        // Traitement en arrière-plan
        (async () => {
            const db = pgDb;
            try {
                importJobs[jobId].progress = 5;
                importJobs[jobId].status = 'initialisation';

                // Fix encoding for originalname
                let filename = file.originalname;
                try {
                    filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
                } catch (e) {}
                
                const content = fs.readFileSync(file.path, 'utf8');
                const title = filename.replace(/\.(vtt|txt)$/i, '');
                let { reunion_id } = req.body;

                if (reunion_id === 'null' || reunion_id === '') reunion_id = null;
                if (reunion_id) reunion_id = parseInt(reunion_id);

                console.log(`[TM IMPORT] reunion_id: ${reunion_id}, type: ${typeof reunion_id}`);

                const result = await db.run('INSERT INTO transcript_meetings (title, reunion_id) VALUES (?, ?)', [title, reunion_id]);
                const meetingId = result.lastID;

                importJobs[jobId].status = 'analyse';
                const cues = parseTranscript(content);

                await processCuesForMeeting(importJobs[jobId], cues, meetingId);
            } catch (err) {
                console.error('[IMPORT ERROR]', err);
                importJobs[jobId].status = 'error';
                importJobs[jobId].message = err.message;
            }
        })();
    },

    /**
     * List the model(s) available for the currently selected AI source
     * (ai_summary_source setting — see getAiSource): the APM API's active
     * models (GET /api/v1/ai/models) in 'apm' mode, or a single entry
     * describing the locally configured provider/model in 'local' mode
     * (there is only ever one local model — same settings as ticket
     * reformulation, cf. ai_provider in /admin).
     */
    getAiModels: async (req, res) => {
        try {
            const source = await getAiSource();
            if (source === 'local') {
                const label = await describeLocalModel();
                return res.json({ models: [label], source: 'local' });
            }
            const models = await apmAi.listModels();
            const defaultModel = await getTranscriptApmDefaultModel();
            res.json({ models, source: 'apm', defaultModel: defaultModel && models.includes(defaultModel) ? defaultModel : null });
        } catch (error) {
            res.status(502).json({ error: error.message });
        }
    },

    /**
     * Summarize meeting via either the APM AI API (POST /api/v1/ai/query) or
     * AppDSI's local AI provider (groq/gemini/openrouter/anthropic/ollama —
     * same settings as ticket reformulation), depending on the
     * ai_summary_source toggle in /admin (section IA, Transcript Manager).
     * Both paths are non-streaming: the reply is parsed the same way
     * (Markdown summary + trailing ```json task list), tasks are matched
     * against DSI agents (hub_calendrier.agents_dsi) and persisted, but NOT
     * auto-converted into real app tasks — that step requires explicit user
     * validation (see linkAppTask / frontend modal).
     *
     * Asynchrone depuis le fix 504 : la route répond immédiatement avec un
     * jobId, le traitement continue en arrière-plan (cf. summarizeJobs) et le
     * front suivit l'avancement via GET /summarize-status/:jobId. Plus aucune
     * connexion HTTP longue n'expose l'app aux timeout des proxies réseau (nginx,
     * etc.) qui coupaient la génération (ERR_BAD_RESPONSE / HTTP 504).
     */
    summarizeMeeting: async (req, res) => {
        const meetingId = req.params.id;
        try {
            const meeting = await pgDb.get('SELECT * FROM transcript_meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion non trouvée' });

            const jobId = `sum_${Date.now()}_${meetingId}`;
            summarizeJobs[jobId] = {
                status: 'starting',
                progress: 0,
                meetingId: parseInt(meetingId, 10),
                model: (req.body || {}).model || null,
                createdAt: Date.now(),
            };
            pruneSummarizeJobs();

            // Réponse immédiate — le travail se poursuit en arrière-plan.
            res.json({ jobId });

            runSummarizeJob(parseInt(meetingId, 10), summarizeJobs[jobId].model, summarizeJobs[jobId])
                .catch(err => console.error(`[TranscriptManager] Job résumé ${jobId} a échoué :`, err.message));
        } catch (error) {
            console.error('Summarize error:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Statut d'un job de génération (summarizeJobs). Le front le poll pendant
     * qu'il tourne ; status = completed (avec summary/tasks) | error | running.
     */
    getSummarizeStatus: (req, res) => {
        const job = summarizeJobs[req.params.jobId];
        if (!job) return res.status(404).json({ status: 'error', message: 'Job non trouvé' });
        res.json(job);
    },

    /**
     * Link a transcript_task (AI-derived) to the real app task created for it
     * (hub.user_tasks, via POST /api/tasks) once the user has validated it.
     */
    linkAppTask: async (req, res) => {
        try {
            const db = pgDb;
            const { app_task_id } = req.body || {};
            if (!app_task_id) return res.status(400).json({ error: 'app_task_id requis' });
            await db.run('UPDATE transcript_tasks SET app_task_id = ? WHERE id = ?', [app_task_id, req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get tasks for a meeting or all tasks
     */
    getTasks: async (req, res) => {
        try {
            const db = pgDb;
            const meetingId = req.query.meeting_id;
            let query = 'SELECT * FROM transcript_tasks';
            let params = [];
            if (meetingId) {
                query += ' WHERE meeting_id = ?';
                params.push(meetingId);
            }
            query += ' ORDER BY is_completed ASC, created_at DESC';
            const tasks = await db.all(query, params);
            res.json(tasks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Toggle task completion
     */
    toggleTask: async (req, res) => {
        try {
            const db = pgDb;
            const taskId = req.params.id;
            const task = await db.get('SELECT is_completed FROM transcript_tasks WHERE id = ?', [taskId]);
            if (!task) return res.status(404).json({ error: 'Tâche non trouvée' });

            const newVal = task.is_completed ? 0 : 1;
            await db.run('UPDATE transcript_tasks SET is_completed = ? WHERE id = ?', [newVal, taskId]);
            res.json({ id: taskId, is_completed: newVal });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Create manual task
     */
    createTask: async (req, res) => {
        try {
            const db = pgDb;
            const { meeting_id, description, assignee, requester, deadline } = req.body;
            const result = await db.run(
                'INSERT INTO transcript_tasks (meeting_id, description, assignee, requester, deadline, origin) VALUES (?, ?, ?, ?, ?, ?)',
                [meeting_id, description, assignee, requester, deadline, 'manual']
            );
            res.json({ id: result.lastID, description });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Delete meeting and associated data
     */
    deleteMeeting: async (req, res) => {
        try {
            await deleteMeetingById(req.params.id);
            res.json({ success: true, message: 'Réunion supprimée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ===== Pièces jointes (stockées via shared/storage.js → /GED, double-écriture hub_docs) =====

    uploadAttachments: async (req, res) => {
        try {
            const { id } = req.params;
            const username = req.user?.username || 'unknown';
            const meeting = await pgDb.get('SELECT id FROM transcript.meetings WHERE id = ?', [id]);
            if (!meeting) return res.status(404).json({ error: 'Réunion non trouvée' });
            if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Aucun fichier reçu' });

            const inserted = [];
            for (const file of req.files) {
                // Corrige l'encodage du nom (multer décode en latin1) avant l'écriture
                if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
                const saved = await storage.saveFile(ATTACHMENT_MODULE, id, file);

                const result = await pgDb.run(
                    `INSERT INTO transcript.meeting_attachments (meeting_id, filename, original_name, mimetype, size, uploaded_by, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [id, saved.filename, file.originalname, file.mimetype, file.size, username, saved.dbPath]
                );

                // Dual-write : enregistre dans hub_docs (viewer central / GED)
                try {
                    const docsService = require('../../shared/documents.service');
                    await docsService.registerExternalUpload({
                        module: ATTACHMENT_MODULE,
                        entityType: 'attachment',
                        entityId: id,
                        title: file.originalname,
                        filename: saved.filename,
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        storageRef: saved.dbPath,
                        uploadedBy: username,
                    });
                } catch (e) { console.warn('[DOCS] register failed:', e.message); }

                inserted.push({ id: result.lastID, filename: saved.filename, original_name: file.originalname, mimetype: file.mimetype, size: file.size });
            }
            res.json({ uploaded: inserted.length, files: inserted });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    getAttachments: async (req, res) => {
        try {
            const attachments = await pgDb.all(`SELECT * FROM transcript.meeting_attachments WHERE meeting_id = ? ORDER BY created_at DESC`, [req.params.id]);
            res.json(attachments);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    downloadAttachment: async (req, res) => {
        try {
            const att = await pgDb.get(`SELECT * FROM transcript.meeting_attachments WHERE id = ?`, [req.params.id]);
            if (!att) return res.status(404).json({ error: 'PJ introuvable' });

            const storagePath = att.file_path
                || (storage.isStoragePath(att.filename) ? att.filename : null);

            if (storagePath) {
                const f = await storage.getFileForServe(storagePath);
                if (!f) return res.status(404).json({ error: 'Fichier introuvable sur le stockage' });
                const displayName = att.original_name || att.filename || 'fichier';
                const disposition = req.query.mode === 'inline' ? 'inline' : 'attachment';
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(displayName)}"`);
                if (att.mimetype) res.type(att.mimetype);
                else res.type(path.extname(displayName) || 'application/octet-stream');
                if (f.absolutePath) return res.sendFile(f.absolutePath);
                return res.send(f.buffer);
            }

            // Fallback legacy local
            const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
            res.download(filePath, att.original_name || att.filename);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteAttachment: async (req, res) => {
        try {
            const att = await pgDb.get(`SELECT * FROM transcript.meeting_attachments WHERE id = ?`, [req.params.id]);
            if (!att) return res.status(404).json({ error: 'PJ introuvable' });

            // Supprime via le service de stockage (nouveau ou legacy)
            if (storage.isStoragePath(att.file_path)) {
                await storage.deleteFile(att.file_path);
            } else if (storage.isStoragePath(att.filename)) {
                await storage.deleteFile(att.filename);
            } else {
                const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            await pgDb.run(`DELETE FROM transcript.meeting_attachments WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    /**
     * Full-text search across all transcripts
     */
    searchTranscripts: async (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.trim().length < 2) return res.json([]);
            const db = pgDb;
            const { username, email, role } = req.user;
            const isAdmin = isSuperAdmin(req.user);
            const term = `%${q.trim()}%`;

            let rows;
            if (isAdmin) {
                rows = await db.all(`
                    SELECT
                        m.id as meeting_id, m.title as meeting_title,
                        m.meeting_date, m.created_at,
                        c.id as cue_id, c.speaker_name, c.text, c.start_seconds
                    FROM transcript_cues c
                    JOIN transcript_meetings m ON m.id = c.meeting_id
                    WHERE c.text ILIKE ? OR m.title ILIKE ?
                    ORDER BY m.meeting_date DESC NULLS LAST, c.start_seconds ASC
                    LIMIT 200
                `, [term, term]);
            } else {
                const emailLocal = (email || username || '').split('@')[0].toLowerCase();
                const emailFull = `${emailLocal}@ivry94.fr`;
                rows = await db.all(`
                    SELECT
                        m.id as meeting_id, m.title as meeting_title,
                        m.meeting_date, m.created_at,
                        c.id as cue_id, c.speaker_name, c.text, c.start_seconds
                    FROM transcript_cues c
                    JOIN transcript_meetings m ON m.id = c.meeting_id
                    WHERE (c.text ILIKE ? OR m.title ILIKE ?)
                      AND (
                        (
                            m.reunion_id IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM reunion_participants rp
                                WHERE rp.reunion_id = m.reunion_id
                                AND (LOWER(rp.email) = ? OR LOWER(rp.email) = ? OR LOWER(rp.ad_username) = ?)
                                AND rp.statut_presence IN ('present', 'excuse', 'info')
                            )
                        )
                        OR EXISTS (
                            SELECT 1 FROM transcript_cues tc2
                            WHERE tc2.meeting_id = m.id
                            AND (LOWER(tc2.speaker_email) = ? OR LOWER(tc2.speaker_email) = ?)
                        )
                        OR (
                            m.shared_with_direction IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM hub_consommables.consumable_requests cr
                                WHERE LOWER(cr.username) = LOWER(?)
                                AND cr.direction = m.shared_with_direction
                            )
                        )
                        OR (
                            m.shared_with_service IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM hub_consommables.consumable_requests cr
                                WHERE LOWER(cr.username) = LOWER(?)
                                AND cr.service = m.shared_with_service
                            )
                        )
                      )
                    ORDER BY m.meeting_date DESC NULLS LAST, c.start_seconds ASC
                    LIMIT 200
                `, [term, term, emailFull, emailLocal, emailLocal, emailFull, emailLocal, username, username]);
            }

            const grouped = new Map();
            for (const row of rows) {
                if (!grouped.has(row.meeting_id)) {
                    grouped.set(row.meeting_id, {
                        meeting_id: row.meeting_id,
                        meeting_title: row.meeting_title,
                        meeting_date: row.meeting_date,
                        created_at: row.created_at,
                        matches: []
                    });
                }
                grouped.get(row.meeting_id).matches.push({
                    cue_id: row.cue_id,
                    speaker_name: row.speaker_name,
                    text: row.text,
                    start_seconds: row.start_seconds
                });
            }
            res.json(Array.from(grouped.values()));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Update meeting details (title, date, summary)
     */
    updateMeeting: async (req, res) => {
        try {
            const db = pgDb;
            const meetingId = req.params.id;
            const { title, meeting_date, summary, shared_with_direction, shared_with_service } = req.body;

            if (summary !== undefined) {
                await db.run(
                    'UPDATE transcript_meetings SET title = ?, meeting_date = ?, summary = ? WHERE id = ?',
                    [title, meeting_date, summary, meetingId]
                );
            } else if (shared_with_direction !== undefined || shared_with_service !== undefined) {
                // Sharing update only
                await db.run(
                    'UPDATE transcript_meetings SET shared_with_direction = ?, shared_with_service = ? WHERE id = ?',
                    [shared_with_direction || null, shared_with_service || null, meetingId]
                );
            } else {
                await db.run(
                    'UPDATE transcript_meetings SET title = ?, meeting_date = ? WHERE id = ?',
                    [title, meeting_date, meetingId]
                );
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Update task fields
     */
    updateTask: async (req, res) => {
        try {
            const db = pgDb;
            const { description, assignee, requester, deadline } = req.body;
            await db.run(
                'UPDATE transcript_tasks SET description = ?, assignee = ?, requester = ?, deadline = ? WHERE id = ?',
                [description, assignee, requester, deadline, req.params.id]
            );
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Delete task
     */
    deleteTask: async (req, res) => {
        try {
            const db = pgDb;
            await db.run('DELETE FROM transcript_tasks WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

/**
 * Supprime une réunion et ses données (y compris les fichiers physiques des
 * pièces jointes — le FK CASCADE ne touche que les enregistrements).
 */
async function deleteMeetingById(meetingId) {
    const db = pgDb;
    const atts = await db.all('SELECT * FROM transcript_meeting_attachments WHERE meeting_id = ?', [meetingId]);
    for (const att of atts) {
        try {
            const storagePath = att.file_path || (storage.isStoragePath(att.filename) ? att.filename : null);
            if (storagePath && storage.isStoragePath(storagePath)) {
                await storage.deleteFile(storagePath);
            } else {
                const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        } catch (e) { console.warn('[TM] Suppression PJ échouée:', e.message); }
    }
    await db.run('DELETE FROM transcript_meetings WHERE id = ?', [meetingId]);
}

/**
 * Pipeline partagé d'insertion des cues (upload .vtt/.txt ET import Teams) :
 * résolution AD des intervenants (job asynchrone), fusion des cues
 * consécutifs du même intervenant, insertion. Met à jour le job d'import
 * (progress/status) et le termine (completed / meetingId).
 */
async function processCuesForMeeting(importJob, cues, meetingId) {
    const db = pgDb;

    const adSettings = await getSqlite().get('SELECT * FROM ad_settings WHERE id = 1');
    const speakerCache = new Map();
    const uniqueSpeakers = [...new Set(cues.map(c => c.speaker))];

    if (adSettings && adSettings.is_enabled) {
        const total = uniqueSpeakers.length;
        for (let i = 0; i < total; i++) {
            const speaker = uniqueSpeakers[i];
            importJob.status = `Recherche AD : ${speaker}`;
            importJob.progress = 10 + Math.round((i / total) * 70);

            if (speaker === "Inconnu" || !speaker) continue;

            const cleanSpeaker = speaker.replace(/[\[\]\(\)]/g, '').trim();

            try {
                console.log(`[TM IMPORT] AD Lookup for: "${cleanSpeaker}" (original: "${speaker}")`);
                // Timeout de 10s par recherche pour ne pas bloquer le job
                const adUsers = await Promise.race([
                    searchADUsersByQuery(cleanSpeaker, adSettings),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout AD')), 10000))
                ]);

                if (adUsers && adUsers.length > 0) {
                    console.log(`[TM IMPORT] Found ${adUsers.length} matches for "${cleanSpeaker}". Using first: ${adUsers[0].email}`);
                    speakerCache.set(speaker, {
                        username: adUsers[0].username,
                        email: adUsers[0].email
                    });
                } else {
                    console.log(`[TM IMPORT] No AD match for "${cleanSpeaker}"`);
                }
            } catch (adErr) {
                console.error(`[AD LOOKUP FAILED] for ${cleanSpeaker}:`, adErr.message);
            }
        }
    }

    importJob.status = 'enregistrement';
    importJob.progress = 85;

    // Fusionner les cues consécutives du même intervenant
    const mergedCues = [];
    if (cues.length > 0) {
        let currentMerged = { ...cues[0] };
        for (let i = 1; i < cues.length; i++) {
            if (cues[i].speaker === currentMerged.speaker) {
                currentMerged.text += " " + cues[i].text;
            } else {
                mergedCues.push(currentMerged);
                currentMerged = { ...cues[i] };
            }
        }
        mergedCues.push(currentMerged);
    }

    for (const cue of mergedCues) {
        const adInfo = speakerCache.get(cue.speaker) || {};
        await db.run(
            'INSERT INTO transcript_cues (meeting_id, speaker_name, speaker_username, speaker_email, start_seconds, text) VALUES (?, ?, ?, ?, ?, ?)',
            [meetingId, cue.speaker, adInfo.username || null, adInfo.email || null, cue.start, cue.text]
        );
    }

    importJob.progress = 100;
    importJob.status = 'completed';
    importJob.meetingId = meetingId;
}

/**
 * Helper to parse VTT/TXT
 */
function parseTranscript(content) {
    const cues = [];
    const lines = content.replace(/\r/g, '').split('\n');
    let currentTime = 0;
    let currentCue = null;

    // Pattern for HH:MM:SS.mmm --> HH:MM:SS.mmm (supports comma, dot, and optional hours/ms)
    const timestampRegex = /(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{3})?/;
    // Pattern for <v Speaker Name>Text
    const speakerRegex = /^<v ([^>]+)>(.*?)(?:<\/v>)?$/s;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) {
            if (!line && currentCue && currentCue.textLines.length > 0) {
                processCue(currentCue, cues);
                currentCue = null;
            }
            continue;
        }

        if (timestampRegex.test(line)) {
            if (currentCue && currentCue.textLines.length > 0) {
                processCue(currentCue, cues);
            }
            const m = line.match(timestampRegex);
            const startTimeStr = m[0].split('-->')[0].trim();
            currentTime = timeToSeconds(startTimeStr);
            currentCue = { start: currentTime, textLines: [] };
        } else if (currentCue && !line.match(/^\d+$/)) {
            currentCue.textLines.push(line);
        }
    }

    if (currentCue && currentCue.textLines.length > 0) {
        processCue(currentCue, cues);
    }

    return cues;
}

function processCue(cue, cues) {
    const rawText = cue.textLines.join(' ');
    // Simple HTML unescape for common entities
    let text = rawText
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#233;/g, 'é')
        .replace(/&#232;/g, 'è')
        .replace(/&#224;/g, 'à')
        .replace(/&#160;/g, ' ');
    
    let speaker = "Inconnu";
    // Pattern for <v Speaker Name>Text (multi-line support with [^]* instead of . for older environments, but Node 12+ supports /s)
    const speakerRegex = /^<v ([^>]+)>([\s\S]*?)(?:<\/v>)?$/;
    const speakerMatch = text.match(speakerRegex);
    
    if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        text = speakerMatch[2].trim();
    } else {
        // Fallback to "Name: Text" if no <v> tag
        // On essaye de ne pas matcher les timestamps type 00:00:10
        const colonMatch = text.match(/^((?!\d{1,2}:\d{2})[^:]+)\s*:\s*([\s\S]*)/);
        if (colonMatch) {
            speaker = colonMatch[1].trim();
            text = colonMatch[2].trim();
        }
    }

    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, '').trim();
    if (text) {
        cues.push({ speaker, text, start: cue.start });
    }
}

function timeToSeconds(ts) {
    if (!ts) return 0;
    // Replace comma with dot for ms
    const cleanTs = ts.replace(',', '.');
    const parts = cleanTs.split(':').map(p => parseFloat(p) || 0);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
}

function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 'apm' (API Ville) or 'local' (AppDSI's own provider settings — same ones
 * used for ticket reformulation). Toggle in /admin (section IA, Transcript
 * Manager). Defaults to 'apm' when unset (current behavior).
 */
async function getAiSource() {
    const sqlite = getSqlite();
    const s = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['ai_summary_source']);
    return s?.setting_value === 'local' ? 'local' : 'apm';
}

/**
 * Modèle APM par défaut choisi en admin pour le Transcript Manager
 * (transcript_apm_default_model) — distinct du modèle par défaut de la
 * reformulation de tickets, et distinct du "défaut" global côté APM lui-même.
 */
async function getTranscriptApmDefaultModel() {
    const sqlite = getSqlite();
    const s = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['transcript_apm_default_model']);
    return s?.setting_value || null;
}

/**
 * Human-readable label for the single local model currently configured
 * (there is only ever one — no model choice in local mode, unlike APM).
 */
async function describeLocalModel() {
    const sqlite = getSqlite();
    const keys = ['ai_provider', 'anthropic_model', 'default_model'];
    const config = {};
    for (const key of keys) {
        const s = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        config[key] = s ? s.setting_value : '';
    }
    const provider = config.ai_provider || 'groq';
    const modelByProvider = {
        groq: config.default_model || 'llama-3.3-70b-versatile',
        gemini: 'gemini-1.5-flash',
        openrouter: config.default_model || 'google/gemini-2.0-flash-001',
        anthropic: config.anthropic_model || 'claude-3-5-sonnet-20240620',
        ollama: 'llama3 (Ollama)',
    };
    const providerLabel = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', anthropic: 'Anthropic', ollama: 'Ollama' }[provider] || provider;
    return `${providerLabel} — ${modelByProvider[provider] || provider} (local AppDSI)`;
}

/**
 * Calls AppDSI's own configured local AI provider (groq/gemini/openrouter/
 * anthropic/ollama — same app_settings as ticket reformulation), blocking,
 * and returns the full response text. Non-streaming port of the provider
 * switch that used to live directly in summarizeMeeting before the APM
 * integration (now used only when ai_summary_source='local').
 */
async function callLocalAi(prompt) {
    const sqlite = getSqlite();
    const keys = ['ai_provider', 'groq_api_key', 'gemini_api_key', 'openrouter_api_key', 'anthropic_api_key', 'ollama_host', 'anthropic_model', 'default_model'];
    const config = {};
    for (const key of keys) {
        const s = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        config[key] = s ? s.setting_value : '';
    }

    const provider = config.ai_provider || 'groq';
    let apiKey = '', model = config.default_model || '', apiUrl = '';

    switch (provider) {
        case 'gemini':
            apiKey = config.gemini_api_key;
            model = 'gemini-1.5-flash';
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            break;
        case 'openrouter':
            apiKey = config.openrouter_api_key;
            model = config.default_model || 'google/gemini-2.0-flash-001';
            apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            break;
        case 'anthropic':
            apiKey = config.anthropic_api_key;
            model = config.anthropic_model || 'claude-3-5-sonnet-20240620';
            apiUrl = 'https://api.anthropic.com/v1/messages';
            break;
        case 'ollama':
            apiUrl = `${config.ollama_host || 'http://localhost:11434'}/api/generate`;
            model = 'llama3';
            break;
        case 'groq':
        default:
            apiKey = config.groq_api_key;
            model = config.default_model || 'llama-3.3-70b-versatile';
            apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            break;
    }
    if (provider !== 'ollama' && !apiKey) throw new Error(`Clé API manquante pour ${provider} (IA locale AppDSI — configurer dans /admin, section IA)`);

    const AXIOS_TIMEOUT = 180000;

    try {
        if (provider === 'gemini') {
            const response = await axios.post(apiUrl, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: AXIOS_TIMEOUT });
            return response.data.candidates[0].content.parts[0].text;
        }
        if (provider === 'ollama') {
            const response = await axios.post(apiUrl, { model, prompt, stream: false }, { timeout: AXIOS_TIMEOUT });
            return response.data.response;
        }
        if (provider === 'anthropic') {
            const response = await axios.post(apiUrl, {
                model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
                timeout: AXIOS_TIMEOUT
            });
            return response.data.content[0].text;
        }
        // groq, openrouter : API compatibles OpenAI
        const response = await axios.post(apiUrl, {
            model, messages: [{ role: 'user', content: prompt }], stream: false
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: AXIOS_TIMEOUT
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        // Surface le vrai motif (ex. 413 "prompt trop volumineux pour ce fournisseur",
        // clé invalide, modèle inconnu...) au lieu du générique axios
        // "Request failed with status code XXX" — cf. logique équivalente de
        // l'ancien flux streaming avant l'intégration APM.
        if (error.response) {
            const data = error.response.data;
            const dataStr = typeof data === 'string' ? data.slice(0, 300)
                : (data && typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : '');
            const hint = error.response.status === 413
                ? ' — la transcription est trop volumineuse pour ce fournisseur, réduisez « Limite de contexte » dans /admin (section IA) ou passez sur API Ville (APM)'
                : '';
            throw new Error(`Erreur IA locale AppDSI (${provider}, HTTP ${error.response.status})${hint}${dataStr ? ' : ' + dataStr : ''}`);
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error(`Délai dépassé en contactant l'IA locale AppDSI (${provider})`);
        }
        throw new Error(`Erreur réseau vers l'IA locale AppDSI (${provider}) : ${error.message}`);
    }
}

async function processFullText(meetingId, fullText) {
    const db = pgDb;
    let displayText = fullText;
    let tasksJson = "[]";

    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        tasksJson = jsonMatch[1];
        displayText = fullText.replace(jsonMatch[0], "").split(/##\s*(?:Plan d'action|Tâches|Actions)/i)[0].trim();
    }

    await db.run('UPDATE transcript_meetings SET summary = ? WHERE id = ?', [displayText, meetingId]);

    const savedTasks = [];
    try {
        const tasks = JSON.parse(tasksJson);
        const agents = await listDsiAgents();
        await db.run('DELETE FROM transcript_tasks WHERE meeting_id = ? AND origin = ?', [meetingId, 'ai']);
        for (const t of tasks) {
            const match = matchDsiAgent(t.who, agents);
            const result = await db.run(
                `INSERT INTO transcript_tasks
                    (meeting_id, description, assignee, requester, deadline, origin, start_seconds, assignee_username, assignee_match_score)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [meetingId, t.what, t.who, t.req, t.when, 'ai', timeToSeconds(t.ts || "00:00:00"), match?.username || null, match?.score ?? null]
            );
            savedTasks.push({
                id: result.lastID,
                description: t.what,
                assignee: t.who,
                requester: t.req,
                deadline: t.when,
                start_seconds: timeToSeconds(t.ts || "00:00:00"),
                assignee_username: match?.username || null,
                assignee_match_score: match?.score ?? null,
                assignee_agent: match ? { username: match.username, nom: match.nom, email: match.email, service: match.service } : null,
            });
        }
    } catch (e) {
        console.error('Error parsing tasks JSON:', e.message);
    }

    return { summary: displayText, tasks: savedTasks };
}

/**
 * Exécute la génération de résumé en arrière-plan (appelée par summarizeMeeting,
 * qui répond immédiatement). Met à jour le job passé en paramètre pour que le
 * front puisse suivre l'avancement via /summarize-status/:jobId. Ne lève pas
 * d'exception non capturée : les erreurs sont reportées dans job.error.
 */
async function runSummarizeJob(meetingId, model, job) {
    const db = pgDb;
    const sqlite = getSqlite();
    try {
        const meeting = await db.get('SELECT * FROM transcript_meetings WHERE id = ?', [meetingId]);
        if (!meeting) throw new Error('Réunion non trouvée');

        const cues = await db.all('SELECT * FROM transcript_cues WHERE meeting_id = ? ORDER BY start_seconds', [meetingId]);
        let transcriptText = cues.map(c => `[${formatTime(c.start_seconds)}] ${c.speaker_name}: ${c.text}`).join('\n');
        console.log(`[TranscriptManager] Transcript length: ${transcriptText.length} chars for meeting ${meetingId}`);
        if (job) { job.status = 'analyse de la transcription'; job.progress = 10; }

        const source = await getAiSource();

        // Limite de contexte : le réglage "max_chars_context" (si renseigné) prime
        // toujours. Sans réglage explicite, l'API Ville (APM) — des modèles hébergés
        // avec un grand contexte — utilise un défaut large, tandis que l'IA locale
        // AppDSI (Groq/Gemini/OpenRouter/Anthropic/Ollama, fenêtre de contexte et
        // limites de requête bien plus restreintes) retombe sur des défauts par
        // fournisseur — sinon un prompt volumineux se fait rejeter (ex. 413 côté Groq).
        const DEFAULT_MAX_BY_LOCAL_PROVIDER = { groq: 24000, openrouter: 80000, gemini: 80000, anthropic: 120000, ollama: 40000 };
        const maxCharsRow = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['max_chars_context']);
        let MAX_TRANSCRIPT_CHARS = maxCharsRow?.setting_value ? parseInt(maxCharsRow.setting_value, 10) : null;
        if (!MAX_TRANSCRIPT_CHARS) {
            if (source === 'local') {
                const providerRow = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['ai_provider']);
                const provider = providerRow?.setting_value || 'groq';
                MAX_TRANSCRIPT_CHARS = DEFAULT_MAX_BY_LOCAL_PROVIDER[provider] || 24000;
            } else {
                MAX_TRANSCRIPT_CHARS = 100000;
            }
        }
        if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
            console.warn(`[TranscriptManager] Truncating transcript from ${transcriptText.length} to ${MAX_TRANSCRIPT_CHARS} chars (source: ${source})`);
            transcriptText = transcriptText.substring(0, MAX_TRANSCRIPT_CHARS) + "\n... (Transcription tronquée car trop longue) ...";
        }

        // Prompt : réglage centralisé (persisté), partagé par les deux sources IA.
        const customPromptRow = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['custom_prompt']);
        const promptTemplate = (customPromptRow?.setting_value) || DEFAULT_PROMPT_TEMPLATE;
        const prompt = promptTemplate
            .replace('{REUNION}', meeting.title)
            .replace('{TRANSCRIPTION}', transcriptText);

        // Sans modèle explicite dans la requête (ex. appel direct à l'API), on
        // retombe sur le modèle par défaut choisi en admin pour le Transcript
        // Manager — jamais sur le "défaut" propre à APM, qui est global à
        // toutes les applications qui l'appellent.
        const effectiveModel = model || (source === 'apm' ? await getTranscriptApmDefaultModel() : undefined);
        console.log(`[TranscriptManager] Prompt length: ${prompt.length} chars — source: ${source} — model: ${effectiveModel || '(défaut)'}`);
        if (job) { job.status = `Envoi du prompt (${effectiveModel || 'défaut'})`; job.progress = 40; }

        const fullText = source === 'local'
            ? await callLocalAi(prompt)
            : await apmAi.queryAi(prompt, effectiveModel || undefined);
        if (job) { job.status = 'enregistrement du résumé'; job.progress = 80; }

        const result = await processFullText(meetingId, fullText);
        if (job) {
            job.status = 'completed';
            job.progress = 100;
            job.summary = result.summary;
            job.tasks = result.tasks;
        }
        return result;
    } catch (error) {
        console.error('Summarize error:', error.message);
        if (job) { job.status = 'error'; job.error = error.message; }
        throw error;
    }
}

/**
 * Purge les jobs terminés/en échec de plus de 35 min (le front arrête de poll
 * au bout de 26 min) — évite la fuite mémoire sur les longs uptimes.
 */
function pruneSummarizeJobs() {
    const cutoff = Date.now() - 35 * 60 * 1000;
    for (const key of Object.keys(summarizeJobs)) {
        const job = summarizeJobs[key];
        if (job.createdAt < cutoff) {
            delete summarizeJobs[key];
        }
    }
}

module.exports = transcriptController;
