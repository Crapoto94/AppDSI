const { pgDb, getSqlite } = require('../../shared/database');
const { getIO } = require('./live.socket');
const storage = require('../../shared/storage');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { SECRET_KEY } = require('../../shared/config');
const { authenticateAD, lookupADUser } = require('../../shared/ad_auth');

const MODULE = 'live';

let _sendMail = null;
function setSendMail(fn) { _sendMail = fn; }

async function getAppBaseUrl() {
    try {
        const db = getSqlite();
        const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
        const val = row?.setting_value?.trim();
        return val || process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    } catch {
        return process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    }
}

// ── GET /api/live/sessions ─────────────────────────────────────────────
async function getSessions(req, res) {
    try {
        const { chat_type, status } = req.query;
        const params = [];
        let whereClause;
        if (status === 'all') {
            whereClause = '1=1';
        } else if (status === 'closed') {
            whereClause = `ls.status IN ('closed', 'pre_closed')`;
        } else {
            whereClause = `ls.status NOT IN ('closed', 'pre_closed')`;
        }
        let query = `
            SELECT ls.*, t.title as ticket_title
            FROM hub_tickets.live_sessions ls
            LEFT JOIN hub_tickets.tickets t ON ls.ticket_id = t.glpi_id
            WHERE ${whereClause}
        `;
        if (chat_type) {
            query += ` AND ls.chat_type = $1`;
            params.push(chat_type);
        }
        query += ` ORDER BY ls.created_at DESC`;

        const rows = await pgDb.all(query, params);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/sessions/:id ─────────────────────────────────────────
async function getSession(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
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
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const messages = await pgDb.all(
            `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
            [id]
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
             VALUES ($1, $2, $3, 1, 3, 3, 2, NULL, NOW(), NOW(), 'live', $4, $5, true)
        `, [ticketId,
            `💬 Live – ${user.displayName || user.username}`,
            content.trim(),
            user.displayName || user.username,
            user.email || '']);

        // Create live session
        const authMethod = user.auth_method || 'internal';
        const chatType = user.chat_type || req.body.chat_type || 'ville';
        const sessionResult = await pgDb.run(`
            INSERT INTO hub_tickets.live_sessions
                (ticket_id, user_username, user_display_name, user_email, status, auth_method, chat_type, created_at)
            VALUES ($1, $2, $3, $4, 'waiting', $5, $6, NOW())
        `, [ticketId, user.username, user.displayName || user.username, user.email || '', authMethod, chatType]);

        const sessionId = sessionResult.lastID;

        // Save first message in live_messages (non-fatal)
        try {
            await pgDb.run(`
                INSERT INTO hub_tickets.live_messages
                    (session_id, sender_type, sender_name, sender_username, content, created_at)
                VALUES ($1, 'user', $2, $3, $4, NOW())
            `, [sessionId, user.displayName || user.username, user.username, content.trim()]);
        } catch (msgErr) {
            console.error('[LIVE] Failed to save first message (session created):', msgErr.message);
        }

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [sessionId]
        );

        if (!session) {
            return res.status(500).json({ message: 'Session créée mais introuvable' });
        }

        // Notify connected techs via socket
        try {
            const io = getIO();
            if (io) io.to('live:techs').emit('new_live_session', session);
        } catch (ioErr) {
            console.error('[LIVE] Socket notification failed:', ioErr.message);
        }

        // Notify "Ecoles" group via SMS (fire & forget)
        if (chatType === 'ecole' && session) {
            notifyEcoleGroup(session).catch(e => console.error('[LIVE] notifyEcoleGroup:', e.message));
        }

        res.json({ session, ticketId });
    } catch (e) {
        console.error('[LIVE] createSession error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── Notify "Ecoles" group via SMS for new school sessions ────────────
async function notifyEcoleGroup(session) {
    console.log('[LIVE] notifyEcoleGroup called for session #' + session?.id + ' chat_type=' + session?.chat_type);
    try {
        const members = await pgDb.all(`
            SELECT DISTINCT u.username, u.displayname as display_name, tp.mobile_phone
            FROM hub_tickets.technician_groups g
            JOIN hub_tickets.technician_group_members gm ON g.id = gm.group_id
            JOIN hub.users u ON gm.user_id = u.id
            JOIN hub_tickets.technician_profiles tp ON u.id = tp.user_id
            WHERE g.name = 'Ecoles' AND g.is_active = true
              AND tp.mobile_phone IS NOT NULL AND tp.mobile_phone != ''
        `);
        console.log('[LIVE] notifyEcoleGroup members found:', members.length);
        if (members.length === 0) {
            console.log('[LIVE] notifyEcoleGroup: aucun membre avec téléphone dans le groupe Ecoles');
            return;
        }

        const db = getSqlite();
        const frizbi = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
        console.log('[LIVE] Frizbi settings: enabled=' + frizbi?.is_enabled + ' client_id=' + (frizbi?.client_id ? 'SET' : 'EMPTY') + ' client_secret=' + (frizbi?.client_secret ? 'SET' : 'EMPTY'));
        if (!frizbi?.is_enabled || !frizbi.client_id || !frizbi.client_secret) {
            console.log('[LIVE] Frizbi not configured, skipping ecole SMS');
            return;
        }

        const appBaseUrl = await getAppBaseUrl();

        console.log('[LIVE] Authenticating with Frizbi...');
        const authRes = await axios.post(`${frizbi.api_url}/api/auth/login`, {
            login: frizbi.client_id,
            password: frizbi.client_secret
        });
        const frizbiToken = authRes.data?.token;
        if (!frizbiToken) {
            console.error('[LIVE] Frizbi auth failed');
            return;
        }
        console.log('[LIVE] Frizbi authenticated, sending individual SMS to', members.length, 'agent(s)...');

        let sentCount = 0;
        // Send one SMS per agent with a unique link directly in the message
        for (const m of members) {
            try {
                const smsJwt = jwt.sign({
                    type: 'sms_auth',
                    username: m.username,
                    displayName: m.display_name || m.username,
                    session_id: session.id,
                }, SECRET_KEY, { expiresIn: '5m' });

                const personalLink = `${appBaseUrl}/chatecole?st=${smsJwt}`;
                const smsMessage = `Nouveau chat ecole ouvert. Prenez en charge ici : ${personalLink}`;
                const mobile = (m.mobile_phone || '').replace(/\D/g, '');

                const payload = {
                    customerSmsId: `ecole_${session.id}_${m.username}_${Date.now()}`.substring(0, 50),
                    date: new Date().toISOString(),
                    title: 'Chat ecole',
                    message: smsMessage,
                    customerSenderId: frizbi.sender_id || 'IVRY',
                    smsContacts: [{
                        customerSmsContactId: `eco_${mobile}`.substring(0, 50),
                        mobile,
                        firstName: (m.display_name || '').split(' ')[0] || 'Agent',
                        lastName: (m.display_name || '').split(' ').slice(1).join(' ') || '',
                    }],
                };

                await axios.post(`${frizbi.api_url}/api/sms/send`, payload, {
                    headers: { Authorization: `Bearer ${frizbiToken}` }
                });

                // Log success
                try {
                    await pgDb.run(`
                        INSERT INTO hub.sms_logs (recipient, message, sender_id, status, source, created_by)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [mobile, smsMessage, frizbi.sender_id || 'IVRY', 'sent', 'ecole_notify', 'system']);
                } catch (logErr) {
                    console.error('[LIVE] Failed to log SMS:', logErr.message);
                }

                sentCount++;
                console.log('[LIVE] SMS sent to', m.username, 'at', mobile);
            } catch (e) {
                const errDetail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
                console.error(`[LIVE] notifyEcoleGroup error: Request failed with status code ${e.response?.status || 'unknown'}`);
                console.error(`[LIVE] notifyEcoleGroup error detail: ${errDetail}`);
                console.error(`[LIVE] notifyEcoleGroup stack: ${e.stack}`);
                // Log failure
                try {
                    const mobile = (m.mobile_phone || '').replace(/\D/g, '');
                    await pgDb.run(`
                        INSERT INTO hub.sms_logs (recipient, message, sender_id, status, error_message, source, created_by)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [mobile, `Nouveau chat ecole ouvert (ecole #${session.id})`, frizbi.sender_id || 'IVRY', 'error', errDetail, 'ecole_notify', 'system']);
                } catch (logErr) {
                    console.error('[LIVE] Failed to log SMS error:', logErr.message);
                }
            }
        }

        console.log(`[LIVE] SMS sent to ${sentCount}/${members.length} agent(s) for ecole session #${session.id}`);
    } catch (e) {
        console.error('[LIVE] notifyEcoleGroup error:', e.message);
        console.error('[LIVE] notifyEcoleGroup stack:', e.stack);
    }
}

// ── POST /api/live/sessions/:id/claim ─────────────────────────────────
// ?force=true allows takeover of an active session
async function claimSession(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
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
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { newTitle, closeTicket = true } = req.body || {};
        const user = req.user;

        const session = await pgDb.get(
            `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]
        );
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        const isTech = session.tech_username && (
            session.tech_username.toLowerCase() === (user.username || '').toLowerCase() ||
            ['superadmin', 'admin'].includes(user.role)
        );

        // ── Requester closing: pre-close only (tech can still finalize) ──
        if (!isTech) {
            // Store transcript
            if (session.ticket_id) {
                const messages = await pgDb.all(
                    `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`, [id]
                );
                if (messages.length > 0) {
                    const ticket = await pgDb.get(`SELECT title, content FROM hub_tickets.tickets WHERE glpi_id = $1`, [session.ticket_id]);
                    const transcriptHtml = buildTranscriptHtml(messages, session, ticket);
                    await pgDb.run(`
                        INSERT INTO hub_tickets.ticket_followups
                            (ticket_id, content, author_name, author_email, is_private, sent_to_user, date_creation)
                        VALUES ($1, $2, 'Système (Live)', '', 0, 0, NOW())
                    `, [session.ticket_id, transcriptHtml]);
                }

                // Send summary email
                if (_sendMail && session.user_email) {
                    try {
                        const messages = await pgDb.all(
                            `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`, [id]
                        );
                        if (messages.length > 0) {
                            const appBaseUrl = await getAppBaseUrl();
                            const html = buildSummaryEmail(messages, session, `💬 Live – ${session.user_display_name || session.user_username}`, appBaseUrl);
                            await _sendMail(session.user_email, `[DSI Support] Résumé de votre échange live — Ticket #${session.ticket_id}`, html);
                        }
                    } catch (emailErr) {
                        console.error('[LIVE] summary email failed:', emailErr.message);
                    }
                }
            }

            // Pre-close: session is closed for chat but ticket stays open
            await pgDb.run(
                `UPDATE hub_tickets.live_sessions SET status = 'pre_closed', closed_at = NOW(), close_reason = 'user_left' WHERE id = $1`, [id]
            );

            const io = getIO();
            if (io) {
                io.to(`live:session:${id}`).emit('session_closed', { sessionId: Number(id), reason: 'user_left' });
                io.to('live:techs').emit('session_updated', { id: Number(id), status: 'pre_closed' });
            }

            return res.json({ success: true, preClosed: true });
        }

        // ── Tech closing: full close ──
        // Collect transcript before closing
        const messages = await pgDb.all(
            `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
            [id]
        );

        // Update ticket
        if (session.ticket_id) {
            // Check type is set before closing
            if (closeTicket !== false) {
                const ticket = await pgDb.get(`SELECT type FROM hub_tickets.tickets WHERE glpi_id = $1`, [session.ticket_id]);
                if (!ticket?.type) {
                    return res.status(400).json({ message: 'Veuillez classer le ticket (Incident ou Demande) avant de le clôturer.' });
                }
            }

            const safeTitle = newTitle?.trim().replace(/'/g, "''") || null;
            if (closeTicket !== false) {
                const titleClause = safeTitle ? `, title = '${safeTitle}'` : '';
                await pgDb.run(
                    `UPDATE hub_tickets.tickets SET status = 6, date_mod = NOW()${titleClause} WHERE glpi_id = $1`,
                    [session.ticket_id]
                );
            } else if (safeTitle) {
                await pgDb.run(
                    `UPDATE hub_tickets.tickets SET title = '${safeTitle}', date_mod = NOW() WHERE glpi_id = $1`,
                    [session.ticket_id]
                );
            }

            // Store transcript as a followup on the ticket (if not already done by pre-close)
            if (messages.length > 0) {
                const existingFollowup = await pgDb.get(
                    `SELECT id FROM hub_tickets.ticket_followups WHERE ticket_id = $1 AND author_name = 'Système (Live)' LIMIT 1`,
                    [session.ticket_id]
                );
                if (!existingFollowup) {
                    const ticket = await pgDb.get(`SELECT title, content FROM hub_tickets.tickets WHERE glpi_id = $1`, [session.ticket_id]);
                    const transcriptHtml = buildTranscriptHtml(messages, session, ticket);
                    await pgDb.run(`
                        INSERT INTO hub_tickets.ticket_followups
                            (ticket_id, content, author_name, author_email, is_private, sent_to_user, date_creation)
                        VALUES ($1, $2, 'Système (Live)', '', 0, 0, NOW())
                    `, [session.ticket_id, transcriptHtml]);
                }
            }

            // Send summary email to requester (if not already sent by pre-close)
            if (_sendMail && session.user_email && messages.length > 0) {
                try {
                    const existingMail = await pgDb.get(
                        `SELECT id FROM hub_tickets.notification_logs WHERE ticket_id = $1 AND event = 'live_summary' LIMIT 1`,
                        [session.ticket_id]
                    );
                    if (!existingMail) {
                        const finalTitle = newTitle?.trim() || `💬 Live – ${session.user_display_name || session.user_username}`;
                        const html = buildSummaryEmail(messages, session, finalTitle);
                        await _sendMail(
                            session.user_email,
                            `[DSI Support] Résumé de votre échange live — Ticket #${session.ticket_id}`,
                            html
                        );
                    }
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
                io.to('live:techs').emit('session_updated', { id: Number(id), status: 'closed' });
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
            pgDb.get(`SELECT COUNT(*) as count FROM hub_tickets.live_sessions WHERE status NOT IN ('closed', 'pre_closed')`),
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
function buildTranscriptHtml(messages, session, ticket) {
    const opener = ticket?.content?.trim();
    const originalTitle = ticket?.title || '';
    let header = `<h4 style="color:#6366f1">Transcript de la session live</h4>`;
    if (originalTitle) header += `<p style="color:#64748b;font-size:12px">Session initiée : ${originalTitle}</p>`;
    header += `<p>Durée : ${session.claimed_at ? Math.round((Date.now() - new Date(session.claimed_at).getTime()) / 60000) + ' min' : 'N/A'}</p>`;
    if (opener) {
        const who = `👤 ${session.user_display_name || session.user_username}`;
        header += `<p style="margin:4px 0;background:#f8fafc;padding:8px 10px;border-radius:6px"><strong>${who}</strong><br>${opener}</p>`;
    }
    const rows = messages.map(m => {
        const who = m.sender_type === 'tech' ? `👨‍💻 ${m.sender_name}` : `👤 ${m.sender_name}`;
        const t = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `<p style="margin:4px 0"><strong>${who}</strong> <span style="color:#94a3b8;font-size:11px">${t}</span><br>${m.content}</p>`;
    }).join('');
    return `<div style="font-family:sans-serif;font-size:13px">${header}${rows}</div>`;
}

