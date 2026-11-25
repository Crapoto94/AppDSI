/**
 * Temps réel des « Réunions de service / de direction ».
 *
 * Un « maître du temps » pilote la salle : rubrique courante, zoom et position
 * de défilement. Son état est rediffusé à tous les écrans connectés, qui
 * affichent ainsi la même chose. Chaque participant peut toutefois se
 * déconnecter du direct (« ne plus suivre ») puis revenir.
 *
 * Les handlers sont branchés depuis modules/live/live.socket.js (socket.io est
 * déjà initialisé pour toute l'application).
 */
const { pgDb } = require('../../shared/database');

let ioRef = null;
const rooms = new Map(); // meetingId -> état live

function roomName(meetingId) { return `rs:${meetingId}`; }

function broadcast(meetingId, event, payload) {
    if (ioRef) ioRef.to(roomName(meetingId)).emit(event, payload);
}

async function loadState(meetingId) {
    const cached = rooms.get(meetingId);
    if (cached) return cached;
    const m = await pgDb.get(
        `SELECT id, status, time_master_username, time_master_name, current_section_id,
                current_section_started_at, started_at, zoom
         FROM reunions_service.meetings WHERE id = ?`, [meetingId]
    );
    if (!m) return null;
    const toMs = (v) => {
        if (!v) return null;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    };
    const st = {
        status: m.status,
        masterUsername: (m.time_master_username || '').toLowerCase() || null,
        masterName: m.time_master_name || null,
        currentSectionId: m.current_section_id || null,
        // Départ de la rubrique courante (bandeau de gestion du temps) ; repli
        // sur le démarrage de la réunion pour les réunions ouvertes avant la
        // colonne current_section_started_at.
        sectionStartedAt: toMs(m.current_section_started_at) || toMs(m.started_at) || Date.now(),
        zoom: Number(m.zoom) || 1,
        anchor: null,
        revision: 0,
        updatedAt: Date.now(),
        byUsername: null,
    };
    rooms.set(meetingId, st);
    return st;
}

function stateEvent(meetingId, st) {
    return {
        meetingId,
        status: st.status,
        masterUsername: st.masterUsername,
        masterName: st.masterName,
        currentSectionId: st.currentSectionId,
        sectionStartedAt: st.sectionStartedAt,
        zoom: st.zoom,
        anchor: st.anchor,
        revision: st.revision,
        updatedAt: st.updatedAt,
        byUsername: st.byUsername,
    };
}

/** Recharge le statut et le maître du temps depuis la base (source de vérité) :
 *  évite qu'un état en mémoire périmé fasse « perdre » le rôle de maître. */
async function refreshFromDb(meetingId, st) {
    try {
        const row = await pgDb.get(
            `SELECT status, time_master_username, time_master_name FROM reunions_service.meetings WHERE id = ?`,
            [meetingId]
        );
        if (row) {
            st.status = row.status;
            st.masterUsername = (row.time_master_username || '').toLowerCase() || null;
            st.masterName = row.time_master_name || null;
        }
    } catch (e) { /* on garde l'état courant */ }
    return st;
}

/** À appeler après un démarrage / une fin de réunion (côté HTTP) : recharge
 *  l'état depuis la base et prévient toute la salle. */
async function syncMeetingState(meetingId) {
    const id = parseInt(meetingId, 10);
    if (!id) return;
    rooms.delete(id);
    const st = await loadState(id);
    if (st) broadcast(id, 'rs_state', stateEvent(id, st));
}

/** Notifie la salle d'un changement de maître du temps. */
function notifyMasterChanged(meetingId, payload = {}) {
    const id = parseInt(meetingId, 10);
    if (!id) return;
    broadcast(id, 'rs_master_changed', { meetingId: id, at: Date.now(), ...payload });
}

/** Émission générique vers la salle d'une réunion (sondages, etc.). */
function notifyMeeting(meetingId, event, payload = {}) {
    const id = parseInt(meetingId, 10);
    if (!id || !event) return;
    broadcast(id, event, { meetingId: id, at: Date.now(), ...payload });
}

/** Notifie la salle qu'un contenu a changé (item ajouté/modifié/supprimé,
 *  participant ajouté, pièce jointe déposée…). Les clients rechargent. */
function notifyContentChanged(meetingId, extra = {}) {
    const id = parseInt(meetingId, 10);
    if (!id) return;
    broadcast(id, 'rs_content', { meetingId: id, at: Date.now(), ...extra });
}

