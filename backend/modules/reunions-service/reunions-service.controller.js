/**
 * Module « Réunions de service / de direction ».
 *
 * Deux temps :
 *  1. Paramétrage — des TEMPLATES (types de réunion) : liste des présents
 *     possibles, rubriques et durée théorique de chacune, rubrique « meta »
 *     contenant les personnes prévues.
 *  2. Occurrences — chaque réunion concrète hérite d'un template et d'une
 *     date ; les participants préparent des ITEMS (titre + contenu riche) dans
 *     chaque rubrique, puis la réunion se tient avec un maître du temps qui
 *     pilote les écrans connectés (temps réel via socket.io).
 */
const { pgDb } = require('../../shared/database');
const { isAdminLike, isModuleAdmin } = require('../../shared/middleware');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../../shared/config');
const storage = require('../../shared/storage');
const docsService = require('../../shared/documents.service');
const reunionSocket = require('./reunions-service.socket');
const teamsTranscript = require('../transcriptmanager/teams_transcript.service');
const interactCatalog = require('./interact_catalog');
const kpiEngine = require('./reunions-service.kpis');

const ATTACHMENT_MODULE = 'reunions-service';

const userName = (u) => u?.displayName || u?.username || null;
const userKey = (u) => String(u?.username || u?.email || '').toLowerCase();
const toInt = (v, def = 0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
};
const parseJsonArray = (v, def = []) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : def; } catch { return def; } }
    return v == null ? def : def;
};
// Les snapshots KPI sont stockés « en dur » dans la rubrique (CR) ; on les
// expose tels quels, null tant que la réunion n'a pas été lancée.
const parseJsonMaybe = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return null;
};

// ─── Templates ──────────────────────────────────────────────────────────────

async function getTemplateFull(id) {
    const tpl = await pgDb.get('SELECT * FROM reunions_service.templates WHERE id = ?', [id]);
    if (!tpl) return null;
    tpl.sections = await pgDb.all(
        'SELECT * FROM reunions_service.template_sections WHERE template_id = ? ORDER BY position, id', [id]
    );
    tpl.sections = tpl.sections.map(s => ({ ...s, kpis_config: parseJsonArray(s.kpis_config, []) }));
    tpl.participants = await pgDb.all(
        'SELECT * FROM reunions_service.template_participants WHERE template_id = ? ORDER BY name', [id]
    );
    // La rubrique meta (participants) compte dans le temps théorique global.
    tpl.total_duration = tpl.sections.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    return tpl;
}

async function replaceTemplateSections(templateId, sections, metaDurationMinutes = 10) {
    await pgDb.run('DELETE FROM reunions_service.template_sections WHERE template_id = ?', [templateId]);
    // La rubrique « meta » (participants prévus) existe toujours, en tête.
    await pgDb.run(
        `INSERT INTO reunions_service.template_sections (template_id, title, duration_minutes, position, is_meta, is_pause, kpis_config)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [templateId, 'Participants', Math.max(0, toInt(metaDurationMinutes, 10)), 0, true, false, JSON.stringify([])]
    );
    let pos = 1;
    for (const s of Array.isArray(sections) ? sections : []) {
        const title = String(s?.title || '').trim();
        if (!title) continue;
        const duration = Math.max(0, toInt(s?.duration_minutes, 0));
        const isPause = s?.is_pause === true || s?.is_pause === 'true';
        // KPI associés à la rubrique (catalogue du tableau de bord) : une pause
        // n'en porte pas.
        const kpis = isPause ? [] : kpiEngine.normalizeList(s?.kpis || s?.kpis_config);
        await pgDb.run(
            `INSERT INTO reunions_service.template_sections (template_id, title, duration_minutes, position, is_meta, is_pause, kpis_config)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [templateId, title, duration, pos, false, isPause, JSON.stringify(kpis)]
        );
        pos += 1;
    }
}

async function replaceTemplateParticipants(templateId, participants) {
    await pgDb.run('DELETE FROM reunions_service.template_participants WHERE template_id = ?', [templateId]);
    const seen = new Set();
    for (const p of Array.isArray(participants) ? participants : []) {
        const email = String(p?.email || '').trim().toLowerCase();
        if (!email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        const kind = p?.kind === 'info' || p?.info === true ? 'info' : 'present';
        await pgDb.run(
            `INSERT INTO reunions_service.template_participants (template_id, email, username, name, kind)
             VALUES (?, ?, ?, ?, ?)`,
            [templateId, email, p?.username || email.split('@')[0], p?.name || email, kind]
        );
    }
}

// ─── Occurrences ────────────────────────────────────────────────────────────

async function getMeetingFull(id) {
    const meeting = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [id]);
    if (!meeting) return null;

    const sections = await pgDb.all(
        'SELECT * FROM reunions_service.meeting_sections WHERE meeting_id = ? ORDER BY position, id', [id]
    );
    sections.forEach(s => {
        s.kpis_config = parseJsonArray(s.kpis_config, []);
        s.kpi_snapshots = parseJsonMaybe(s.kpi_snapshots);
    });
    const participants = await pgDb.all(
        'SELECT * FROM reunions_service.meeting_participants WHERE meeting_id = ? ORDER BY name', [id]
    );
    // Enrichissement « service » (pour regrouper les participants par service
    // dans l'UI) depuis le référentiel des agents DSI.
    try {
        const agents = await pgDb.all(
            `SELECT LOWER(email) AS email, service FROM hub_calendrier.agents_dsi
             WHERE email IS NOT NULL AND email <> ''`
        );
        const serviceByEmail = new Map(agents.map(a => [a.email, a.service]));
        for (const p of participants) {
            p.service = serviceByEmail.get(String(p.email || '').toLowerCase()) || p.service || null;
        }
    } catch (e) { /* référentiel indisponible : on garde sans service */ }
    participants.sort((a, b) => {
        const sa = a.service || '\uffff';
        const sb = b.service || '\uffff';
        return sa.localeCompare(sb, 'fr') || String(a.name || '').localeCompare(String(b.name || ''), 'fr');
    });
    const items = await pgDb.all(
        // Les items importants passent en tête de leur rubrique.
        'SELECT * FROM reunions_service.items WHERE meeting_id = ? ORDER BY COALESCE(is_important, FALSE) DESC, position, id', [id]
    );
    const attachments = await pgDb.all(
        `SELECT id, meeting_id, item_id, filename, original_name, mimetype, size, uploaded_by, uploaded_by_name, created_at
         FROM reunions_service.attachments WHERE meeting_id = ? ORDER BY created_at`, [id]
    );

    const itemsWithAtt = items.map(it => ({ ...it, attachments: attachments.filter(a => a.item_id === it.id) }));
    meeting.sections = sections.map(s => ({
        ...s,
        items: itemsWithAtt.filter(i => i.section_id === s.id),
    }));
    meeting.participants = participants;
    meeting.attachments = attachments.filter(a => !a.item_id);
    meeting.total_duration = sections.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);

    // INTERACTs (sondages) de la réunion, avec résultats agrégés.
    try {
        const pollRows = await pgDb.all(
            'SELECT * FROM reunions_service.polls WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 100', [id]
        );
        meeting.polls = [];
        for (const row of pollRows) {
            const poll = normalizePollRow(row);
            meeting.polls.push({ ...poll, results: await computePollResults(poll) });
        }
    } catch (e) {
        meeting.polls = [];
    }

    // Compte rendu / transcript éventuellement associé (Transcript Manager).
    if (meeting.transcript_meeting_id) {
        try {
            meeting.transcript = await pgDb.get(
                `SELECT id, title, summary, summary_model, summary_requested_at, meeting_date, source
                 FROM transcript.meetings WHERE id = ?`, [meeting.transcript_meeting_id]
            );
        } catch (e) { meeting.transcript = null; }
    } else {
        meeting.transcript = null;
    }
    return meeting;
}

// Toute réunion dont la date est passée est clôturée automatiquement. Exécuté
// au chargement des listes/statistiques (throttle 60 s pour éviter les écritures
// répétées).
let _lastFinalizeAt = 0;
async function finalizePastMeetings(force = false) {
    const now = Date.now();
    if (!force && now - _lastFinalizeAt < 60_000) return;
    _lastFinalizeAt = now;
    try {
        await pgDb.run(
            `UPDATE reunions_service.meetings
             SET status = 'finished',
                 ended_at = COALESCE(ended_at, meeting_date + INTERVAL '2 hours'),
                 updated_at = NOW()
             WHERE status <> 'finished'
               AND meeting_date IS NOT NULL
               AND meeting_date < date_trunc('day', NOW())`
        );
    } catch (e) {
        console.error('[REUNIONS-SERVICE] clôture auto réunions passées:', e.message);
    }
}

/** Le maître du temps ou un administrateur du module peut piloter la structure. */
async function canManageMeeting(user, meeting) {
    if (!meeting) return false;
    if (isAdminLike(user) || await isModuleAdmin(user, 'reunions-service')) return true;
    const key = userKey(user);
    return !!key && String(meeting.time_master_username || '').toLowerCase() === key;
}

/**
 * Visibilité des réunions : seuls les « présents possibles » et les « pour info »
 * (ainsi que l'administrateur du module et le maître du temps) voient la réunion.
 * Renvoie null pour un admin (aucune restriction), sinon un fragment SQL + params.
 */
async function meetingVisibilityFor(user) {
    if (!user) return { sql: '1 = 0', params: [] };
    if (isAdminLike(user) || await isModuleAdmin(user, 'reunions-service')) return null;
    const key = userKey(user);
    const email = String(user?.email || '').trim().toLowerCase();
    return {
        sql: `(LOWER(m.created_by) = ? OR LOWER(m.time_master_username) = ?
               OR EXISTS (SELECT 1 FROM reunions_service.meeting_participants pv
                          WHERE pv.meeting_id = m.id
                            AND (LOWER(pv.username) = ? OR (LOWER(pv.email) = ? AND ? <> ''))))`,
        params: [key, key, key, email, email],
    };
}

async function canSeeMeeting(user, meeting) {
    if (!meeting) return false;
    if (isAdminLike(user) || await isModuleAdmin(user, 'reunions-service')) return true;
    const key = userKey(user);
    const email = String(user?.email || '').trim().toLowerCase();
    if (key && String(meeting.created_by || '').toLowerCase() === key) return true;
    if (key && String(meeting.time_master_username || '').toLowerCase() === key) return true;
    if (!key && !email) return false;
    const row = await pgDb.get(
        `SELECT 1 FROM reunions_service.meeting_participants
         WHERE meeting_id = ?
           AND (LOWER(username) = ? OR (LOWER(email) = ? AND ? <> ''))
         LIMIT 1`,
        [meeting.id, key, email, email]
    );
    return !!row;
}