function buildSummaryEmail(messages, session, title, appBaseUrl = '') {
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
        <a href="${appBaseUrl}/tickets/${session.ticket_id}" style="color:#6366f1;font-size:13px">→ Voir le ticket #${session.ticket_id}</a>
      </div>
    </div>`;
}

// ── POST /api/live/sessions/:id/messages ─────────────────────────────
// REST fallback for sending messages (used when socket.io is unavailable)
async function sendMessage(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
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

        await pgDb.run(
            `UPDATE hub_tickets.live_sessions SET last_activity_at = NOW() WHERE id = $1`, [id]
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
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
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

        // Corrige l'encodage et sauvegarde via storage
        if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(MODULE, id, file);
        const attachmentUrl = `/${saved.dbPath}`;

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

        // Dual-write hub_docs (viewer central)
        try {
            const docsService = require('../../shared/documents.service');
            await docsService.registerExternalUpload({
                module: 'live',
                entityType: 'attachment',
                entityId: id,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                storageRef: saved.dbPath,
                metadata: { sender_type: senderType, message_id: result.lastID },
                uploadedBy: user.username || null,
            });
        } catch (e) { console.warn('[DOCS] register failed:', e.message); }

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

// ── GET /api/live/public-config (public) ─────────────────────────────
async function getPublicConfig(req, res) {
    try {
        const rows = await pgDb.all(
            `SELECT key, value FROM hub_tickets.module_config WHERE key IN ('live_enabled','live_use_schedule','live_calendar_id','live_closing_message','chat_name','chat_logo','primary_color','secondary_color','ad_name','ad_default_username')`
        );
        const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
        const useSchedule = cfg.live_use_schedule === 'true';
        const live_enabled = useSchedule
            ? await isNowInCalendar(cfg.live_calendar_id ? parseInt(cfg.live_calendar_id) : null)
            : (cfg.live_enabled !== 'false');
        res.json({
            live_enabled,
            closing_message: cfg.live_closing_message || '',
            chat_name: cfg.chat_name || 'Support DSI',
            chat_logo: cfg.chat_logo || '💬',
            primary_color: cfg.primary_color || '#6366f1',
            secondary_color: cfg.secondary_color || '#818cf8',
            ad_name: cfg.ad_name || 'Active Directory',
            ad_default_username: cfg.ad_default_username || 'prenom.nom',
        });
    } catch (e) {
        res.json({ live_enabled: true, closing_message: '', chat_name: 'Support DSI', chat_logo: '💬', primary_color: '#6366f1', secondary_color: '#818cf8', ad_name: 'Active Directory', ad_default_username: 'prenom.nom' });
    }
}

// ── GET /api/live/config ──────────────────────────────────────────────
async function getConfig(req, res) {
    try {
        const rows = await pgDb.all(
            `SELECT key, value FROM hub_tickets.module_config WHERE key IN ('live_enabled','live_use_schedule','live_calendar_id','live_closing_message','whatsapp_enabled','whatsapp_phone_number_id','whatsapp_access_token')`
        );
        const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
        const useSchedule  = cfg.live_use_schedule === 'true';
        const calendarId   = cfg.live_calendar_id ? parseInt(cfg.live_calendar_id) : null;
        const live_enabled = useSchedule
            ? await isNowInCalendar(calendarId)
            : (cfg.live_enabled !== 'false');

        res.json({
            live_enabled, live_use_schedule: useSchedule, live_calendar_id: calendarId,
            closing_message: cfg.live_closing_message || '',
            whatsapp_enabled: cfg.whatsapp_enabled === 'true',
            whatsapp_phone_number_id: cfg.whatsapp_phone_number_id || '',
            whatsapp_access_token: cfg.whatsapp_access_token || '',
        });
    } catch (e) {
        res.json({ live_enabled: true, live_use_schedule: false, live_calendar_id: null, closing_message: '', whatsapp_enabled: false, whatsapp_phone_number_id: '', whatsapp_access_token: '' });
    }
}

// ── PUT /api/live/config ──────────────────────────────────────────────
async function setConfig(req, res) {
    try {
        const { live_enabled, live_use_schedule, live_calendar_id, closing_message,
                whatsapp_enabled, whatsapp_phone_number_id, whatsapp_access_token } = req.body;

        const upsert = (key, val) => pgDb.run(
            `INSERT INTO hub_tickets.module_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(val ?? '')]
        );

        if (live_enabled              !== undefined) await upsert('live_enabled',              live_enabled ? 'true' : 'false');
        if (live_use_schedule         !== undefined) await upsert('live_use_schedule',          live_use_schedule ? 'true' : 'false');
        if (live_calendar_id          !== undefined) await upsert('live_calendar_id',           live_calendar_id ?? '');
        if (closing_message           !== undefined) await upsert('live_closing_message',       closing_message);
        if (whatsapp_enabled          !== undefined) await upsert('whatsapp_enabled',           whatsapp_enabled ? 'true' : 'false');
        if (whatsapp_phone_number_id  !== undefined) await upsert('whatsapp_phone_number_id',   whatsapp_phone_number_id || '');
        if (whatsapp_access_token     !== undefined) await upsert('whatsapp_access_token',      whatsapp_access_token || '');

        const effective = await computeLiveEnabled();
        const io = getIO();
        if (io) io.emit('live_config', { live_enabled: effective });

        res.json({ live_enabled: effective, live_use_schedule: !!live_use_schedule, live_calendar_id: live_calendar_id ?? null, closing_message: closing_message ?? '' });
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