function handleConnection(io, socket) {
    ioRef = io;
    // Jeu de pause (Tetris multijoueur) : mêmes sockets que la réunion.
    require('./tetris-room').handleConnection(io, socket);
    const user = socket.user || {};

    socket.on('rs_join', async ({ meetingId } = {}) => {
        const id = parseInt(meetingId, 10);
        if (!id) return;
        socket.join(roomName(id));
        socket.data.rsMeetingId = id;
        const st = await loadState(id);
        if (!st) {
            socket.emit('rs_error', { meetingId: id, message: 'Réunion introuvable' });
            return;
        }
        await refreshFromDb(id, st);
        socket.emit('rs_state', {
            ...stateEvent(id, st),
            you: { username: user.username || null, name: user.displayName || user.username || null },
        });
        // Popup d'arrivée : prévient tous les écrans connectés (y compris
        // l'arrivant) qu'un agent vient de rejoindre la réunion.
        io.to(roomName(id)).emit('rs_joined', {
            meetingId: id,
            name: user.displayName || user.username || 'Un participant',
            username: user.username || null,
            at: Date.now(),
        });
        // Présence automatique : un participant qui se connecte pendant la
        // séance est marqué présent (il peut ensuite être requalifié à la main
        // en excusé/absent depuis la rubrique META).
        if (st.status === 'in_progress') {
            try {
                const uname = String(user.username || '').toLowerCase();
                const email = String(user.email || '').toLowerCase();
                if (uname || email) {
                    const row = await pgDb.get(
                        `SELECT id, present, excused FROM reunions_service.meeting_participants
                         WHERE meeting_id = ?
                           AND (LOWER(username) = ? OR (LOWER(email) = ? AND ? <> ''))
                           AND COALESCE(kind, 'present') <> 'info'
                         LIMIT 1`,
                        [id, uname, email, email]
                    );
                    if (row && (!row.present || row.excused)) {
                        await pgDb.run(
                            `UPDATE reunions_service.meeting_participants
                             SET present = TRUE, excused = FALSE
                             WHERE id = ?`,
                            [row.id]
                        );
                        notifyContentChanged(id, { reason: 'presence' });
                    }
                }
            } catch (e) {
                console.error('[REUNIONS-SERVICE] auto-présence:', e.message);
            }
        }
        const room = io.sockets.adapter.rooms.get(roomName(id));
        io.to(roomName(id)).emit('rs_presence', { meetingId: id, count: room ? room.size : 1 });
    });

    socket.on('rs_request_state', async ({ meetingId } = {}) => {
        const id = parseInt(meetingId, 10);
        if (!id) return;
        const st = await loadState(id);
        if (st) {
            await refreshFromDb(id, st);
            socket.emit('rs_state', stateEvent(id, st));
        }
    });

    // Navigation : acceptée uniquement du maître du temps désigné.
    socket.on('rs_navigate', async (payload = {}) => {
        const id = parseInt(payload.meetingId, 10);
        if (!id) return;
        const st = await loadState(id);
        if (!st || st.status !== 'in_progress') return;
        const uname = String(user.username || '').toLowerCase();
        if (!st.masterUsername || uname !== st.masterUsername) {
            // État mémoire possiblement périmé : on relit la base avant de refuser.
            await refreshFromDb(id, st);
            if (st.status !== 'in_progress') return;
            if (!st.masterUsername || uname !== st.masterUsername) return;
        }

        const previousSectionId = st.currentSectionId;
        if (payload.currentSectionId !== undefined && payload.currentSectionId !== null) {
            const sid = parseInt(payload.currentSectionId, 10);
            if (sid) st.currentSectionId = sid;
        }
        if (payload.zoom !== undefined && payload.zoom !== null) {
            const z = Number(payload.zoom);
            if (!Number.isNaN(z)) st.zoom = Math.min(3, Math.max(0.5, z));
        }
        if (payload.anchor !== undefined) st.anchor = payload.anchor;
        st.revision += 1;
        st.updatedAt = Date.now();
        st.byUsername = uname;

        // Changement de rubrique : nouveau départ pour le chronomètre du bandeau.
        const sectionChanged = st.currentSectionId !== previousSectionId;
        if (sectionChanged) {
            st.sectionStartedAt = Date.now();
            // Si le maître du temps quitte la pause, le jeu s'arrête immédiatement
            // pour tous les participants (sans attendre la fin de la partie).
            try {
                const sec = await pgDb.get(
                    'SELECT is_pause FROM reunions_service.meeting_sections WHERE id = ? AND meeting_id = ?',
                    [st.currentSectionId, id]
                );
                if (!sec?.is_pause) {
                    require('./tetris-room').closeMeeting(io, id, 'La pause est terminée.');
                }
            } catch { /* ignore */ }
        }

        // Persistance légère : rubrique + zoom (le défilement reste éphémère).
        if (sectionChanged) {
            pgDb.run(
                `UPDATE reunions_service.meetings
                 SET current_section_id = ?, zoom = ?, current_section_started_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [st.currentSectionId, st.zoom, id]
            ).catch(() => {});
        } else {
            pgDb.run(
                `UPDATE reunions_service.meetings SET current_section_id = ?, zoom = ?, updated_at = NOW() WHERE id = ?`,
                [st.currentSectionId, st.zoom, id]
            ).catch(() => {});
        }

        io.to(roomName(id)).emit('rs_state', stateEvent(id, st));
    });

    // Défilement du popup INTERACT : seul le maître du temps pilote, les
    // autres écrans appliquent le même ratio de défilement.
    socket.on('rs_poll_scroll', async (payload = {}) => {
        const id = parseInt(payload.meetingId, 10);
        if (!id) return;
        const st = await loadState(id);
        if (!st || st.status !== 'in_progress') return;
        const uname = String(user.username || '').toLowerCase();
        if (!st.masterUsername || uname !== st.masterUsername) {
            await refreshFromDb(id, st);
            if (st.status !== 'in_progress') return;
            if (!st.masterUsername || uname !== st.masterUsername) return;
        }
        const ratio = Math.min(1, Math.max(0, Number(payload.ratio) || 0));
        io.to(roomName(id)).emit('rs_poll_scroll', {
            meetingId: id,
            pollId: payload.pollId ? parseInt(payload.pollId, 10) : null,
            ratio,
            byUsername: uname,
        });
    });

    socket.on('disconnect', () => {
        const id = socket.data?.rsMeetingId;
        if (!id) return;
        const room = io.sockets.adapter.rooms.get(roomName(id));
        io.to(roomName(id)).emit('rs_presence', { meetingId: id, count: room ? room.size : 0 });
    });
}

/** Ferme les jeux de pause d'une réunion (fin de réunion, changement de rubrique…). */
function closePause(meetingId, message) {
    if (ioRef) require('./tetris-room').closeMeeting(ioRef, meetingId, message);
}

module.exports = { handleConnection, syncMeetingState, notifyContentChanged, notifyMasterChanged, notifyMeeting, closePause };