// ─── KPI des rubriques ──────────────────────────────────────────────────────
// Jeton de service court : les KPI proviennent d'API internes dont certaines
// exigent un accès étendu (projets, MagApp…). Le calcul doit aboutir quel que
// soit le rôle du maître du temps qui lance la réunion.
function makeServiceToken() {
    try {
        return jwt.sign(
            {
                id: 0, username: 'adminhub', displayName: 'Réunions de service',
                role: 'superadmin', is_admin: true, is_superadmin: true, is_approved: 1,
            },
            SECRET_KEY,
            { expiresIn: '10m' }
        );
    } catch { return null; }
}

// Date de la réunion précédente (même modèle) : sert de borne basse au préréglage
// « depuis la réunion précédente ».
async function previousMeetingDateFor(meeting) {
    if (!meeting?.template_id) return null;
    try {
        const row = await pgDb.get(
            `SELECT meeting_date FROM reunions_service.meetings
             WHERE template_id = ? AND id <> ?
               AND meeting_date IS NOT NULL AND status <> 'planned'
               AND meeting_date < COALESCE(?, NOW())
             ORDER BY meeting_date DESC LIMIT 1`,
            [meeting.template_id, meeting.id, meeting.meeting_date || null]
        );
        return row?.meeting_date || null;
    } catch { return null; }
}

/** Dernière réunion (même modèle) ayant des KPI figés : sert à calculer l'évolution. */
async function previousMeetingWithKpis(meeting) {
    if (!meeting?.template_id) return null;
    try {
        return await pgDb.get(
            `SELECT m.id, m.meeting_date FROM reunions_service.meetings m
             WHERE m.template_id = ? AND m.id <> ?
               AND m.meeting_date IS NOT NULL AND m.status <> 'planned'
               AND m.meeting_date < COALESCE(?, NOW())
               AND EXISTS (SELECT 1 FROM reunions_service.meeting_sections s
                           WHERE s.meeting_id = m.id AND s.kpi_snapshots IS NOT NULL)
             ORDER BY m.meeting_date DESC LIMIT 1`,
            [meeting.template_id, meeting.id, meeting.meeting_date || null]
        );
    } catch { return null; }
}

const kpiSignature = (key, filters) => `${key}|${JSON.stringify(
    Object.entries(filters || {}).map(([k, v]) => [k, v && v.value]).sort()
)}`;
const fmtRefDate = (d) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return String(d || ''); }
};

/**
 * Calcule et enregistre « en dur » les KPI des rubriques de la réunion.
 * Appelé au lancement de la réunion (les valeurs sont ensuite figées dans le CR).
 * force = true → recalcule même si un instantané existe déjà.
 */
async function computeMeetingKpiSnapshots(meeting, token, { force = false } = {}) {
    const sections = await pgDb.all(
        `SELECT * FROM reunions_service.meeting_sections
         WHERE meeting_id = ? AND is_meta = FALSE AND COALESCE(is_pause, FALSE) = FALSE
         ORDER BY position, id`,
        [meeting.id]
    );
    const withKpi = sections.filter(s => parseJsonArray(s.kpis_config, []).length > 0);
    if (!withKpi.length) return 0;

    const previousMeetingDate = await previousMeetingDateFor(meeting);
    // Réunion précédente (même modèle) : permet d'afficher une flèche d'évolution
    // même pour les KPI « à date » (photo au lancement).
    const prevMeeting = await previousMeetingWithKpis(meeting);
    const prevSnapshots = new Map();
    if (prevMeeting) {
        try {
            const rows = await pgDb.all(
                `SELECT kpi_snapshots FROM reunions_service.meeting_sections
                 WHERE meeting_id = ? AND kpi_snapshots IS NOT NULL`, [prevMeeting.id]
            );
            for (const row of rows) {
                for (const snap of parseJsonArray(row.kpi_snapshots, [])) {
                    if (snap?.key) prevSnapshots.set(kpiSignature(snap.key, snap.filters), snap);
                }
            }
        } catch (e) { /* historisé indisponible : pas de flèche */ }
    }
    const refLabel = prevMeeting ? `réunion du ${fmtRefDate(prevMeeting.meeting_date)}` : null;
    const ctx = {
        token: makeServiceToken() || token,
        meetingDate: meeting.meeting_date || new Date(),
        previousMeetingDate,
        // Cache partagé par toutes les rubriques : un même endpoint n'est
        // interrogé qu'une fois par lancement.
        cache: new Map(),
    };
    let computed = 0;
    await Promise.all(withKpi.map(async (s) => {
        if (!force && s.kpi_computed_at) return;
        const configs = parseJsonArray(s.kpis_config, []);
        try {
            const snapshots = await kpiEngine.evaluateList(configs, ctx);
            // Évolution vs réunion précédente pour les KPI à date (valeur simple).
            if (prevMeeting) {
                for (const snap of snapshots) {
                    if (!snap || snap.error || snap.periodic) continue;
                    if (!snap.current || snap.current.value == null) continue;
                    if (snap.current.items || snap.current.series) continue;
                    const prev = prevSnapshots.get(kpiSignature(snap.key, snap.filters));
                    const pv = prev?.current?.value;
                    if (pv == null) continue;
                    const cv = Number(snap.current.value) || 0;
                    snap.previous = { value: pv, text: prev.current.text ?? String(pv), label: refLabel };
                    snap.delta_pct = Number(pv) === 0
                        ? (cv === 0 ? 0 : null)
                        : Math.round(((cv - Number(pv)) / Number(pv)) * 1000) / 10;
                    snap.delta_abs = Math.round((cv - Number(pv)) * 100) / 100;
                    snap.evolution_ref = { meeting_id: prevMeeting.id, date: prevMeeting.meeting_date };
                }
            }
            await pgDb.run(
                `UPDATE reunions_service.meeting_sections
                 SET kpi_snapshots = ?, kpi_computed_at = NOW() WHERE id = ?`,
                [JSON.stringify(snapshots), s.id]
            );
            computed += 1;
        } catch (e) {
            console.error(`[REUNIONS-SERVICE] KPI rubrique ${s.id} :`, e.message);
        }
    }));
    return computed;
}

async function loadManagedMeeting(req, res, meetingId) {    const meeting = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [meetingId]);
    if (!meeting) { res.status(404).json({ error: 'Réunion introuvable' }); return null; }
    if (!(await canManageMeeting(req.user, meeting))) {
        res.status(403).json({ error: 'Réservé au maître du temps ou aux administrateurs du module.' });
        return null;
    }
    return meeting;
}

/** Rubrique INTERACT d'une réunion (créée à la volée au premier sondage). */
async function ensureInteractSection(meetingId) {
    let section = await pgDb.get(
        "SELECT * FROM reunions_service.meeting_sections WHERE meeting_id = ? AND LOWER(title) = 'interact' LIMIT 1",
        [meetingId]
    );
    if (section) return section;
    const max = await pgDb.get('SELECT COALESCE(MAX(position), 0) AS m FROM reunions_service.meeting_sections WHERE meeting_id = ?', [meetingId]);
    const result = await pgDb.run(
        `INSERT INTO reunions_service.meeting_sections (meeting_id, title, duration_minutes, position, is_meta)
         VALUES (?, 'INTERACT', 0, ?, FALSE)`,
        [meetingId, (Number(max?.m) || 0) + 1]
    );
    return pgDb.get('SELECT * FROM reunions_service.meeting_sections WHERE id = ?', [result.lastID]);
}

/** Résultats agrégés d'un sondage, tous types. */
async function computePollResults(poll) {
    const rows = await pgDb.all(
        'SELECT participant_key, participant_name, participant_email, answer FROM reunions_service.poll_answers WHERE poll_id = ?',
        [poll.id]
    );
    let options = poll.options;
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = []; } }
    if (!Array.isArray(options)) options = [];
    const parsedRows = rows.map(r => {
        let a = r.answer;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* garder */ } }
        return { name: r.participant_name || r.participant_email || 'Participant', key: r.participant_key, answer: a };
    });
    const answers = parsedRows.map(r => r.answer);
    const total = rows.length;
    const pct = (n) => total ? Math.round((n / total) * 1000) / 10 : 0;
    let byOption = [];
    let texts = [];
    let average = null;
    let distribution = [];
    // 🧩 Classement : rang moyen par élément (1 = le plus souvent en tête).
    let ranking = [];
    if (poll.type === 'single' || poll.type === 'truefalse') {
        const labels = poll.type === 'truefalse' ? ['Vrai', 'Faux'] : options;
        const counts = new Array(labels.length).fill(0);
        for (const a of answers) {
            let idx = -1;
            if (poll.type === 'truefalse') {
                if (a === true || a === 'true' || a === 1) idx = 0;
                else if (a === false || a === 'false' || a === 0) idx = 1;
            } else idx = Number(a);
            if (idx >= 0 && idx < counts.length) counts[idx]++;
        }
        byOption = labels.map((label, i) => ({ label, count: counts[i], percent: pct(counts[i]) }));
    } else if (poll.type === 'multiple') {
        const counts = new Array(options.length).fill(0);
        for (const a of answers) {
            if (!Array.isArray(a)) continue;
            for (const v of a) { const i = Number(v); if (i >= 0 && i < counts.length) counts[i]++; }
        }
        byOption = options.map((label, i) => ({ label, count: counts[i], percent: pct(counts[i]) }));
    } else if (poll.type === 'ordering') {
        const n = options.length;
        const rankSums = new Array(n).fill(0);
        const rankCounts = new Array(n).fill(0);
        const firstPlaces = new Array(n).fill(0);
        for (const a of answers) {
            if (!Array.isArray(a)) continue;
            a.forEach((v, pos) => {
                const i = Number(v);
                if (i >= 0 && i < n) {
                    rankSums[i] += pos + 1;
                    rankCounts[i] += 1;
                    if (pos === 0) firstPlaces[i] += 1;
                }
            });
        }
        ranking = options
            .map((label, i) => ({
                label,
                count: rankCounts[i],
                averageRank: rankCounts[i]
                    ? Math.round((rankSums[i] / rankCounts[i]) * 100) / 100
                    : null,
                firstPlaces: firstPlaces[i],
            }))
            .sort((a, b) => (a.averageRank ?? 99) - (b.averageRank ?? 99));
    } else if (poll.type === 'open' || poll.type === 'wordcloud') {
        texts = answers.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim());
    } else if (poll.type === 'stars' || poll.type === 'slider') {
        const nums = answers.map(Number).filter(n => Number.isFinite(n));
        average = nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null;
        const dist = new Map();
        for (const n of nums) dist.set(n, (dist.get(n) || 0) + 1);
        distribution = [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count }));
    }
    // Réponses nominatives : visibles par tous si le sondage n'est pas anonyme.
    // Si anonyme, les noms ne sortent PAS ici (endpoint dédié pour le lanceur /
    // maître du temps / admin).
    const visibility = pollVisibility(poll);
    const responses = visibility === 'nominatif' ? parsedRows.map(r => ({ name: r.name, answer: r.answer })) : [];
    return { total, visibility, anonymous: visibility !== 'nominatif', by_option: byOption, texts: texts.slice(0, 200), average, distribution, ranking, responses };
}

