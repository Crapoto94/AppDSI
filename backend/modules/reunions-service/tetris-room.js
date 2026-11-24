/**
 * Tetris multijoueur des « pauses » de réunion.
 *
 * Réutilise le moteur de jeu de C:\dev\AnnivVincent (server/game/tetris.js).
 * Une partie est créée par item de pause, avec un lobby : les participants
 * cliquent « Jouer au Tetris », le premier lance la partie, chacun joue sa
 * grille en temps réel sur son écran.
 */
const { TetrisGame } = require('./tetris');
const { pgDb } = require('../../shared/database');

const rooms = new Map(); // `${meetingId}:${itemId}` -> room
const roomKey = (meetingId, itemId) => `${meetingId}:${itemId}`;

/**
 * Le jeu ne peut démarrer que lorsque le maître du temps a placé la réunion
 * sur la pause : rubrique « pause » courante, ou item de pause de la rubrique
 * courante. Sinon on refuse (message « attendez la pause »).
 */
async function isPauseActive(meetingId, itemId) {
    try {
        const meeting = await pgDb.get(
            'SELECT status, current_section_id FROM reunions_service.meetings WHERE id = ?', [meetingId]
        );
        if (!meeting || meeting.status !== 'in_progress' || !meeting.current_section_id) return false;
        const current = Number(meeting.current_section_id);
        const section = await pgDb.get(
            'SELECT id, is_pause FROM reunions_service.meeting_sections WHERE id = ? AND meeting_id = ?',
            [current, meetingId]
        );
        if (!section) return false;
        if (section.is_pause) return true;
        const item = await pgDb.get(
            'SELECT id, section_id, is_pause FROM reunions_service.items WHERE id = ? AND meeting_id = ?',
            [itemId, meetingId]
        );
        return !!item?.is_pause && Number(item.section_id) === current;
    } catch {
        return false;
    }
}

const PAUSE_WAIT_MESSAGE = 'Attendez que le maître du temps mette la réunion sur la pause.';

function blocked(socket, meetingId, itemId) {
    socket.emit('rs_tetris_blocked', { meetingId, itemId, message: PAUSE_WAIT_MESSAGE });
}

function getRoom(meetingId, itemId, create = false) {
    const key = roomKey(meetingId, itemId);
    let room = rooms.get(key);
    if (!room && create) {
        room = {
            key, meetingId, itemId,
            lobby: new Map(), // socketId -> { id, name }
            game: null,
            timer: null,
            ranking: null,
            startedAt: null,
        };
        rooms.set(key, room);
    }
    return room;
}

function lobbyList(room) {
    return [...room.lobby.values()].map(p => ({ id: p.id, name: p.name }));
}

function snapshot(room) {
    if (!room) return null;
    if (room.game) {
        const st = room.game.publicState();
        return {
            meetingId: room.meetingId,
            itemId: room.itemId,
            status: st.status === 'playing' ? 'playing' : 'done',
            state: st,
            lobby: lobbyList(room),
            ranking: st.status !== 'playing' ? room.game.ranking() : null,
        };
    }
    return {
        meetingId: room.meetingId,
        itemId: room.itemId,
        status: 'lobby',
        state: null,
        lobby: lobbyList(room),
        ranking: null,
    };
}

function emit(io, room, event, payload = {}) {
    io.to(`rs:${room.meetingId}`).emit(event, {
        meetingId: room.meetingId,
        itemId: room.itemId,
        ...payload,
    });
}

function broadcast(io, room, event) {
    emit(io, room, 'rs_tetris', snapshot(room));
    if (event) emit(io, room, event, snapshot(room));
}

function stopTimer(room) {
    if (room?.timer) { clearInterval(room.timer); room.timer = null; }
}

async function pauseRemainingSeconds(meetingId, itemId) {
    try {
        const item = await pgDb.get(
            'SELECT section_id FROM reunions_service.items WHERE id = ? AND meeting_id = ?', [itemId, meetingId]
        );
        const sectionId = item?.section_id || itemId;
        const section = await pgDb.get(
            'SELECT duration_minutes FROM reunions_service.meeting_sections WHERE id = ? AND meeting_id = ?',
            [sectionId, meetingId]
        );
        const meeting = await pgDb.get(
            'SELECT current_section_started_at FROM reunions_service.meetings WHERE id = ?', [meetingId]
        );
        const total = Math.max(0, Number(section?.duration_minutes) || 0) * 60;
        if (!total) return 240;
        const started = meeting?.current_section_started_at ? new Date(meeting.current_section_started_at).getTime() : null;
        if (!started) return total;
        const remaining = total - (Date.now() - started) / 1000;
        return Math.max(5, Math.round(remaining));
    } catch {
        return 240;
    }
}

