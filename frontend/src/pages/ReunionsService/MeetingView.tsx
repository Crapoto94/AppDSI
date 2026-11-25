import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import Header from '../../components/Header';
import AgentSearch from '../../components/AgentSearch';
import type { AgentOption } from '../../components/AgentSearch';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';
import { ReunionServiceRichEditor, ReunionRichContent } from '../../components/ReunionServiceRichEditor';
import { PollComposerModal, PollCard, PollAnswerForm } from './InteractPoll';
import type { Poll } from './InteractPoll';
import TetrisPause from './TetrisPause';
import KpiSnapshots from './KpiSnapshots';
import type { KpiSnapshot } from './KpiSnapshots';
import type { KpiConfig } from './KpiConfigurator';
import useReunionAccess from './useReunionAccess';
import { useAuth } from '../../contexts/AuthContext';
import {
    ArrowLeft, Play, Square, Timer, ListChecks, FileText, Plus, Pencil, Trash2,
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ZoomIn, ZoomOut, Eye, EyeOff, Paperclip, Upload, X,
    Calendar, RotateCcw, Save, Radio, Video, Building2, Link2, ExternalLink, Search, RefreshCw, Sparkles,
    Pause, Gamepad2, GripVertical, User,
} from 'lucide-react';

interface Attachment {
    id: number;
    item_id?: number | null;
    original_name: string;
    filename?: string;
    mimetype?: string | null;
    size?: number | null;
    uploaded_by_name?: string | null;
}

interface Item {
    id: number;
    section_id: number;
    title: string;
    content_html: string;
    created_by_name?: string | null;
    updated_at?: string | null;
    attachments: Attachment[];
}

interface Section {
    id: number;
    title: string;
    duration_minutes: number;
    position: number;
    is_meta: boolean;
    is_pause?: boolean;
    completed?: boolean;
    // KPI : configuration recopiée du modèle, instantanés figés au lancement.
    kpis_config?: KpiConfig[];
    kpi_snapshots?: KpiSnapshot[] | null;
    kpi_computed_at?: string | null;
    items: Item[];
}

interface Participant {
    id: number;
    email: string;
    name: string;
    username?: string | null;
    present?: boolean;
    excused?: boolean;
    service?: string | null;
}

interface Meeting {
    id: number;
    title: string;
    meeting_date?: string | null;
    created_at?: string;
    status: 'planned' | 'in_progress' | 'finished';
    template_name?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
    time_master_username?: string | null;
    time_master_name?: string | null;
    current_section_id?: number | null;
    current_section_started_at?: string | null;
    zoom?: number | null;
    meeting_mode?: 'presentiel' | 'distanciel' | null;
    transcript_meeting_id?: number | null;
    teams_meeting_id?: string | null;
    teams_transcript_id?: string | null;
    teams_subject?: string | null;
    teams_start?: string | null;
    transcript?: {
        id: number;
        title?: string | null;
        summary?: string | null;
        summary_model?: string | null;
        summary_requested_at?: string | null;
        meeting_date?: string | null;
        source?: string | null;
    } | null;
    sections: Section[];
    participants: Participant[];
    attachments: Attachment[];
    polls?: Poll[];
    total_duration?: number;
}

interface LiveState {
    meetingId: number;
    status: string;
    masterUsername: string | null;
    masterName: string | null;
    currentSectionId: number | null;
    sectionStartedAt?: number | null;
    zoom: number;
    anchor: { itemId?: number; ratio?: number } | null;
    revision: number;
    byUsername: string | null;
    you?: { username?: string | null; name?: string | null };
}

interface ApiErrorLike {
    response?: { data?: { error?: string } };
    message?: string;
}

interface ExchangeMeeting {
    eventId: string;
    subject: string;
    startDateTime: string | null;
    endDateTime?: string | null;
    organizer?: string | null;
    location?: string | null;
    isOnline?: boolean;
    joinUrl?: string | null;
    meetingId?: string | null;
    transcriptId?: string | null;
    participants?: string[];
    participantEmails?: string[];
}

interface TranscriptItem {
    id: number;
    title: string;
    meeting_date?: string | null;
    summary?: string | null;
}

const STATUS_LABEL: Record<string, string> = { planned: 'Planifiée', in_progress: 'En cours', finished: 'Terminée' };
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
    planned: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    in_progress: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    finished: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
};