function pollParticipantKey(user) {
    const email = String(user?.email || '').toLowerCase().trim();
    const uname = String(user?.username || '').toLowerCase().trim();
    return email || uname || 'anonyme';
}

function pollVisibility(poll) {
    const v = poll?.visibility;
    if (v === 'nominatif' || v === 'semi_anonyme' || v === 'totalement_anonyme') return v;
    return poll?.anonymous ? 'semi_anonyme' : 'nominatif';
}

/** Clé de participation : identité réelle (nominatif/semi) ou empreinte
 *  irréversible (totalement anonyme, pour éviter les doublons sans stocker qui). */
function pollAnswerKey(poll, user) {
    const raw = pollParticipantKey(user);
    if (pollVisibility(poll) !== 'totalement_anonyme') return raw;
    return crypto.createHash('sha256').update(`${poll.id}:${raw}:${SECRET_KEY || 'dsihub'}`).digest('hex');
}

function normalizePollRow(row) {
    if (!row) return null;
    let options = row.options;
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = []; } }
    const visibility = pollVisibility(row);
    return { ...row, options: Array.isArray(options) ? options : [], visibility, anonymous: visibility !== 'nominatif' };
}

function meetingSummarySelect() {    return `
        SELECT m.*,
            (SELECT COUNT(*) FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id AND s.is_meta = FALSE) AS section_count,
            (SELECT COALESCE(SUM(s.duration_minutes), 0) FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id) AS total_duration,
            (SELECT COUNT(*) FROM reunions_service.meeting_participants p WHERE p.meeting_id = m.id) AS participant_count,
            (SELECT COUNT(*) FROM reunions_service.items i WHERE i.meeting_id = m.id) AS item_count
        FROM reunions_service.meetings m
    `;
}

// ─── Contrôleur ─────────────────────────────────────────────────────────────