async function start(io, room) {
    if (!room || room.lobby.size === 0) return;
    if (room.game && room.game.status === 'playing') return;
    stopTimer(room);
    const players = [...room.lobby.values()].map(p => ({ id: p.id, name: p.name }));
    // La partie dure exactement le temps restant de la pause : elle s'éteint
    // toute seule à la fin du temps de pause et affiche les scores.
    const seconds = await pauseRemainingSeconds(room.meetingId, room.itemId);
    room.game = new TetrisGame(players, { seconds });
    room.ranking = null;
    room.startedAt = Date.now();
    broadcast(io, room, 'rs_tetris_started');
    room.timer = setInterval(() => {
        if (!room.game) { stopTimer(room); return; }
        room.game.tick();
        if (room.game.status !== 'playing') {
            stopTimer(room);
            room.ranking = room.game.ranking();
            broadcast(io, room, 'rs_tetris_finished');
            return;
        }
        emit(io, room, 'rs_tetris', snapshot(room));
    }, 110);
}

/** Ferme immédiatement tous les jeux de pause d'une réunion. */
function closeMeeting(io, meetingId, message = 'La pause est terminée.') {
    for (const [key, room] of rooms) {
        if (Number(room.meetingId) !== Number(meetingId)) continue;
        stopTimer(room);
        try { room.game?.end?.(); } catch { /* ignore */ }
        room.lobby.clear();
        rooms.delete(key);
        io.to(`rs:${room.meetingId}`).emit('rs_tetris_closed', {
            meetingId: room.meetingId,
            itemId: room.itemId,
            message,
        });
    }
}

function handleConnection(io, socket) {    socket.on('tetris_join', async (data = {}) => {
        const meetingId = parseInt(data.meetingId, 10);
        const itemId = parseInt(data.itemId, 10);
        if (!meetingId || !itemId) return;
        if (!(await isPauseActive(meetingId, itemId))) { blocked(socket, meetingId, itemId); return; }
        const room = getRoom(meetingId, itemId, true);
        const name = String(data.name || socket.user?.displayName || socket.user?.username || 'Participant').slice(0, 40);
        // Un seul joueur par socket ; le nom peut être actualisé.
        room.lobby.set(socket.id, { id: socket.id, name });
        // Une partie est déjà en cours : on l'intègre avec une nouvelle grille.
        if (room.game && room.game.status === 'playing') {
            room.game.addPlayer({ id: socket.id, name });
        }
        socket.data.tetrisRooms = socket.data.tetrisRooms || new Set();
        socket.data.tetrisRooms.add(room.key);
        broadcast(io, room, 'rs_tetris_lobby');
    });

    socket.on('tetris_start', async (data = {}) => {
        const meetingId = parseInt(data.meetingId, 10);
        const itemId = parseInt(data.itemId, 10);
        if (!meetingId || !itemId) return;
        if (!(await isPauseActive(meetingId, itemId))) { blocked(socket, meetingId, itemId); return; }
        const room = getRoom(meetingId, itemId, false);
        if (!room) return;
        const name = String(socket.user?.displayName || socket.user?.username || 'Participant').slice(0, 40);
        socket.data.tetrisRooms = socket.data.tetrisRooms || new Set();
        socket.data.tetrisRooms.add(room.key);
        if (room.game && room.game.status === 'playing') {
            room.lobby.set(socket.id, { id: socket.id, name });
            room.game.addPlayer({ id: socket.id, name });
            broadcast(io, room, 'rs_tetris_lobby');
            return;
        }
        // « Nouvelle partie » : le demandeur rejoint le lobby avant le départ.
        if (!room.lobby.has(socket.id)) room.lobby.set(socket.id, { id: socket.id, name });
        await start(io, room);
    });

    socket.on('tetris_move', (data = {}) => {
        const meetingId = parseInt(data.meetingId, 10);
        const itemId = parseInt(data.itemId, 10);
        const dir = String(data.dir || '');
        if (!meetingId || !itemId || !['left', 'right', 'rotate', 'down', 'drop'].includes(dir)) return;
        const room = getRoom(meetingId, itemId, false);
        if (!room?.game || room.game.status !== 'playing') return;
        room.game.move(socket.id, dir);
        emit(io, room, 'rs_tetris', snapshot(room));
    });

    socket.on('tetris_leave', (data = {}) => {
        const meetingId = parseInt(data.meetingId, 10);
        const itemId = parseInt(data.itemId, 10);
        if (!meetingId || !itemId) return;
        const room = getRoom(meetingId, itemId, false);
        if (!room) return;
        room.lobby.delete(socket.id);
        socket.data.tetrisRooms?.delete(room.key);
        // Si aucune partie en cours, on peut supprimer la salle vide.
        if (!room.game && room.lobby.size === 0) {
            stopTimer(room);
            rooms.delete(room.key);
            return;
        }
        broadcast(io, room, 'rs_tetris_lobby');
    });

    socket.on('disconnect', () => {
        for (const key of socket.data.tetrisRooms || []) {
            const room = rooms.get(key);
            if (!room) continue;
            room.lobby.delete(socket.id);
            if (!room.game && room.lobby.size === 0) {
                stopTimer(room);
                rooms.delete(key);
            } else {
                broadcast(io, room, 'rs_tetris_lobby');
            }
        }
    });
}

module.exports = { handleConnection, closeMeeting };