const fmtDuration = (min?: number) => {
    const m = Number(min) || 0;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`;
};
const fmtDate = (d?: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return '—'; }
};
const fmtElapsed = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n: number) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};

/** Petit signal sonore lors du dépassement du temps d'une rubrique. */
function playOverrunBeep() {
    try {
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
        const AudioCtor = Ctx.AudioContext || Ctx.webkitAudioContext;
        if (!AudioCtor) return;
        const ctx = new AudioCtor();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 660;
        gain.gain.value = 0.07;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
        setTimeout(() => ctx.close().catch(() => undefined), 500);
    } catch { /* audio indisponible */ }
}

const TIME_PALETTES = {
    green: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', strong: '#15803d', pillBg: '#dcfce7' },
    orange: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', strong: '#c2410c', pillBg: '#ffedd5' },
    red: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', strong: '#dc2626', pillBg: '#fee2e2' },
    neutral: { bg: '#f8fafc', border: '#e2e8f0', text: '#334155', strong: '#475569', pillBg: '#f1f5f9' },
} as const;

export default function ReunionServiceMeetingView() {
    const { token, user } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const meetingId = Number(id);

    const [meeting, setMeeting] = useState<Meeting | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
    const [following, setFollowing] = useState(true);
    const [live, setLive] = useState<LiveState | null>(null);
    const [presenceCount, setPresenceCount] = useState(0);
    const [joinToasts, setJoinToasts] = useState<{ id: string; text: string }[]>([]);
    const [itemModal, setItemModal] = useState<{ sectionId: number; item?: Item } | null>(null);
    const [showTetris, setShowTetris] = useState<{ itemId: number; sectionId: number; title?: string } | null>(null);
    const [dragSectionId, setDragSectionId] = useState<number | null>(null);
    const [dragItemId, setDragItemId] = useState<number | null>(null);
    const [showStartModal, setShowStartModal] = useState(false);
    const [startMaster, setStartMaster] = useState<string>('');
    const [starting, setStarting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [claimingMaster, setClaimingMaster] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [meetingDocUploading, setMeetingDocUploading] = useState(false);
    // Lien avec le compte rendu / transcript Teams
    const [showTeamsModal, setShowTeamsModal] = useState(false);
    const [showTranscriptModal, setShowTranscriptModal] = useState(false);
    const [teamsList, setTeamsList] = useState<ExchangeMeeting[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(false);
    const [teamsError, setTeamsError] = useState('');
    const [teamsSelected, setTeamsSelected] = useState('');
    const [transcriptList, setTranscriptList] = useState<TranscriptItem[]>([]);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [transcriptSearch, setTranscriptSearch] = useState('');
    const [transcriptBusy, setTranscriptBusy] = useState(false);
    const [transcriptStep, setTranscriptStep] = useState('');
    const [transcriptError, setTranscriptError] = useState('');
    const [transcriptSelected, setTranscriptSelected] = useState<number | ''>('');
    // INTERACTs (sondages)
    const [polls, setPolls] = useState<Poll[]>([]);
    const [showPollComposer, setShowPollComposer] = useState(false);
    const [pollBusy, setPollBusy] = useState(false);
    const [myAnswers, setMyAnswers] = useState<Map<number, unknown>>(new Map());
    const [dismissedPolls, setDismissedPolls] = useState<Set<number>>(new Set());

    const socketRef = useRef<Socket | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const followingRef = useRef(true);
    const meetingIdRef = useRef(meetingId);
    const statusRef = useRef<string | undefined>(undefined);
    const lastScrollEmit = useRef(0);
    const overrunAlertedRef = useRef<string>('');
    const selfPresenceRef = useRef<number | null>(null);
    const wasMasterRef = useRef(false);
    const pollModalBodyRef = useRef<HTMLDivElement | null>(null);
    const openPollIdRef = useRef<number | null>(null);
    const lastPollScrollEmit = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
    const me = String(user?.username || '').toLowerCase();

    useEffect(() => { followingRef.current = following; }, [following]);
    useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);
    useEffect(() => { statusRef.current = meeting?.status; }, [meeting?.status]);

    const reload = useCallback(async () => {
        if (!token || !meetingId) return null;
        try {
            const res = await axios.get(`/api/reunions-service/meetings/${meetingId}`, auth);
            const m: Meeting = res.data;
            setMeeting(m);
            setPolls(Array.isArray(m.polls) ? m.polls : []);
            setMyAnswers(prev => {
                const next = new Map(prev);
                for (const p of (m.polls || [])) {
                    if (p.my_answer !== undefined && p.my_answer !== null) next.set(p.id, p.my_answer);
                }
                return next;
            });
            setSelectedSectionId(prev => {
                if (prev && m.sections.some(s => s.id === prev)) return prev;
                return m.sections[0]?.id ?? null;
            });
            // Repli HTTP de l'auto-présence : à l'ouverture d'une séance en
            // cours, l'utilisateur connecté est marqué présent même si le
            // socket n'est pas encore établi (le mécanisme socket reste actif).
            if (m.status === 'in_progress' && selfPresenceRef.current !== m.id) {
                selfPresenceRef.current = m.id;
                try {
                    const pr = await axios.post(`/api/reunions-service/meetings/${m.id}/presence/self`, {}, auth);
                    if (pr.data?.changed) {
                        const fresh = await axios.get(`/api/reunions-service/meetings/${m.id}`, auth);
                        setMeeting(fresh.data);
                    }
                } catch (e) {
                    console.error('[REUNIONS-SERVICE] auto-présence HTTP:', e);
                }
            }
            return m;
        } catch (e) {
            const err = e as ApiErrorLike;
            setError(err?.response?.data?.error || 'Erreur de chargement');
            return null;
        } finally {
            setLoading(false);
        }
    }, [token, meetingId, auth]);

    // Recalcule les KPI figés (réservé au maître du temps / admin) : utile si un
    // indicateur a échoué au lancement ou si les données ont été corrigées après.
    const [refreshingKpis, setRefreshingKpis] = useState(false);
    const refreshKpis = async () => {
        setRefreshingKpis(true);
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/kpis/refresh`, {}, auth);
            await reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible de recalculer les KPI.');
        } finally { setRefreshingKpis(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setLoading(true); reload(); }, [meetingId, token]);

    // Horloge pour le temps écoulé en séance
    useEffect(() => {
        if (meeting?.status !== 'in_progress') return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [meeting?.status]);

    // Filet de sécurité temps réel : même sans événement socket (reconnexion,
    // onglet ancien), l'INTERACT en cours est récupéré toutes les 12 s et
    // s'affiche sur tous les postes connectés.
    useEffect(() => {
        if (!token || !meetingId) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const res = await axios.get(`/api/reunions-service/meetings/${meetingId}/polls/current`, auth);
                if (cancelled) return;
                const p = res.data?.poll;
                if (!p) return;
                setPolls(prev => {
                    const idx = prev.findIndex(x => x.id === p.id);
                    if (idx >= 0) {
                        const next = [...prev];
                        next[idx] = { ...next[idx], ...p };
                        return next;
                    }
                    return [p, ...prev];
                });
                if (res.data.my_answer !== null && res.data.my_answer !== undefined) {
                    setMyAnswers(prev => new Map(prev).set(p.id, res.data.my_answer));
                }
            } catch { /* silencieux */ }
        };
        const timer = setInterval(tick, 12000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [token, meetingId, auth]);

    // Socket temps réel
    useEffect(() => {
        if (!token || !meetingId) return;
        const socket = io({ auth: { token } });
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('rs_join', { meetingId }));
        socket.on('rs_state', async (st: LiveState) => {
            setLive(st);
            const current = meetingIdRef.current;
            if (st.meetingId !== current) return;
            // Rafraîchit immédiatement le maître du temps affiché pour tout le monde.
            setMeeting(m => {
                if (!m) return m;
                const nextName = st.masterName ?? m.time_master_name ?? null;
                const nextUser = st.masterUsername ?? m.time_master_username ?? null;
                if (nextName === (m.time_master_name ?? null) && nextUser === (m.time_master_username ?? null)) return m;
                return { ...m, time_master_name: nextName, time_master_username: nextUser };
            });
            if (followingRef.current) {
                setSelectedSectionId(st.currentSectionId ?? null);
            }
            if (st.byUsername !== me && followingRef.current) {
                requestAnimationFrame(() => applyAnchor(st.anchor));
            }
            // Changement de statut (démarrage / fin) : on recharge la fiche.
            const m = await axios.get(`/api/reunions-service/meetings/${current}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
            if (m?.data && m.data.status !== statusRef.current) reload();
        });
        socket.on('rs_content', () => { reload(); });
        socket.on('rs_presence', (p: { count?: number }) => setPresenceCount(p?.count || 0));
        socket.on('rs_poll', (p: { poll?: Poll }) => {
            const poll = p?.poll;
            if (!poll) return;
            setPolls(prev => [poll, ...prev.filter(x => x.id !== poll.id)]);
            setDismissedPolls(prev => { const n = new Set(prev); n.delete(poll.id); return n; });
        });
        socket.on('rs_poll_results', (p: { poll?: Poll; results?: Poll['results'] }) => {
            if (!p?.poll) return;
            setPolls(prev => prev.map(x => x.id === p.poll!.id ? { ...x, ...p.poll, results: p.results } : x));
        });
        socket.on('rs_poll_closed', (p: { poll?: Poll; results?: Poll['results'] }) => {
            if (!p?.poll) return;
            setPolls(prev => prev.map(x => x.id === p.poll!.id ? { ...x, ...p.poll, status: 'closed', results: p.results } : x));
        });
        socket.on('rs_poll_deleted', (p: { pollId?: number }) => {
            if (!p?.pollId) return;
            setPolls(prev => prev.filter(x => x.id !== p.pollId));
        });
        socket.on('rs_poll_scroll', (p: { pollId?: number | null; ratio?: number; byUsername?: string }) => {
            if (String(p?.byUsername || '').toLowerCase() === me) return;
            const el = pollModalBodyRef.current;
            if (!el) return;
            if (p?.pollId && openPollIdRef.current && p.pollId !== openPollIdRef.current) return;
            const max = el.scrollHeight - el.clientHeight;
            el.scrollTop = max * Math.min(1, Math.max(0, Number(p?.ratio) || 0));
        });
        socket.on('rs_master_changed', (p: { name?: string; username?: string }) => {
            const isMe = String(p?.username || '').toLowerCase() === me;
            const id = `master-changed-${Date.now()}-${Math.random()}`;
            const text = isMe
                ? 'Vous êtes désormais maître du temps'
                : `${p?.name || p?.username || 'Un participant'} est désormais maître du temps`;
            setJoinToasts(prev => [...prev.slice(-3), { id, text }]);
            setTimeout(() => setJoinToasts(prev => prev.filter(t => t.id !== id)), 7000);
            // Met à jour le nom affiché pour tous les écrans sans attendre un F5.
            setMeeting(m => m ? {
                ...m,
                time_master_name: p?.name || m.time_master_name || null,
                time_master_username: p?.username ? String(p.username).toLowerCase() : m.time_master_username,
            } : m);
        });
        socket.on('rs_joined', (p: { name?: string; username?: string; at?: number }) => {
            const isMe = String(p?.username || '').toLowerCase() === me;
            const id = `${p?.username || p?.name || 'x'}-${p?.at || Date.now()}-${Math.random()}`;
            const text = isMe
                ? 'Vous avez rejoint la réunion'
                : `${p?.name || p?.username || 'Un participant'} a rejoint la réunion`;
            setJoinToasts(prev => [...prev.slice(-3), { id, text }]);
            setTimeout(() => setJoinToasts(prev => prev.filter(t => t.id !== id)), 6000);
        });
        return () => { socket.disconnect(); socketRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, meetingId]);

    const isMaster = (String(meeting?.time_master_username || '').toLowerCase() === me && !!me)
        || (!!live?.masterUsername && live.masterUsername === me);
    const isAdmin = useReunionAccess();
    const isLive = meeting?.status === 'in_progress';
    const currentLiveSectionId = Number(live?.currentSectionId || 0);
    const isPauseLive = (sectionId: number) => isLive && currentLiveSectionId > 0 && currentLiveSectionId === sectionId;

    // Popup si le rôle de maître du temps est perdu en cours de séance.
    useEffect(() => {
        if (wasMasterRef.current && !isMaster && meeting?.status === 'in_progress') {
            const id = `master-${Date.now()}-${Math.random()}`;
            const text = live?.masterName
                ? `Vous n'êtes plus maître du temps (nouveau maître : ${live.masterName})`
                : "Vous n'êtes plus maître du temps";
            setJoinToasts(prev => [...prev.slice(-3), { id, text }]);
            setTimeout(() => setJoinToasts(prev => prev.filter(t => t.id !== id)), 9000);
        }
        wasMasterRef.current = isMaster;
    }, [isMaster, live?.masterName, meeting?.status]);

    const sections = meeting?.sections || [];
    const displayedSectionId = isLive && following && live?.currentSectionId
        ? live.currentSectionId
        : selectedSectionId;
    const displayedSection = sections.find(s => s.id === displayedSectionId) || sections[0] || null;
    const isInteractSection = !!displayedSection && displayedSection.title.trim().toUpperCase() === 'INTERACT';
    const openPoll = polls.find(p => p.status === 'open') || null;
    const myOpenPollAnswer = openPoll ? myAnswers.get(openPoll.id) : undefined;
    const showPollPopup = !!openPoll && myOpenPollAnswer === undefined
        && !dismissedPolls.has(openPoll.id)
        && meeting?.status !== 'finished';
    const canManagePoll = (poll: Poll) => isMaster || isAdmin
        || (poll.created_by || '').toLowerCase() === me;
    const canManageStructure = isMaster || isAdmin;

    const addPauseSection = async () => {
        const title = window.prompt('Titre de la pause ?', 'Pause');
        if (title === null) return;
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/sections`,
                { title: title.trim() || 'Pause', duration_minutes: 10, is_pause: true }, auth);
            reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible d\'ajouter la pause.');
        }
    };

    const removeSection = async (section: Section) => {
        if (!section || section.is_meta) return;
        if (!window.confirm(`Supprimer la rubrique « ${section.title} » et tout son contenu ?`)) return;
        try {
            await axios.delete(`/api/reunions-service/sections/${section.id}`, auth);
            reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible de supprimer la rubrique.');
        }
    };

    const moveSection = async (section: Section, dir: -1 | 1) => {
        if (!section || section.is_meta) return;
        const ordered = [...sections].sort((a, b) => a.position - b.position || a.id - b.id);
        const idx = ordered.findIndex(s => s.id === section.id);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= ordered.length) return;
        if (ordered[target].is_meta) return;
        [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
        try {
            await axios.patch(`/api/reunions-service/meetings/${meetingId}/sections/order`,
                { ids: ordered.map(s => s.id) }, auth);
            reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible de réordonner les rubriques.');
        }
    };

    const reorderItemsByDrag = async (sourceId: number, targetId: number) => {
        if (!displayedSection || sourceId === targetId) return;
        const items = [...displayedSection.items];
        const from = items.findIndex(i => i.id === sourceId);
        const to = items.findIndex(i => i.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        try {
            await axios.patch(
                `/api/reunions-service/meetings/${meetingId}/sections/${displayedSection.id}/items/order`,
                { ids: items.map(i => i.id) }, auth
            );
            reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible de réordonner les items.');
        }
    };

    const reorderSectionsByDrag = async (sourceId: number, targetId: number) => {
        if (!canManageStructure || sourceId === targetId) return;
        const ordered = [...sections].sort((a, b) => a.position - b.position || a.id - b.id);
        const from = ordered.findIndex(s => s.id === sourceId);
        const to = ordered.findIndex(s => s.id === targetId);
        if (from < 0 || to < 0 || ordered[from].is_meta) return;
        const [moved] = ordered.splice(from, 1);
        ordered.splice(to, 0, moved);
        const meta = ordered.filter(s => s.is_meta);
        const rest = ordered.filter(s => !s.is_meta);
        try {
            await axios.patch(`/api/reunions-service/meetings/${meetingId}/sections/order`,
                { ids: [...meta, ...rest].map(s => s.id) }, auth);
            reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            window.alert(err?.response?.data?.error || 'Impossible de réordonner les rubriques.');
        }
    };

    useEffect(() => { openPollIdRef.current = openPoll?.id ?? null; }, [openPoll?.id]);

    const liveIndex = sections.findIndex(s => s.id === live?.currentSectionId);
    const currentIndex = liveIndex >= 0 ? liveIndex : sections.findIndex(s => s.id === displayedSectionId);

    // ── Gestion du temps : rubrique courante, bandeau coloré et fin prévue ──
    const currentLiveSection = currentIndex >= 0 ? sections[currentIndex] : null;
    const sectionDurationMs = (Number(currentLiveSection?.duration_minutes) || 0) * 60000;
    const sectionStartMs = live?.sectionStartedAt
        || (meeting?.current_section_started_at ? new Date(meeting.current_section_started_at).getTime() : null)
        || (meeting?.started_at ? new Date(meeting.started_at).getTime() : null);
    const sectionElapsedMs = sectionStartMs ? Math.max(0, now - sectionStartMs) : 0;
    const sectionRatio = sectionDurationMs > 0 ? sectionElapsedMs / sectionDurationMs : 0;
    const timeLevel: keyof typeof TIME_PALETTES = sectionDurationMs <= 0
        ? 'neutral'
        : sectionRatio <= 0.8 ? 'green' : sectionRatio <= 1 ? 'orange' : 'red';
    const palette = TIME_PALETTES[timeLevel];
    const overrunMs = sectionDurationMs > 0 ? Math.max(0, sectionElapsedMs - sectionDurationMs) : 0;
    const remainingAfterMs = currentIndex >= 0
        ? sections.slice(currentIndex + 1).reduce((sum, s) => sum + (Number(s.duration_minutes) || 0) * 60000, 0)
        : 0;
    const currentRemainingMs = sectionDurationMs > 0 ? Math.max(0, sectionDurationMs - sectionElapsedMs) : 0;
    const expectedEndMs = isLive && currentIndex >= 0
        ? now + currentRemainingMs + remainingAfterMs
        : null;
    const expectedEndLabel = expectedEndMs
        ? new Date(expectedEndMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—';

    const zoomPct = Math.round((live?.zoom ?? 1) * 100);
    const zoomPresets = [40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 250];
    const zoomOptions = zoomPresets.includes(zoomPct) ? zoomPresets : [...zoomPresets, zoomPct].sort((a, b) => a - b);

    // Alerte sonore (une fois par rubrique) au dépassement du temps alloué.
    useEffect(() => {
        if (!isLive || timeLevel !== 'red') return;
        const key = currentLiveSection ? String(currentLiveSection.id) : '';
        if (key && overrunAlertedRef.current !== key) {
            overrunAlertedRef.current = key;
            playOverrunBeep();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLive, timeLevel, currentLiveSection?.id]);

    function applyAnchor(anchor: { itemId?: number; ratio?: number } | null) {
        const cont = contentRef.current;
        if (!cont) return;
        if (!anchor || !anchor.itemId) { cont.scrollTop = 0; return; }
        const el = cont.querySelector(`[data-rs-item="${anchor.itemId}"]`) as HTMLElement | null;
        if (!el) return;
        const cr = cont.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        const offset = er.top - cr.top + cont.scrollTop;
        cont.scrollTop = Math.max(0, offset + (Number(anchor.ratio) || 0) * el.offsetHeight);
    }

    const computeAnchor = () => {
        const cont = contentRef.current;
        if (!cont) return null;
        const cr = cont.getBoundingClientRect();
        const els = Array.from(cont.querySelectorAll('[data-rs-item]')) as HTMLElement[];
        let chosen: HTMLElement | null = null;
        let ratio = 0;
        for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.top - cr.top <= 6) {
                chosen = el;
                ratio = Math.min(1, Math.max(0, (cr.top - r.top) / Math.max(1, r.height)));
            }
        }
        if (!chosen) return null;
        const idAttr = chosen.getAttribute('data-rs-item');
        return { itemId: idAttr ? Number(idAttr) : undefined, ratio };
    };

    // Applique l'ancre de défilement quand un participant reçoit une navigation.
    useEffect(() => {
        if (!isLive || !following) return;
        if (live?.byUsername === me) return;
        const raf = requestAnimationFrame(() => applyAnchor(live?.anchor || null));
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live?.revision, live?.currentSectionId, following, displayedSectionId, isLive]);

    const emitNavigate = (patch: { currentSectionId?: number | null; zoom?: number; anchor?: { itemId?: number; ratio?: number } | null }) => {
        const socket = socketRef.current;
        if (!socket || !meeting) return;
        socket.emit('rs_navigate', {
            meetingId: meeting.id,
            currentSectionId: patch.currentSectionId !== undefined ? patch.currentSectionId : live?.currentSectionId,
            zoom: patch.zoom !== undefined ? patch.zoom : (live?.zoom ?? 1),
            anchor: patch.anchor !== undefined ? patch.anchor : undefined,
        });
    };

    const onContentScroll = () => {
        if (!isLive || !isMaster || !following) return;
        const t = Date.now();
        if (t - lastScrollEmit.current < 160) return;
        lastScrollEmit.current = t;
        emitNavigate({ currentSectionId: displayedSection?.id ?? null, zoom: live?.zoom ?? 1, anchor: computeAnchor() });
    };

    const gotoSection = (sectionId: number) => {
        setSelectedSectionId(sectionId);
        if (isMaster && isLive) {
            emitNavigate({ currentSectionId: sectionId, zoom: live?.zoom ?? 1, anchor: null });
        } else if (isLive && following && sectionId !== live?.currentSectionId) {
            // Consulter une autre rubrique pendant le direct = quitter le suivi.
            setFollowing(false);
        }
    };

    const goPrev = () => {
        if (currentIndex <= 0) return;
        const target = sections[currentIndex - 1];
        setSelectedSectionId(target.id);
        emitNavigate({ currentSectionId: target.id, zoom: live?.zoom ?? 1, anchor: null });
    };
    const goNext = () => {
        if (currentIndex < 0 || currentIndex >= sections.length - 1) return;
        const target = sections[currentIndex + 1];
        setSelectedSectionId(target.id);
        emitNavigate({ currentSectionId: target.id, zoom: live?.zoom ?? 1, anchor: null });
    };
    const changeZoom = (delta: number) => {
        const z = Math.min(2.5, Math.max(0.6, Math.round(((live?.zoom ?? 1) + delta) * 10) / 10));
        emitNavigate({ currentSectionId: live?.currentSectionId ?? displayedSection?.id ?? null, zoom: z, anchor: computeAnchor() });
    };
    const changeZoomTo = (zoom: number) => {
        const z = Math.min(2.5, Math.max(0.4, Math.round(zoom * 100) / 100));
        emitNavigate({ currentSectionId: live?.currentSectionId ?? displayedSection?.id ?? null, zoom: z, anchor: computeAnchor() });
    };

    const startMeeting = async () => {
        setStarting(true);
        try {
            const p = meeting?.participants.find(x => (x.username || '').toLowerCase() === startMaster);
            const payload = startMaster
                ? { time_master_username: startMaster, time_master_name: p?.name || startMaster }
                : { time_master_username: me, time_master_name: user?.displayName || user?.username || me };
            await axios.post(`/api/reunions-service/meetings/${meetingId}/start`, payload, auth);
            setShowStartModal(false);
            await reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Impossible de démarrer la réunion');
        } finally {
            setStarting(false);
        }
    };

    const endMeeting = async () => {
        if (!window.confirm('Clôturer la réunion ? Les écrans connectés repasseront en consultation.')) return;
        setBusy(true);
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/end`, {}, auth);
            await reload();
        } catch (e) { console.error(e); alert('Impossible de terminer la réunion'); }
        finally { setBusy(false); }
    };

    const reopenMeeting = async () => {
        if (!window.confirm('Replanifier cette réunion (revenir en préparation) ?')) return;
        setBusy(true);
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/reopen`, {}, auth);
            await reload();
        } catch (e) { console.error(e); alert('Impossible de replanifier la réunion'); }
        finally { setBusy(false); }
    };

    const becomeTimeMaster = async () => {
        setClaimingMaster(true);
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/time-master`, {
                time_master_username: me,
                time_master_name: user?.displayName || user?.username || me,
            }, auth);
            setFollowing(true);
            await reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Impossible de devenir maître du temps');
        } finally {
            setClaimingMaster(false);
        }
    };

    // ── Compte rendu / transcript Teams associé ─────────────────────────────
    const pollImportStatus = async (jobId: string): Promise<number | null> => {
        const deadline = Date.now() + 15 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2500));
            const res = await axios.get(`/api/transcriptmanager/upload-status/${jobId}`, auth);
            const job = res.data || {};
            if (job.status === 'completed') return job.meetingId || null;
            if (job.status === 'error') throw new Error(job.message || 'Import du transcript impossible');
        }
        throw new Error('Import du transcript : délai dépassé');
    };

    const pollSummarizeStatus = async (jobId: string) => {
        const deadline = Date.now() + 26 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            const res = await axios.get(`/api/transcriptmanager/summarize-status/${jobId}`, auth);
            const job = res.data || {};
            if (job.status === 'completed') return;
            if (job.status === 'error') throw new Error(job.error || 'Génération du CR IA impossible');
        }
    };

    const openTeamsModal = async () => {
        setShowTeamsModal(true);
        setTeamsSelected('');
        setTeamsError('');
        setTranscriptError('');
        setTranscriptStep('');
        setTeamsLoading(true);
        try {
            const d = meeting?.meeting_date ? new Date(meeting.meeting_date) : new Date();
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const res = await axios.get('/api/reunions-service/exchange-meetings', { ...auth, params: { date } });
            setTeamsList(Array.isArray(res.data?.meetings) ? res.data.meetings : []);
        } catch (e) {
            const err = e as ApiErrorLike;
            setTeamsError(err?.response?.data?.error || 'Impossible de récupérer les réunions Exchange/O365.');
        } finally {
            setTeamsLoading(false);
        }
    };

    const importSelectedTeams = async () => {
        const teams = teamsList.find(t => t.eventId === teamsSelected);
        if (!teams) return;
        setTranscriptBusy(true);
        setTranscriptError('');
        let transcriptId: number | null = null;
        if (teams.transcriptId && teams.meetingId) {
            try {
                setTranscriptStep('Récupération du transcript Teams…');
                const imp = await axios.post('/api/transcriptmanager/teams-import', {
                    meetingId: teams.meetingId,
                    transcriptId: teams.transcriptId,
                    subject: meeting?.title || teams.subject,
                    startDateTime: teams.startDateTime,
                    participantEmails: teams.participantEmails || [],
                    participants: teams.participants || [],
                    overwrite: true,
                }, auth);
                transcriptId = await pollImportStatus(imp.data.jobId);
            } catch (e) {
                const err = e as ApiErrorLike;
                setTranscriptError(err?.response?.data?.error || err?.message || 'Import Teams impossible');
            }
        }
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/link-transcript`, {
                transcript_meeting_id: transcriptId,
                teams_meeting_id: teams.meetingId || teams.joinUrl || teams.eventId,
                teams_transcript_id: teams.transcriptId || null,
                teams_subject: teams.subject,
                teams_start: teams.startDateTime,
            }, auth);
        } catch (e) {
            console.error('Lien transcript impossible', e);
        }
        if (transcriptId) {
            try {
                setTranscriptStep('Génération du compte rendu IA…');
                const sum = await axios.post(`/api/transcriptmanager/meeting/${transcriptId}/summarize`, { niveau: 'normal' }, auth);
                if (sum.data?.jobId) await pollSummarizeStatus(sum.data.jobId);
            } catch (e) {
                console.error('Synthèse IA impossible', e);
            }
        }
        setTranscriptBusy(false);
        setTranscriptStep('');
        setShowTeamsModal(false);
        await reload();
    };

    const openTranscriptModal = async () => {
        setShowTranscriptModal(true);
        setTranscriptSelected('');
        setTranscriptError('');
        setTranscriptSearch('');
        setTranscriptLoading(true);
        try {
            const res = await axios.get('/api/transcriptmanager/meetings', auth);
            setTranscriptList(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            const err = e as ApiErrorLike;
            setTranscriptError(err?.response?.data?.error || 'Impossible de charger les comptes rendus.');
        } finally {
            setTranscriptLoading(false);
        }
    };

    const linkSelectedTranscript = async () => {
        if (!transcriptSelected) return;
        setTranscriptBusy(true);
        setTranscriptError('');
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/link-transcript`, {
                transcript_meeting_id: transcriptSelected,
            }, auth);
            setShowTranscriptModal(false);
            await reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            setTranscriptError(err?.response?.data?.error || 'Association impossible');
        } finally {
            setTranscriptBusy(false);
        }
    };

    const unlinkTranscript = async () => {
        if (!window.confirm('Délier le compte rendu de cette réunion ?')) return;
        try {
            await axios.delete(`/api/reunions-service/meetings/${meetingId}/link-transcript`, auth);
            await reload();
        } catch (e) {
            console.error(e);
            alert('Impossible de délier le compte rendu');
        }
    };

    // Rafraîchissement silencieux : recharge la fiche et redemande l'état temps
    // réel sans ré-émettre `rs_join` (donc sans popup « a rejoint la réunion »).
    const softRefresh = async () => {
        setRefreshing(true);
        try {
            await reload();
            socketRef.current?.emit('rs_request_state', { meetingId });
        } finally {
            setRefreshing(false);
        }
    };

    const onPollModalScroll = (e: { currentTarget: HTMLDivElement }) => {
        if (!isMaster) return;
        const el = e.currentTarget;
        const max = el.scrollHeight - el.clientHeight;
        const now = Date.now();
        if (now - lastPollScrollEmit.current < 140) return;
        lastPollScrollEmit.current = now;
        socketRef.current?.emit('rs_poll_scroll', {
            meetingId,
            pollId: openPoll?.id ?? null,
            ratio: max > 0 ? el.scrollTop / max : 0,
        });
    };

    const answerPoll = async (pollId: number, answer: unknown) => {
        setPollBusy(true);
        try {
            const res = await axios.post(`/api/reunions-service/polls/${pollId}/answers`, { answer }, auth);
            setMyAnswers(prev => new Map(prev).set(pollId, answer));
            if (res.data?.poll) {
                setPolls(prev => prev.map(p => p.id === pollId ? { ...p, ...res.data.poll, results: res.data.results } : p));
            }
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Impossible d\'enregistrer la réponse');
        } finally {
            setPollBusy(false);
        }
    };

    const closePoll = async (pollId: number) => {
        if (!window.confirm('Clôturer cet INTERACT ?')) return;
        setPollBusy(true);
        try {
            const res = await axios.post(`/api/reunions-service/polls/${pollId}/close`, {}, auth);
            if (res.data?.poll) {
                setPolls(prev => prev.map(p => p.id === pollId ? { ...p, ...res.data.poll, status: 'closed', results: res.data.results } : p));
            }
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Impossible de clôturer l\'INTERACT');
        } finally {
            setPollBusy(false);
        }
    };

    const deletePoll = async (pollId: number) => {
        if (!isAdmin) return;
        if (!window.confirm('Supprimer définitivement cet INTERACT et toutes ses réponses ?')) return;
        setPollBusy(true);
        try {
            await axios.delete(`/api/reunions-service/polls/${pollId}`, auth);
            setPolls(prev => prev.filter(p => p.id !== pollId));
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Suppression impossible');
        } finally {
            setPollBusy(false);
        }
    };

    const addParticipants = async (a: AgentOption) => {
        const email = String(a.email || '').trim().toLowerCase();
        if (!email.includes('@')) { alert("Cet agent n'a pas d'adresse e-mail exploitable."); return; }
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/participants`,
                { participants: [{ email, name: a.displayName || email, username: a.username }] }, auth);
        } catch (e) { console.error(e); alert('Ajout impossible'); }
    };

    const participantStatus = (p: Participant): 'present' | 'excused' | 'absent' =>
        p.present ? 'present' : (p.excused ? 'excused' : 'absent');

    const setParticipantStatus = async (p: Participant, status: 'present' | 'excused' | 'absent') => {
        try {
            await axios.patch(`/api/reunions-service/meetings/${meetingId}/participants/${p.id}`, { status }, auth);
            setMeeting(m => m ? {
                ...m,
                participants: m.participants.map(x => x.id === p.id
                    ? { ...x, present: status === 'present', excused: status === 'excused' }
                    : x),
            } : m);
        } catch (e) { console.error(e); alert('Impossible de modifier la présence'); }
    };

    const groupByService = (list: Participant[]) => {
        const map = new Map<string, Participant[]>();
        for (const p of list) {
            const svc = (p.service || '').trim() || 'Service non renseigné';
            if (!map.has(svc)) map.set(svc, []);
            map.get(svc)!.push(p);
        }
        return [...map.entries()]
            .sort((a, b) => (a[0] === 'Service non renseigné' ? 1 : b[0] === 'Service non renseigné' ? -1 : a[0].localeCompare(b[0], 'fr')))
            .map(([service, items]) => ({ service, items: items.slice().sort((x, y) => x.name.localeCompare(y.name, 'fr')) }));
    };

    const removeParticipant = async (p: Participant) => {
        if (!window.confirm(`Retirer ${p.name} de la réunion ?`)) return;
        try {
            await axios.delete(`/api/reunions-service/meetings/${meetingId}/participants/${p.id}`, auth);
        } catch (e) { console.error(e); }
    };

    const uploadMeetingDocuments = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setMeetingDocUploading(true);
        try {
            const fd = new FormData();
            Array.from(files).forEach(f => fd.append('files', f));
            await axios.post(`/api/reunions-service/meetings/${meetingId}/attachments`, fd, auth);
            await reload();
        } catch (e) {
            const err = e as ApiErrorLike;
            alert(err?.response?.data?.error || 'Envoi impossible');
        } finally {
            setMeetingDocUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const downloadUrl = (attId: number) => `/api/reunions-service/attachments/${attId}/file?token=${encodeURIComponent(token || '')}`;
    const deleteAttachment = async (att: Attachment) => {
        if (!window.confirm('Supprimer cette pièce jointe ?')) return;
        try {
            await axios.delete(`/api/reunions-service/attachments/${att.id}`, auth);
            await reload();
        } catch (e) { console.error(e); }
    };

    const elapsedMs = meeting?.started_at ? (now - new Date(meeting.started_at).getTime()) : 0;

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Chargement…</div>;
    if (!meeting) return <div style={{ padding: 40, textAlign: 'center', color: '#b91c1c' }}>{error || 'Réunion introuvable.'}</div>;

    const st = STATUS_STYLE[meeting.status] || STATUS_STYLE.planned;
    const masters = meeting.participants.filter(p => p.email);

    return (
        <div className="rsv-page">
            <style>{`
                .rsv-page { min-height: 100vh; background: #f1f5f9; }
                .rsv-container { max-width: 1320px; margin: 0 auto; padding: 1.5rem 1.5rem 3rem; }
                .rsv-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
                .rsv-title { margin: 0; font-size: 1.35rem; font-weight: 800; color: #0f172a; }
                .rsv-sub { margin: .3rem 0 0; color: #64748b; font-size: .82rem; display: flex; gap: 12px; flex-wrap: wrap; }
                .rsv-chip { display: inline-flex; align-items: center; gap: 4px; font-size: .72rem; font-weight: 700; padding: 2px 9px; border-radius: 999px; border: 1px solid; }
                .rsv-btn { display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 9px; padding: .55rem 1rem; font-weight: 700; font-size: .83rem; cursor: pointer; }
                .rsv-btn:disabled { opacity: .55; cursor: default; }
                .rsv-btn-primary { background: #0078a4; color: #fff; }
                .rsv-btn-danger { background: #dc2626; color: #fff; }
                .rsv-btn-secondary { background: #fff; color: #334155; border: 1px solid #e2e8f0; }
                .rsv-btn-ghost { background: #f1f5f9; color: #475569; }
                .rsv-layout { display: grid; grid-template-columns: 290px 1fr; gap: 1rem; align-items: start; }
                .rsv-layout-collapsed { grid-template-columns: 1fr; }
                .rsv-layout-collapsed .rsv-side { display: none; }
                @media (max-width: 980px) { .rsv-layout { grid-template-columns: 1fr; } }
                .rsv-side-head { display: flex; align-items: center; justify-content: space-between; margin: .3rem .5rem .5rem; }
                .rsv-side-head h3 { margin: 0; }
                .rsv-side-count { font-size: .68rem; font-weight: 800; color: #0078a4; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 999px; padding: 1px 8px; }
                .rsv-svc-head { display: flex; align-items: center; justify-content: space-between; font-size: .66rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; margin: .6rem .35rem .2rem; }
                .rsv-status-select { font-size: 10.5px; font-weight: 700; border-radius: 6px; padding: 2px 4px; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; max-width: 84px; flex-shrink: 0; outline: none; cursor: pointer; }
                .rsv-status-select.present { color: #15803d; border-color: #bbf7d0; background: #f0fdf4; }
                .rsv-status-select.excused { color: #b45309; border-color: #fde68a; background: #fffbeb; }
                .rsv-status-select.absent { color: #64748b; border-color: #e2e8f0; background: #f8fafc; }
                .rsv-zoom-select { font-size: .76rem; font-weight: 700; border-radius: 7px; border: 1px solid rgba(255,255,255,.7); background: rgba(255,255,255,.9); color: #334155; padding: 3px 4px; cursor: pointer; outline: none; }
                .rsv-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
                .rsv-side { position: sticky; top: 12px; padding: .6rem; max-height: calc(100vh - 120px); overflow: auto; }
                .rsv-side h3 { margin: .3rem .5rem .6rem; font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; font-weight: 800; }
                .rsv-sec { width: 100%; text-align: left; border: 1px solid transparent; background: transparent; border-radius: 9px; padding: .5rem .6rem; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
                .rsv-sec:hover { background: #f8fafc; }
                .rsv-sec.active { background: #eff6ff; border-color: #bfdbfe; }
                .rsv-sec .t { flex: 1; min-width: 0; font-size: .82rem; font-weight: 700; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .rsv-sec.active .t { color: #1d4ed8; }
                .rsv-sec .d { font-size: .7rem; color: #94a3b8; }
                .rsv-main { min-width: 0; }
                .rsv-head { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .8rem 1.1rem; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
                .rsv-head h2 { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
                .rsv-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .rsv-ibtn { background: #f1f5f9; border: none; border-radius: 8px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #334155; }
                .rsv-ibtn:hover { background: #e2e8f0; }
                .rsv-ibtn:disabled { opacity: .4; cursor: default; }
                .rsv-content { padding: 1.1rem 1.2rem; }
                .rsv-content-live { height: calc(100vh - 260px); min-height: 320px; overflow-y: auto; }
                .rsv-item { border: 1px solid #e2e8f0; border-radius: 12px; padding: .9rem 1rem; margin-bottom: .9rem; background: #fff; }
                .rsv-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: .5rem; }
                .rsv-item-title { font-weight: 800; color: #0f172a; font-size: .95rem; }
                .rsv-item-meta { font-size: .7rem; color: #94a3b8; }
                .rsv-part-row { display: flex; align-items: center; gap: 8px; padding: .4rem .3rem; border-bottom: 1px solid #f8fafc; }
                .rsv-part-row .nm { flex: 1; min-width: 0; }
                .rsv-part-row .nm b { display: block; font-size: .84rem; color: #1e293b; }
                .rsv-part-row .nm span { font-size: .72rem; color: #94a3b8; }
                .rsv-att { display: flex; align-items: center; gap: 6px; font-size: .78rem; padding: .3rem 0; }
                .rsv-att a { color: #0078a4; text-decoration: underline; }
                .rsv-livebar { display: flex; align-items: center; gap: .75rem; padding: .65rem 1rem; border-bottom: 1px solid #fecaca; background: #fff5f5; flex-wrap: wrap; transition: background .3s, border-color .3s; }
                .rsv-livebar .rsv-ibtn { background: rgba(255,255,255,.85); }
                .rsv-time-alert { display: inline-flex; align-items: center; gap: 5px; border: 1px solid; border-radius: 999px; padding: 2px 10px; font-size: .76rem; font-weight: 800; animation: rsvPulse 1.3s ease-in-out infinite; }
                @keyframes rsvPulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
                .rsv-pill { display: inline-flex; align-items: center; gap: 5px; background: #fff; border: 1px solid #fecaca; color: #b91c1c; border-radius: 999px; padding: 2px 10px; font-size: .76rem; font-weight: 700; }
                .rsv-empty { color: #94a3b8; font-size: .85rem; padding: .6rem 0; }
                .rsv-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.6); display: flex; align-items: center; justify-content: center; z-index: 1300; padding: 1rem; }
                .rsv-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 860px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,.25); }
                .rsv-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.3rem .4rem; }
                .rsv-modal-body { padding: .4rem 1.3rem 1rem; overflow-y: auto; }
                .rsv-modal-foot { display: flex; justify-content: flex-end; gap: .6rem; padding: .85rem 1.3rem; border-top: 1px solid #f1f5f9; background: #fbfdff; }
                .rsv-field { margin-bottom: .8rem; }
                .rsv-field label { display: block; font-size: .76rem; font-weight: 700; color: #334155; margin-bottom: 4px; }
                .rsv-field input[type=text] { width: 100%; padding: .55rem .7rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: .9rem; box-sizing: border-box; }
                .rsv-follow-note { display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: .5rem .7rem; font-size: .8rem; margin-bottom: .8rem; }
                .rsv-toast-wrap { position: fixed; top: 16px; right: 16px; z-index: 2200; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
                .rsv-toast { background: #0f172a; color: #fff; padding: .6rem .9rem; border-radius: 10px; font-size: .82rem; font-weight: 600; box-shadow: 0 10px 25px -8px rgba(0,0,0,.45); display: flex; align-items: center; gap: 8px; animation: rsvToastIn .25s ease-out; }
                @keyframes rsvToastIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
            `}</style>
            <Header />
            <div className="rsv-toast-wrap">
                {joinToasts.map(t => (
                    <div key={t.id} className="rsv-toast"><Radio size={14} /> {t.text}</div>
                ))}
            </div>
            <div className="rsv-container">
                <div className="rsv-top">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <button className="rsv-btn rsv-btn-secondary" onClick={() => navigate('/reunions-service')}><ArrowLeft size={16} /> Retour</button>
                        <div>
                            <h1 className="rsv-title">{meeting.title}</h1>
                            <div className="rsv-sub">
                                <span className="rsv-chip" style={{ background: st.bg, color: st.color, borderColor: st.border }}>{STATUS_LABEL[meeting.status]}</span>
                                <span className="rsv-chip" style={{
                                    background: meeting.meeting_mode === 'distanciel' ? '#e0f2fe' : '#fef3c7',
                                    color: meeting.meeting_mode === 'distanciel' ? '#075985' : '#92400e',
                                    borderColor: meeting.meeting_mode === 'distanciel' ? '#bae6fd' : '#fcd34d',
                                }}>
                                    {meeting.meeting_mode === 'distanciel' ? <Video size={12} /> : <Building2 size={12} />}
                                    {meeting.meeting_mode === 'distanciel' ? 'Distanciel' : 'Présentiel'}
                                </span>
                                <span><Calendar size={13} style={{ verticalAlign: -2 }} /> {fmtDate(meeting.meeting_date)}</span>
                                <span><Timer size={13} style={{ verticalAlign: -2 }} /> {fmtDuration(meeting.total_duration)} théoriques</span>
                                <span><ListChecks size={13} style={{ verticalAlign: -2 }} /> {sections.filter(s => !s.is_meta).length} rubriques</span>
                                {meeting.template_name && <span>Modèle : {meeting.template_name}</span>}
                                {meeting.time_master_name && <span>⏱ Maître du temps : {meeting.time_master_name}</span>}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {openPoll && meeting.status !== 'finished' && (
                            <button
                                className="rsv-btn"
                                style={{ background: '#7c3aed', color: '#fff' }}
                                onClick={() => setDismissedPolls(prev => { const n = new Set(prev); n.delete(openPoll.id); return n; })}
                                title="Ouvrir l'INTERACT en cours"
                            >
                                <Sparkles size={16} /> INTERACT en cours — répondre
                            </button>
                        )}
                        <button
                            className="rsv-btn rsv-btn-secondary"
                            onClick={softRefresh}
                            disabled={refreshing}
                            title="Rafraîchir les données sans être notifié comme nouvel arrivant (contrairement à F5)"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}
                        </button>
                        {meeting.status === 'planned' && (
                            <button className="rsv-btn rsv-btn-primary" onClick={() => { setStartMaster(me); setShowStartModal(true); }}>
                                <Play size={16} /> Démarrer la réunion
                            </button>
                        )}
                        {(isMaster || isAdmin) && meeting.status !== 'finished' && (
                            <button className="rsv-btn rsv-btn-danger" onClick={endMeeting} disabled={busy}>
                                <Square size={16} /> Clôturer la réunion
                            </button>
                        )}
                        {meeting.status === 'finished' && (
                            <button className="rsv-btn rsv-btn-secondary" onClick={reopenMeeting} disabled={busy}>
                                <RotateCcw size={16} /> Replanifier
                            </button>
                        )}
                    </div>
                </div>

                {isLive && (
                    <div className="rsv-livebar" style={{ background: palette.bg, borderBottomColor: palette.border, color: palette.text }}>
                        <span className="rsv-pill" style={{ background: '#fff', borderColor: palette.border, color: palette.strong }}>
                            <Radio size={13} /> En séance
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '.85rem', color: palette.text }}>
                            <Timer size={14} style={{ verticalAlign: -2 }} /> {fmtElapsed(elapsedMs)}
                        </span>
                        <span style={{ fontSize: '.8rem', color: palette.text }}>
                            Rubrique : <strong>{currentLiveSection?.title || displayedSection?.title || '—'}</strong>
                            {currentLiveSection && !currentLiveSection.is_meta && sectionDurationMs > 0 && (
                                <span style={{ marginLeft: 6, fontWeight: 700 }}>
                                    ({fmtElapsed(sectionElapsedMs)} / {fmtDuration(currentLiveSection.duration_minutes)})
                                </span>
                            )}
                        </span>
                        <span style={{ fontSize: '.8rem', color: palette.text }} title="Heure de fin prévue, calculée sur le temps restant de la rubrique en cours et les rubriques restantes">
                            <Calendar size={13} style={{ verticalAlign: -2 }} /> Fin prévue : <strong>{expectedEndLabel}</strong>
                        </span>
                        {timeLevel === 'red' && (
                            <span className="rsv-time-alert" style={{ background: palette.pillBg, borderColor: palette.border, color: palette.strong }}>
                                ⚠ Temps dépassé{overrunMs > 0 ? ` (+${fmtElapsed(overrunMs)})` : ''}
                            </span>
                        )}
                        <span style={{ fontSize: '.8rem', color: palette.text }}><Eye size={13} style={{ verticalAlign: -2 }} /> {presenceCount} écran(s) connecté(s)</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {isMaster ? (
                                <>
                                    <button className="rsv-ibtn" onClick={goPrev} disabled={currentIndex <= 0} title="Rubrique précédente"><ChevronLeft size={16} /></button>
                                    <button className="rsv-ibtn" onClick={goNext} disabled={currentIndex < 0 || currentIndex >= sections.length - 1} title="Rubrique suivante"><ChevronRight size={16} /></button>
                                    <button className="rsv-ibtn" onClick={() => changeZoom(-0.1)} title="Zoom arrière (partagé avec tous les écrans)"><ZoomOut size={16} /></button>
                                    <select
                                        className="rsv-zoom-select"
                                        value={zoomPct}
                                        onChange={e => changeZoomTo(Number(e.target.value) / 100)}
                                        title="Zoom d'affichage — appliqué à tous les écrans connectés"
                                    >
                                        {zoomOptions.map(v => <option key={v} value={v}>{v} %</option>)}
                                    </select>
                                    <button className="rsv-ibtn" onClick={() => changeZoom(0.1)} title="Zoom avant (partagé avec tous les écrans)"><ZoomIn size={16} /></button>
                                </>
                            ) : (
                                <button className="rsv-btn rsv-btn-secondary" onClick={becomeTimeMaster} disabled={claimingMaster} title="Prendre le pilotage de la réunion : les autres écrans suivront votre rubrique, votre zoom et votre défilement">
                                    <Radio size={15} /> {claimingMaster ? 'Changement…' : 'Devenir maître du temps'}
                                </button>
                            )}
                            {!isMaster && following && (
                                <button className="rsv-btn rsv-btn-ghost" onClick={() => setFollowing(false)}>
                                    <EyeOff size={15} /> Ne plus suivre
                                </button>
                            )}
                            {!following && (
                                <button className="rsv-btn rsv-btn-primary" onClick={() => {
                                    setFollowing(true);
                                    setSelectedSectionId(live?.currentSectionId ?? selectedSectionId);
                                    requestAnimationFrame(() => applyAnchor(live?.anchor || null));
                                }}>
                                    <Eye size={15} /> Revenir à la réunion
                                </button>
                            )}
                        </span>
                    </div>
                )}

                {!following && isLive && (
                    <div className="rsv-follow-note">
                        <EyeOff size={15} /> Vous ne suivez plus le direct. Vous pouvez consulter librement les autres rubriques ; le bouton « Revenir à la réunion » vous réaffichera ce que voit l'assemblée.
                    </div>
                )}

                <div className={`rsv-layout ${sidebarCollapsed ? 'rsv-layout-collapsed' : ''}`}>
                    <aside className="rsv-card rsv-side">
                        <div className="rsv-side-head">
                            <h3>Rubriques</h3>
                            <button className="rsv-ibtn" style={{ width: 26, height: 26 }} onClick={() => setSidebarCollapsed(true)} title="Réduire la liste des rubriques (plus d'espace de lecture)">
                                <ChevronLeft size={15} />
                            </button>
                        </div>
                        {sections.map(s => {
                            const active = s.id === displayedSectionId;
                            const draggable = canManageStructure && !s.is_meta;
                            return (
                                <button
                                    key={s.id}
                                    className={`rsv-sec ${active ? 'active' : ''}`}
                                    onClick={() => gotoSection(s.id)}
                                    draggable={draggable}
                                    onDragStart={e => {
                                        if (!draggable) return;
                                        setDragSectionId(s.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', String(s.id));
                                    }}
                                    onDragOver={e => { if (draggable) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        const src = Number(e.dataTransfer.getData('text/plain')) || dragSectionId;
                                        if (src && src !== s.id) reorderSectionsByDrag(src, s.id);
                                        setDragSectionId(null);
                                    }}
                                    onDragEnd={() => setDragSectionId(null)}
                                    style={{
                                        ...(s.is_pause ? { background: '#fffbeb', borderLeft: '3px solid #f59e0b' } : {}),
                                        ...(dragSectionId === s.id ? { opacity: 0.45 } : {}),
                                    }}
                                >
                                    <span className="t" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {draggable && <GripVertical size={13} style={{ opacity: 0.45, flex: '0 0 auto' }} />}
                                        <span>{s.is_meta ? `👥 ${s.title}` : s.is_pause ? `⏸ ${s.title || 'Pause'}` : s.title}</span>
                                    </span>
                                    <span className="d">{s.is_meta ? 'meta' : s.is_pause ? 'pause' : fmtDuration(s.duration_minutes)}</span>
                                </button>
                            );
                        })}
                    </aside>

                    <main className="rsv-card rsv-main">
                        <div className="rsv-head">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <button className="rsv-ibtn" onClick={() => setSidebarCollapsed(v => !v)}
                                    title={sidebarCollapsed ? 'Afficher la liste des rubriques' : 'Réduire la liste des rubriques'}>
                                    {sidebarCollapsed ? <ListChecks size={16} /> : <ChevronLeft size={16} />}
                                </button>
                                <h2>{displayedSection ? displayedSection.title : 'Aucune rubrique'}</h2>
                            </div>
                            <div className="rsv-toolbar">
                                {displayedSection && !displayedSection.is_meta && (
                                    <span style={{ fontSize: '.75rem', color: '#94a3b8' }}><Timer size={13} style={{ verticalAlign: -2 }} /> {fmtDuration(displayedSection.duration_minutes)}</span>
                                )}
                                {meeting.status !== 'finished' && displayedSection && !displayedSection.is_pause && (
                                    <button className="rsv-btn rsv-btn-primary" style={{ padding: '.4rem .8rem', fontSize: '.78rem' }}
                                        onClick={() => setItemModal({ sectionId: displayedSection.id })}>
                                        <Plus size={14} /> Ajouter un item
                                    </button>
                                )}
                                {meeting.status !== 'finished' && (
                                    <button className="rsv-btn" style={{ padding: '.4rem .8rem', fontSize: '.78rem', background: '#7c3aed', color: '#fff' }}
                                        onClick={() => setShowPollComposer(true)}
                                        title="Lancer un INTERACT (sondage) dans la réunion">
                                        <Sparkles size={14} /> Ajouter un INTERACT
                                    </button>
                                )}
                                {canManageStructure && meeting.status !== 'finished' && (
                                    <div style={{ display: 'flex', gap: 4, paddingLeft: 6, borderLeft: '1px solid #e2e8f0' }}>
                                        {meeting.sections.some(s => (s.kpis_config || []).length > 0) && (
                                            <button className="rsv-ibtn" title="Recalculer les KPI figés des rubriques" onClick={refreshKpis} disabled={refreshingKpis}>
                                                <RefreshCw size={15} className={refreshingKpis ? 'spin' : ''} />
                                            </button>
                                        )}
                                        <button className="rsv-ibtn" title="Ajouter une rubrique de pause (Tetris)" onClick={addPauseSection} style={{ color: '#b45309' }}>
                                            <Gamepad2 size={15} />
                                        </button>
                                        {displayedSection && !displayedSection.is_meta && (
                                            <>
                                                <button className="rsv-ibtn" title="Monter la rubrique" onClick={() => moveSection(displayedSection, -1)}><ChevronUp size={15} /></button>
                                                <button className="rsv-ibtn" title="Descendre la rubrique" onClick={() => moveSection(displayedSection, 1)}><ChevronDown size={15} /></button>
                                                <button className="rsv-ibtn" title="Supprimer la rubrique" onClick={() => removeSection(displayedSection)} style={{ color: '#b91c1c' }}><Trash2 size={15} /></button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            ref={contentRef}
                            className={`rsv-content ${isLive ? 'rsv-content-live' : ''}`}
                            onScroll={onContentScroll}
                        >
                            <div style={{ zoom: isLive && following ? (live?.zoom ?? 1) : 1 } as CSSProperties}>
                                {displayedSection?.is_pause && (
                                    isPauseLive(displayedSection.id) ? (
                                        <div style={{
                                            marginBottom: '1rem', padding: '1.1rem 1.2rem', borderRadius: 14,
                                            background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fcd34d',
                                            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                                        }}>
                                            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f59e0b', color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                                                <Pause size={24} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <div style={{ fontWeight: 900, color: '#92400e', fontSize: '1rem' }}>Pause — Tetris multijoueur</div>
                                                <div style={{ color: '#a16207', fontSize: '.82rem', marginTop: 2 }}>
                                                    Chacun joue sur son écran. Le premier lance la partie, les autres rejoignent le lobby.
                                                </div>
                                            </div>
                                            <button className="rsv-btn"
                                                onClick={() => setShowTetris({ itemId: displayedSection.id, sectionId: displayedSection.id, title: displayedSection.title })}
                                                style={{ background: '#b45309', color: '#fff', fontWeight: 800 }}>
                                                <Gamepad2 size={16} /> Rejoindre la partie
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{
                                            marginBottom: '1rem', padding: '1rem 1.2rem', borderRadius: 14,
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                        }}>
                                            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#e2e8f0', color: '#64748b', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                                                <Pause size={20} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <div style={{ fontWeight: 800, color: '#334155', fontSize: '.92rem' }}>Pause</div>
                                                <div style={{ color: '#94a3b8', fontSize: '.8rem', marginTop: 2 }}>
                                                    Cette rubrique sera ouverte par le maître du temps.
                                                </div>
                                            </div>
                                            <span style={{ color: '#94a3b8', fontSize: '.78rem' }}><Timer size={13} style={{ verticalAlign: -2 }} /> {fmtDuration(displayedSection.duration_minutes)}</span>
                                        </div>
                                    )
                                )}
                                {displayedSection && !displayedSection.is_meta && !displayedSection.is_pause && (
                                    <KpiSnapshots
                                        snapshots={displayedSection.kpi_snapshots}
                                        configs={displayedSection.kpis_config}
                                        status={meeting.status}
                                    />
                                )}
                                {displayedSection?.is_meta && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', marginBottom: 6 }}>Personnes prévues / présentes</div>
                                        {meeting.participants.length === 0 && <div className="rsv-empty">Aucun participant enregistré.</div>}
                                        {groupByService(meeting.participants).map(group => (
                                            <div key={`meta-svc-${group.service}`} style={{ marginBottom: 8 }}>
                                                <div className="rsv-svc-head"><span>{group.service}</span><span>{group.items.length}</span></div>
                                                {group.items.map(p => {
                                                    const status = participantStatus(p);
                                                    return (
                                                        <div className="rsv-part-row" key={`meta-${p.id}`}>
                                                            <select
                                                                className={`rsv-status-select ${status}`}
                                                                value={status}
                                                                onChange={e => setParticipantStatus(p, e.target.value as 'present' | 'excused' | 'absent')}
                                                                disabled={meeting.status === 'finished'}
                                                                title="Présence : présent, excusé ou absent (non excusé)"
                                                            >
                                                                <option value="present">Présent</option>
                                                                <option value="excused">Excusé</option>
                                                                <option value="absent">Absent</option>
                                                            </select>
                                                            <div className="nm"><b>{p.name}</b><span>{p.email}</span></div>
                                                            <AgentPresenceBadge email={p.email} name={p.name} />
                                                            {meeting.status !== 'finished' && (
                                                                <button className="rsv-ibtn" style={{ width: 24, height: 24 }} title="Retirer de la réunion" onClick={() => removeParticipant(p)}>
                                                                    <X size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                        <div style={{ marginTop: 8 }}>
                                            <AgentSearch onSelect={addParticipants} placeholder="Ajouter une personne présente…" compact />
                                        </div>
                                    </div>
                                )}

                                {isInteractSection && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', marginBottom: 6 }}>
                                            INTERACTs de la réunion
                                        </div>
                                        {polls.length === 0 && <div className="rsv-empty">Aucun INTERACT lancé pour l'instant.</div>}
                                        {polls.map(p => (
                                            <div key={p.id} data-rs-item={-p.id}>
                                                <PollCard
                                                    poll={p}
                                                    canManage={canManagePoll(p)}
                                                    myAnswer={myAnswers.get(p.id) ?? null}
                                                    onAnswer={a => answerPoll(p.id, a)}
                                                    onClose={() => closePoll(p.id)}
                                                    busy={pollBusy}
                                                    token={token || ''}
                                                    canDelete={isAdmin}
                                                    onDelete={() => deletePoll(p.id)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {displayedSection && displayedSection.items.length === 0 && !displayedSection.is_meta && !displayedSection.is_pause && !isInteractSection && (
                                    <div className="rsv-empty">
                                        Aucun item dans cette rubrique.
                                        {meeting.status !== 'finished' && ' Cliquez sur « Ajouter un item » pour préparer ou compléter son contenu.'}
                                    </div>
                                )}

                                {(displayedSection?.items || []).map(item => (
                                    <div
                                        className="rsv-item"
                                        key={item.id}
                                        data-rs-item={item.id}
                                        draggable
                                        onDragStart={e => {
                                            setDragItemId(item.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', String(item.id));
                                        }}
                                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                        onDrop={e => {
                                            e.preventDefault();
                                            const src = Number(e.dataTransfer.getData('text/plain')) || dragItemId;
                                            if (src && src !== item.id) reorderItemsByDrag(src, item.id);
                                            setDragItemId(null);
                                        }}
                                        onDragEnd={() => setDragItemId(null)}
                                        style={dragItemId === item.id ? { opacity: 0.45 } : undefined}
                                    >
                                        <div className="rsv-item-head">
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
                                                <span title="Glisser pour réordonner" style={{ cursor: 'grab', color: '#cbd5e1', marginTop: 2, flex: '0 0 auto' }}>
                                                    <GripVertical size={15} />
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="rsv-item-title">{item.title}</div>
                                                    <div className="rsv-item-meta" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                        <User size={11} />
                                                        <span>{item.created_by_name || 'Auteur inconnu'}</span>
                                                        {item.updated_at ? <span>· modifié le {fmtDate(item.updated_at)}</span> : null}
                                                    </div>
                                                </div>
                                            </div>
                                            {meeting.status !== 'finished' && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="rsv-ibtn" title="Modifier" onClick={() => setItemModal({ sectionId: item.section_id, item })}>
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button className="rsv-ibtn" title="Supprimer" onClick={async () => {
                                                        if (!window.confirm('Supprimer cet item ?')) return;
                                                        try { await axios.delete(`/api/reunions-service/items/${item.id}`, auth); reload(); } catch (e) { console.error(e); }
                                                    }}>
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <ReunionRichContent html={item.content_html} />
                                        {item.attachments.length > 0 && (
                                            <div style={{ marginTop: '.6rem', borderTop: '1px dashed #e2e8f0', paddingTop: '.5rem' }}>
                                                {item.attachments.map(att => (
                                                    <div className="rsv-att" key={att.id}>
                                                        <Paperclip size={13} />
                                                        <a href={downloadUrl(att.id)} target="_blank" rel="noopener noreferrer">{att.original_name}</a>
                                                        <span style={{ color: '#94a3b8' }}>{att.size ? `· ${(att.size / 1024).toFixed(0)} Ko` : ''}</span>
                                                        {meeting.status !== 'finished' && (
                                                            <button className="rsv-ibtn" style={{ width: 24, height: 24 }} title="Supprimer" onClick={() => deleteAttachment(att)}>
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>
                </div>

                {/* Compte rendu / transcript associé */}
                <div className="rsv-card" style={{ marginTop: '1rem', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileText size={15} /> Compte rendu de séance
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {meeting.transcript ? (
                                <>
                                    <a className="rsv-btn rsv-btn-primary" href={`/transcriptmanager/meeting/${meeting.transcript.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                        <ExternalLink size={15} /> Ouvrir le CR IA
                                    </a>
                                    <button className="rsv-btn rsv-btn-secondary" onClick={unlinkTranscript}>Délier</button>
                                </>
                            ) : (
                                <>
                                    <button className="rsv-btn rsv-btn-secondary" onClick={openTranscriptModal}>
                                        <Search size={15} /> Lier un CR existant
                                    </button>
                                    <button className="rsv-btn rsv-btn-primary" onClick={openTeamsModal}>
                                        <Video size={15} /> Associer une réunion Exchange
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    {meeting.transcript ? (
                        <div style={{ fontSize: '.85rem', color: '#475569' }}>
                            <div>
                                <b>{meeting.transcript.title}</b>
                                {meeting.transcript.summary_model ? ` · ${meeting.transcript.summary_model}` : ''}
                            </div>
                            {meeting.transcript.summary ? (
                                <div style={{ marginTop: 6, maxHeight: 110, overflow: 'hidden', whiteSpace: 'pre-wrap', color: '#64748b', fontSize: '.8rem' }}>
                                    {meeting.transcript.summary.replace(/[#*_>`]/g, '').slice(0, 600)}{meeting.transcript.summary.length > 600 ? '…' : ''}
                                </div>
                            ) : (
                                <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '.8rem' }}>Aucun résumé IA disponible pour ce transcript.</div>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>
                            {meeting.teams_meeting_id ? (
                                <div style={{ marginBottom: 4, color: '#475569' }}>
                                    Réunion Exchange associée : <b>{meeting.teams_subject || meeting.teams_meeting_id}</b>
                                    {meeting.teams_start ? ` · ${fmtDate(meeting.teams_start)}` : ''}
                                    {' '}— aucun transcript/CR IA importé pour l'instant.
                                </div>
                            ) : null}
                            Aucun compte rendu associé. Liez un CR existant du Transcript Manager ou associez la réunion Exchange
                            (transcript et CR IA générés automatiquement si disponibles).
                        </div>
                    )}
                </div>

                {/* Documents de la réunion (hors items) */}
                <div className="rsv-card" style={{ marginTop: '1rem', padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Paperclip size={15} /> Documents de la réunion
                        </div>
                        {meeting.status !== 'finished' && (
                            <>
                                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => uploadMeetingDocuments(e.target.files)} />
                                <button className="rsv-btn rsv-btn-secondary" style={{ padding: '.4rem .8rem', fontSize: '.78rem' }} onClick={() => fileInputRef.current?.click()} disabled={meetingDocUploading}>
                                    <Upload size={14} /> {meetingDocUploading ? 'Envoi…' : 'Ajouter'}
                                </button>
                            </>
                        )}
                    </div>
                    {meeting.attachments.length === 0 && <div className="rsv-empty">Aucun document joint (PDF, images, etc.).</div>}
                    {meeting.attachments.map(att => (
                        <div className="rsv-att" key={`doc-${att.id}`}>
                            <FileText size={13} />
                            <a href={downloadUrl(att.id)} target="_blank" rel="noopener noreferrer">{att.original_name}</a>
                            <span style={{ color: '#94a3b8' }}>{att.size ? `· ${(att.size / 1024).toFixed(0)} Ko` : ''}</span>
                            {meeting.status !== 'finished' && (
                                <button className="rsv-ibtn" style={{ width: 24, height: 24 }} title="Supprimer" onClick={() => deleteAttachment(att)}>
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {showPollComposer && meeting && (
                <PollComposerModal
                    token={token || ''}
                    meetingId={meetingId}
                    onClose={() => setShowPollComposer(false)}
                    onCreated={() => { setShowPollComposer(false); reload(); }}
                />
            )}

            {showPollPopup && openPoll && (
                <div className="rsv-modal-overlay" style={{ zIndex: 1500 }}>
                    <div className="rsv-modal" style={{ maxWidth: 560 }}>
                        <div className="rsv-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Sparkles size={18} color="#7c3aed" /> INTERACT
                            </h3>
                        </div>
                        <div className="rsv-modal-body" ref={pollModalBodyRef} onScroll={onPollModalScroll} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{openPoll.question}</div>
                            <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>
                                Lancé par {openPoll.created_by_name || openPoll.created_by || '—'}
                            </div>
                            {openPoll.explanation && <div style={{ fontSize: '.82rem', color: '#64748b' }}>{openPoll.explanation}</div>}
                            <PollAnswerForm poll={openPoll} onSubmit={a => answerPoll(openPoll.id, a)} busy={pollBusy} />
                        </div>
                        <div className="rsv-modal-foot">
                            <button className="rsv-btn rsv-btn-secondary" onClick={() => setDismissedPolls(prev => new Set(prev).add(openPoll.id))}>
                                Plus tard
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {itemModal && (
                <ItemModal
                    meetingId={meetingId}
                    sectionId={itemModal.sectionId}
                    item={itemModal.item}
                    token={token || ''}
                    onClose={() => setItemModal(null)}
                    onSaved={() => { setItemModal(null); reload(); }}
                />
            )}

            {showTetris && (
                <TetrisPause
                    socket={socketRef.current}
                    meetingId={Number(meetingId)}
                    itemId={showTetris.itemId}
                    allowed={isPauseLive(showTetris.sectionId)}
                    playerName={String((user as { name?: string; username?: string } | null)?.name || (user as { username?: string } | null)?.username || 'Participant')}
                    onClose={() => setShowTetris(null)}
                />
            )}

            {showTeamsModal && (
                <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !transcriptBusy) setShowTeamsModal(false); }}>
                    <div className="rsv-modal" style={{ maxWidth: 620 }}>
                        <div className="rsv-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Video size={18} /> Réunion Exchange/O365
                            </h3>
                            <button onClick={() => setShowTeamsModal(false)} disabled={transcriptBusy} style={{ background: 'none', border: 'none', cursor: transcriptBusy ? 'default' : 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div className="rsv-modal-body">
                            <div style={{ fontSize: '.85rem', color: '#475569', lineHeight: 1.55 }}>
                                Choisissez l'occurrence Exchange du {meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString('fr-FR') : '—'}.
                                Si un transcript est disponible, il sera importé et le CR IA généré ; sinon la réunion sera simplement associée.
                            </div>
                            {teamsLoading && <div style={{ color: '#64748b', fontSize: '.85rem' }}>Recherche dans le calendrier Exchange…</div>}
                            {teamsError && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{teamsError}</div>}
                            {!teamsLoading && !teamsError && teamsList.length === 0 && (
                                <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>Aucune réunion Exchange/O365 trouvée à cette date.</div>
                            )}
                            {teamsList.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {teamsList.map(t => (
                                        <label key={t.eventId} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '.55rem .65rem', border: `1px solid ${teamsSelected === t.eventId ? '#0078a4' : '#e2e8f0'}`, background: teamsSelected === t.eventId ? '#f0f9ff' : '#fff', borderRadius: 9, cursor: 'pointer', fontSize: '.83rem' }}>
                                            <input type="radio" name="teams" checked={teamsSelected === t.eventId} onChange={() => setTeamsSelected(t.eventId)} disabled={transcriptBusy} />
                                            <span>
                                                <b style={{ display: 'block', color: '#1e293b' }}>{t.subject || 'Réunion'}</b>
                                                <span style={{ color: '#64748b', fontSize: '.75rem' }}>
                                                    {t.startDateTime ? new Date(t.startDateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    {t.location ? ` · ${t.location}` : ''}
                                                    {t.transcriptId ? ' · transcript disponible' : t.isOnline ? ' · en ligne (transcript non disponible)' : ' · hors ligne'}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                            {transcriptStep && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 9, padding: '.6rem .8rem', color: '#0078a4', fontWeight: 700, fontSize: '.82rem' }}>
                                    <RefreshCw size={14} className="animate-spin" /> {transcriptStep}
                                </div>
                            )}
                            {transcriptError && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{transcriptError}</div>}
                        </div>
                        <div className="rsv-modal-foot">
                            <button className="rsv-btn rsv-btn-secondary" onClick={() => setShowTeamsModal(false)} disabled={transcriptBusy}>Annuler</button>
                            <button className="rsv-btn rsv-btn-primary" onClick={importSelectedTeams} disabled={transcriptBusy || !teamsSelected}>
                                <RefreshCw size={15} className={transcriptBusy ? 'animate-spin' : ''} /> {transcriptBusy ? 'Traitement…' : 'Importer et associer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTranscriptModal && (
                <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !transcriptBusy) setShowTranscriptModal(false); }}>
                    <div className="rsv-modal" style={{ maxWidth: 620 }}>
                        <div className="rsv-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Link2 size={18} /> Lier un compte rendu existant
                            </h3>
                            <button onClick={() => setShowTranscriptModal(false)} disabled={transcriptBusy} style={{ background: 'none', border: 'none', cursor: transcriptBusy ? 'default' : 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div className="rsv-modal-body">
                            <input
                                type="text"
                                value={transcriptSearch}
                                onChange={e => setTranscriptSearch(e.target.value)}
                                placeholder="Rechercher un compte rendu (titre)…"
                                style={{ width: '100%', padding: '.55rem .7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '.88rem', boxSizing: 'border-box' }}
                            />
                            {transcriptLoading && <div style={{ color: '#64748b', fontSize: '.85rem' }}>Chargement des comptes rendus…</div>}
                            {transcriptError && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{transcriptError}</div>}
                            {!transcriptLoading && transcriptList.length === 0 && (
                                <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>Aucun compte rendu disponible dans le Transcript Manager.</div>
                            )}
                            {transcriptList.length > 0 && (
                                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 9 }}>
                                    {transcriptList
                                        .filter(t => !transcriptSearch.trim() || String(t.title || '').toLowerCase().includes(transcriptSearch.trim().toLowerCase()))
                                        .map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => setTranscriptSelected(t.id)}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f1f5f9', background: transcriptSelected === t.id ? '#f0f9ff' : '#fff', padding: '.55rem .7rem', cursor: 'pointer' }}
                                            >
                                                <b style={{ display: 'block', color: '#1e293b', fontSize: '.84rem' }}>{t.title}</b>
                                                <span style={{ color: '#64748b', fontSize: '.74rem' }}>
                                                    {fmtDate(t.meeting_date)} {t.summary ? ' · résumé IA disponible' : ''}
                                                </span>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                        <div className="rsv-modal-foot">
                            <button className="rsv-btn rsv-btn-secondary" onClick={() => setShowTranscriptModal(false)} disabled={transcriptBusy}>Annuler</button>
                            <button className="rsv-btn rsv-btn-primary" onClick={linkSelectedTranscript} disabled={transcriptBusy || !transcriptSelected}>
                                <Link2 size={15} /> {transcriptBusy ? 'Association…' : 'Associer ce CR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showStartModal && (
                <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowStartModal(false); }}>
                    <div className="rsv-modal" style={{ maxWidth: 560 }}>
                        <div className="rsv-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Play size={18} /> Démarrer la réunion
                            </h3>
                            <button onClick={() => setShowStartModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div className="rsv-modal-body">
                            <div style={{ fontSize: '.85rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.55 }}>
                                Désignez le <strong>maître du temps</strong> : c'est lui qui fera avancer la réunion rubrique par rubrique.
                                Les autres écrans connectés afficheront la même chose (rubrique, zoom, position de lecture).
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                                    <input type="radio" name="master" checked={startMaster === me} onChange={() => setStartMaster(me)} />
                                    <strong>Moi</strong> <span style={{ color: '#64748b', fontSize: '.82rem' }}>({user?.displayName || user?.username})</span>
                                </label>
                                {masters.map(p => {
                                    const key = String(p.username || p.email.split('@')[0]).toLowerCase();
                                    return (
                                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                                            <input type="radio" name="master" checked={startMaster === key} onChange={() => setStartMaster(key)} />
                                            <strong>{p.name}</strong> <span style={{ color: '#64748b', fontSize: '.82rem' }}>{p.email}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="rsv-modal-foot">
                            <button className="rsv-btn rsv-btn-secondary" onClick={() => setShowStartModal(false)}>Annuler</button>
                            <button className="rsv-btn rsv-btn-primary" onClick={startMeeting} disabled={starting}>
                                <Play size={15} /> {starting ? 'Démarrage…' : 'Démarrer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Modale d'ajout / édition d'un item ─────────────────────────────────────

function ItemModal({
    meetingId, sectionId, item, token, onClose, onSaved,
}: {
    meetingId: number;
    sectionId: number;
    item?: Item;
    token: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(item?.title || '');
    const [content, setContent] = useState(item?.content_html || '');
    const [files, setFiles] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [removedIds, setRemovedIds] = useState<number[]>([]);

    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const save = async () => {
        if (!title.trim()) { setError('Le titre est requis.'); return; }
        setSaving(true);
        setError('');
        try {
            let itemId = item?.id;
            const payload = { title: title.trim(), content_html: content };
            if (itemId) {
                await axios.put(`/api/reunions-service/items/${itemId}`, payload, auth);
            } else {
                const res = await axios.post(`/api/reunions-service/meetings/${meetingId}/sections/${sectionId}/items`, payload, auth);
                itemId = res.data.id;
            }
            // Suppression des pièces jointes retirées
            for (const id of removedIds) {
                await axios.delete(`/api/reunions-service/attachments/${id}`, auth).catch(() => null);
            }
            // Ajout des nouvelles pièces jointes
            if (files.length > 0 && itemId) {
                const fd = new FormData();
                fd.append('item_id', String(itemId));
                files.forEach(f => fd.append('files', f));
                await axios.post(`/api/reunions-service/meetings/${meetingId}/attachments`, fd, auth);
            }
            onSaved();
        } catch (e) {
            const err = e as ApiErrorLike;
            setError(err?.response?.data?.error || 'Erreur lors de l\'enregistrement');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rsv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rsv-modal">
                <div className="rsv-modal-head">
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item ? <Pencil size={17} /> : <Plus size={18} />} {item ? 'Modifier l\'item' : 'Nouvel item'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                </div>
                <div className="rsv-modal-body">
                    <div className="rsv-field">
                        <label>Titre *</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'item" />
                    </div>
                    <div className="rsv-field">
                        <label>Contenu</label>
                        <ReunionServiceRichEditor value={content} onChange={setContent} placeholder="Rédigez le contenu (images par copier-coller ou bouton image)…" />
                    </div>
                    <div className="rsv-field">
                        <label>Pièces jointes (PDF, images, documents…)</label>
                        {item && item.attachments.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                                {item.attachments.filter(a => !removedIds.includes(a.id)).map(att => (
                                    <div className="rsv-att" key={att.id}>
                                        <Paperclip size={13} />
                                        <span>{att.original_name}</span>
                                        <span style={{ color: '#94a3b8' }}>{att.size ? `· ${(att.size / 1024).toFixed(0)} Ko` : ''}</span>
                                        <button className="rsv-ibtn" style={{ width: 24, height: 24 }} title="Retirer" onClick={() => setRemovedIds(prev => [...prev, att.id])}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <label
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files || [])]); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .75rem', border: '1.5px dashed #cbd5e1', borderRadius: 9, background: '#fbfdff', color: '#64748b', fontSize: '.82rem', cursor: 'pointer' }}
                        >
                            <Upload size={15} />
                            <span style={{ fontWeight: 700, color: '#334155' }}>Ajouter des pièces jointes</span>
                            <span style={{ fontSize: '.72rem' }}>PDF, images, documents… (ou glisser-déposer)</span>
                            <input type="file" multiple style={{ display: 'none' }} onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                        </label>
                        {files.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                                {files.map((f, i) => (
                                    <span key={`${f.name}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 4px 2px 9px', fontSize: '.74rem', color: '#334155' }}>
                                        {f.name}
                                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {error && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{error}</div>}
                </div>
                <div className="rsv-modal-foot">
                    <button className="rsv-btn rsv-btn-secondary" onClick={onClose}>Annuler</button>
                    <button className="rsv-btn rsv-btn-primary" onClick={save} disabled={saving}>
                        <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