const controller = {
    // ===== Templates =====
    listTemplates: async (req, res) => {
        try {
            const rows = await pgDb.all(`
                SELECT t.*,
                    (SELECT COUNT(*) FROM reunions_service.template_sections s WHERE s.template_id = t.id AND s.is_meta = FALSE) AS section_count,
                    (SELECT COALESCE(SUM(s.duration_minutes), 0) FROM reunions_service.template_sections s WHERE s.template_id = t.id) AS total_duration,
                    (SELECT COUNT(*) FROM reunions_service.template_participants p WHERE p.template_id = t.id) AS participant_count,
                    (SELECT COUNT(*) FROM reunions_service.meetings m WHERE m.template_id = t.id) AS meeting_count
                FROM reunions_service.templates t
                ORDER BY t.is_active DESC, t.name
            `);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getTemplate: async (req, res) => {
        try {
            const tpl = await getTemplateFull(req.params.id);
            if (!tpl) return res.status(404).json({ error: 'Modèle introuvable' });
            res.json(tpl);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createTemplate: async (req, res) => {
        try {
            const { name, description, sections, participants, meta_duration_minutes } = req.body || {};
            const cleanName = String(name || '').trim();
            if (!cleanName) return res.status(400).json({ error: 'Nom du modèle requis' });
            const result = await pgDb.run(
                `INSERT INTO reunions_service.templates (name, description, created_by, created_by_name)
                 VALUES (?, ?, ?, ?)`,
                [cleanName, description || null, userKey(req.user), userName(req.user)]
            );
            const id = result.lastID;
            await replaceTemplateSections(id, sections, meta_duration_minutes);
            await replaceTemplateParticipants(id, participants);
            res.json(await getTemplateFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateTemplate: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const existing = await pgDb.get('SELECT * FROM reunions_service.templates WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Modèle introuvable' });
            const { name, description, sections, participants, is_active, meta_duration_minutes } = req.body || {};
            const cleanName = name !== undefined ? String(name || '').trim() : existing.name;
            if (!cleanName) return res.status(400).json({ error: 'Nom du modèle requis' });
            await pgDb.run(
                `UPDATE reunions_service.templates
                 SET name = ?, description = ?, is_active = ?, updated_at = NOW()
                 WHERE id = ?`,
                [
                    cleanName,
                    description !== undefined ? (description || null) : existing.description,
                    is_active !== undefined ? !!is_active : existing.is_active,
                    id,
                ]
            );
            if (sections !== undefined) await replaceTemplateSections(id, sections, meta_duration_minutes);
            if (participants !== undefined) await replaceTemplateParticipants(id, participants);
            res.json(await getTemplateFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteTemplate: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            await pgDb.run('DELETE FROM reunions_service.templates WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    duplicateTemplate: async (req, res) => {
        try {
            const src = await getTemplateFull(req.params.id);
            if (!src) return res.status(404).json({ error: 'Modèle introuvable' });
            const result = await pgDb.run(
                `INSERT INTO reunions_service.templates (name, description, created_by, created_by_name)
                 VALUES (?, ?, ?, ?)`,
                [`${src.name} (copie)`, src.description || null, userKey(req.user), userName(req.user)]
            );
            const id = result.lastID;
            const srcMeta = src.sections.find(s => s.is_meta);
            await replaceTemplateSections(id, src.sections.filter(s => !s.is_meta), srcMeta?.duration_minutes);
            await replaceTemplateParticipants(id, src.participants);
            res.json(await getTemplateFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ===== Occurrences =====
    stats: async (req, res) => {
        try {
            await finalizePastMeetings();
            const rows = await pgDb.all(
                `SELECT status, COUNT(*)::int AS n FROM reunions_service.meetings GROUP BY status`
            );
            const byStatus = { planned: 0, in_progress: 0, finished: 0 };
            let total = 0;
            for (const r of rows) {
                const n = Number(r.n) || 0;
                total += n;
                if (byStatus[r.status] !== undefined) byStatus[r.status] = n;
            }
            const upcoming = await pgDb.get(
                `SELECT COUNT(*)::int AS n FROM reunions_service.meetings
                 WHERE status = 'planned' AND meeting_date IS NOT NULL
                   AND meeting_date >= NOW() AND meeting_date <= NOW() + INTERVAL '7 days'`
            );
            const presence = await pgDb.get(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE p.present)::int AS present,
                        COUNT(*) FILTER (WHERE NOT p.present AND p.excused)::int AS excused,
                        COUNT(*) FILTER (WHERE NOT p.present AND NOT p.excused)::int AS absent
                 FROM reunions_service.meeting_participants p
                 WHERE COALESCE(p.kind, 'present') <> 'info'`
            );
            const dur = await pgDb.get(
                `SELECT COUNT(*)::int AS meetings,
                        COALESCE(AVG(d), 0) AS avg_duration
                 FROM (
                   SELECT m.id, (SELECT COALESCE(SUM(duration_minutes),0) FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id) AS d
                   FROM reunions_service.meetings m
                 ) x`
            );
            const extras = await pgDb.get(
                `SELECT (SELECT COUNT(*)::int FROM reunions_service.items) AS items,
                        (SELECT COUNT(*)::int FROM reunions_service.attachments) AS attachments,
                        (SELECT COUNT(*)::int FROM reunions_service.meetings WHERE transcript_meeting_id IS NOT NULL) AS with_transcript,
                        (SELECT COUNT(*)::int FROM reunions_service.meetings WHERE meeting_mode = 'presentiel') AS presentiel,
                        (SELECT COUNT(*)::int FROM reunions_service.meetings WHERE meeting_mode = 'distanciel') AS distanciel,
                        (SELECT COUNT(*)::int FROM reunions_service.meetings WHERE meeting_date IS NOT NULL AND EXTRACT(YEAR FROM meeting_date) = EXTRACT(YEAR FROM NOW())) AS this_year`
            );
            const pt = Number(presence?.total) || 0;
            res.json({
                total,
                planned: byStatus.planned,
                in_progress: byStatus.in_progress,
                finished: byStatus.finished,
                upcoming_7d: Number(upcoming?.n) || 0,
                this_year: Number(extras?.this_year) || 0,
                participants_total: pt,
                present: Number(presence?.present) || 0,
                excused: Number(presence?.excused) || 0,
                absent: Number(presence?.absent) || 0,
                participation_rate: pt ? Math.round((Number(presence.present) / pt) * 1000) / 10 : 0,
                excused_rate: pt ? Math.round((Number(presence.excused) / pt) * 1000) / 10 : 0,
                absent_rate: pt ? Math.round((Number(presence.absent) / pt) * 1000) / 10 : 0,
                avg_duration: Math.round(Number(dur?.avg_duration) || 0),
                items: Number(extras?.items) || 0,
                attachments: Number(extras?.attachments) || 0,
                with_transcript: Number(extras?.with_transcript) || 0,
                presentiel: Number(extras?.presentiel) || 0,
                distanciel: Number(extras?.distanciel) || 0,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Statistiques détaillées (réservées aux administrateurs du module).
     * Filtre optionnel : ?year=2025.
     */
    /**
     * Recherche les occurrences Exchange/O365 du calendrier de l'utilisateur
     * pour une date donnée, afin de rattacher l'occurrence DSIHub à la bonne
     * réunion Exchange/Teams (et récupérer ensuite transcript + CR IA).
     * GET /exchange-meetings?date=AAAA-MM-JJ
     */
    exchangeMeetings: async (req, res) => {
        try {
            const date = String(req.query.date || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ error: 'Paramètre date (AAAA-MM-JJ) requis' });
            }
            const userEmail = req.user?.email
                || `${String(req.user?.username || '').split('@')[0].toLowerCase()}@ivry94.fr`;
            if (!userEmail || !userEmail.includes('@')) {
                return res.status(400).json({ error: 'Aucune adresse email associée à votre compte.' });
            }
            const result = await teamsTranscript.listCalendarMeetingsForDate(userEmail, date);
            if (!result.ok) return res.status(502).json({ error: result.error, warnings: result.warnings || [] });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    detailedStats: async (req, res) => {
        try {
            await finalizePastMeetings();
            const year = req.query.year ? toInt(req.query.year) : null;
            const yCond = year ? 'EXTRACT(YEAR FROM m.meeting_date) = ?' : '';
            const yParams = year ? [year] : [];
            const where = (extra = '') => {
                const parts = [yCond, extra].filter(Boolean);
                return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
            };

            const byYear = await pgDb.all(
                `SELECT EXTRACT(YEAR FROM m.meeting_date)::int AS year, COUNT(*)::int AS meetings,
                        COALESCE(SUM((SELECT COALESCE(SUM(s.duration_minutes),0)
                                      FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id)), 0)::int AS total_min
                 FROM reunions_service.meetings m
                 WHERE m.meeting_date IS NOT NULL
                 GROUP BY 1 ORDER BY 1`
            );
            const statusRows = await pgDb.all(
                `SELECT m.status, COUNT(*)::int AS n FROM reunions_service.meetings m ${where()} GROUP BY 1`, yParams
            );
            const presence = await pgDb.get(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE p.present)::int AS present,
                        COUNT(*) FILTER (WHERE NOT p.present AND p.excused)::int AS excused,
                        COUNT(*) FILTER (WHERE NOT p.present AND NOT p.excused)::int AS absent
                 FROM reunions_service.meeting_participants p
                 JOIN reunions_service.meetings m ON m.id = p.meeting_id
                 WHERE COALESCE(p.kind, 'present') <> 'info'${where() ? ' AND ' + where().replace(/^WHERE /i, '') : ''}`, yParams
            );
            const totals = await pgDb.get(
                `SELECT COUNT(*)::int AS meetings,
                        COALESCE(SUM((SELECT COALESCE(SUM(s.duration_minutes),0)
                                      FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id)), 0)::int AS total_min,
                        COUNT(*) FILTER (WHERE m.transcript_meeting_id IS NOT NULL)::int AS with_transcript,
                        COUNT(*) FILTER (WHERE m.meeting_mode = 'presentiel')::int AS presentiel,
                        COUNT(*) FILTER (WHERE m.meeting_mode = 'distanciel')::int AS distanciel
                 FROM reunions_service.meetings m ${where()}`, yParams
            );
            const extras = await pgDb.get(
                `SELECT (SELECT COUNT(*)::int FROM reunions_service.items i JOIN reunions_service.meetings m ON m.id = i.meeting_id ${where()}) AS items,
                        (SELECT COUNT(*)::int FROM reunions_service.attachments a JOIN reunions_service.meetings m ON m.id = a.meeting_id ${where()}) AS attachments`,
                [...yParams, ...yParams]
            );
            const monthYear = year || new Date().getFullYear();
            const byMonth = await pgDb.all(
                `SELECT EXTRACT(MONTH FROM m.meeting_date)::int AS month, COUNT(*)::int AS meetings
                 FROM reunions_service.meetings m
                 WHERE m.meeting_date IS NOT NULL AND EXTRACT(YEAR FROM m.meeting_date) = ?
                 GROUP BY 1 ORDER BY 1`, [monthYear]
            );
            const rubDur = await pgDb.all(
                `SELECT s.title, s.is_meta,
                        COUNT(DISTINCT s.meeting_id)::int AS meetings,
                        COALESCE(SUM(s.duration_minutes),0)::int AS total_min
                 FROM reunions_service.meeting_sections s
                 JOIN reunions_service.meetings m ON m.id = s.meeting_id
                 ${where()}
                 GROUP BY s.title, s.is_meta
                 ORDER BY total_min DESC`, yParams
            );
            const rubItems = await pgDb.all(
                `SELECT s.title, COUNT(i.id)::int AS items
                 FROM reunions_service.items i
                 JOIN reunions_service.meeting_sections s ON s.id = i.section_id
                 JOIN reunions_service.meetings m ON m.id = i.meeting_id
                 ${where()}
                 GROUP BY s.title`, yParams
            );
            const itemsByTitle = new Map(rubItems.map(r => [r.title, Number(r.items) || 0]));
            const rubriques = rubDur.map(r => ({
                title: r.title,
                is_meta: !!r.is_meta,
                meetings: Number(r.meetings) || 0,
                total_min: Number(r.total_min) || 0,
                avg_min: r.meetings ? Math.round((Number(r.total_min) / Number(r.meetings)) * 10) / 10 : 0,
                items: itemsByTitle.get(r.title) || 0,
            }));
            const services = await pgDb.all(
                `SELECT COALESCE(a.service, 'Service non renseigné') AS service,
                        COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE p.present)::int AS present,
                        COUNT(*) FILTER (WHERE NOT p.present AND p.excused)::int AS excused,
                        COUNT(*) FILTER (WHERE NOT p.present AND NOT p.excused)::int AS absent
                 FROM reunions_service.meeting_participants p
                 JOIN reunions_service.meetings m ON m.id = p.meeting_id
                 LEFT JOIN hub_calendrier.agents_dsi a ON LOWER(a.email) = LOWER(p.email)
                 ${where()}
                 GROUP BY 1 ORDER BY total DESC`, yParams
            );
            const topAbsent = await pgDb.all(
                `SELECT p.name, COALESCE(a.service, '') AS service,
                        COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE p.present)::int AS present,
                        COUNT(*) FILTER (WHERE NOT p.present AND p.excused)::int AS excused,
                        COUNT(*) FILTER (WHERE NOT p.present AND NOT p.excused)::int AS absent
                 FROM reunions_service.meeting_participants p
                 JOIN reunions_service.meetings m ON m.id = p.meeting_id
                 LEFT JOIN hub_calendrier.agents_dsi a ON LOWER(a.email) = LOWER(p.email)
                 ${where()}
                 GROUP BY p.name, a.service
                 HAVING COUNT(*) FILTER (WHERE NOT p.present) > 0
                 ORDER BY absent DESC, excused DESC, p.name
                 LIMIT 20`, yParams
            );
            const overrunRows = await pgDb.all(
                `SELECT m.id, m.title, to_char(m.meeting_date, 'YYYY-MM-DD') AS d,
                        m.started_at, m.ended_at,
                        (SELECT COALESCE(SUM(s.duration_minutes),0) FROM reunions_service.meeting_sections s WHERE s.meeting_id = m.id)::int AS theo,
                        ROUND(EXTRACT(EPOCH FROM (COALESCE(m.ended_at, NOW()) - m.started_at)) / 60)::int AS actual
                 FROM reunions_service.meetings m
                 WHERE m.started_at IS NOT NULL ${yCond ? 'AND ' + yCond : ''}
                 ORDER BY m.meeting_date DESC`, yParams
            );
            const overruns = overrunRows
                .map(r => ({ ...r, overrun: (Number(r.actual) || 0) - (Number(r.theo) || 0) }))
                .filter(r => r.overrun > 5);
            const overrunStats = overruns.length ? {
                available: true,
                count: overruns.length,
                avg_min: Math.round(overruns.reduce((s, r) => s + r.overrun, 0) / overruns.length),
                max_min: Math.max(...overruns.map(r => r.overrun)),
                details: overruns.slice(0, 15).map(r => ({
                    id: r.id, title: r.title, date: r.d, theoretical: r.theo, actual: r.actual, overrun: r.overrun,
                })),
            } : { available: false, count: 0, avg_min: 0, max_min: 0, details: [] };

            const pt = Number(presence?.total) || 0;
            const rate = (n) => pt ? Math.round((Number(n) / pt) * 1000) / 10 : 0;
            const byStatus = { planned: 0, in_progress: 0, finished: 0 };
            for (const r of statusRows) if (byStatus[r.status] !== undefined) byStatus[r.status] = Number(r.n) || 0;

            res.json({
                year,
                kpis: {
                    meetings: Number(totals?.meetings) || 0,
                    planned: byStatus.planned,
                    in_progress: byStatus.in_progress,
                    finished: byStatus.finished,
                    total_min: Number(totals?.total_min) || 0,
                    avg_min: totals?.meetings ? Math.round((Number(totals.total_min) / Number(totals.meetings)) * 10) / 10 : 0,
                    participants_total: pt,
                    present: Number(presence?.present) || 0,
                    excused: Number(presence?.excused) || 0,
                    absent: Number(presence?.absent) || 0,
                    presence_rate: rate(presence?.present),
                    excused_rate: rate(presence?.excused),
                    absence_rate: rate(presence?.absent),
                    items: Number(extras?.items) || 0,
                    attachments: Number(extras?.attachments) || 0,
                    with_transcript: Number(totals?.with_transcript) || 0,
                    presentiel: Number(totals?.presentiel) || 0,
                    distanciel: Number(totals?.distanciel) || 0,
                },
                by_year: byYear,
                by_month: byMonth,
                by_status: Object.entries(byStatus).map(([status, n]) => ({ status, n })),
                rubriques,
                services,
                top_absent: topAbsent,
                overruns: overrunStats,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Associe (ou délie) un compte rendu du Transcript Manager à l'occurrence.
     * Corps : { transcript_meeting_id, teams_meeting_id?, teams_transcript_id? }.
     */
    linkTranscript: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const meeting = await pgDb.get('SELECT id FROM reunions_service.meetings WHERE id = ?', [id]);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            const { transcript_meeting_id, teams_meeting_id, teams_transcript_id, teams_subject, teams_start } = req.body || {};
            const trId = transcript_meeting_id ? toInt(transcript_meeting_id) : null;
            if (trId) {
                const tr = await pgDb.get('SELECT id FROM transcript.meetings WHERE id = ?', [trId]);
                if (!tr) return res.status(404).json({ error: 'Compte rendu (transcript) introuvable' });
            }
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET transcript_meeting_id = ?, teams_meeting_id = COALESCE(?, teams_meeting_id),
                     teams_transcript_id = COALESCE(?, teams_transcript_id),
                     teams_subject = COALESCE(?, teams_subject),
                     teams_start = COALESCE(?, teams_start),
                     updated_at = NOW()
                 WHERE id = ?`,
                [trId, teams_meeting_id || null, teams_transcript_id || null, teams_subject || null, teams_start || null, id]
            );
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    unlinkTranscript: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET transcript_meeting_id = NULL, teams_meeting_id = NULL, teams_transcript_id = NULL, updated_at = NOW()
                 WHERE id = ?`, [id]
            );
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Recherche transverse dans toutes les occurrences (items, titres de
     * réunion, participants), avec filtres type/date/mode et mode de
     * correspondance « tous les mots » ou « au moins un mot ».
     * GET /search?q=...&match=all|any&template_id=&mode=&from=&to=
     */
    search: async (req, res) => {
        try {
            const q = String(req.query.q || '').trim();
            if (q.length < 2) return res.json({ query: q, terms: [], results: [] });
            const terms = [...new Set(q.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2))].slice(0, 8);
            if (!terms.length) return res.json({ query: q, terms: [], results: [] });
            const matchMode = req.query.match === 'any' ? 'any' : 'all';
            const joinWord = matchMode === 'any' ? ' OR ' : ' AND ';
            const params = [];
            for (const term of terms) params.push(`%${term}%`, `%${term}%`);

            const filters = [];
            if (req.query.template_id) { filters.push('m.template_id = ?'); }
            if (req.query.mode === 'presentiel' || req.query.mode === 'distanciel') { filters.push('m.meeting_mode = ?'); }
            if (req.query.from) { filters.push('m.meeting_date >= ?'); }
            if (req.query.to) { filters.push('m.meeting_date <= ?'); }

            const filterParams = [];
            if (req.query.template_id) filterParams.push(toInt(req.query.template_id));
            if (req.query.mode === 'presentiel' || req.query.mode === 'distanciel') filterParams.push(req.query.mode);
            if (req.query.from) filterParams.push(req.query.from);
            if (req.query.to) filterParams.push(req.query.to);

            // Visibilité : ne renvoyer que les réunions auxquelles l'utilisateur a accès.
            const vis = await meetingVisibilityFor(req.user);
            if (vis) { filters.push(vis.sql); filterParams.push(...vis.params); }

            const filterSql = filters.length ? ' AND ' + filters.join(' AND ') : '';

            // 1) Items (titre + contenu HTML)
            const itemTermSql = terms.map(() => '(i.title ILIKE ? OR i.content_html ILIKE ?)').join(joinWord);
            const itemRows = await pgDb.all(
                `SELECT i.id, i.meeting_id, i.title, i.content_html, s.title AS section_title, s.position AS section_position,
                        m.title AS meeting_title, m.meeting_date, m.template_name, m.template_id, m.meeting_mode, m.status
                 FROM reunions_service.items i
                 JOIN reunions_service.meeting_sections s ON s.id = i.section_id
                 JOIN reunions_service.meetings m ON m.id = i.meeting_id
                 WHERE (${itemTermSql})${filterSql}
                 ORDER BY m.meeting_date DESC NULLS LAST, s.position, i.position
                 LIMIT 400`,
                [...params, ...filterParams]
            );

            // 2) Titres de réunion
            const meetingParams = [];
            for (const term of terms) meetingParams.push(`%${term}%`);
            const meetingTermSql = terms.map(() => '(m.title ILIKE ?)').join(joinWord);
            const meetingRows = await pgDb.all(
                `SELECT m.id AS meeting_id, m.title AS meeting_title, m.meeting_date, m.template_name, m.template_id, m.meeting_mode, m.status
                 FROM reunions_service.meetings m
                 WHERE (${meetingTermSql})${filterSql}
                 ORDER BY m.meeting_date DESC NULLS LAST
                 LIMIT 100`,
                [...meetingParams, ...filterParams]
            );

            // 3) Participants (nom / email)
            const partParams = [];
            for (const term of terms) partParams.push(`%${term}%`, `%${term}%`);
            const partTermSql = terms.map(() => '(p.name ILIKE ? OR p.email ILIKE ?)').join(joinWord);
            const participantRows = await pgDb.all(
                `SELECT p.meeting_id, p.name, p.email, m.title AS meeting_title, m.meeting_date, m.template_name, m.template_id, m.meeting_mode, m.status
                 FROM reunions_service.meeting_participants p
                 JOIN reunions_service.meetings m ON m.id = p.meeting_id
                 WHERE (${partTermSql})${filterSql}
                 ORDER BY m.meeting_date DESC NULLS LAST
                 LIMIT 200`,
                [...partParams, ...filterParams]
            );

            const htmlToPlain = (html) => String(html || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, ' ')
                .trim();
            const lowTerms = terms.map(t => t.toLowerCase());
            const makeSnippet = (text, size = 160) => {
                const src = String(text || '');
                if (!src) return '';
                const lower = src.toLowerCase();
                let idx = -1;
                let found = '';
                for (const t of lowTerms) {
                    const i = lower.indexOf(t);
                    if (i >= 0 && (idx === -1 || i < idx)) { idx = i; found = t; }
                }
                if (idx === -1) return src.slice(0, size) + (src.length > size ? '…' : '');
                const start = Math.max(0, idx - Math.round(size / 3));
                const end = Math.min(src.length, idx + found.length + Math.round((size * 2) / 3));
                return (start > 0 ? '…' : '') + src.slice(start, end).trim() + (end < src.length ? '…' : '');
            };

            const byMeeting = new Map();
            const ensure = (row) => {
                const id = Number(row.meeting_id);
                if (!byMeeting.has(id)) {
                    byMeeting.set(id, {
                        meeting_id: id,
                        meeting_title: row.meeting_title,
                        meeting_date: row.meeting_date,
                        template_name: row.template_name,
                        meeting_mode: row.meeting_mode,
                        status: row.status,
                        matches: [],
                    });
                }
                return byMeeting.get(id);
            };

            for (const row of itemRows) {
                const entry = ensure(row);
                const plain = htmlToPlain(row.content_html);
                entry.matches.push({
                    kind: 'item',
                    item_id: row.id,
                    section_title: row.section_title,
                    item_title: row.title,
                    snippet: makeSnippet(`${row.title} — ${plain}`),
                });
            }
            for (const row of meetingRows) {
                const entry = ensure(row);
                entry.matches.push({ kind: 'meeting', snippet: row.meeting_title });
            }
            for (const row of participantRows) {
                const entry = ensure(row);
                entry.matches.push({
                    kind: 'participant',
                    snippet: `${row.name || ''}${row.email ? ` <${row.email}>` : ''}`,
                });
            }

            const results = [...byMeeting.values()]
                .map(r => ({ ...r, match_count: r.matches.length, matches: r.matches.slice(0, 25) }))
                .sort((a, b) => {
                    const ta = a.meeting_date ? new Date(a.meeting_date).getTime() : 0;
                    const tb = b.meeting_date ? new Date(b.meeting_date).getTime() : 0;
                    return tb - ta;
                })
                .slice(0, 100);

            res.json({ query: q, terms, match: matchMode, results, meeting_count: results.length });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    listMeetings: async (req, res) => {
        try {
            await finalizePastMeetings();
            const { status, template_id, from, to, year, q, mode } = req.query;
            const conditions = [];
            const params = [];
            // Visibilité : participants (présents possibles / pour info), maître du temps, créateur, admins.
            const vis = await meetingVisibilityFor(req.user);
            if (vis) { conditions.push(vis.sql); params.push(...vis.params); }
            if (status) { conditions.push('m.status = ?'); params.push(status); }
            if (template_id) { conditions.push('m.template_id = ?'); params.push(toInt(template_id)); }
            if (from) { conditions.push('m.meeting_date >= ?'); params.push(from); }
            if (to) { conditions.push('m.meeting_date <= ?'); params.push(to); }
            if (year) { conditions.push('EXTRACT(YEAR FROM m.meeting_date) = ?'); params.push(toInt(year)); }
            if (mode === 'presentiel' || mode === 'distanciel') { conditions.push('m.meeting_mode = ?'); params.push(mode); }
            if (q && String(q).trim()) { conditions.push('m.title ILIKE ?'); params.push(`%${String(q).trim()}%`); }
            let sql = meetingSummarySelect();
            if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
            sql += ' ORDER BY m.meeting_date DESC NULLS LAST, m.created_at DESC';
            res.json(await pgDb.all(sql, params));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getMeeting: async (req, res) => {
        try {
            await finalizePastMeetings();
            const meeting = await getMeetingFull(req.params.id);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            if (!(await canSeeMeeting(req.user, meeting))) {
                return res.status(403).json({ error: "Cette réunion est réservée aux personnes invitées (présents possibles ou pour information)." });
            }
            // Réponse de l'utilisateur courant au dernier INTERACT (popup).
            try {
                const latest = meeting.polls?.[0];
                if (latest) {
                    const mine = await pgDb.get(
                        'SELECT answer FROM reunions_service.poll_answers WHERE poll_id = ? AND participant_key = ?',
                        [latest.id, pollAnswerKey(latest, req.user)]
                    );
                    let myAnswer = mine?.answer;
                    if (typeof myAnswer === 'string') { try { myAnswer = JSON.parse(myAnswer); } catch { /* garder */ } }
                    latest.my_answer = myAnswer ?? null;
                }
            } catch (e) { /* pas bloquant */ }
            res.json(meeting);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createMeeting: async (req, res) => {
        try {
            const { template_id, title, meeting_date, participants, meeting_mode } = req.body || {};
            const tpl = await getTemplateFull(template_id);
            if (!tpl) return res.status(404).json({ error: 'Modèle introuvable' });
            const mode = meeting_mode === 'distanciel' ? 'distanciel' : 'presentiel';

            const meetingTitle = String(title || '').trim() || tpl.name;
            const result = await pgDb.run(
                `INSERT INTO reunions_service.meetings
                    (template_id, template_name, title, meeting_date, status, meeting_mode, created_by, created_by_name)
                 VALUES (?, ?, ?, ?, 'planned', ?, ?, ?)`,
                [tpl.id, tpl.name, meetingTitle, meeting_date || null, mode, userKey(req.user), userName(req.user)]
            );
            const id = result.lastID;

            // Instantané des rubriques du template (les modifications ultérieures
            // du modèle ne changent pas les réunions déjà créées).
            for (const s of tpl.sections) {
                await pgDb.run(
                    `INSERT INTO reunions_service.meeting_sections
                        (meeting_id, title, duration_minutes, position, is_meta, is_pause, kpis_config)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [id, s.title, s.duration_minutes || 0, s.position || 0, !!s.is_meta, !!s.is_pause,
                     JSON.stringify(Array.isArray(s.kpis_config) ? s.kpis_config : [])]
                );
            }

            // Participants : ceux fournis (modifiés à la création) sinon ceux du modèle.
            const list = Array.isArray(participants) ? participants : tpl.participants;
            const seen = new Set();
            for (const p of list) {
                const email = String(p?.email || '').trim().toLowerCase();
                if (!email.includes('@') || seen.has(email)) continue;
                seen.add(email);
                await pgDb.run(
                    `INSERT INTO reunions_service.meeting_participants (meeting_id, email, username, name, present, excused, kind)
                     VALUES (?, ?, ?, ?, FALSE, FALSE, ?)`,
                    [id, email, p?.username || email.split('@')[0], p?.name || email,
                     (p?.kind === 'info' || p?.info === true) ? 'info' : 'present']
                );
            }

            const firstSection = await pgDb.get(
                'SELECT id FROM reunions_service.meeting_sections WHERE meeting_id = ? ORDER BY position, id LIMIT 1', [id]
            );
            if (firstSection) {
                await pgDb.run('UPDATE reunions_service.meetings SET current_section_id = ? WHERE id = ?', [firstSection.id, id]);
            }

            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateMeeting: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const existing = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Réunion introuvable' });
            const { title, meeting_date, meeting_mode } = req.body || {};
            const mode = (meeting_mode === 'presentiel' || meeting_mode === 'distanciel')
                ? meeting_mode
                : (existing.meeting_mode || 'presentiel');
            await pgDb.run(
                'UPDATE reunions_service.meetings SET title = ?, meeting_date = ?, meeting_mode = ?, updated_at = NOW() WHERE id = ?',
                [
                    title !== undefined ? (String(title || '').trim() || existing.title) : existing.title,
                    meeting_date !== undefined ? (meeting_date || null) : existing.meeting_date,
                    mode,
                    id,
                ]
            );
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteMeeting: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const atts = await pgDb.all('SELECT file_path FROM reunions_service.attachments WHERE meeting_id = ?', [id]);
            for (const a of atts) {
                if (a.file_path) { try { await storage.deleteFile(a.file_path); } catch { /* ignore */ } }
            }
            await pgDb.run('DELETE FROM reunions_service.meetings WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    startMeeting: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const existing = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Réunion introuvable' });
            const { time_master_username, time_master_name } = req.body || {};
            const masterUsername = String(time_master_username || userKey(req.user) || '').toLowerCase();
            const masterName = time_master_name || userName(req.user);
            const firstSection = await pgDb.get(
                'SELECT id FROM reunions_service.meeting_sections WHERE meeting_id = ? ORDER BY position, id LIMIT 1', [id]
            );
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET status = 'in_progress', started_at = COALESCE(started_at, NOW()),
                     time_master_username = ?, time_master_name = ?,
                     current_section_id = COALESCE(NULLIF(current_section_id, 0), ?),
                     current_section_started_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [masterUsername, masterName, firstSection?.id || null, id]
            );
            // Lancement = calcul des KPI de chaque rubrique, figés dans le CR.
            // Les instantanés déjà présents (réouverture/relance) sont conservés.
            try {
                const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
                await computeMeetingKpiSnapshots(existing, token, { force: false });
            } catch (e) {
                console.error('[REUNIONS-SERVICE] calcul des KPI au lancement :', e.message);
            }
            await reunionSocket.notifyMasterChanged(id, { username: masterUsername, name: masterName });
            await reunionSocket.syncMeetingState(id);
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Change le maître du temps (bouton « Devenir maître du temps »). Le nouveau
     * maître pilote immédiatement la salle : la synchronisation temps réel est
     * rediffusée à tous les écrans connectés.
     */
    setTimeMaster: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const existing = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Réunion introuvable' });
            const { time_master_username, time_master_name } = req.body || {};
            const username = String(time_master_username || userKey(req.user) || '').toLowerCase();
            const name = time_master_name || userName(req.user);
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET time_master_username = ?, time_master_name = ?, updated_at = NOW()
                 WHERE id = ?`,
                [username, name, id]
            );
            await reunionSocket.notifyMasterChanged(id, { username, name });
            await reunionSocket.syncMeetingState(id);
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Auto-présence à l'ouverture de la page : repli HTTP du mécanisme socket
     * (rs_join), pour garantir la présence même si le temps réel n'est pas
     * encore établi. Règles dans `markUserPresent`.
     */
    markSelfPresent: async (req, res) => {
        try {
            res.json(await reunionSocket.markUserPresent(toInt(req.params.id), req.user));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Lance un INTERACT (sondage) depuis une réunion. L'INTERACT reste
     *  interne à DSIHub (rubrique INTERACT de la réunion) : aucune copie
     *  n'est créée dans Interact'Ivry. */
    createPoll: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const meeting = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            const {
                question, type, options, explanation, image, anonymous,
                visibility: rawVisibility, interactType, interactLabel,
            } = req.body || {};
            const legacyAnonymous = anonymous === true || anonymous === 'true';
            const visibility = ['nominatif', 'semi_anonyme', 'totalement_anonyme'].includes(rawVisibility)
                ? rawVisibility
                : (legacyAnonymous ? 'semi_anonyme' : 'nominatif');
            const isAnonymous = visibility !== 'nominatif';
            const cleanQuestion = String(question || '').trim();
            if (!cleanQuestion) return res.status(400).json({ error: 'Question requise' });
            // Le type demandé doit être un type natif DSIHub (le catalogue
            // Interact'Ivry est traduit en familles de rendu côté client).
            const pollType = interactCatalog.isSupportedPollType(type) ? type : 'single';
            // Format d'origine dans le catalogue Interact'Ivry (libellé seul).
            const sourceType = String(interactType || '').trim().slice(0, 80) || null;
            const sourceLabel = String(interactLabel || '').trim().slice(0, 120) || null;
            let cleanOptions = [];
            if (pollType === 'single' || pollType === 'multiple' || pollType === 'ordering') {
                cleanOptions = (Array.isArray(options) ? options : []).map(o => String(o).trim()).filter(Boolean);
                if (cleanOptions.length < 2) {
                    return res.status(400).json({
                        error: pollType === 'ordering'
                            ? 'Au moins deux éléments à classer sont requis'
                            : 'Au moins deux propositions sont requises',
                    });
                }
            }
            // Un seul INTERACT ouvert à la fois : on clôt les précédents.
            await pgDb.run(
                `UPDATE reunions_service.polls SET status = 'closed', closed_at = NOW()
                 WHERE meeting_id = ? AND status = 'open'`, [meetingId]
            );
            // 🔌 Découplage Interact'Ivry : aucune animation/session n'est
            // créée là-bas. Seul le format choisi dans son catalogue est
            // mémorisé (interact_type / interact_label) pour l'affichage.
            const interact = { ok: false, error: null };
            const result = await pgDb.run(
                `INSERT INTO reunions_service.polls
                    (meeting_id, question, type, options, explanation, image, status, anonymous, visibility,
                     interact_quiz_id, interact_session_id, interact_code, interact_type, interact_label,
                     created_by, created_by_name)
                 VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    meetingId, cleanQuestion, pollType, JSON.stringify(cleanOptions), explanation || null, image || null,
                    isAnonymous, visibility,
                    interact.quizId || null, interact.sessionId || null, interact.code || null,
                    sourceType, sourceLabel,
                    userKey(req.user), userName(req.user),
                ]
            );
            const newSection = await ensureInteractSection(meetingId);
            const poll = normalizePollRow(await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [result.lastID]));
            const results = await computePollResults(poll);
            reunionSocket.notifyMeeting(meetingId, 'rs_poll', { poll });
            reunionSocket.notifyContentChanged(meetingId, { sectionId: newSection?.id, reason: 'poll' });
            res.json({ poll, results, interact_created: !!interact.ok, interact_error: interact.ok ? null : interact.error });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Catalogue des formats proposés par Interact'Ivry (lecture seule).
     *  DSIHub s'en sert pour afficher dynamiquement les formats disponibles
     *  sans jamais créer d'animation dans Interact'Ivry. */
    getInteractFormats: async (_req, res) => {
        try {
            const catalog = await interactCatalog.getCatalog();
            // Le cache HTTP est géré côté serveur (5 min) : pas de cache
            // navigateur, l'admin doit voir un nouveau format sans F5 forcé.
            res.set('Cache-Control', 'no-store');
            res.json(catalog);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getCurrentPoll: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const row = await pgDb.get(
                `SELECT * FROM reunions_service.polls WHERE meeting_id = ?
                 ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
                [meetingId]
            );
            if (!row) return res.json({ poll: null, results: null, my_answer: null });
            const poll = normalizePollRow(row);
            const results = await computePollResults(poll);
            const mine = await pgDb.get(
                'SELECT answer FROM reunions_service.poll_answers WHERE poll_id = ? AND participant_key = ?',
                [poll.id, pollAnswerKey(poll, req.user)]
            );
            let myAnswer = mine?.answer;
            if (typeof myAnswer === 'string') { try { myAnswer = JSON.parse(myAnswer); } catch { /* garder */ } }
            res.json({ poll, results, my_answer: myAnswer ?? null });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    answerPoll: async (req, res) => {
        try {
            const pollId = toInt(req.params.id);
            const row = await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [pollId]);
            if (!row) return res.status(404).json({ error: 'INTERACT introuvable' });
            if (row.status !== 'open') return res.status(409).json({ error: 'Ce sondage est clos' });
            const answer = req.body?.answer;
            if (answer === undefined || answer === null || answer === '') {
                return res.status(400).json({ error: 'Réponse requise' });
            }
            const totalAnon = pollVisibility(row) === 'totalement_anonyme';
            const key = pollAnswerKey(normalizePollRow(row), req.user);
            await pgDb.run(
                `INSERT INTO reunions_service.poll_answers
                    (poll_id, participant_key, participant_username, participant_email, participant_name, answer)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT (poll_id, participant_key)
                 DO UPDATE SET answer = EXCLUDED.answer, participant_name = EXCLUDED.participant_name, created_at = NOW()`,
                [
                    pollId,
                    key,
                    totalAnon ? null : userKey(req.user),
                    totalAnon ? null : (String(req.user?.email || '').toLowerCase() || null),
                    totalAnon ? null : userName(req.user),
                    JSON.stringify(answer),
                ]
            );
            const poll = normalizePollRow(row);
            const results = await computePollResults(poll);
            reunionSocket.notifyMeeting(row.meeting_id, 'rs_poll_results', { poll, results });
            res.json({ poll, results, my_answer: answer });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Réponses nominatives d'un INTERACT. Même si le sondage est anonyme pour
     * les participants, le lanceur, le maître du temps et les administrateurs
     * peuvent toujours savoir qui a répondu (« il faut forcément savoir qui »).
     */
    getPollResponses: async (req, res) => {
        try {
            const pollId = toInt(req.params.id);
            const row = await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [pollId]);
            if (!row) return res.status(404).json({ error: 'INTERACT introuvable' });
            const meeting = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [row.meeting_id]);
            const visibility = pollVisibility(row);
            if (visibility === 'totalement_anonyme') {
                return res.status(403).json({ error: 'Réponses totalement anonymes : personne ne peut savoir qui a répondu.' });
            }
            const username = userKey(req.user);
            const allowed = visibility === 'nominatif' || await isModuleAdmin(req.user, 'reunions-service')
                || String(row.created_by || '') === username
                || String(meeting?.time_master_username || '') === username;
            if (!allowed) return res.status(403).json({ error: 'Accès réservé au lanceur, au maître du temps ou à un administrateur.' });
            const rows = await pgDb.all(
                'SELECT participant_name, participant_email, answer, created_at FROM reunions_service.poll_answers WHERE poll_id = ? ORDER BY created_at',
                [pollId]
            );
            const responses = rows.map(r => {
                let a = r.answer;
                if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* garder */ } }
                return { name: r.participant_name || r.participant_email || 'Participant', email: r.participant_email, answer: a, at: r.created_at };
            });
            res.json({ poll: normalizePollRow(row), responses });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    closePoll: async (req, res) => {
        try {
            const pollId = toInt(req.params.id);
            const row = await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [pollId]);
            if (!row) return res.status(404).json({ error: 'INTERACT introuvable' });
            const meeting = await pgDb.get('SELECT * FROM reunions_service.meetings WHERE id = ?', [row.meeting_id]);
            const username = userKey(req.user);
            const allowed = await isModuleAdmin(req.user, 'reunions-service')
                || String(row.created_by || '') === username
                || String(meeting?.time_master_username || '') === username;
            if (!allowed) return res.status(403).json({ error: 'Seul le lanceur, le maître du temps ou un administrateur peut clôturer ce sondage.' });
            await pgDb.run(
                `UPDATE reunions_service.polls SET status = 'closed', closed_at = NOW() WHERE id = ?`, [pollId]
            );
            const poll = normalizePollRow(await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [pollId]));
            const results = await computePollResults(poll);
            reunionSocket.notifyMeeting(row.meeting_id, 'rs_poll_closed', { poll, results });
            res.json({ poll, results });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Suppression d'un INTERACT — réservée aux administrateurs. */
    deletePoll: async (req, res) => {
        try {
            if (!(await isModuleAdmin(req.user, 'reunions-service'))) {
                return res.status(403).json({ error: 'Suppression réservée aux administrateurs du module.' });
            }
            const pollId = toInt(req.params.id);
            const row = await pgDb.get('SELECT * FROM reunions_service.polls WHERE id = ?', [pollId]);
            if (!row) return res.status(404).json({ error: 'INTERACT introuvable' });
            const meetingId = row.meeting_id;
            await pgDb.run('DELETE FROM reunions_service.poll_answers WHERE poll_id = ?', [pollId]);
            await pgDb.run('DELETE FROM reunions_service.polls WHERE id = ?', [pollId]);
            // Si plus aucun INTERACT, on retire la rubrique INTERACT vide.
            try {
                const remaining = await pgDb.get(
                    'SELECT COUNT(*)::int AS n FROM reunions_service.polls WHERE meeting_id = ?', [meetingId]
                );
                if (Number(remaining?.n) === 0) {
                    const section = await pgDb.get(
                        "SELECT id FROM reunions_service.meeting_sections WHERE meeting_id = ? AND LOWER(title) = 'interact' LIMIT 1",
                        [meetingId]
                    );
                    if (section) {
                        const items = await pgDb.get(
                            'SELECT COUNT(*)::int AS n FROM reunions_service.items WHERE section_id = ?', [section.id]
                        );
                        if (Number(items?.n) === 0) {
                            await pgDb.run('DELETE FROM reunions_service.meeting_sections WHERE id = ?', [section.id]);
                        }
                    }
                }
            } catch (e) { /* nettoyage non bloquant */ }
            reunionSocket.notifyMeeting(meetingId, 'rs_poll_deleted', { pollId });
            reunionSocket.notifyContentChanged(meetingId, { reason: 'poll_deleted' });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    endMeeting: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET status = 'finished', ended_at = NOW(), updated_at = NOW()
                 WHERE id = ?`, [id]
            );
            await reunionSocket.syncMeetingState(id);
            reunionSocket.closePause(id, 'La réunion est terminée.');
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    reopenMeeting: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            await pgDb.run(
                `UPDATE reunions_service.meetings
                 SET status = 'planned', ended_at = NULL, updated_at = NOW()
                 WHERE id = ?`, [id]
            );
            await reunionSocket.syncMeetingState(id);
            res.json(await getMeetingFull(id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    setSectionCompleted: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const { completed } = req.body || {};
            await pgDb.run('UPDATE reunions_service.meeting_sections SET completed = ? WHERE id = ?', [!!completed, id]);
            const row = await pgDb.get('SELECT meeting_id FROM reunions_service.meeting_sections WHERE id = ?', [id]);
            if (row) reunionSocket.notifyContentChanged(row.meeting_id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ===== Participants =====
    addParticipants: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const meeting = await pgDb.get('SELECT id FROM reunions_service.meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            const list = Array.isArray(req.body?.participants) ? req.body.participants : [];
            const existing = await pgDb.all('SELECT LOWER(email) AS email FROM reunions_service.meeting_participants WHERE meeting_id = ?', [meetingId]);
            const seen = new Set(existing.map(r => r.email));
            for (const p of list) {
                const email = String(p?.email || '').trim().toLowerCase();
                if (!email.includes('@') || seen.has(email)) continue;
                seen.add(email);
                await pgDb.run(
                    `INSERT INTO reunions_service.meeting_participants (meeting_id, email, username, name, present, excused, kind)
                     VALUES (?, ?, ?, ?, FALSE, FALSE, ?)`,
                    [meetingId, email, p?.username || email.split('@')[0], p?.name || email,
                     (p?.kind === 'info' || p?.info === true) ? 'info' : 'present']
                );
            }
            reunionSocket.notifyContentChanged(meetingId);
            res.json(await getMeetingFull(meetingId));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    toggleParticipantPresence: async (req, res) => {
        try {
            const participantId = toInt(req.params.participantId);
            const row = await pgDb.get('SELECT * FROM reunions_service.meeting_participants WHERE id = ?', [participantId]);
            if (!row) return res.status(404).json({ error: 'Participant introuvable' });
            const { status } = req.body || {};
            let present;
            let excused;
            if (status === 'present') { present = true; excused = false; }
            else if (status === 'excused') { present = false; excused = true; }
            else if (status === 'absent') { present = false; excused = false; }
            else if (req.body?.present !== undefined) { present = !!req.body.present; excused = present ? false : !!row.excused; }
            else { present = !row.present; excused = present ? false : !!row.excused; }
            await pgDb.run(
                'UPDATE reunions_service.meeting_participants SET present = ?, excused = ? WHERE id = ?',
                [present, excused, participantId]
            );
            reunionSocket.notifyContentChanged(row.meeting_id);
            res.json({ success: true, present, excused });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    removeParticipant: async (req, res) => {
        try {
            const participantId = toInt(req.params.participantId);
            const row = await pgDb.get('SELECT * FROM reunions_service.meeting_participants WHERE id = ?', [participantId]);
            if (!row) return res.status(404).json({ error: 'Participant introuvable' });
            await pgDb.run('DELETE FROM reunions_service.meeting_participants WHERE id = ?', [participantId]);
            reunionSocket.notifyContentChanged(row.meeting_id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ===== Items =====
    createItem: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const sectionId = toInt(req.params.sectionId);
            const section = await pgDb.get(
                'SELECT * FROM reunions_service.meeting_sections WHERE id = ? AND meeting_id = ?', [sectionId, meetingId]
            );
            if (!section) return res.status(404).json({ error: 'Rubrique introuvable' });
            const { title, content_html, is_pause } = req.body || {};
            const cleanTitle = String(title || '').trim();
            if (!cleanTitle) return res.status(400).json({ error: 'Titre de l\'item requis' });
            const pause = is_pause === true || is_pause === 'true';
            const posRow = await pgDb.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM reunions_service.items WHERE section_id = ?', [sectionId]);
            const result = await pgDb.run(
                `INSERT INTO reunions_service.items
                    (meeting_id, section_id, title, content_html, position, is_pause, created_by, created_by_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [meetingId, sectionId, cleanTitle, content_html || '', posRow?.p || 0, pause, userKey(req.user), userName(req.user)]
            );
            reunionSocket.notifyContentChanged(meetingId, { itemId: result.lastID });
            const item = await pgDb.get('SELECT * FROM reunions_service.items WHERE id = ?', [result.lastID]);
            res.json({ ...item, attachments: [] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateItem: async (req, res) => {
        try {
            const itemId = toInt(req.params.itemId);
            const item = await pgDb.get('SELECT * FROM reunions_service.items WHERE id = ?', [itemId]);
            if (!item) return res.status(404).json({ error: 'Item introuvable' });
            const { title, content_html, is_pause } = req.body || {};
            const pause = is_pause === undefined ? !!item.is_pause : (is_pause === true || is_pause === 'true');
            await pgDb.run(
                `UPDATE reunions_service.items
                 SET title = ?, content_html = ?, is_pause = ?, updated_at = NOW()
                 WHERE id = ?`,
                [
                    title !== undefined ? (String(title || '').trim() || item.title) : item.title,
                    content_html !== undefined ? (content_html || '') : item.content_html,
                    pause,
                    itemId,
                ]
            );
            reunionSocket.notifyContentChanged(item.meeting_id, { itemId });
            const updated = await pgDb.get('SELECT * FROM reunions_service.items WHERE id = ?', [itemId]);
            const atts = await pgDb.all(
                `SELECT id, meeting_id, item_id, filename, original_name, mimetype, size, uploaded_by, uploaded_by_name, created_at
                 FROM reunions_service.attachments WHERE item_id = ? ORDER BY created_at`, [itemId]
            );
            res.json({ ...updated, attachments: atts });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Marque / démarque un item « important ». Ouvert à tous les participants,
     *  comme la modification ; ne change pas la date de modification. */
    setItemImportant: async (req, res) => {
        try {
            const itemId = toInt(req.params.itemId);
            const item = await pgDb.get('SELECT id, meeting_id FROM reunions_service.items WHERE id = ?', [itemId]);
            if (!item) return res.status(404).json({ error: 'Item introuvable' });
            const important = req.body?.is_important === true || req.body?.is_important === 'true';
            await pgDb.run('UPDATE reunions_service.items SET is_important = ? WHERE id = ?', [important, itemId]);
            reunionSocket.notifyContentChanged(item.meeting_id, { itemId });
            res.json({ success: true, is_important: important });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteItem: async (req, res) => {
        try {
            const itemId = toInt(req.params.itemId);
            const item = await pgDb.get('SELECT * FROM reunions_service.items WHERE id = ?', [itemId]);
            if (!item) return res.status(404).json({ error: 'Item introuvable' });
            const atts = await pgDb.all('SELECT file_path FROM reunions_service.attachments WHERE item_id = ?', [itemId]);
            for (const a of atts) { if (a.file_path) { try { await storage.deleteFile(a.file_path); } catch { /* ignore */ } } }
            await pgDb.run('DELETE FROM reunions_service.items WHERE id = ?', [itemId]);
            reunionSocket.notifyContentChanged(item.meeting_id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ===== Pièces jointes =====
    uploadAttachments: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const meeting = await pgDb.get('SELECT id FROM reunions_service.meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            const itemId = req.body?.item_id ? toInt(req.body.item_id) : null;
            const files = req.files || (req.file ? [req.file] : []);
            if (!files.length) return res.status(400).json({ error: 'Aucun fichier reçu' });

            const inserted = [];
            for (const file of files) {
                if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
                const saved = await storage.saveFile(ATTACHMENT_MODULE, meetingId, file);
                const result = await pgDb.run(
                    `INSERT INTO reunions_service.attachments
                        (meeting_id, item_id, filename, original_name, mimetype, size, uploaded_by, uploaded_by_name, file_path)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [meetingId, itemId, saved.filename, file.originalname, file.mimetype, file.size, userKey(req.user), userName(req.user), saved.dbPath]
                );
                try {
                    await docsService.registerExternalUpload({
                        module: ATTACHMENT_MODULE,
                        entityType: itemId ? 'item_attachment' : 'meeting_attachment',
                        entityId: meetingId,
                        title: file.originalname,
                        filename: saved.filename,
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        storageRef: saved.dbPath,
                        uploadedBy: userKey(req.user),
                        metadata: { meeting_id: meetingId, item_id: itemId },
                    });
                } catch (e) {
                    console.error('[REUNIONS-SERVICE] hub_docs:', e.message);
                }
                inserted.push({
                    id: result.lastID, meeting_id: meetingId, item_id: itemId,
                    filename: saved.filename, original_name: file.originalname,
                    mimetype: file.mimetype, size: file.size,
                    uploaded_by: userKey(req.user), uploaded_by_name: userName(req.user),
                });
            }
            reunionSocket.notifyContentChanged(meetingId, { itemId });
            res.json({ uploaded: inserted.length, files: inserted });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createSection: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const meeting = await loadManagedMeeting(req, res, meetingId);
            if (!meeting) return;
            const isPause = req.body?.is_pause === true || req.body?.is_pause === 'true';
            const title = String(req.body?.title || '').trim() || (isPause ? 'Pause' : 'Nouvelle rubrique');
            const duration = Math.max(0, toInt(req.body?.duration_minutes, isPause ? 10 : 0));
            const kpis = isPause ? [] : kpiEngine.normalizeList(req.body?.kpis || req.body?.kpis_config);
            const max = await pgDb.get('SELECT COALESCE(MAX(position), 0) AS m FROM reunions_service.meeting_sections WHERE meeting_id = ?', [meetingId]);
            const result = await pgDb.run(
                `INSERT INTO reunions_service.meeting_sections
                    (meeting_id, title, duration_minutes, position, is_meta, is_pause, kpis_config)
                 VALUES (?, ?, ?, ?, FALSE, ?, ?)`,
                [meetingId, title, duration, (Number(max?.m) || 0) + 1, isPause, JSON.stringify(kpis)]
            );
            reunionSocket.notifyContentChanged(meetingId, { sectionId: result.lastID });
            const section = await pgDb.get('SELECT * FROM reunions_service.meeting_sections WHERE id = ?', [result.lastID]);
            res.json(section);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateSection: async (req, res) => {
        try {
            const sectionId = toInt(req.params.id);
            const section = await pgDb.get('SELECT * FROM reunions_service.meeting_sections WHERE id = ?', [sectionId]);
            if (!section) return res.status(404).json({ error: 'Rubrique introuvable' });
            const meeting = await loadManagedMeeting(req, res, section.meeting_id);
            if (!meeting) return;
            if (section.is_meta) return res.status(400).json({ error: 'La rubrique Participants n\'est pas modifiable.' });
            const title = req.body?.title !== undefined ? String(req.body.title || '').trim() : section.title;
            if (!title) return res.status(400).json({ error: 'Titre de la rubrique requis' });
            const duration = req.body?.duration_minutes !== undefined
                ? Math.max(0, toInt(req.body.duration_minutes, 0))
                : section.duration_minutes;
            const isPause = req.body?.is_pause === undefined
                ? !!section.is_pause
                : (req.body.is_pause === true || req.body.is_pause === 'true');
            await pgDb.run(
                `UPDATE reunions_service.meeting_sections
                 SET title = ?, duration_minutes = ?, is_pause = ? WHERE id = ?`,
                [title, duration, isPause, sectionId]
            );
            reunionSocket.notifyContentChanged(section.meeting_id, { sectionId });
            const updated = await pgDb.get('SELECT * FROM reunions_service.meeting_sections WHERE id = ?', [sectionId]);
            res.json(updated);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteSection: async (req, res) => {
        try {
            const sectionId = toInt(req.params.id);
            const section = await pgDb.get('SELECT * FROM reunions_service.meeting_sections WHERE id = ?', [sectionId]);
            if (!section) return res.status(404).json({ error: 'Rubrique introuvable' });
            const meeting = await loadManagedMeeting(req, res, section.meeting_id);
            if (!meeting) return;
            if (section.is_meta) return res.status(400).json({ error: 'La rubrique Participants ne peut pas être supprimée.' });

            const atts = await pgDb.all(
                `SELECT a.file_path FROM reunions_service.attachments a
                 JOIN reunions_service.items i ON i.id = a.item_id
                 WHERE i.section_id = ?`, [sectionId]
            );
            for (const att of atts) {
                if (att.file_path) { try { await storage.deleteFile(att.file_path); } catch { /* ignore */ } }
            }
            await pgDb.run('DELETE FROM reunions_service.meeting_sections WHERE id = ?', [sectionId]);

            if (Number(meeting.current_section_id) === sectionId) {
                const next = await pgDb.get(
                    'SELECT id FROM reunions_service.meeting_sections WHERE meeting_id = ? ORDER BY position, id LIMIT 1',
                    [section.meeting_id]
                );
                await pgDb.run('UPDATE reunions_service.meetings SET current_section_id = ? WHERE id = ?', [next?.id || null, section.meeting_id]);
            }
            reunionSocket.notifyContentChanged(section.meeting_id, { sectionId, deleted: true });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    reorderSections: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const meeting = await loadManagedMeeting(req, res, meetingId);
            if (!meeting) return;
            const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toInt(v)).filter(Boolean) : [];
            if (ids.length === 0) return res.status(400).json({ error: 'Ordre des rubriques manquant' });
            const existing = await pgDb.all('SELECT id, is_meta FROM reunions_service.meeting_sections WHERE meeting_id = ?', [meetingId]);
            const valid = new Set(existing.map(s => Number(s.id)));
            const meta = existing.filter(s => s.is_meta).map(s => Number(s.id));
            const ordered = ids.filter(id => valid.has(id) && !meta.includes(id));
            for (const id of meta) if (!ordered.includes(id)) ordered.unshift(id);
            let pos = 1;
            for (const id of ordered) {
                await pgDb.run('UPDATE reunions_service.meeting_sections SET position = ? WHERE id = ? AND meeting_id = ?', [pos, id, meetingId]);
                pos += 1;
            }
            reunionSocket.notifyContentChanged(meetingId);
            res.json({ success: true, ids: ordered });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    moveItem: async (req, res) => {
        try {
            const itemId = toInt(req.params.itemId);
            const item = await pgDb.get('SELECT * FROM reunions_service.items WHERE id = ?', [itemId]);
            if (!item) return res.status(404).json({ error: 'Item introuvable' });
            const meeting = await loadManagedMeeting(req, res, item.meeting_id);
            if (!meeting) return;
            const dir = String(req.body?.dir || req.body?.direction || '');
            if (!['up', 'down'].includes(dir)) return res.status(400).json({ error: 'Direction invalide' });
            const items = await pgDb.all(
                'SELECT id FROM reunions_service.items WHERE section_id = ? ORDER BY position, id', [item.section_id]
            );
            const idx = items.findIndex(i => Number(i.id) === itemId);
            const target = idx + (dir === 'up' ? -1 : 1);
            if (idx < 0 || target < 0 || target >= items.length) return res.json({ success: true, moved: false });
            const tmp = items[idx];
            items[idx] = items[target];
            items[target] = tmp;
            let pos = 0;
            for (const it of items) {
                await pgDb.run('UPDATE reunions_service.items SET position = ? WHERE id = ?', [pos, it.id]);
                pos += 1;
            }
            reunionSocket.notifyContentChanged(item.meeting_id, { itemId });
            res.json({ success: true, moved: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Réordonne les items d'une rubrique. Ouvert à tous les participants : le
     *  nouvel ordre est partagé à tous (exigence métier). */
    reorderItems: async (req, res) => {
        try {
            const meetingId = toInt(req.params.id);
            const sectionId = toInt(req.params.sectionId);
            const meeting = await pgDb.get('SELECT id FROM reunions_service.meetings WHERE id = ?', [meetingId]);
            if (!meeting) return res.status(404).json({ error: 'Réunion introuvable' });
            const section = await pgDb.get(
                'SELECT id FROM reunions_service.meeting_sections WHERE id = ? AND meeting_id = ?', [sectionId, meetingId]
            );
            if (!section) return res.status(404).json({ error: 'Rubrique introuvable' });
            const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toInt(v)).filter(Boolean) : [];
            if (ids.length === 0) return res.status(400).json({ error: 'Ordre des items manquant' });
            const existing = await pgDb.all(
                'SELECT id FROM reunions_service.items WHERE section_id = ? ORDER BY position, id', [sectionId]
            );
            const valid = new Set(existing.map(i => Number(i.id)));
            const ordered = ids.filter(id => valid.has(id));
            // Les items non transmis restent à la fin (pas de perte).
            for (const it of existing) {
                if (!ordered.includes(Number(it.id))) ordered.push(Number(it.id));
            }
            let pos = 0;
            for (const id of ordered) {
                await pgDb.run('UPDATE reunions_service.items SET position = ? WHERE id = ? AND section_id = ?', [pos, id, sectionId]);
                pos += 1;
            }
            reunionSocket.notifyContentChanged(meetingId, { sectionId });
            res.json({ success: true, ids: ordered });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    downloadAttachment: async (req, res) => {
        try {
            const att = await pgDb.get('SELECT * FROM reunions_service.attachments WHERE id = ?', [req.params.id]);
            if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
            if (!att.file_path) return res.status(404).json({ error: 'Fichier introuvable' });
            const f = await storage.getFileForServe(att.file_path);
            if (!f) return res.status(404).json({ error: 'Fichier introuvable sur le stockage' });
            const displayName = att.original_name || att.filename || 'fichier';
            const disposition = req.query.mode === 'inline' ? 'inline' : 'attachment';
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(displayName)}"`);
            if (att.mimetype) res.type(att.mimetype);
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            return res.send(f.buffer);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteAttachment: async (req, res) => {
        try {
            const att = await pgDb.get('SELECT * FROM reunions_service.attachments WHERE id = ?', [req.params.id]);
            if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
            if (att.file_path) { try { await storage.deleteFile(att.file_path); } catch { /* ignore */ } }
            await pgDb.run('DELETE FROM reunions_service.attachments WHERE id = ?', [req.params.id]);
            reunionSocket.notifyContentChanged(att.meeting_id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── KPI des rubriques ──────────────────────────────────────────────────

    /** Catalogue des KPI disponibles (repris du tableau de bord) + sources de filtres. */
    kpiCatalog: async (req, res) => {
        try {
            const catalog = kpiEngine.listCatalog();
            const token = makeServiceToken() || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            catalog.filterSources = await kpiEngine.getFilterSources(token);
            res.json(catalog);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Aperçu d'un KPI pendant la préparation du modèle : renvoie exactement ce
     * qui sera figé au lancement de la réunion (mêmes période et comparaison).
     */
    previewKpi: async (req, res) => {
        try {
            const config = kpiEngine.normalizeConfig(req.body?.kpi || req.body);
            if (!config) return res.status(400).json({ error: 'KPI inconnu ou incomplet' });
            const meetingDate = req.body?.meeting_date || new Date();
            const token = makeServiceToken() || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            let previousMeetingDate = null;
            const templateId = toInt(req.body?.template_id) || null;
            if (templateId) {
                const row = await pgDb.get(
                    `SELECT meeting_date FROM reunions_service.meetings
                     WHERE template_id = ? AND meeting_date IS NOT NULL AND status <> 'planned'
                     ORDER BY meeting_date DESC LIMIT 1`,
                    [templateId]
                );
                previousMeetingDate = row?.meeting_date || null;
            }
            const snapshot = await kpiEngine.evaluate(config, { token, meetingDate, previousMeetingDate });
            res.json({ snapshot });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /** Recalcule les KPI figés d'une réunion (maître du temps / admin). */
    refreshMeetingKpis: async (req, res) => {
        try {
            const id = toInt(req.params.id);
            const meeting = await loadManagedMeeting(req, res, id);
            if (!meeting) return;
            const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const computed = await computeMeetingKpiSnapshots(meeting, token, { force: true });
            reunionSocket.notifyContentChanged(id);
            res.json({ success: true, sections: computed, meeting: await getMeetingFull(id) });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};

module.exports = controller;
