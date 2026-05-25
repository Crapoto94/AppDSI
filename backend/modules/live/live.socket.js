const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../../shared/config');
const { pgDb } = require('../../shared/database');

let ioInstance = null;

function getIO() { return ioInstance; }

function setupSocket(server) {
    const { Server } = require('socket.io');
    const io = new Server(server, {
        cors: {
            origin: ['http://localhost:5173', 'http://localhost:5174', 'http://dsihub.ivry.local', 'http://po22038:5173'],
            credentials: true
        }
    });

    ioInstance = io;

    // Auth middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('auth_required'));
        try {
            socket.user = jwt.verify(token, SECRET_KEY);
            next();
        } catch (e) {
            next(new Error('auth_invalid'));
        }
    });

    io.on('connection', (socket) => {
        const user = socket.user;
        console.log(`[LIVE] Connected: ${user.username}`);

        // ── Tech: watch for new sessions ────────────────────────────
        socket.on('tech_watch', () => {
            socket.join('live:techs');
        });

        // ── Join a specific session room ──────────────────────────────
        socket.on('join_session', async ({ sessionId }) => {
            if (!sessionId) return;
            socket.join(`live:session:${sessionId}`);
            try {
                const messages = await pgDb.all(
                    `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
                    [sessionId]
                );
                socket.emit('session_history', messages);
            } catch (e) {
                console.error('[LIVE] join_session error:', e.message);
            }
        });

        // ── Send a message ────────────────────────────────────────────
        socket.on('send_message', async ({ sessionId, content }) => {
            if (!content?.trim() || !sessionId) return;
            try {
                const session = await pgDb.get(
                    `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`,
                    [sessionId]
                );
                if (!session || session.status === 'closed') return;

                const senderType = session.tech_username === user.username ? 'tech' : 'user';
                const result = await pgDb.run(
                    `INSERT INTO hub_tickets.live_messages (session_id, sender_type, sender_name, sender_username, content, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [sessionId, senderType, user.displayName || user.username, user.username, content.trim()]
                );

                const message = await pgDb.get(
                    `SELECT * FROM hub_tickets.live_messages WHERE id = $1`,
                    [result.lastID]
                );

                io.to(`live:session:${sessionId}`).emit('new_message', message);
            } catch (e) {
                console.error('[LIVE] send_message error:', e.message);
                socket.emit('live_error', { message: e.message });
            }
        });

        // ── Tech claims a session ─────────────────────────────────────
        socket.on('claim_session', async ({ sessionId }) => {
            try {
                const session = await pgDb.get(
                    `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`,
                    [sessionId]
                );
                if (!session) return socket.emit('live_error', { message: 'Session introuvable' });
                if (session.status !== 'waiting') return socket.emit('live_error', { message: 'Session déjà prise en charge' });

                await pgDb.run(
                    `UPDATE hub_tickets.live_sessions
                     SET status = 'active', tech_username = $1, tech_display_name = $2, claimed_at = NOW()
                     WHERE id = $3`,
                    [user.username, user.displayName || user.username, sessionId]
                );

                const updated = await pgDb.get(
                    `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`,
                    [sessionId]
                );

                socket.join(`live:session:${sessionId}`);

                // Send history to the newly joined tech
                const messages = await pgDb.all(
                    `SELECT * FROM hub_tickets.live_messages WHERE session_id = $1 ORDER BY created_at ASC`,
                    [sessionId]
                );
                socket.emit('session_history', messages);

                // Notify the session room (user gets a "tech joined" event)
                io.to(`live:session:${sessionId}`).emit('session_claimed', {
                    session: updated,
                    tech: { username: user.username, displayName: user.displayName || user.username }
                });

                // Notify all techs to update their list
                io.to('live:techs').emit('session_updated', updated);

            } catch (e) {
                console.error('[LIVE] claim_session error:', e.message);
                socket.emit('live_error', { message: e.message });
            }
        });

        // ── Close a session ───────────────────────────────────────────
        socket.on('close_session', async ({ sessionId }) => {
            try {
                await pgDb.run(
                    `UPDATE hub_tickets.live_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1`,
                    [sessionId]
                );

                const session = await pgDb.get(
                    `SELECT * FROM hub_tickets.live_sessions WHERE id = $1`,
                    [sessionId]
                );
                if (session?.ticket_id) {
                    await pgDb.run(
                        `UPDATE hub_tickets.tickets SET status = 6, date_mod = NOW() WHERE glpi_id = $1`,
                        [session.ticket_id]
                    );
                }

                io.to(`live:session:${sessionId}`).emit('session_closed', { sessionId });
                io.to('live:techs').emit('session_closed', { sessionId });
            } catch (e) {
                socket.emit('live_error', { message: e.message });
            }
        });

        socket.on('disconnect', () => {
            console.log(`[LIVE] Disconnected: ${user.username}`);
        });
    });

    console.log('[LIVE] Socket.io initialized');
    return io;
}

module.exports = { setupSocket, getIO };
