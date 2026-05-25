const { pgDb } = require('../../shared/database');
const { getIO } = require('./live.socket');

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
        const sessionResult = await pgDb.run(`
            INSERT INTO hub_tickets.live_sessions
                (ticket_id, user_username, user_display_name, user_email, status, created_at)
            VALUES ($1, $2, $3, $4, 'waiting', NOW())
        `, [ticketId, user.username, user.displayName || user.username, user.email || '']);

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
// body: { newTitle?: string }  — optionally rename the ticket
async function closeSession(req, res) {
    try {
        const { id } = req.params;
        const { newTitle } = req.body || {};

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
            const titleUpdate = newTitle?.trim()
                ? `, title = '${newTitle.trim().replace(/'/g, "''")}'`
                : '';
            await pgDb.run(
                `UPDATE hub_tickets.tickets SET status = 6, date_mod = NOW()${titleUpdate} WHERE glpi_id = $1`,
                [session.ticket_id]
            );

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

// ── GET /api/live/config ──────────────────────────────────────────────
async function getConfig(req, res) {
    try {
        const row = await pgDb.get(
            `SELECT value FROM hub_tickets.module_config WHERE key = 'live_enabled'`
        );
        // Default to enabled if no row found
        res.json({ live_enabled: row ? row.value !== 'false' : true });
    } catch (e) {
        res.json({ live_enabled: true });
    }
}

// ── PUT /api/live/config ──────────────────────────────────────────────
async function setConfig(req, res) {
    try {
        const { live_enabled } = req.body;
        await pgDb.run(`
            INSERT INTO hub_tickets.module_config (key, value)
            VALUES ('live_enabled', $1)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [live_enabled ? 'true' : 'false']);

        // Broadcast new state to all connected clients
        const io = getIO();
        if (io) io.emit('live_config', { live_enabled });

        res.json({ live_enabled });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
}

module.exports = { getSessions, getSession, getMessages, createSession, claimSession, closeSession, getWaitingCount, setSendMail, getConfig, setConfig, uploadAttachment };
