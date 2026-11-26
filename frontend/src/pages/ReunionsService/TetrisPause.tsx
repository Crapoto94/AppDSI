import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import {
    Gamepad2, Pause, Play, Trophy, X, RotateCw, ArrowLeft, ArrowRight, ArrowDown, ChevronsDown,
    Volume2, VolumeX, Hourglass,
} from 'lucide-react';

interface ClearInfo { seq: number; rows: number[]; count: number; at: number }

interface TetrisPlayer {
    id: string;
    name: string;
    lines: number;
    score: number;
    eliminated: boolean;
    cells: string[];
    next: { color: number; mat: number[][] } | null;
    clear?: ClearInfo | null;
}

interface TetrisState {
    w: number;
    h: number;
    timeLeft: number;
    level: number;
    players: TetrisPlayer[];
    ranking: { id: string; name: string; score: number; lines: number; eliminated?: boolean }[] | null;
}

interface TetrisSnapshot {
    meetingId: number;
    itemId: number;
    status: 'lobby' | 'playing' | 'done';
    state: TetrisState | null;
    lobby: { id: string; name: string }[];
    ranking: { id: string; name: string; score: number; lines: number }[] | null;
}

const COLORS: Record<number, string> = {
    1: '#06b6d4', 2: '#facc15', 3: '#a855f7', 4: '#22c55e', 5: '#ef4444', 6: '#3b82f6', 7: '#f97316',
};

const CELL_ME = 24;
const CELL_OPP = 17;