// ── Auto-close sessions inactive for 15 min ───────────────────────────
async function _autoCloseInactiveSessions() {
    try {
        const inactive = await pgDb.all(`
            SELECT * FROM hub_tickets.live_sessions
            WHERE status NOT IN ('closed', 'pre_closed')
            AND COALESCE(last_activity_at, created_at) < NOW() - INTERVAL '15 minutes'
        `);
        const io = getIO();
        for (const session of inactive) {
            await pgDb.run(
                `UPDATE hub_tickets.live_sessions SET status = 'pre_closed', closed_at = NOW(), close_reason = 'inactivity' WHERE id = $1`,
                [session.id]
            );
            if (io) {
                io.to(`live:session:${session.id}`).emit('session_closed', { sessionId: session.id, reason: 'inactivity' });
                io.to('live:techs').emit('session_updated', { id: session.id, status: 'pre_closed' });
            }
            console.log(`[LIVE] Pre-closed inactive session ${session.id}`);
        }
    } catch (e) {
        console.error('[LIVE] auto-close inactivity error:', e.message);
    }
}

function startScheduler() {
    _checkScheduleTick();          // immediate check at startup
    _autoCloseInactiveSessions();  // and inactivity check
    setInterval(_checkScheduleTick, 60 * 1000);
    setInterval(_autoCloseInactiveSessions, 60 * 1000); // every minute
}

