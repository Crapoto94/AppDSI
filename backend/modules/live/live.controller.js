const { pgDb, getSqlite } = require('../../shared/database');
const { getIO } = require('./live.socket');
const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../../shared/config');
const { authenticateAD, lookupADUser } = require('../../shared/ad_auth');

let _sendMail = null;
function setSendMail(fn) { _sendMail = fn; }

// ── GET /api/live/sessions ─────────────────────────────────────────────
async function getSessions(req, res) {
    try {
        const rows = await pgDb.all(`
            SELECT ls.*, t.title as ticket_title
            FROM hub_tickets.live_sessions ls
            LEFT JOIN hub_tickets.tickets t ON ls.ticket_id = t.glpi_id
            WHERE ls.status != 'closed'
            ORDER BY ls.created_at DESC
        `);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/sessions/:id ─────────────────────────────────────────
async function getSession(req, res) {
    try {
        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [req.params.id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        res.json(session);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/sessions/:id/messages ───────────────────────────────
async function getMessages(req, res) {
    try {
        const messages = await pgDb.all(
            `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
            [req.params.id]
        );
        res.json(messages);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions — user creates a new live session ─────────
async function createSession(req, res) {
    try {
        const { content } = req.body;
        const user = req.user;
        if (!content?.trim()) return res.status(400).json({ message: 'Message requis' });

        // Generate ticket ID using atomic sequence
        const seqResult = await pgDb.get(`SELECT nextval('hub_tickets.ticket_id_seq') as next_id`);
        const ticketId = seqResult.next_id;

        // Create linked ticket (no notification — live tickets are email-silent)
        await pgDb.run(`
            INSERT INTO hub_tickets.tickets
                (glpi_id, title, content, status, priority, urgency, impact,
                 type, date_creation, date_mod, source, requester_name, requester_email_22, is_live)
            VALUES ($1, $2, $3, 1, 3, 3, 2, '1', NOW(), NOW(), 'live', $4, $5, true)
        `, [ticketId,
            `💬 Live – ${user.displayName || user.username}`,
            content.trim(),
            user.displayName || user.username,
            user.email || '']);

        // Create live session
        const authMethod = user.auth_method || 'internal';
        const sessionResult = await pgDb.run(`
            INSERT INTO hub_tickets.live_sessions
                (ticket_id, user_username, user_display_name, user_email, status, auth_method, created_at)
            VALUES ($1, $2, $3, $4, 'waiting', $5, NOW())
        `, [ticketId, user.username, user.displayName || user.username, user.email || '', authMethod]);

        const sessionId = sessionResult.lastID;

        // Save first message in live_messages
        await pgDb.run(`
            INSERT INTO hub_tickets.live_messages
                (session_id, sender_type, sender_name, sender_username, content, created_at)
            VALUES ($1, 'user', $2, $3, $4, NOW())
        `, [sessionId, user.displayName || user.username, user.username, content.trim()]);

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [sessionId]
        );

        // Notify connected techs via socket
        const io = getIO();
        if (io) io.to('live:techs').emit('new_live_session', session);

        res.json({ session, ticketId });
    } catch (e) {
        console.error('[LIVE] createSession error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/claim ─────────────────────────────────
// ?force=true allows takeover of an active session
async function claimSession(req, res) {
    try {
        const { id } = req.params;
        const force = req.query.force === 'true' || req.body.force;
        const user = req.user;

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (session.status === 'closed') return res.status(400).json({ message: 'Session terminée' });
        if (session.status === 'active' && !force) {
            return res.status(400).json({ message: 'Session déjà prise en charge', tech: session.tech_display_name });
        }

        await pgDb.run(`
            UPDATE hub_tickets.live_sessions
            SET status = 'active', tech_username = $1, tech_display_name = $2, claimed_at = NOW()
            WHERE id = $3
        `, [user.username, user.displayName || user.username, id]);

        const updated = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );

        const io = getIO();
        if (io) {
            io.to(`live:session:${id}`).emit('session_claimed', {
                session: updated,
                tech: { username: user.username, displayName: user.displayName || user.username }
            });
            io.to('live:techs').emit('session_updated', updated);
        }

        res.json(updated);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/close ─────────────────────────────────
// body: { newTitle?: string, closeTicket?: boolean }
async function closeSession(req, res) {
    try {
        const { id } = req.params;
        const { newTitle, closeTicket = true } = req.body || {};

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        // Collect transcript before closing
        const messages = await pgDb.all(
            `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
            [id]
        );

        // Update ticket
        if (session.ticket_id) {
            const safeTitle = newTitle?.trim().replace(/'/g, "''") || null;
            if (closeTicket !== false) {
                // Close ticket (status 6), optionally rename
                const titleClause = safeTitle ? `, title = '${safeTitle}'` : '';
                await pgDb.run(
                    `UPDATE hub_tickets.tickets SET status = 6, date_mod = NOW()${titleClause} WHERE glpi_id = $1`,
                    [session.ticket_id]
                );
            } else if (safeTitle) {
                // Just rename, leave ticket open
                await pgDb.run(
                    `UPDATE hub_tickets.tickets SET title = '${safeTitle}', date_mod = NOW() WHERE glpi_id = $1`,
                    [session.ticket_id]
                );
            }

            // Store transcript as a followup on the ticket
            if (messages.length > 0) {
                const transcriptHtml = buildTranscriptHtml(messages, session);
                await pgDb.run(`
                    INSERT INTO hub_tickets.ticket_followups
                        (ticket_id, content, author_name, author_email, is_private, sent_to_user, date_creation)
                    VALUES ($1, $2, 'Système (Live)', '', 0, 0, NOW())
                `, [session.ticket_id, transcriptHtml]);
            }

            // Send summary email to requester
            if (_sendMail && session.user_email && messages.length > 0) {
                try {
                    const finalTitle = newTitle?.trim() || `💬 Live – ${session.user_display_name || session.user_username}`;
                    const html = buildSummaryEmail(messages, session, finalTitle);
                    await _sendMail(
                        session.user_email,
                        `[DSI Support] Résumé de votre échange live — Ticket #${session.ticket_id}`,
                        html
                    );
                } catch (emailErr) {
                    console.error('[LIVE] summary email failed:', emailErr.message);
                }
            }
        }

        await pgDb.run(
            `UPDATE hub_tickets.live_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1`, [id]
        );

        const io = getIO();
        if (io) {
            io.to(`live:session:${id}`).emit('session_closed', { sessionId: Number(id) });
            io.to('live:techs').emit('session_closed', { sessionId: Number(id) });
        }

        res.json({ success: true });
    } catch (e) {
        console.error('[LIVE] closeSession error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/stats ───────────────────────────────────────────────
async function getStats(req, res) {
    try {
        const [totals, active, durations, byTech, daily] = await Promise.all([
            pgDb.get(`
                SELECT
                    COUNT(*) FILTER (WHERE true) AS total,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
                    COUNT(*) FILTER (WHERE created_at >= date_trunc('week', NOW())) AS this_week,
                    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month
                FROM hub_tickets.live_sessions
            `),
            pgDb.get(`SELECT COUNT(*) as count FROM hub_tickets.live_sessions WHERE status != 'closed'`),
            pgDb.get(`
                SELECT
                    ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - claimed_at)) / 60)::numeric, 1) AS avg_duration_min,
                    ROUND(AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60)::numeric, 1) AS avg_response_min
                FROM hub_tickets.live_sessions
                WHERE closed_at IS NOT NULL AND claimed_at IS NOT NULL
            `),
            pgDb.all(`
                SELECT tech_display_name AS tech, COUNT(*) AS count
                FROM hub_tickets.live_sessions
                WHERE tech_username IS NOT NULL
                GROUP BY tech_display_name ORDER BY count DESC LIMIT 10
            `),
            pgDb.all(`
                SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                       COUNT(*) AS count
                FROM hub_tickets.live_sessions
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY day ORDER BY day
            `),
        ]);

        res.json({
            total:            parseInt(totals?.total  || 0),
            today:            parseInt(totals?.today  || 0),
            this_week:        parseInt(totals?.this_week || 0),
            this_month:       parseInt(totals?.this_month || 0),
            active:           parseInt(active?.count  || 0),
            avg_duration_min: parseFloat(durations?.avg_duration_min || 0),
            avg_response_min: parseFloat(durations?.avg_response_min || 0),
            by_tech: (byTech || []).map(r => ({ tech: r.tech, count: parseInt(r.count) })),
            daily:   (daily  || []).map(r => ({ day: r.day, count: parseInt(r.count) })),
        });
    } catch (e) {
        console.error('[LIVE] getStats error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/count ───────────────────────────────────────────────
async function getWaitingCount(req, res) {
    try {
        const row = await pgDb.get(
            `SELECT COUNT(*) as count FROM hub_tickets.live_sessions WHERE status = 'waiting'`
        );
        res.json({ count: parseInt(row?.count || 0) });
    } catch (e) {
        res.json({ count: 0 });
    }
}

// ── Helpers ────────────────────────────────────────────────────────────
function buildTranscriptHtml(messages, session) {
    const rows = messages.map(m => {
        const who = m.sender_type === 'tech' ? `👨‍💻 ${m.sender_name}` : `👤 ${m.sender_name}`;
        const t = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `<p style="margin:4px 0"><strong>${who}</strong> <span style="color:#94a3b8;font-size:11px">${t}</span><br>${m.content}</p>`;
    }).join('');
    return `<div style="font-family:sans-serif;font-size:13px"><h4 style="color:#6366f1">Transcript de la session live</h4><p>Durée : ${session.claimed_at ? Math.round((Date.now() - new Date(session.claimed_at).getTime()) / 60000) + ' min' : 'N/A'}</p>${rows}</div>`;
}

function buildSummaryEmail(messages, session, title) {
    const rows = messages.map(m => {
        const isTech = m.sender_type === 'tech';
        const who = isTech ? `👨‍💻 <strong>${m.sender_name}</strong>` : `👤 ${m.sender_name}`;
        const t = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const bg = isTech ? '#f0f4ff' : '#f8fafc';
        return `<tr><td style="padding:8px 12px;background:${bg};border-bottom:1px solid #f1f5f9"><span style="font-size:12px">${who}</span><span style="font-size:11px;color:#94a3b8;margin-left:8px">${t}</span><br><span style="font-size:13px;color:#1e293b">${m.content}</span></td></tr>`;
    }).join('');
    return `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:20px 24px;color:#fff">
        <div style="font-size:18px;font-weight:700">💬 Résumé de votre échange DSI</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px">${title}</div>
      </div>
      <div style="padding:20px 24px">
        <p style="font-size:14px;color:#374151">Bonjour <strong>${session.user_display_name || session.user_username}</strong>,</p>
        <p style="font-size:14px;color:#374151">Voici le résumé de votre échange avec le support DSI${session.tech_display_name ? ` (technicien : ${session.tech_display_name})` : ''} :</p>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <a href="http://dsihub.ivry.local/tickets/${session.ticket_id}" style="color:#6366f1;font-size:13px">→ Voir le ticket #${session.ticket_id}</a>
      </div>
    </div>`;
}

// ── POST /api/live/sessions/:id/messages ─────────────────────────────
// REST fallback for sending messages (used when socket.io is unavailable)
async function sendMessage(req, res) {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const user = req.user;
        if (!content?.trim()) return res.status(400).json({ message: 'Contenu requis' });

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (session.status === 'closed') return res.status(400).json({ message: 'Session terminée' });

        const isTech = session.tech_username === user.username ||
            ['superadmin', 'admin'].includes(user.role);
        const senderType = isTech ? 'tech' : 'user';

        const result = await pgDb.run(
            `INSERT INTO hub_tickets.live_messages
                (session_id, sender_type, sender_name, sender_username, content, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [id, senderType, user.displayName || user.username, user.username, content.trim()]
        );

        const message = await pgDb.get(
            `SELECT * FROM hub_tickets.live_messages WHERE id = $1`, [result.lastID]
        );

        const io = getIO();
        if (io) io.to(`live:session:${id}`).emit('new_message', message);

        res.json(message);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/upload ───────────────────────────────
async function uploadAttachment(req, res) {
    try {
        const { id } = req.params;
        const user = req.user;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'Aucun fichier reçu' });

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (session.status === 'closed') return res.status(400).json({ message: 'Session terminée' });

        const isTech = session.tech_username === user.username ||
            ['superadmin', 'admin'].includes(user.role);
        const senderType = isTech ? 'tech' : 'user';
        const attachmentUrl = `/uploads/live/${file.filename}`;

        const result = await pgDb.run(`
            INSERT INTO hub_tickets.live_messages
                (session_id, sender_type, sender_name, sender_username, content, attachment_url, attachment_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
            id,
            senderType,
            user.displayName || user.username,
            user.username,
            file.originalname,
            attachmentUrl,
            file.originalname,
        ]);

        const message = await pgDb.get(
            `SELECT * FROM hub_tickets.live_messages WHERE id = $1`, [result.lastID]
        );

        const io = getIO();
        if (io) io.to(`live:session:${id}`).emit('new_message', message);

        res.json(message);
    } catch (e) {
        console.error('[LIVE] uploadAttachment error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── Schedule helpers ──────────────────────────────────────────────────
// Returns true if current wall-clock time falls within a calendar's working hours.
// day_of_week in DB: 1=Monday … 5=Friday (ISO weekday, JS getDay gives 0=Sun…6=Sat).
async function isNowInCalendar(calendarId) {
    const cal = await pgDb.get(
        calendarId
            ? `SELECT * FROM hub_tickets.sla_calendars WHERE id = $1`
            : `SELECT * FROM hub_tickets.sla_calendars WHERE is_default = true LIMIT 1`,
        calendarId ? [calendarId] : []
    );
    if (!cal) return false;

    const tz = cal.timezone || 'Europe/Paris';
    const now = new Date();

    // Derive weekday (1=Mon…7=Sun, ISO) and HH:MM in the calendar timezone
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);

    const SHORT_DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const dayName  = parts.find(p => p.type === 'weekday')?.value || '';
    const dayNum   = SHORT_DAY[dayName] ?? 0;
    const hourStr  = parts.find(p => p.type === 'hour')?.value   || '00';
    const minStr   = parts.find(p => p.type === 'minute')?.value || '00';
    const current  = `${String(hourStr).padStart(2, '0')}:${String(minStr).padStart(2, '0')}`;

    const slots = await pgDb.all(
        `SELECT start_time, end_time FROM hub_tickets.sla_calendar_hours
         WHERE calendar_id = $1 AND day_of_week = $2`,
        [cal.id, dayNum]
    );
    if (!slots.length) return false;

    return slots.some(s =>
        current >= s.start_time.substring(0, 5) &&
        current <  s.end_time.substring(0, 5)
    );
}

// Returns the effective live_enabled value (respects schedule when live_use_schedule=true)
async function computeLiveEnabled() {
    const rows = await pgDb.all(
        `SELECT key, value FROM hub_tickets.module_config WHERE key IN ('live_enabled','live_use_schedule','live_calendar_id')`
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (cfg.live_use_schedule === 'true') {
        return isNowInCalendar(cfg.live_calendar_id ? parseInt(cfg.live_calendar_id) : null);
    }
    return cfg.live_enabled !== 'false';
}

// ── GET /api/live/config ──────────────────────────────────────────────
async function getConfig(req, res) {
    try {
        const rows = await pgDb.all(
            `SELECT key, value FROM hub_tickets.module_config WHERE key IN ('live_enabled','live_use_schedule','live_calendar_id')`
        );
        const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
        const useSchedule  = cfg.live_use_schedule === 'true';
        const calendarId   = cfg.live_calendar_id ? parseInt(cfg.live_calendar_id) : null;
        const live_enabled = useSchedule
            ? await isNowInCalendar(calendarId)
            : (cfg.live_enabled !== 'false');

        res.json({ live_enabled, live_use_schedule: useSchedule, live_calendar_id: calendarId });
    } catch (e) {
        res.json({ live_enabled: true, live_use_schedule: false, live_calendar_id: null });
    }
}

// ── PUT /api/live/config ──────────────────────────────────────────────
async function setConfig(req, res) {
    try {
        const { live_enabled, live_use_schedule, live_calendar_id } = req.body;

        const upsert = (key, val) => pgDb.run(
            `INSERT INTO hub_tickets.module_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(val)]
        );

        if (live_enabled  !== undefined) await upsert('live_enabled',      live_enabled  ? 'true' : 'false');
        if (live_use_schedule !== undefined) await upsert('live_use_schedule', live_use_schedule ? 'true' : 'false');
        if (live_calendar_id  !== undefined) await upsert('live_calendar_id',  live_calendar_id ?? '');

        const effective = await computeLiveEnabled();
        const io = getIO();
        if (io) io.emit('live_config', { live_enabled: effective });

        res.json({ live_enabled: effective, live_use_schedule: !!live_use_schedule, live_calendar_id: live_calendar_id ?? null });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/calendars ───────────────────────────────────────────
async function getCalendars(req, res) {
    try {
        const cals = await pgDb.all(
            `SELECT id, name, timezone, is_default FROM hub_tickets.sla_calendars ORDER BY is_default DESC, name`
        );
        // Attach hours per calendar for display
        const hours = await pgDb.all(
            `SELECT calendar_id, day_of_week, start_time, end_time FROM hub_tickets.sla_calendar_hours ORDER BY calendar_id, day_of_week, start_time`
        );
        const hoursByCalendar = {};
        hours.forEach(h => {
            if (!hoursByCalendar[h.calendar_id]) hoursByCalendar[h.calendar_id] = [];
            hoursByCalendar[h.calendar_id].push(h);
        });
        res.json(cals.map(c => ({ ...c, hours: hoursByCalendar[c.id] || [] })));
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── Background schedule checker ───────────────────────────────────────
// Emits live_config via socket when the schedule transitions open→closed or vice-versa.
let _lastScheduledState = null;

async function _checkScheduleTick() {
    try {
        const row = await pgDb.get(`SELECT value FROM hub_tickets.module_config WHERE key = 'live_use_schedule'`);
        if (row?.value !== 'true') { _lastScheduledState = null; return; }

        const nowEnabled = await computeLiveEnabled();
        if (_lastScheduledState !== nowEnabled) {
            _lastScheduledState = nowEnabled;
            const io = getIO();
            if (io) io.emit('live_config', { live_enabled: nowEnabled });
            console.log(`[LIVE] Schedule transition → live_enabled=${nowEnabled}`);
        }
    } catch (e) {
        console.error('[LIVE] schedule tick error:', e.message);
    }
}

function startScheduler() {
    _checkScheduleTick(); // immediate check at startup
    setInterval(_checkScheduleTick, 60 * 1000); // then every minute
}

// ── POST /api/live/guest-login (public) ───────────────────────────────────
async function guestLogin(req, res) {
    try {
        const { displayName, email } = req.body || {};
        if (!displayName?.trim() || !email?.trim()) {
            return res.status(400).json({ message: 'Nom et email requis' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ message: 'Adresse email invalide' });
        }
        const username = `guest_${Date.now()}`;
        const token = jwt.sign({
            id: 0, username,
            displayName: displayName.trim(),
            email: email.trim().toLowerCase(),
            role: 'user', is_approved: true,
            auth_method: 'guest',
        }, SECRET_KEY);
        res.json({ token, user: { username, displayName: displayName.trim(), email: email.trim().toLowerCase() } });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/auth/ad (public) ───────────────────────────────────────
async function adLogin(req, res) {
    try {
        const { username, password } = req.body || {};
        if (!username?.trim() || !password) {
            return res.status(400).json({ message: 'Identifiants requis' });
        }
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: 'Authentification AD non disponible' });
        }
        const clean = username.trim().replace(/@ivry94\.fr$/i, '');
        const adUser = await authenticateAD(clean, password, adSettings);
        if (!adUser) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }
        const email = adUser.email || `${clean.toLowerCase()}@ivry94.fr`;
        const token = jwt.sign({
            id: 0, username: clean.toLowerCase(),
            displayName: adUser.displayName,
            email,
            role: 'user', is_approved: true,
            auth_method: 'ad',
        }, SECRET_KEY);
        res.json({ token, user: { username: clean.toLowerCase(), displayName: adUser.displayName, email } });
    } catch (e) {
        console.error('[LIVE] adLogin error:', e.message);
        res.status(401).json({ message: e.message || 'Échec de l\'authentification AD' });
    }
}

function maskEmail(email) {
    const [user, domain] = (email || '').split('@');
    if (!user || !domain) return email;
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    return `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}@${domain}`;
}

// ── POST /api/live/auth/otp/request (public) ──────────────────────────────
// Accepts { username } (Windows login), looks up email in AD, sends OTP code.
async function otpRequest(req, res) {
    try {
        const { username } = req.body || {};
        if (!username?.trim()) {
            return res.status(400).json({ message: 'Identifiant Windows requis' });
        }
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.status(503).json({ message: 'Service AD non disponible — contactez le support' });
        }

        const clean = username.trim().replace(/@ivry94\.fr$/i, '').toLowerCase();
        const adUser = await lookupADUser(clean, adSettings);
        if (!adUser) {
            return res.status(404).json({ message: 'Identifiant introuvable dans l\'annuaire' });
        }
        if (!adUser.email) {
            return res.status(400).json({ message: 'Aucune adresse email associée à ce compte AD' });
        }
        if (!adUser.email.toLowerCase().endsWith('@ivry94.fr')) {
            return res.status(403).json({ message: 'Seules les adresses @ivry94.fr sont acceptées' });
        }

        const code = String(Math.floor(1000 + Math.random() * 9000));
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await pgDb.run(`DELETE FROM hub_tickets.live_otp_codes WHERE username = $1`, [clean]);
        await pgDb.run(
            `INSERT INTO hub_tickets.live_otp_codes (username, email, display_name, code, expires_at) VALUES ($1, $2, $3, $4, $5)`,
            [clean, adUser.email, adUser.displayName, code, expiresAt]
        );

        if (_sendMail) {
            const html = `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                  <h2 style="color:#4f46e5">Support DSI — Code de vérification</h2>
                  <p>Bonjour <strong>${adUser.displayName}</strong>,</p>
                  <p>Voici votre code de connexion pour accéder au chat de support :</p>
                  <div style="text-align:center;margin:28px 0">
                    <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#4f46e5;background:#eef2ff;padding:16px 28px;border-radius:12px">${code}</span>
                  </div>
                  <p style="color:#64748b;font-size:13px">Ce code est valable <strong>5 minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
                  <p style="color:#94a3b8;font-size:12px">Si vous n'avez pas demandé ce code, ignorez cet e-mail.</p>
                </div>`;
            try {
                await _sendMail(adUser.email, 'Votre code de connexion — Support DSI', html);
            } catch (mailErr) {
                console.error('[LIVE] OTP mail failed:', mailErr.message);
            }
        } else {
            console.log(`[LIVE] OTP code for ${adUser.email} (${clean}): ${code}`);
        }

        res.json({ success: true, emailHint: maskEmail(adUser.email) });
    } catch (e) {
        console.error('[LIVE] otpRequest error:', e.message);
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/auth/otp/verify (public) ───────────────────────────────
// Accepts { username, code }. Returns JWT on success.
async function otpVerify(req, res) {
    try {
        const { username, code } = req.body || {};
        if (!username?.trim() || !code?.trim()) {
            return res.status(400).json({ message: 'Identifiant et code requis' });
        }
        const clean = username.trim().replace(/@ivry94\.fr$/i, '').toLowerCase();
        const record = await pgDb.get(
            `SELECT * FROM hub_tickets.live_otp_codes
             WHERE username = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [clean, code.trim()]
        );
        if (!record) {
            return res.status(400).json({ message: 'Code invalide ou expiré' });
        }
        await pgDb.run(`UPDATE hub_tickets.live_otp_codes SET used = TRUE WHERE id = $1`, [record.id]);

        const otpUsername = `otp_${Date.now()}`;
        const token = jwt.sign({
            id: 0, username: otpUsername,
            displayName: record.display_name || clean,
            email: record.email,
            role: 'user', is_approved: true,
            auth_method: 'otp',
        }, SECRET_KEY);
        res.json({ token, user: { username: otpUsername, displayName: record.display_name || clean, email: record.email } });
    } catch (e) {
        console.error('[LIVE] otpVerify error:', e.message);
        res.status(500).json({ message: e.message });
    }
}

module.exports = { getSessions, getSession, getMessages, createSession, claimSession, closeSession, getWaitingCount, getStats, setSendMail, getConfig, setConfig, getCalendars, startScheduler, uploadAttachment, sendMessage, guestLogin, adLogin, otpRequest, otpVerify };