export default function TetrisPause({
    socket, meetingId, itemId, playerName, allowed = true, onClose,
}: {
    socket: Socket | null;
    meetingId: number;
    itemId: number;
    playerName: string;
    allowed?: boolean;
    onClose: () => void;
}) {
    const [snap, setSnap] = useState<TetrisSnapshot | null>(null);
    const [blockedMessage, setBlockedMessage] = useState('');
    const [soundOn, setSoundOn] = useState(true);
    const joinedRef = useRef(false);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    const canJoin = allowed && !blockedMessage;

    useEffect(() => {
        if (!socket) return;
        const matches = (p: TetrisSnapshot) => Number(p?.meetingId) === meetingId && Number(p?.itemId) === itemId;
        const onSnap = (p: TetrisSnapshot) => { if (matches(p)) { setBlockedMessage(''); setSnap(p); } };
        const onBlocked = (p: { meetingId?: number; itemId?: number; message?: string }) => {
            if (Number(p?.meetingId) === meetingId && Number(p?.itemId) === itemId) {
                joinedRef.current = false;
                setBlockedMessage(p?.message || 'Attendez que le maître du temps mette la réunion sur la pause.');
            }
        };
        // Le maître du temps a quitté la pause : le jeu disparaît pour tout le monde.
        const onClosed = (p: { meetingId?: number }) => {
            if (Number(p?.meetingId) === meetingId) onCloseRef.current();
        };

        socket.on('rs_tetris', onSnap);
        socket.on('rs_tetris_lobby', onSnap);
        socket.on('rs_tetris_started', onSnap);
        socket.on('rs_tetris_finished', onSnap);
        socket.on('rs_tetris_blocked', onBlocked);
        socket.on('rs_tetris_closed', onClosed);
        if (canJoin) {
            socket.emit('tetris_join', { meetingId, itemId, name: playerName });
            joinedRef.current = true;
        }

        const leave = () => {
            if (joinedRef.current) {
                socket.emit('tetris_leave', { meetingId, itemId });
                joinedRef.current = false;
            }
        };
        window.addEventListener('beforeunload', leave);
        return () => {
            leave();
            socket.off('rs_tetris', onSnap);
            socket.off('rs_tetris_lobby', onSnap);
            socket.off('rs_tetris_started', onSnap);
            socket.off('rs_tetris_finished', onSnap);
            socket.off('rs_tetris_blocked', onBlocked);
            socket.off('rs_tetris_closed', onClosed);
            window.removeEventListener('beforeunload', leave);
        };
    }, [socket, meetingId, itemId, playerName, canJoin]);

    useEffect(() => {
        if (!socket || !snap || snap.status === 'lobby') return;
        const onKey = (e: KeyboardEvent) => {
            let dir = '';
            if (e.key === 'ArrowLeft') dir = 'left';
            else if (e.key === 'ArrowRight') dir = 'right';
            else if (e.key === 'ArrowUp') dir = 'rotate';
            else if (e.key === 'ArrowDown') dir = 'down';
            else if (e.key === ' ') dir = 'drop';
            if (!dir) return;
            e.preventDefault();
            socket.emit('tetris_move', { meetingId, itemId, dir });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [socket, snap, meetingId, itemId]);

    useTetrisMusic(snap?.status === 'playing' && soundOn && canJoin);

    const myId = socket?.id || '';
    const state = snap?.state || null;
    const me = state?.players.find(p => p.id === myId) || null;
    const myClearSeq = Number(me?.clear?.seq || 0);
    const myClearCount = Number(me?.clear?.count || 0);
    const lastSfxSeq = useRef(0);
    useEffect(() => {
        if (!soundOn || !myClearSeq || myClearSeq === lastSfxSeq.current) return;
        lastSfxSeq.current = myClearSeq;
        playLineSfx(myClearCount || 1);
    }, [myClearSeq, myClearCount, soundOn]);
    const others = (state?.players || []).filter(p => p.id !== myId);
    const inLobby = !!snap?.lobby?.some(p => p.id === myId);
    const players = state?.players || [];
    const sorted = [...players].sort((a, b) =>
        (b.eliminated ? 0 : 1) - (a.eliminated ? 0 : 1) || b.lines - a.lines || b.score - a.score
    );
    const alive = sorted.filter(p => !p.eliminated);
    const leader = sorted[0] || null;
    const best = alive[0] || leader;
    const second = leader && leader.id === myId ? (alive.find(p => p.id !== myId) || null) : leader;
    const rival = best && best.id === myId ? (alive.find(p => p.id !== myId) || null) : best;
    const topTwo = (alive.length >= 2 ? alive : sorted).slice(0, 2);
    const notInGame = !me;
    const isEliminated = !!me && me.eliminated;
    const spectator = notInGame || isEliminated;

    const level = Number(state?.level || 0);
    const lastLevel = useRef(0);
    useEffect(() => {
        if (!level) return;
        if (lastLevel.current && level > lastLevel.current && soundOn) playLevelSfx();
        lastLevel.current = level;
    }, [level, soundOn]);

    const join = () => {
        if (!socket || !canJoin) return;
        getAudioCtx();
        socket.emit('tetris_join', { meetingId, itemId, name: playerName });
        joinedRef.current = true;
    };
    const start = () => {
        if (!canJoin) return;
        getAudioCtx();
        socket?.emit('tetris_start', { meetingId, itemId });
    };
    const move = (dir: string) => { if (canJoin) socket?.emit('tetris_move', { meetingId, itemId, dir }); };
    const close = () => {
        if (socket && joinedRef.current) socket.emit('tetris_leave', { meetingId, itemId });
        joinedRef.current = false;
        onClose();
    };

    if (!allowed) {
        return (
            <Overlay onClose={close}>
                <Blocked text="Attendez que le maître du temps mette la réunion sur la pause." />
            </Overlay>
        );
    }

    return (
        <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <style>{`
                @keyframes rsTetrisFlash {
                    0% { opacity: 0; transform: scaleX(.2); }
                    30% { opacity: 1; transform: scaleX(1); }
                    100% { opacity: 0; transform: scaleX(1.05); }
                }
                @keyframes rsTetrisPop {
                    0% { opacity: 0; transform: translateY(6px) scale(.8); }
                    30% { opacity: 1; transform: translateY(0) scale(1.08); }
                    100% { opacity: 0; transform: translateY(-18px) scale(1); }
                }
                @keyframes rsLevelFlash {
                    0% { opacity: 0; }
                    12% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
            <div className="rsv-modal" style={{ maxWidth: 1080, width: 'min(98vw, 1080px)' }}>
                <div className="rsv-modal-head" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Pause size={18} /> Pause — Tetris multijoueur
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setSoundOn(v => !v)} title={soundOn ? 'Couper la musique' : 'Activer la musique'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', display: 'flex' }}>
                            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </button>
                        <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}><X size={18} /></button>
                    </div>
                </div>

                <div className="rsv-modal-body" style={{ background: '#0f172a', minHeight: 380, position: 'relative' }}>
                    {state && state.level > 1 && (
                        <div key={`lvl-${state.level}`} style={{
                            position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
                            background: 'radial-gradient(circle at 50% 40%, rgba(253,224,71,.5), rgba(253,224,71,0) 65%)',
                            animation: 'rsLevelFlash .95s ease-out forwards',
                        }}>
                            <div style={{
                                position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)',
                                color: '#fde047', fontWeight: 900, fontSize: '2rem',
                                textShadow: '0 0 24px #f59e0b, 0 3px 14px #000', whiteSpace: 'nowrap',
                            }}>NIVEAU {state.level}</div>
                        </div>
                    )}
                    {blockedMessage && <Blocked text={blockedMessage} />}
                    {!snap && !blockedMessage && (
                        <div style={{ color: '#cbd5e1', fontSize: '.9rem' }}>Connexion au jeu…</div>
                    )}

                    {snap && snap.status === 'lobby' && !blockedMessage && (
                        <div style={{ display: 'grid', gap: 14, justifyItems: 'center', padding: '1rem 0' }}>
                            <Gamepad2 size={44} color="#f59e0b" />
                            <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1.05rem' }}>Lobby de la pause</div>
                            <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>{snap.lobby.length} joueur(s) prêt(s)</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {snap.lobby.map(p => (
                                    <span key={p.id} style={{ padding: '.35rem .7rem', borderRadius: 999, background: '#1e293b', color: '#f8fafc', fontSize: '.8rem', fontWeight: 700 }}>
                                        {p.name}{p.id === myId ? ' (vous)' : ''}
                                    </span>
                                ))}
                                {snap.lobby.length === 0 && <span style={{ color: '#64748b', fontSize: '.85rem' }}>Aucun joueur pour l'instant.</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                {!inLobby ? (
                                    <button onClick={join} style={btn('#f59e0b', '#78350f')}><Gamepad2 size={15} /> Rejoindre</button>
                                ) : (
                                    <button onClick={start} style={btn('#22c55e', '#052e16')}><Play size={15} /> Lancer la partie</button>
                                )}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '.75rem' }}>La partie démarre pour tout le monde. Vous verrez votre écran et celui du 1er.</div>
                        </div>
                    )}

                    {snap && snap.status === 'playing' && state && !blockedMessage && (
                        <div>
                            {!spectator && me && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap',
                                    marginBottom: 10, padding: '.5rem .8rem', borderRadius: 10,
                                    background: '#111827', border: '1px solid #334155', color: '#e2e8f0', fontSize: '.8rem',
                                }}>
                                    <span>Vous : <b style={{ color: '#fbbf24' }}>{me.score}</b> pts · <b>{me.lines}</b> lignes</span>
                                    {best ? (
                                        best.id === myId ? (
                                            <span style={{ color: '#34d399', fontWeight: 700 }}>
                                                Vous êtes le meilleur{second ? ` · 2e : ${second.name} (${second.score} pts)` : ''}
                                            </span>
                                        ) : (
                                            <span>
                                                Meilleur : <b>{best.name}</b> — {best.score} pts / {best.lines} lignes · écart{' '}
                                                <b style={{ color: '#f87171' }}>+{Math.max(0, best.score - me.score)}</b> pts
                                            </span>
                                        )
                                    ) : <span>Aucun adversaire pour l'instant</span>}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
                                {spectator ? (
                                    <>
                                        <div style={{ flexBasis: '100%', textAlign: 'center', color: notInGame ? '#93c5fd' : '#fbbf24', fontWeight: 800, fontSize: '.9rem', marginBottom: 2 }}>
                                            {notInGame ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    Vous n'êtes pas encore dans la partie.
                                                    <button onClick={join} style={btn('#3b82f6', '#eff6ff')}><Gamepad2 size={14} /> Rejoindre la partie en cours</button>
                                                </span>
                                            ) : 'Vous êtes éliminé — voici les 2 meilleurs'}
                                        </div>
                                        {topTwo.map((p, i) => (
                                            <div key={p.id}>
                                                <div style={{ color: i === 0 ? '#fbbf24' : '#94a3b8', fontSize: '.8rem', marginBottom: 6, fontWeight: 700 }}>
                                                    {i + 1}{i === 0 ? 'er' : 'e'} : {p.name} · {p.score} pts · {p.lines} lignes
                                                </div>
                                                <BoardPane player={p} w={state.w} h={state.h} cell={i === 0 ? 21 : 19}
                                                    borderWidth={i === 0 ? 3 : 2} borderColor={i === 0 ? '#fbbf24' : '#334155'} emptyLabel="—" />
                                            </div>
                                        ))}
                                        {topTwo.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>Aucun joueur.</div>}
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '.8rem', marginBottom: 6, gap: 12 }}>
                                                <span><b>Votre écran</b></span>
                                                <span>⏱ {state.timeLeft}s · niv. {state.level}</span>
                                            </div>
                                            <BoardPane player={me} w={state.w} h={state.h} cell={CELL_ME} borderWidth={4} borderColor="#fbbf24" emptyLabel="Vous êtes éliminé" />
                                            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <Ctrl onClick={() => move('left')} label="Gauche"><ArrowLeft size={16} /></Ctrl>
                                                <Ctrl onClick={() => move('rotate')} label="Tourner"><RotateCw size={16} /></Ctrl>
                                                <Ctrl onClick={() => move('right')} label="Droite"><ArrowRight size={16} /></Ctrl>
                                                <Ctrl onClick={() => move('down')} label="Descendre"><ArrowDown size={16} /></Ctrl>
                                                <Ctrl onClick={() => move('drop')} label="Lâcher"><ChevronsDown size={16} /></Ctrl>
                                            </div>
                                            <div style={{ color: '#64748b', fontSize: '.7rem', textAlign: 'center', marginTop: 6 }}>← → ↑ ↓ et Espace · 0,25 s avant de bouger après un lâcher</div>
                                        </div>

                                        <div style={{ paddingTop: 30 }}>
                                            <div style={{ color: '#94a3b8', fontSize: '.8rem', marginBottom: 6, fontWeight: 700 }}>
                                                {rival ? `Meilleur : ${rival.name}` : 'En attente d\'un autre joueur'}
                                            </div>
                                            {me?.next && (
                                                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ color: '#94a3b8', fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Prochaine pièce</span>
                                                    <NextPreview mat={me.next.mat} color={me.next.color} />
                                                </div>
                                            )}
                                            <BoardPane player={rival} w={state.w} h={state.h} cell={CELL_OPP} borderWidth={2} borderColor="#334155" emptyLabel={rival ? 'Éliminé' : 'En attente d\'un autre joueur'} />
                                        </div>
                                    </>
                                )}

                                <div style={{ minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                                    <div style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Classement live</div>
                                    {[me, ...others].filter(Boolean).map((p, i) => (
                                        <div key={p!.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '.4rem .55rem', borderRadius: 8,
                                            marginBottom: 5, background: p!.id === myId ? '#1e3a8a' : '#1e293b',
                                            opacity: p!.eliminated ? 0.55 : 1,
                                        }}>
                                            <span style={{ width: 18, color: '#94a3b8', fontSize: '.72rem', fontWeight: 800 }}>{i + 1}</span>
                                            <span style={{ flex: 1, color: '#f8fafc', fontSize: '.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p!.id === myId ? 'Vous' : p!.name}</span>
                                            <span style={{ color: '#fbbf24', fontSize: '.75rem', fontWeight: 800 }}>{p!.score}</span>
                                            <span style={{ color: '#94a3b8', fontSize: '.68rem' }}>{p!.lines}L</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {snap && snap.status === 'done' && !blockedMessage && (
                        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', padding: '1rem 0' }}>
                            <Trophy size={44} color="#fbbf24" />
                            <div style={{ color: '#f8fafc', fontWeight: 900, fontSize: '1.1rem' }}>Partie terminée</div>
                            <div style={{ width: 'min(100%, 380px)' }}>
                                {(snap.ranking || snap.state?.ranking || []).map((r, i) => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.45rem .6rem', borderRadius: 8, marginBottom: 5, background: r.id === myId ? '#1e3a8a' : '#1e293b' }}>
                                        <span style={{ width: 20, color: '#fbbf24', fontWeight: 900 }}>{i + 1}</span>
                                        <span style={{ flex: 1, color: '#f8fafc', fontSize: '.85rem', fontWeight: 700 }}>{r.id === myId ? 'Vous' : r.name}</span>
                                        <span style={{ color: '#fbbf24', fontSize: '.8rem', fontWeight: 800 }}>{r.score}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '.7rem' }}>{r.lines}L</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={join} style={btn('#f59e0b', '#78350f')}><Gamepad2 size={15} /> Rejoindre le lobby</button>
                                <button onClick={start} style={btn('#22c55e', '#052e16')}><Play size={15} /> Nouvelle partie</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
    return (
        <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rsv-modal" style={{ maxWidth: 520 }}>
                <div className="rsv-modal-head" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Pause size={18} /> Pause — Tetris
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}><X size={18} /></button>
                </div>
                <div className="rsv-modal-body" style={{ background: '#0f172a' }}>{children}</div>
            </div>
        </div>
    );
}

function Blocked({ text }: { text: string }) {
    return (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', padding: '2rem 1rem', textAlign: 'center' }}>
            <Hourglass size={40} color="#fbbf24" />
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '1rem' }}>La partie n'est pas encore ouverte</div>
            <div style={{ color: '#cbd5e1', fontSize: '.85rem', maxWidth: 380 }}>{text}</div>
            <div style={{ color: '#64748b', fontSize: '.75rem' }}>Le jeu sera disponible dès que le maître du temps sera sur la rubrique de pause.</div>
        </div>
    );
}

function BoardPane({ player, w, h, cell, borderWidth, borderColor, emptyLabel }: {
    player: TetrisPlayer | null; w: number; h: number; cell: number; borderWidth: number; borderColor: string; emptyLabel: string;
}) {
    if (!player || player.eliminated) {
        return (
            <div style={{
                width: w * cell, height: h * cell, display: 'grid', placeItems: 'center', textAlign: 'center',
                background: '#111827', border: `${borderWidth}px solid ${borderColor}`, borderRadius: 8, color: '#94a3b8',
                fontWeight: 700, fontSize: '.8rem', padding: 8,
                boxShadow: borderWidth >= 4 ? '0 0 18px rgba(251,191,36,.35)' : 'none',
            }}>{emptyLabel}</div>
        );
    }
    return <Board player={player} w={w} h={h} cell={cell} borderWidth={borderWidth} borderColor={borderColor} />;
}

function Board({ player, w, h, cell, borderWidth, borderColor }: {
    player: TetrisPlayer; w: number; h: number; cell: number; borderWidth: number; borderColor: string;
}) {
    // Animation de suppression de ligne : l'info vient du moteur (seq + lignes).
    // La clé inclut la séquence : chaque nouvelle suppression rejoue l'animation.
    // L'animation se termine en opacité 0 (« forwards »), donc rien ne reste visible.
    const clear = player.clear;

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${w}, ${cell}px)`, gridTemplateRows: `repeat(${h}, ${cell}px)`,
                background: '#020617', border: `${borderWidth}px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden',
                boxShadow: borderWidth >= 4 ? '0 0 20px rgba(251,191,36,.35)' : 'none',
            }}>
                {player.cells.flatMap((row, y) => row.split('').map((ch, x) => {
                    const v = Number(ch) || 0;
                    return (
                        <div key={`${y}-${x}`} style={{
                            width: cell, height: cell,
                            background: v ? COLORS[v] || '#e2e8f0' : (y % 2 === 0 ? '#0b1220' : '#0f172a'),
                            boxShadow: v ? 'inset 0 0 0 1px rgba(255,255,255,.18)' : 'inset 0 0 0 .5px rgba(148,163,184,.08)',
                        }} />
                    );
                }))}
            </div>
            {clear && (clear.rows || []).map(y => (
                <div key={`flash-${clear.seq}-${y}`} style={{
                    position: 'absolute', left: 0, width: w * cell, height: cell,
                    top: y * cell, background: 'linear-gradient(90deg,transparent 0%,#fde047 20%,#fff 50%,#fde047 80%,transparent 100%)',
                    animation: 'rsTetrisFlash .48s ease-out forwards', pointerEvents: 'none',
                    boxShadow: '0 0 14px #fde047',
                }} />
            ))}
            {clear && (
                <div key={`pop-${clear.seq}`} style={{
                    position: 'absolute', left: '50%', top: '36%', transform: 'translateX(-50%)',
                    color: (clear.count || 0) >= 4 ? '#fef08a' : '#fde047', fontWeight: 900,
                    fontSize: (clear.count || 0) >= 4 ? '1.7rem' : '1.3rem',
                    textShadow: (clear.count || 0) >= 4 ? '0 0 20px #f59e0b, 0 2px 12px #000' : '0 2px 12px #000',
                    animation: 'rsTetrisPop .9s ease-out forwards', pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>{(clear.count || 0) >= 4 ? 'PERFECT !' : (clear.count || 0) > 1 ? `${clear.count} LIGNES !` : 'LIGNE !'}</div>
            )}
        </div>
    );
}

function NextPreview({ mat, color }: { mat: number[][]; color: number }) {
    const cell = 14;
    return (
        <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${mat[0]?.length || 4}, ${cell}px)`, background: '#020617', padding: 4, borderRadius: 6 }}>
            {(mat || []).flatMap((row, y) => row.map((v, x) => (
                <div key={`${y}-${x}`} style={{
                    width: cell, height: cell,
                    background: v ? COLORS[color] || '#e2e8f0' : 'transparent',
                    boxShadow: v ? 'inset 0 0 0 1px rgba(255,255,255,.18)' : 'none',
                }} />
            )))}
        </div>
    );
}

function Ctrl({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
    return (
        <button onClick={onClick} title={label} style={{
            width: 46, height: 40, borderRadius: 9, border: '1px solid #475569', background: '#1e293b',
            color: '#f8fafc', display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}>{children}</button>
    );
}

function btn(bg: string, color: string): CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '.55rem 1rem', borderRadius: 9,
        background: bg, color, border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '.85rem',
    };
}

// ---------------------------------------------------------------------------
// Musique : mélodie traditionnelle « Korobeiniki » (domaine public), synthèse
// Web Audio (aucun fichier externe, aucun risque de licence).
// ---------------------------------------------------------------------------
const MELODY: [string, number][] = [
    ['E5', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['C5', 1], ['B4', 1],
    ['A4', 2], ['A4', 1], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 3], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 2], ['A4', 2],
    ['D5', 3], ['F5', 1], ['A5', 2], ['G5', 1], ['F5', 1],
    ['E5', 3], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 2], ['A4', 2],
];