// ── POST /api/live/sessions/:id/reject ───────────────────────────────
async function rejectSession(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (session.status === 'closed') return res.status(400).json({ message: 'Session déjà fermée' });

        // Soft-delete the auto-created ticket (status = 8 "Rejeté")
        if (session.ticket_id) {
            await pgDb.run(
                `UPDATE hub_tickets.tickets SET status = 8, date_mod = NOW() WHERE glpi_id = $1`,
                [session.ticket_id]
            );
        }

        await pgDb.run(
            `UPDATE hub_tickets.live_sessions SET status = 'closed', closed_at = NOW(), close_reason = 'rejected' WHERE id = $1`,
            [id]
        );

        const io = getIO();
        if (io) {
            io.to(`live:session:${id}`).emit('session_closed', { sessionId: parseInt(id), reason: 'rejected' });
            io.to('live:techs').emit('session_closed', { sessionId: parseInt(id) });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/task ─────────────────────────────────
async function createTask(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { description, echeance } = req.body || {};
        if (!description?.trim()) return res.status(400).json({ message: 'Description requise' });

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        const user = req.user;
        await pgDb.run(`
            INSERT INTO hub.user_tasks
                (username, description, echeance, statut, context_source, context_id, context_title, created_by)
            VALUES ($1, $2, $3, 'a_faire', 'ticket', $4, $5, $6)
        `, [
            user.username,
            description.trim(),
            echeance || null,
            session.ticket_id || null,
            session.ticket_id ? `Chat live — Ticket #${session.ticket_id}` : `Session live #${id}`,
            user.username,
        ]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── PATCH /api/live/sessions/:id/app ─────────────────────────────────
async function setSessionApp(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { app_id } = req.body || {};

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        await pgDb.run(
            `UPDATE hub_tickets.live_sessions SET app_id = $1 WHERE id = $2`,
            [app_id || null, id]
        );

        const io = getIO();
        if (io) io.to('live:techs').emit('session_updated', { ...session, app_id: app_id || null });

        res.json({ success: true, app_id: app_id || null });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/satisfaction (authenticated) ──────────
async function submitSatisfaction(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { rating, comment } = req.body || {};

        if (!rating || parseInt(rating) < 1 || parseInt(rating) > 5) {
            return res.status(400).json({ message: 'Note invalide (1-5)' });
        }

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        const existing = await pgDb.get(
            `SELECT id FROM hub_tickets.live_satisfaction WHERE session_id = $1`, [id]
        );
        if (existing) return res.status(400).json({ message: 'Satisfaction déjà soumise' });

        await pgDb.run(
            `INSERT INTO hub_tickets.live_satisfaction (session_id, ticket_id, rating, comment)
             VALUES ($1, $2, $3, $4)`,
            [id, session.ticket_id || null, parseInt(rating), comment?.trim() || null]
        );

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── GET /api/live/satisfaction ────────────────────────────────────────
async function getSatisfactionStats(req, res) {
    try {
        const [summary, distribution, recent, daily] = await Promise.all([
            pgDb.get(`
                SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS total
                FROM hub_tickets.live_satisfaction
            `),
            pgDb.all(`
                SELECT rating, COUNT(*) AS count
                FROM hub_tickets.live_satisfaction
                GROUP BY rating ORDER BY rating
            `),
            pgDb.all(`
                SELECT s.rating, s.comment, s.created_at,
                       ls.user_display_name, ls.tech_display_name, ls.ticket_id
                FROM hub_tickets.live_satisfaction s
                LEFT JOIN hub_tickets.live_sessions ls ON s.session_id = ls.id
                ORDER BY s.created_at DESC LIMIT 30
            `),
            pgDb.all(`
                SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                       ROUND(AVG(rating)::numeric, 2) AS avg_rating,
                       COUNT(*) AS count
                FROM hub_tickets.live_satisfaction
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY day ORDER BY day
            `),
        ]);

        res.json({
            avg_rating:   parseFloat(summary?.avg_rating || 0),
            total:        parseInt(summary?.total || 0),
            distribution: (distribution || []).map(r => ({ rating: parseInt(r.rating), count: parseInt(r.count) })),
            recent:       recent || [],
            daily:        (daily || []).map(r => ({ day: r.day, avg_rating: parseFloat(r.avg_rating), count: parseInt(r.count) })),
        });
    } catch (e) {
        console.error('[LIVE] getSatisfactionStats error:', e);
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/sessions/:id/emergency ─────────────────────────────
async function sendEmergencyMessage(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { message } = req.body || {};
        if (!message?.trim()) return res.status(400).json({ message: 'Message requis' });

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });

        // Fetch emergency contacts
        const contacts = await pgDb.all(`
            SELECT tp.mobile_phone, u.displayname as display_name, u.email
            FROM hub_tickets.technician_profiles tp
            JOIN hub.users u ON tp.user_id = u.id
            WHERE tp.is_emergency_contact = true AND tp.status = 'active'
        `);
        if (contacts.length === 0) {
            return res.status(400).json({ message: 'Aucun contact d\'urgence défini dans l\'équipe' });
        }

        const _emergencyAppBaseUrl = await getAppBaseUrl();
        const results = { email: [], sms: [], whatsapp: [], errors: [] };
        const msgText = message.trim();
        const subject = `🚨 [DSI Live] Message d'urgence — Session #${id}`;
        const htmlBody = `
            <div style="font-family:sans-serif;max-width:600px">
                <div style="background:#dc2626;padding:16px 20px;color:#fff;border-radius:8px 8px 0 0">
                    <h2 style="margin:0;font-size:18px">🚨 Message d'urgence DSI Chat Live</h2>
                </div>
                <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                    <p style="font-size:14px;color:#374151">Session <strong>#${id}</strong> — Ticket <strong>#${session.ticket_id || 'N/A'}</strong></p>
                    <p style="font-size:14px;color:#374151">Demandeur : <strong>${session.user_display_name || session.user_username}</strong></p>
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:12px 0">
                        <p style="color:#1e293b;font-size:14px;margin:0;white-space:pre-wrap">${msgText}</p>
                    </div>
                    <a href="${_emergencyAppBaseUrl}/admin/tickets" style="color:#6366f1;font-size:13px">→ Accéder au tableau de bord live</a>
                </div>
            </div>`;

        // Email to all emergency contacts
        if (_sendMail) {
            for (const c of contacts) {
                if (!c.email) continue;
                try {
                    await _sendMail(c.email, subject, htmlBody);
                    results.email.push(c.email);
                } catch (e) {
                    results.errors.push(`Email ${c.email}: ${e.message}`);
                }
            }
        }

        // SMS via Frizbi (contacts with mobile_phone)
        const smsContacts = contacts.filter(c => c.mobile_phone);
        if (smsContacts.length > 0) {
            try {
                const db = getSqlite();
                const frizbi = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
                if (frizbi?.is_enabled && frizbi.client_id && frizbi.client_secret) {
                    const loginRes = await axios.post(`${frizbi.api_url}/api/auth/login`, {
                        login: frizbi.client_id, password: frizbi.client_secret
                    });
                    const frizbiToken = loginRes.data?.token;
                    if (frizbiToken) {
                        await axios.post(`${frizbi.api_url}/api/sms/send`, {
                            customerSmsId: `live_urg_${id}_${Date.now()}`.substring(0, 50),
                            date: new Date().toISOString(),
                            title: 'Urgence DSI',
                            message: `[DSI URGENCE] Session #${id}: ${msgText}`,
                            customerSenderId: frizbi.sender_id || 'IVRY',
                            smsContacts: smsContacts.map(c => ({
                                customerSmsContactId: `urg_${(c.mobile_phone || '').replace(/\D/g, '')}`,
                                mobile: (c.mobile_phone || '').replace(/\D/g, ''),
                                firstName: (c.display_name || '').split(' ')[0] || 'Tech',
                                lastName: (c.display_name || '').split(' ').slice(1).join(' ') || '',
                            })),
                        }, { headers: { Authorization: `Bearer ${frizbiToken}` } });
                        results.sms = smsContacts.map(c => c.mobile_phone);
                        // Log SMS for each emergency contact
                        const emergMsg = `[DSI URGENCE] Session #${id}: ${msgText}`;
                        for (const c of smsContacts) {
                            try {
                                await pgDb.run(`
                                    INSERT INTO hub.sms_logs (recipient, message, sender_id, status, source, created_by)
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                `, [(c.mobile_phone || '').replace(/\D/g, ''), emergMsg, frizbi.sender_id || 'IVRY', 'sent', 'emergency', req.user?.username || 'system']);
                            } catch (logErr) {
                                console.error('[LIVE] Failed to log emergency SMS:', logErr.message);
                            }
                        }
                    }
                }
            } catch (e) {
                results.errors.push(`SMS Frizbi: ${e.message}`);
                console.error('[LIVE] emergency SMS error:', e.message);
            }
        }

        // WhatsApp via Meta Cloud API
        const waCfgRows = await pgDb.all(
            `SELECT key, value FROM hub_tickets.module_config WHERE key IN ('whatsapp_enabled','whatsapp_phone_number_id','whatsapp_access_token')`
        );
        const waCfg = Object.fromEntries(waCfgRows.map(r => [r.key, r.value]));
        if (waCfg.whatsapp_enabled === 'true' && waCfg.whatsapp_phone_number_id && waCfg.whatsapp_access_token) {
            for (const c of smsContacts) {
                const raw = (c.mobile_phone || '').replace(/\D/g, '');
                if (!raw) continue;
                // Normalize to international format (French: 06... → 336...)
                const phone = raw.startsWith('33') ? raw : `33${raw.replace(/^0/, '')}`;
                try {
                    await axios.post(
                        `https://graph.facebook.com/v19.0/${waCfg.whatsapp_phone_number_id}/messages`,
                        {
                            messaging_product: 'whatsapp',
                            to: phone,
                            type: 'text',
                            text: { body: `🚨 [DSI URGENCE] Session #${id} - Ticket #${session.ticket_id || 'N/A'}\n${msgText}` },
                        },
                        { headers: { Authorization: `Bearer ${waCfg.whatsapp_access_token}`, 'Content-Type': 'application/json' } }
                    );
                    results.whatsapp.push(phone);
                } catch (e) {
                    results.errors.push(`WhatsApp ${phone}: ${e.message}`);
                    console.error('[LIVE] emergency WhatsApp error:', e.message);
                }
            }
        }

        res.json({ success: true, contacts: contacts.length, results });
    } catch (e) {
        console.error('[LIVE] sendEmergencyMessage error:', e);
        res.status(500).json({ message: e.message });
    }
}

async function setTicketType(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { type } = req.body || {};
        if (!type || !['1', '2'].includes(String(type))) {
            return res.status(400).json({ message: 'Type invalide (1=Incident, 2=Demande)' });
        }

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (!session.ticket_id) return res.status(400).json({ message: 'Aucun ticket associé' });

        await pgDb.run(
            `UPDATE hub_tickets.tickets SET type = $1, date_mod = NOW() WHERE glpi_id = $2`,
            [String(type), session.ticket_id]
        );

        res.json({ success: true, type: String(type) });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── PATCH /api/live/sessions/:id/priority ─────────────────────────────────
// Permet au technicien de modifier l'impact et/ou la priorité pendant un live.
async function setTicketPriority(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { priority, impact } = req.body || {};
        const valid = (v) => v != null && ['1', '2', '3', '4', '5'].includes(String(v));
        if (priority === undefined && impact === undefined) {
            return res.status(400).json({ message: 'priority ou impact requis' });
        }
        if (priority !== undefined && !valid(priority)) return res.status(400).json({ message: 'Priorité invalide (1-5)' });
        if (impact !== undefined && !valid(impact)) return res.status(400).json({ message: 'Impact invalide (1-5)' });

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (!session.ticket_id) return res.status(400).json({ message: 'Aucun ticket associé' });

        const sets = [];
        const params = [];
        if (priority !== undefined) { params.push(String(priority)); sets.push(`priority = $${params.length}`); }
        if (impact !== undefined) { params.push(String(impact)); sets.push(`impact = $${params.length}`); }
        params.push(session.ticket_id);
        await pgDb.run(
            `UPDATE hub_tickets.tickets SET ${sets.join(', ')}, date_mod = NOW() WHERE glpi_id = $${params.length}`,
            params
        );

        res.json({
            success: true,
            priority: priority !== undefined ? String(priority) : undefined,
            impact: impact !== undefined ? String(impact) : undefined,
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── PATCH /api/live/sessions/:id/category ─────────────────────────────────
// Permet au technicien de classer le ticket (catégorie / sous-catégorie) en live.
async function setTicketCategory(req, res) {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: 'ID de session invalide' });
        const { category_id, subcategory_id } = req.body || {};

        const session = await pgDb.get(`SELECT * FROM hub_tickets.live_sessions WHERE id = $1`, [id]);
        if (!session) return res.status(404).json({ message: 'Session introuvable' });
        if (!session.ticket_id) return res.status(400).json({ message: 'Aucun ticket associé' });

        const cat = category_id != null && category_id !== '' ? parseInt(category_id) : null;
        const sub = subcategory_id != null && subcategory_id !== '' ? parseInt(subcategory_id) : null;

        await pgDb.run(
            `UPDATE hub_tickets.tickets SET category_id = $1, subcategory_id = $2, date_mod = NOW() WHERE glpi_id = $3`,
            [cat, sub, session.ticket_id]
        );

        res.json({ success: true, category_id: cat, subcategory_id: sub });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/guest-login (public) ───────────────────────────────────
async function guestLogin(req, res) {
    try {
        const { displayName, email, chat_type } = req.body || {};
        if (!displayName?.trim() || !email?.trim()) {
            return res.status(400).json({ message: 'Nom et email requis' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ message: 'Adresse email invalide' });
        }
        const chatType = chat_type === 'ecole' ? 'ecole' : 'ville';
        const username = `guest_${Date.now()}`;
        const token = jwt.sign({
            id: 0, username,
            displayName: displayName.trim(),
            email: email.trim().toLowerCase(),
            role: 'user', is_approved: true,
            auth_method: 'guest',
            chat_type: chatType
        }, SECRET_KEY);
        res.json({ token, user: { username, displayName: displayName.trim(), email: email.trim().toLowerCase(), chat_type: chatType } });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/auth/ad (public) ───────────────────────────────────────
async function adLogin(req, res) {
    try {
        const { username, password, chat_type } = req.body || {};
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
        const chatType = chat_type === 'ecole' ? 'ecole' : 'ville';
        const email = adUser.email || `${clean.toLowerCase()}@ivry94.fr`;
        const token = jwt.sign({
            id: 0, username: clean.toLowerCase(),
            displayName: adUser.displayName,
            email,
            role: 'user', is_approved: true,
            auth_method: 'ad',
            chat_type: chatType,
        }, SECRET_KEY);
        res.json({ token, user: { username: clean.toLowerCase(), displayName: adUser.displayName, email, chat_type: chatType } });
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
            const content = `
                <p style="font-size:15px;color:#1e293b">Bonjour <strong>${adUser.displayName}</strong>,</p>
                <p style="color:#374151">Voici votre code de connexion pour accéder au <strong>chat de support DSI</strong> :</p>
                <div style="text-align:center;margin:28px 0">
                  <span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#6366f1;background:#eef2ff;padding:16px 28px;border-radius:12px;display:inline-block">${code}</span>
                </div>
                <p style="color:#64748b;font-size:13px">Ce code est valable <strong>5 minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
                <p style="font-size:12px;color:#94a3b8;">Si vous n'avez pas demandé ce code, ignorez cet e-mail.</p>`;
            try {
                await _sendMail(adUser.email, '[DSI Support] Votre code de connexion', content, [], 'live_otp');
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
        const { username, code, chat_type } = req.body || {};
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

        const chatType = chat_type === 'ecole' ? 'ecole' : 'ville';
        const otpUsername = `otp_${Date.now()}`;
        const token = jwt.sign({
            id: 0, username: otpUsername,
            displayName: record.display_name || clean,
            email: record.email,
            role: 'user', is_approved: true,
            auth_method: 'otp',
            chat_type: chatType,
        }, SECRET_KEY);
        res.json({ token, user: { username: otpUsername, displayName: record.display_name || clean, email: record.email, chat_type: chatType } });
    } catch (e) {
        console.error('[LIVE] otpVerify error:', e.message);
        res.status(500).json({ message: e.message });
    }
}

// ── POST /api/live/auth/sms-token — validate short-lived SMS link token ─
async function smsTokenAuth(req, res) {
    try {
        const { token } = req.body || {};
        if (!token) return res.status(400).json({ message: 'Token requis' });

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.type !== 'sms_auth') {
            return res.status(403).json({ message: 'Token invalide' });
        }

        const authToken = jwt.sign({
            id: 0,
            username: decoded.username,
            displayName: decoded.displayName,
            email: decoded.email || decoded.username + '@dsi',
            role: 'user',
            is_approved: true,
            auth_method: 'sms_link',
        }, SECRET_KEY);

        res.json({
            token: authToken,
            user: {
                username: decoded.username,
                displayName: decoded.displayName,
                email: decoded.email || decoded.username + '@dsi',
                role: 'user',
                is_approved: true,
            },
            session_id: decoded.session_id || null,
        });
    } catch (e) {
        if (e.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Lien expiré (5 minutes)' });
        }
        console.error('[LIVE] smsTokenAuth error:', e.message);
        res.status(403).json({ message: 'Token invalide' });
    }
}

module.exports = { getSessions, getSession, getMessages, createSession, claimSession, closeSession, getWaitingCount, getStats, setSendMail, getConfig, setConfig, getPublicConfig, getCalendars, startScheduler, uploadAttachment, sendMessage, guestLogin, adLogin, otpRequest, otpVerify, rejectSession, createTask, setTicketType, setTicketPriority, setTicketCategory, setSessionApp, submitSatisfaction, getSatisfactionStats, sendEmergencyMessage, smsTokenAuth };
