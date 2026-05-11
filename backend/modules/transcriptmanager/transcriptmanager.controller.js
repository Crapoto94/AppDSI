const { pgDb, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

const transcriptController = {
    /**
     * Get all meetings
     */
    getMeetings: async (req, res) => {
        try {
            const db = pgDb;
            const { username, email, role } = req.user;
            const isAdmin = role === 'admin' || username?.toLowerCase() === 'admin' || username?.toLowerCase() === 'adminhub';

            let meetings;
            if (isAdmin) {
                meetings = await db.all(`
                    SELECT m.*,
                    (SELECT COUNT(DISTINCT speaker_name) FROM transcript_cues WHERE meeting_id = m.id) as speaker_count,
                    (SELECT string_agg(DISTINCT speaker_email, ',') FROM transcript_cues WHERE meeting_id = m.id AND speaker_email IS NOT NULL) as speaker_emails,
                    (SELECT MAX(start_seconds) FROM transcript_cues WHERE meeting_id = m.id) as duration_seconds
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
                    (SELECT MAX(start_seconds) FROM transcript_cues WHERE meeting_id = m.id) as duration_seconds
                    FROM transcript_meetings m
                    WHERE m.reunion_id IS NULL
                       OR EXISTS (
                           SELECT 1 FROM reunion_participants rp
                           WHERE rp.reunion_id = m.reunion_id
                           AND (LOWER(rp.email) = ? OR LOWER(rp.email) = ? OR LOWER(rp.ad_username) = ?)
                           AND rp.statut_presence IN ('present', 'excuse', 'info')
                       )
                    ORDER BY meeting_date DESC NULLS LAST, created_at DESC
                `, [emailFull, emailLocal, emailLocal]);
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
     * Get meeting details with cues
     */
    getMeeting: async (req, res) => {
        try {
            const db = pgDb;
            const meetingId = req.params.id;
            const meeting = await db.get('SELECT * FROM transcript_meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion non trouvée' });

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

                importJobs[jobId].progress = 10;
                importJobs[jobId].status = 'analyse';
                const cues = parseTranscript(content);

                // AD Lookup for speakers
                const adSettings = await getSqlite().get('SELECT * FROM ad_settings WHERE id = 1');
                const speakerCache = new Map();
                const uniqueSpeakers = [...new Set(cues.map(c => c.speaker))];

                if (adSettings && adSettings.is_enabled) {
                    const total = uniqueSpeakers.length;
                    for (let i = 0; i < total; i++) {
                        const speaker = uniqueSpeakers[i];
                        importJobs[jobId].status = `Recherche AD : ${speaker}`;
                        importJobs[jobId].progress = 10 + Math.round((i / total) * 70);
                        
                        if (speaker === "Inconnu" || !speaker) continue;
                        
                        // Nettoyage du nom de l'intervenant (retirer crochets, etc.)
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

                importJobs[jobId].status = 'enregistrement';
                importJobs[jobId].progress = 85;

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

                importJobs[jobId].progress = 100;
                importJobs[jobId].status = 'completed';
                importJobs[jobId].meetingId = meetingId;
            } catch (err) {
                console.error('[IMPORT ERROR]', err);
                importJobs[jobId].status = 'error';
                importJobs[jobId].message = err.message;
            }
        })();
    },

    /**
     * Summarize meeting using AI (Streaming)
     */
    summarizeMeeting: async (req, res) => {
        const meetingId = req.params.id;
        const db = pgDb;
        const sqlite = getSqlite();
        
        try {
            const meeting = await db.get('SELECT * FROM transcript_meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion non trouvée' });

            const cues = await db.all('SELECT * FROM transcript_cues WHERE meeting_id = ? ORDER BY start_seconds', [meetingId]);
            let transcriptText = cues.map(c => `[${formatTime(c.start_seconds)}] ${c.speaker_name}: ${c.text}`).join('\n');
            console.log(`[TranscriptManager] Transcript length: ${transcriptText.length} chars for meeting ${meetingId}`);

            // Fetch central AI settings from SQLite
            const keys = ['ai_provider', 'groq_api_key', 'gemini_api_key', 'openrouter_api_key', 'anthropic_api_key', 'ollama_host', 'anthropic_model', 'default_model', 'max_chars_context'];
            const config = {};
            for (const key of keys) {
                const s = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
                config[key] = s ? s.setting_value : '';
            }

            const provider = config.ai_provider || 'groq';

            // Limit transcript size: custom setting takes priority over per-provider defaults
            const DEFAULT_MAX_BY_PROVIDER = { groq: 24000, openrouter: 80000, gemini: 80000, anthropic: 120000, ollama: 40000 };
            const MAX_TRANSCRIPT_CHARS = config.max_chars_context
                ? parseInt(config.max_chars_context, 10)
                : (DEFAULT_MAX_BY_PROVIDER[provider] || 24000);
            if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
                console.warn(`[TranscriptManager] Truncating transcript from ${transcriptText.length} to ${MAX_TRANSCRIPT_CHARS} chars (provider: ${provider})`);
                transcriptText = transcriptText.substring(0, MAX_TRANSCRIPT_CHARS) + "\n... (Transcription tronquée car trop longue) ...";
            }
            let apiKey = '';
            let model = config.default_model || '';
            let apiUrl = '';

            switch (provider) {
                case 'gemini':
                    apiKey = config.gemini_api_key;
                    model = 'gemini-1.5-flash';
                    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
                    break;
                case 'openrouter':
                    apiKey = config.openrouter_api_key;
                    model = 'google/gemini-2.0-flash-001';
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

            if (provider !== 'ollama' && !apiKey) return res.status(400).json({ error: `Clé API manquante pour ${provider}` });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            console.log(`[TranscriptManager] Starting generation with provider: ${provider}, model: ${model}`);

            const customPromptRow = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['custom_prompt']);
            const promptTemplate = (customPromptRow?.setting_value) || DEFAULT_PROMPT_TEMPLATE;
            const prompt = promptTemplate
                .replace('{REUNION}', meeting.title)
                .replace('{TRANSCRIPTION}', transcriptText);

            console.log(`[TranscriptManager] Prompt length: ${prompt.length} chars`);

            let fullText = "";

            if (provider === 'gemini') {
                const response = await axios.post(apiUrl, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, { responseType: 'stream' });

                response.data.on('data', chunk => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const parsed = JSON.parse(line.substring(6));
                                const content = parsed.candidates[0].content.parts[0].text;
                                fullText += content;
                                res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
                            } catch (e) {}
                        }
                    }
                });
                response.data.on('end', () => {
                    res.write('event: done\ndata: \n\n');
                    processFullText(meetingId, fullText).then(() => res.end());
                });
            } else if (provider === 'groq' || provider === 'openrouter') {
                const response = await axios.post(apiUrl, {
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    stream: true
                }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    responseType: 'stream'
                });

                response.data.on('data', chunk => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        const message = line.replace(/^data: /, '');
                        if (message === '[DONE]') {
                            res.write('event: done\ndata: \n\n');
                            processFullText(meetingId, fullText).then(() => res.end());
                            return;
                        }
                        try {
                            const parsed = JSON.parse(message);
                            const content = parsed.choices[0].delta.content || "";
                            fullText += content;
                            res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
                        } catch (e) {}
                    }
                });
            } else if (provider === 'ollama') {
                const response = await axios.post(apiUrl, {
                    model: model,
                    prompt: prompt,
                    stream: true
                }, { responseType: 'stream' });

                response.data.on('data', chunk => {
                    try {
                        const parsed = JSON.parse(chunk.toString());
                        const content = parsed.response;
                        fullText += content;
                        res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
                        if (parsed.done) {
                            res.write('event: done\ndata: \n\n');
                            processFullText(meetingId, fullText).then(() => res.end());
                        }
                    } catch (e) {}
                });
            } else if (provider === 'anthropic') {
                // Anthropic is a bit different, but for now we'll handle it without streaming to simplify or use their SSE
                const response = await axios.post(apiUrl, {
                    model: model,
                    max_tokens: 4096,
                    messages: [{ role: "user", content: prompt }]
                }, {
                    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
                });
                const content = response.data.content[0].text;
                fullText = content;
                res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
                res.write('event: done\ndata: \n\n');
                await processFullText(meetingId, fullText);
                res.end();
            }

        } catch (error) {
            console.error('Summarize error:', error.message);
            let detailedError = error.message;
            if (error.response) {
                console.error('Error status:', error.response.status);
                try {
                    const data = error.response.data;
                    const dataStr = typeof data === 'string' ? data : typeof data === 'object' && data !== null && !data.pipe ? JSON.stringify(data) : '[stream]';
                    detailedError += ` (Status: ${error.response.status}, Data: ${dataStr})`;
                } catch (e) {
                    detailedError += ` (Status: ${error.response.status})`;
                }
            }
            if (!res.headersSent) res.setHeader('Content-Type', 'text/event-stream');
            res.write(`event: error\ndata: ${JSON.stringify({ error: detailedError })}\n\n`);
            res.end();
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
            const db = pgDb;
            const meetingId = req.params.id;
            await db.run('DELETE FROM transcript_meetings WHERE id = ?', [meetingId]);
            res.json({ success: true, message: 'Réunion supprimée' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
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
            const isAdmin = role === 'admin' || username?.toLowerCase() === 'admin' || username?.toLowerCase() === 'adminhub';
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
                      AND (m.reunion_id IS NULL
                           OR EXISTS (
                               SELECT 1 FROM reunion_participants rp
                               WHERE rp.reunion_id = m.reunion_id
                               AND (LOWER(rp.email) = ? OR LOWER(rp.email) = ? OR LOWER(rp.ad_username) = ?)
                               AND rp.statut_presence IN ('present', 'excuse', 'info')
                           ))
                    ORDER BY m.meeting_date DESC NULLS LAST, c.start_seconds ASC
                    LIMIT 200
                `, [term, term, emailFull, emailLocal, emailLocal]);
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
            const { title, meeting_date, summary } = req.body;

            if (summary !== undefined) {
                await db.run(
                    'UPDATE transcript_meetings SET title = ?, meeting_date = ?, summary = ? WHERE id = ?',
                    [title, meeting_date, summary, meetingId]
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

    try {
        const tasks = JSON.parse(tasksJson);
        await db.run('DELETE FROM transcript_tasks WHERE meeting_id = ? AND origin = ?', [meetingId, 'ai']);
        for (const t of tasks) {
            await db.run(
                'INSERT INTO transcript_tasks (meeting_id, description, assignee, requester, deadline, origin, start_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [meetingId, t.what, t.who, t.req, t.when, 'ai', timeToSeconds(t.ts || "00:00:00")]
            );
        }
    } catch (e) {
        console.error('Error parsing tasks JSON:', e.message);
    }
}

module.exports = transcriptController;