function noteFreq(note: string): number {
    const m = /^([A-G])(#|b)?(\d)$/.exec(note);
    if (!m) return 440;
    const semis: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const name = m[1] + (m[2] === '#' ? '#' : '');
    const octave = Number(m[3]);
    const midi = (octave + 1) * 12 + (semis[name] ?? 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function playNote(ctx: AudioContext, note: string, when: number, dur: number) {
    const f = noteFreq(note);
    const voices: [OscillatorType, number, number][] = [
        ['square', 1, 0.035],
        ['triangle', 0.5, 0.02],
    ];
    for (const [type, mult, gain] of voices) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(gain, when + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.06, dur * 0.92));
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + Math.max(0.07, dur * 0.95));
    }
}

let SHARED_AUDIO: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
    if (!SHARED_AUDIO) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        SHARED_AUDIO = new AC();
    }
    SHARED_AUDIO.resume().catch(() => null);
    return SHARED_AUDIO;
}

/** Petit jingle de ligne (et fanfare « perfect » pour 4 lignes). */
function playLineSfx(count: number) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const perfect = count >= 4;
    const notes = perfect ? ['C6', 'E6', 'G6', 'C7'] : ['E6', 'B6'];
    const step = perfect ? 0.1 : 0.08;
    let when = ctx.currentTime + 0.01;
    for (const note of notes) {
        const f = noteFreq(note);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = f;
        const gain = perfect ? 0.075 : 0.055;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(gain, when + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + 0.2);
        when += step;
    }
}

/** Petit son de montée de niveau (accord ascendant). */
function playLevelSfx() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const notes = ['C5', 'E5', 'G5', 'C6'];
    let when = ctx.currentTime + 0.01;
    for (const note of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = noteFreq(note);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.06, when + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + 0.24);
        when += 0.075;
    }
}

function useTetrisMusic(active: boolean) {
    useEffect(() => {
        if (!active) return;
        const ctx = getAudioCtx();
        if (!ctx) return;

        const BEAT = 0.17;
        let stopped = false;
        let when = ctx.currentTime + 0.1;
        let idx = 0;
        let timer: number | null = null;

        const schedule = () => {
            if (stopped) return;
            while (when < ctx.currentTime + 1.5) {
                const [note, len] = MELODY[idx % MELODY.length];
                const dur = len * BEAT;
                playNote(ctx, note, when, dur);
                when += dur;
                idx += 1;
            }
            timer = window.setTimeout(schedule, 300);
        };
        schedule();

        return () => {
            stopped = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [active]);
}
