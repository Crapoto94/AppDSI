import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import useReunionAccess from './useReunionAccess';
import {
    Plus, Calendar, Clock, Users, ListChecks, Presentation, Pencil, Copy,
    Trash2, Play, ArrowRight, X, CheckCircle2, Timer, FileText, Search,
    BarChart3, Video, Building2, RefreshCw, Link2,
} from 'lucide-react';

interface TemplateRow {
    id: number;
    name: string;
    description?: string | null;
    is_active?: boolean;
    section_count?: number;
    total_duration?: number;
    participant_count?: number;
    meeting_count?: number;
}

interface MeetingRow {
    id: number;
    title: string;
    meeting_date?: string | null;
    created_at?: string;
    status: 'planned' | 'in_progress' | 'finished';
    template_id?: number | null;
    template_name?: string | null;
    section_count?: number;
    total_duration?: number;
    participant_count?: number;
    item_count?: number;
    time_master_name?: string | null;
    meeting_mode?: 'presentiel' | 'distanciel' | null;
    transcript_meeting_id?: number | null;
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

interface ApiErrorLike {
    response?: { data?: { error?: string; existingMeetingId?: number } };
    message?: string;
}

interface SearchMatch {
    kind: 'item' | 'meeting' | 'participant';
    item_id?: number;
    section_title?: string;
    item_title?: string;
    snippet: string;
}

interface SearchGroup {
    meeting_id: number;
    meeting_title: string;
    meeting_date?: string | null;
    template_name?: string | null;
    meeting_mode?: string | null;
    status: string;
    match_count: number;
    matches: SearchMatch[];
}

const STATUS_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
    planned: { label: 'Planifiée', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    in_progress: { label: 'En cours', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    finished: { label: 'Terminée', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
};

const fmtDuration = (min?: number) => {
    const m = Number(min) || 0;
    if (!m) return '—';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`;
};

const fmtDate = (d?: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return '—'; }
};

// Titre affiché dans la liste, avec la date : « REDI — 20 NOV 26 ».
// Si le titre contient déjà cette date (imports OneNote), on ne la duplique pas.
const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOUT', 'SEP', 'OCT', 'NOV', 'DEC'];
const titleWithDate = (title?: string | null, date?: string | null) => {
    const base = String(title || '').trim() || 'Réunion';
    if (!date) return base;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return base;
    const p = (n: number) => String(n).padStart(2, '0');
    const suffix = `${p(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
    // Le titre contient déjà une date (ex. imports : « 20 NOV 26 », « 10 JUI 26 ») ?
    if (/\b\d{1,2}\s+[A-Za-z]{3,4}\.?\s+\d{2}\b/.test(base)) return base;
    if (base.toUpperCase().includes(suffix)) return base;
    return `${base} — ${suffix}`;
};

const toLocalInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    // Minutes limitées à 00, 15, 30, 45.
    const rounded = new Date(d);
    rounded.setMinutes(Math.floor(rounded.getMinutes() / 15) * 15, 0, 0);
    return `${rounded.getFullYear()}-${p(rounded.getMonth() + 1)}-${p(rounded.getDate())}T${p(rounded.getHours())}:${p(rounded.getMinutes())}`;
};

// Vues dérivées de createDate (AAAA-MM-JJTHH:MM) pour les sélecteurs date/heure.
const splitLocalDateTime = (value: string) => {
    const [datePart = '', timePart = '09:00'] = String(value || '').split('T');
    const [hour = '09', minute = '00'] = timePart.split(':');
    return { datePart, hour, minute };
};

const ModeBadge = ({ mode }: { mode?: string | null }) => {
    const presentiel = mode !== 'distanciel';
    return (
        <span
            title={presentiel ? 'Réunion en présentiel' : 'Réunion en distanciel (Teams)'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
                padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                background: presentiel ? '#fef3c7' : '#e0f2fe',
                color: presentiel ? '#92400e' : '#075985',
                border: `1px solid ${presentiel ? '#fcd34d' : '#bae6fd'}`,
            }}
        >
            {presentiel ? <Building2 size={12} /> : <Video size={12} />}
            {presentiel ? 'Présentiel' : 'Distanciel'}
        </span>
    );
};

export default function ReunionsServiceIndex() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const isAdmin = useReunionAccess();
    const [tab, setTab] = useState<'meetings' | 'templates'>('meetings');
    const [meetings, setMeetings] = useState<MeetingRow[]>([]);
    const [templates, setTemplates] = useState<TemplateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filtres liste
    const [filterYear, setFilterYear] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterMode, setFilterMode] = useState('');
    const [filterTemplate, setFilterTemplate] = useState('');
    const [search, setSearch] = useState('');

    // Création d'une occurrence à partir d'un modèle
    const [showCreate, setShowCreate] = useState(false);
    const [createTemplateId, setCreateTemplateId] = useState<number | ''>('');
    const [createTitle, setCreateTitle] = useState('');
    const [createDate, setCreateDate] = useState(toLocalInput(new Date()));
    const [createMode, setCreateMode] = useState<'presentiel' | 'distanciel'>('presentiel');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createStep, setCreateStep] = useState('');
    const [exchangeList, setExchangeList] = useState<ExchangeMeeting[]>([]);
    const [exchangeLoading, setExchangeLoading] = useState(false);
    const [exchangeError, setExchangeError] = useState('');
    const [exchangeSelected, setExchangeSelected] = useState('');

    // Recherche transverse
    const [showSearch, setShowSearch] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [searchMatch, setSearchMatch] = useState<'all' | 'any'>('all');
    const [searchTemplate, setSearchTemplate] = useState('');
    const [searchMode, setSearchMode] = useState('');
    const [searchFrom, setSearchFrom] = useState('');
    const [searchTo, setSearchTo] = useState('');
    const [searchResults, setSearchResults] = useState<SearchGroup[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [searchRan, setSearchRan] = useState(false);

    const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const load = async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const [mRes, tRes] = await Promise.all([
                axios.get('/api/reunions-service/meetings', { headers: auth }),
                axios.get('/api/reunions-service/templates', { headers: auth }),
            ]);
            setMeetings(Array.isArray(mRes.data) ? mRes.data : []);
            setTemplates(Array.isArray(tRes.data) ? tRes.data : []);
        } catch (e) {
            const err = e as ApiErrorLike;
            setError(err?.response?.data?.error || err?.message || 'Erreur de chargement');
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [token]);

    // Recherche transverse (debounce) — relancée à chaque changement de filtre.
    useEffect(() => {
        if (!showSearch) return;
        const q = searchQ.trim();
        if (q.length < 2) {
            setSearchResults([]);
            setSearchRan(false);
            setSearchError('');
            return;
        }
        setSearchLoading(true);
        setSearchError('');
        const timer = setTimeout(async () => {
            try {
                const res = await axios.get('/api/reunions-service/search', {
                    params: {
                        q,
                        match: searchMatch,
                        template_id: searchTemplate || undefined,
                        mode: searchMode || undefined,
                        from: searchFrom || undefined,
                        to: searchTo || undefined,
                    },
                    headers: auth,
                });
                const list: SearchGroup[] = Array.isArray(res.data?.results) ? res.data.results : [];
                list.sort((a, b) => {
                    const ta = a.meeting_date ? new Date(a.meeting_date).getTime() : 0;
                    const tb = b.meeting_date ? new Date(b.meeting_date).getTime() : 0;
                    return tb - ta;
                });
                setSearchResults(list);
                setSearchRan(true);
            } catch (e) {
                const err = e as ApiErrorLike;
                setSearchError(err?.response?.data?.error || 'Erreur lors de la recherche');
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [showSearch, searchQ, searchMatch, searchTemplate, searchMode, searchFrom, searchTo, auth]);

    const years = useMemo(() => {
        const set = new Set<string>();
        for (const m of meetings) {
            if (m.meeting_date) set.add(String(new Date(m.meeting_date).getFullYear()));
        }
        return [...set].sort((a, b) => b.localeCompare(a));
    }, [meetings]);

    // Types de réunion présents dans la liste (dépend du modèle utilisé).
    const meetingTypes = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of meetings) {
            const label = m.template_name || (m.template_id ? `Modèle #${m.template_id}` : '');
            if (!label) continue;
            const key = m.template_id ? String(m.template_id) : label;
            if (!map.has(key)) map.set(key, label);
        }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
    }, [meetings]);

    const filteredMeetings = useMemo(() => {
        const q = search.trim().toLowerCase();
        return meetings.filter(m => {
            if (filterTemplate && String(m.template_id ?? m.template_name ?? '') !== filterTemplate) return false;
            if (filterYear && (!m.meeting_date || String(new Date(m.meeting_date).getFullYear()) !== filterYear)) return false;
            if (filterStatus && m.status !== filterStatus) return false;
            if (filterMode && (m.meeting_mode || 'presentiel') !== filterMode) return false;
            if (q && !m.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [meetings, filterTemplate, filterYear, filterStatus, filterMode, search]);

    const openCreate = () => {
        const active = templates.filter(t => t.is_active !== false);
        setCreateTemplateId(active[0]?.id || '');
        setCreateTitle(active[0]?.name || '');
        setCreateDate(toLocalInput(new Date()));
        setCreateMode('presentiel');
        setCreateStep('');
        setCreateError('');
        setExchangeSelected('');
        setExchangeList([]);
        setExchangeError('');
        setShowCreate(true);
        loadExchangeForDate(toLocalInput(new Date()));
    };

    const onSelectTemplate = (id: number | '') => {
        setCreateTemplateId(id);
        const t = templates.find(x => x.id === id);
        if (t) setCreateTitle(t.name);
    };

    const toDayIso = (datetimeLocal: string) => {
        const d = new Date(datetimeLocal);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const loadExchangeForDate = async (datetimeLocal: string) => {
        if (!datetimeLocal) { setExchangeList([]); setExchangeError(''); return; }
        setExchangeLoading(true);
        setExchangeError('');
        try {
            const res = await axios.get('/api/reunions-service/exchange-meetings', {
                params: { date: toDayIso(datetimeLocal) },
                headers: auth,
            });
            setExchangeList(Array.isArray(res.data?.meetings) ? res.data.meetings : []);
        } catch (e) {
            const err = e as ApiErrorLike;
            setExchangeError(err?.response?.data?.error || 'Impossible de récupérer les réunions Exchange/O365.');
        } finally {
            setExchangeLoading(false);
        }
    };

    const updateCreateWhen = (patch: { datePart?: string; hour?: string; minute?: string }) => {
        const current = splitLocalDateTime(createDate);
        const next = `${patch.datePart ?? current.datePart}T${patch.hour ?? current.hour}:${patch.minute ?? current.minute}`;
        setCreateDate(next);
        setExchangeSelected('');
        loadExchangeForDate(next);
    };

    const pollImport = async (jobId: string): Promise<number | null> => {
        const deadline = Date.now() + 15 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2500));
            const res = await axios.get(`/api/transcriptmanager/upload-status/${jobId}`, { headers: auth });
            const job = res.data || {};
            if (job.status === 'completed') return job.meetingId || null;
            if (job.status === 'error') throw new Error(job.message || 'Import du transcript impossible');
        }
        throw new Error('Import du transcript : délai dépassé');
    };

    const pollSummarize = async (jobId: string) => {
        const deadline = Date.now() + 26 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            const res = await axios.get(`/api/transcriptmanager/summarize-status/${jobId}`, { headers: auth });
            const job = res.data || {};
            if (job.status === 'completed') return;
            if (job.status === 'error') throw new Error(job.error || 'Génération du CR IA impossible');
        }
    };

    const submitCreate = async () => {
        if (!createTemplateId) { setCreateError('Choisissez un modèle de réunion.'); return; }
        setCreating(true);
        setCreateError('');
        setCreateStep('Création de la réunion…');
        let meetingId: number | null = null;
        try {
            const res = await axios.post('/api/reunions-service/meetings', {
                template_id: createTemplateId,
                title: createTitle,
                meeting_date: createDate || null,
                meeting_mode: createMode,
            }, { headers: auth });
            meetingId = res.data.id;

            const teams = exchangeList.find(t => t.eventId === exchangeSelected);
            if (teams && meetingId) {
                let transcriptId: number | null = null;
                if (teams.transcriptId && teams.meetingId) {
                    try {
                        setCreateStep('Récupération du transcript Teams…');
                        const imp = await axios.post('/api/transcriptmanager/teams-import', {
                            meetingId: teams.meetingId,
                            transcriptId: teams.transcriptId,
                            subject: createTitle || teams.subject,
                            startDateTime: teams.startDateTime,
                            participantEmails: teams.participantEmails || [],
                            participants: teams.participants || [],
                            overwrite: true,
                        }, { headers: auth });
                        transcriptId = await pollImport(imp.data.jobId);
                    } catch (e) {
                        console.error('Import Teams impossible', e);
                    }
                }
                try {
                    await axios.post(`/api/reunions-service/meetings/${meetingId}/link-transcript`, {
                        transcript_meeting_id: transcriptId,
                        teams_meeting_id: teams.meetingId || teams.joinUrl || teams.eventId,
                        teams_transcript_id: teams.transcriptId || null,
                        teams_subject: teams.subject,
                        teams_start: teams.startDateTime,
                    }, { headers: auth });
                } catch (e) { console.error(e); }
                if (transcriptId) {
                    try {
                        setCreateStep('Génération du compte rendu IA…');
                        const sum = await axios.post(`/api/transcriptmanager/meeting/${transcriptId}/summarize`, { niveau: 'normal' }, { headers: auth });
                        if (sum.data?.jobId) await pollSummarize(sum.data.jobId);
                    } catch (e) {
                        console.error('Synthèse IA impossible', e);
                    }
                }
            }

            setShowCreate(false);
            navigate(`/reunions-service/meetings/${meetingId}`);
        } catch (e) {
            const err = e as ApiErrorLike;
            setCreateError(err?.response?.data?.error || 'Erreur lors de la création');
            if (meetingId) {
                setShowCreate(false);
                navigate(`/reunions-service/meetings/${meetingId}`);
            }
        } finally {
            setCreating(false);
            setCreateStep('');
        }
    };

    const deleteMeeting = async (id: number, title: string) => {
        if (!isAdmin) return;
        if (!window.confirm(`Supprimer la réunion « ${title} » ? Cette action est définitive.`)) return;
        try {
            await axios.delete(`/api/reunions-service/meetings/${id}`, { headers: auth });
            load();
        } catch (e) { console.error(e); alert('Suppression impossible'); }
    };

    const deleteTemplate = async (id: number, name: string) => {
        if (!isAdmin) return;
        if (!window.confirm(`Supprimer le modèle « ${name} » ? Les réunions déjà créées à partir de ce modèle sont conservées.`)) return;
        try {
            await axios.delete(`/api/reunions-service/templates/${id}`, { headers: auth });
            load();
        } catch (e) { console.error(e); alert('Suppression impossible'); }
    };

    const duplicateTemplate = async (id: number) => {
        if (!isAdmin) return;
        try {
            const res = await axios.post(`/api/reunions-service/templates/${id}/duplicate`, {}, { headers: auth });
            navigate(`/reunions-service/templates/${res.data.id}`);
        } catch (e) { console.error(e); alert('Duplication impossible'); }
    };

    const stats = useMemo(() => ({
        planned: meetings.filter(m => m.status === 'planned').length,
        inProgress: meetings.filter(m => m.status === 'in_progress').length,
        finished: meetings.filter(m => m.status === 'finished').length,
        presentiel: meetings.filter(m => (m.meeting_mode || 'presentiel') === 'presentiel').length,
        distanciel: meetings.filter(m => m.meeting_mode === 'distanciel').length,
    }), [meetings]);

    const highlightSnippet = (text: string) => {
        const terms = searchQ.trim().split(/\s+/).filter(t => t.length >= 2);
        if (!terms.length) return text;
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(${terms.map(esc).join('|')})`, 'gi');
        const lowered = new Set(terms.map(t => t.toLowerCase()));
        return String(text).split(re).map((part, i) => (
            lowered.has(part.toLowerCase())
                ? <mark key={i} style={{ background: '#fef08a', padding: '0 1px', borderRadius: 2 }}>{part}</mark>
                : part
        ));
    };

    return (
        <div className="rsx-page">
            <style>{`
                .rsx-page { min-height: 100vh; background: #f8fafc; }
                .rsx-container { max-width: 1180px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
                .rsx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
                .rsx-title { margin: 0; font-size: 1.6rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                .rsx-sub { margin: .35rem 0 0; color: #64748b; font-size: .9rem; }
                .rsx-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
                .rsx-btn { display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 9px; padding: .6rem 1.05rem; font-weight: 700; font-size: .85rem; cursor: pointer; transition: transform .12s, background .15s; }
                .rsx-btn:hover:not(:disabled) { transform: translateY(-1px); }
                .rsx-btn:disabled { opacity: .6; cursor: default; }
                .rsx-btn-primary { background: #0078a4; color: #fff; box-shadow: 0 4px 10px -3px rgba(0,120,164,.4); }
                .rsx-btn-secondary { background: #fff; color: #334155; border: 1px solid #e2e8f0; }
                .rsx-btn-stats { background: #7c3aed; color: #fff; }
                .rsx-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: .75rem; margin-bottom: 1.1rem; }
                @media (max-width: 900px) { .rsx-kpis { grid-template-columns: repeat(2, 1fr); } }
                .rsx-kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: .8rem 1rem; }
                .rsx-kpi .n { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
                .rsx-kpi .l { font-size: .72rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
                .rsx-filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
                .rsx-filter { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 9px; padding: .45rem .6rem; }
                .rsx-filter input, .rsx-filter select { border: none; outline: none; background: transparent; font-size: .82rem; color: #334155; font-weight: 600; }
                .rsx-tabs { display: flex; gap: 6px; margin-bottom: 1rem; }
                .rsx-tab { border: 1px solid #e2e8f0; background: #fff; color: #64748b; padding: .5rem .95rem; border-radius: 9px; font-weight: 700; font-size: .85rem; cursor: pointer; }
                .rsx-tab.active { background: #0078a4; color: #fff; border-color: #0078a4; }
                .rsx-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
                .rsx-row { display: flex; align-items: center; gap: .8rem; padding: 1rem 1.15rem; border-bottom: 1px solid #f1f5f9; }
                .rsx-row:last-child { border-bottom: none; }
                .rsx-row:hover { background: #fbfdff; }
                .rsx-row-main { flex: 1; min-width: 0; cursor: pointer; }
                .rsx-row-main.static { cursor: default; }
                .rsx-row-title { font-weight: 700; color: #0f172a; font-size: .95rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                .rsx-row-meta { color: #64748b; font-size: .78rem; margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
                .rsx-chip { display: inline-flex; align-items: center; gap: 4px; font-size: .72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
                .rsx-icon-btn { background: #f1f5f9; border: none; border-radius: 8px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #475569; }
                .rsx-icon-btn:hover { background: #e2e8f0; }
                .rsx-icon-btn.danger:hover { background: #fee2e2; color: #b91c1c; }
                .rsx-empty { padding: 2.5rem; text-align: center; color: #94a3b8; font-size: .9rem; }
                .rsx-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; z-index: 1200; padding: 1rem; }
                .rsx-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 560px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.25); overflow: hidden; }
                .rsx-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 1.15rem 1.35rem .5rem; }
                .rsx-modal-body { padding: .5rem 1.35rem 1rem; display: flex; flex-direction: column; gap: .85rem; max-height: 70vh; overflow-y: auto; }
                .rsx-modal-foot { display: flex; justify-content: flex-end; gap: .6rem; padding: .9rem 1.35rem; border-top: 1px solid #f1f5f9; background: #fbfdff; }
                .rsx-field label { display: block; font-size: .78rem; font-weight: 700; color: #334155; margin-bottom: 4px; }
                .rsx-field input, .rsx-field select { width: 100%; padding: .55rem .7rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: .88rem; box-sizing: border-box; outline: none; }
                .rsx-field input:focus, .rsx-field select:focus { border-color: #0078a4; }
                .rsx-mode-row { display: flex; gap: 8px; }
                .rsx-mode-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: .55rem; border-radius: 9px; border: 1.5px solid #e2e8f0; background: #fff; color: #475569; font-weight: 700; font-size: .82rem; cursor: pointer; }
                .rsx-mode-btn.active { border-color: #0078a4; background: #f0f9ff; color: #0078a4; }
                .rsx-teams-item { display: flex; align-items: flex-start; gap: 8px; padding: .55rem .6rem; border: 1px solid #e2e8f0; border-radius: 9px; cursor: pointer; font-size: .82rem; }
                .rsx-teams-item.active { border-color: #0078a4; background: #f0f9ff; }
                .rsx-teams-item b { display: block; color: #1e293b; }
                .rsx-teams-item span { color: #64748b; font-size: .74rem; }
                .rsx-err { color: #b91c1c; font-size: .82rem; }
                .rsx-step { display: flex; align-items: center; gap: 8px; font-size: .82rem; color: #0078a4; font-weight: 700; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 9px; padding: .6rem .8rem; }
            `}</style>
            <Header />
            <div className="rsx-container">
                <div className="rsx-head">
                    <div>
                        <h1 className="rsx-title"><Presentation size={26} color="#0078a4" /> Réunions de service</h1>
                        <p className="rsx-sub">Modèles, occurrences, tenue en direct et comptes rendus associés.</p>
                    </div>
                    <div className="rsx-actions">
                        <button className="rsx-btn rsx-btn-secondary" onClick={() => setShowSearch(true)}>
                            <Search size={16} /> Recherche transverse
                        </button>
                        {isAdmin && (
                            <button className="rsx-btn rsx-btn-stats" onClick={() => navigate('/reunions-service/statistiques')}>
                                <BarChart3 size={16} /> Statistiques
                            </button>
                        )}
                        {isAdmin && (
                            <button className="rsx-btn rsx-btn-secondary" onClick={() => navigate('/reunions-service/templates/new')}>
                                <Plus size={16} /> Nouveau modèle
                            </button>
                        )}
                        <button className="rsx-btn rsx-btn-primary" onClick={openCreate} disabled={templates.length === 0}>
                            <Plus size={16} /> Nouvelle réunion
                        </button>
                    </div>
                </div>

                <div className="rsx-kpis">
                    <div className="rsx-kpi"><div className="n">{stats.planned}</div><div className="l">Planifiées</div></div>
                    <div className="rsx-kpi"><div className="n" style={{ color: '#b91c1c' }}>{stats.inProgress}</div><div className="l">En cours</div></div>
                    <div className="rsx-kpi"><div className="n">{stats.finished}</div><div className="l">Terminées</div></div>
                    <div className="rsx-kpi"><div className="n" style={{ color: '#92400e' }}>{stats.presentiel}</div><div className="l">Présentiel</div></div>
                    <div className="rsx-kpi"><div className="n" style={{ color: '#075985' }}>{stats.distanciel}</div><div className="l">Distanciel</div></div>
                </div>

                <div className="rsx-tabs">
                    <button className={`rsx-tab ${tab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>Réunions</button>
                    <button className={`rsx-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>Modèles</button>
                </div>

                {tab === 'meetings' && (
                    <div className="rsx-filters">
                        <div className="rsx-filter">
                            <Search size={14} color="#94a3b8" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un titre…" style={{ minWidth: 180 }} />
                        </div>
                        <div className="rsx-filter">
                            <Presentation size={14} color="#94a3b8" />
                            <select value={filterTemplate} onChange={e => setFilterTemplate(e.target.value)} title="Type de réunion (modèle utilisé)">
                                <option value="">Tous les types de réunion</option>
                                {meetingTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        </div>
                        <div className="rsx-filter">
                            <Calendar size={14} color="#94a3b8" />
                            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                                <option value="">Toutes les années</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="rsx-filter">
                            <CheckCircle2 size={14} color="#94a3b8" />
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                <option value="">Tous les statuts</option>
                                <option value="planned">Planifiées</option>
                                <option value="in_progress">En cours</option>
                                <option value="finished">Terminées</option>
                            </select>
                        </div>
                        <div className="rsx-filter">
                            <Video size={14} color="#94a3b8" />
                            <select value={filterMode} onChange={e => setFilterMode(e.target.value)}>
                                <option value="">Présentiel + distanciel</option>
                                <option value="presentiel">Présentiel</option>
                                <option value="distanciel">Distanciel</option>
                            </select>
                        </div>
                        <button className="rsx-btn rsx-btn-secondary" style={{ marginLeft: 'auto', padding: '.45rem .8rem' }} onClick={() => { setSearch(''); setFilterYear(''); setFilterStatus(''); setFilterMode(''); setFilterTemplate(''); }}>
                            Réinitialiser
                        </button>
                    </div>
                )}

                {error && <div className="rsx-err" style={{ marginBottom: 10 }}>{error}</div>}

                {tab === 'meetings' && (
                    <div className="rsx-card">
                        {loading && <div className="rsx-empty">Chargement…</div>}
                        {!loading && filteredMeetings.length === 0 && (
                            <div className="rsx-empty">Aucune réunion ne correspond aux filtres.</div>
                        )}
                        {!loading && filteredMeetings.map(m => {
                            const st = STATUS_META[m.status] || STATUS_META.planned;
                            return (
                                <div className="rsx-row" key={m.id}>
                                    <div className="rsx-row-main" onClick={() => navigate(`/reunions-service/meetings/${m.id}`)}>
                                        <div className="rsx-row-title">
                                            {titleWithDate(m.title, m.meeting_date)}
                                            <ModeBadge mode={m.meeting_mode} />
                                            <span className="rsx-chip" style={{ background: st.bg, color: st.color, borderColor: st.border }}>{st.label}</span>
                                            {m.transcript_meeting_id && (
                                                <span className="rsx-chip" style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' }}><Link2 size={11} /> CR lié</span>
                                            )}
                                        </div>
                                        <div className="rsx-row-meta">
                                            <span><Calendar size={13} style={{ verticalAlign: -2 }} /> {fmtDate(m.meeting_date)}</span>
                                            <span><Timer size={13} style={{ verticalAlign: -2 }} /> {fmtDuration(m.total_duration)}</span>
                                            <span><ListChecks size={13} style={{ verticalAlign: -2 }} /> {m.section_count || 0} rubriques</span>
                                            <span><Users size={13} style={{ verticalAlign: -2 }} /> {m.participant_count || 0} participants</span>
                                            <span><FileText size={13} style={{ verticalAlign: -2 }} /> {m.item_count || 0} items</span>
                                            {m.time_master_name && <span>⏱ {m.time_master_name}</span>}
                                        </div>
                                    </div>
                                    {m.status === 'planned' && (
                                        <button className="rsx-icon-btn" title="Ouvrir / démarrer" onClick={() => navigate(`/reunions-service/meetings/${m.id}`)}>
                                            <Play size={16} />
                                        </button>
                                    )}
                                    <button className="rsx-icon-btn" title="Ouvrir" onClick={() => navigate(`/reunions-service/meetings/${m.id}`)}>
                                        <ArrowRight size={16} />
                                    </button>
                                    {isAdmin && (
                                        <button className="rsx-icon-btn danger" title="Supprimer" onClick={() => deleteMeeting(m.id, m.title)}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {tab === 'templates' && (
                    <div className="rsx-card">
                        {loading && <div className="rsx-empty">Chargement…</div>}
                        {!loading && templates.length === 0 && (
                            <div className="rsx-empty">
                                Aucun modèle. {isAdmin ? 'Créez un modèle (ex. « REDI »).' : 'Un administrateur doit créer un modèle.'}
                            </div>
                        )}
                        {!loading && templates.map(t => (
                            <div className="rsx-row" key={t.id}>
                                <div className={`rsx-row-main ${isAdmin ? '' : 'static'}`} onClick={() => { if (isAdmin) navigate(`/reunions-service/templates/${t.id}`); }}>
                                    <div className="rsx-row-title">
                                        {t.name}
                                        {t.is_active === false && (
                                            <span className="rsx-chip" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>inactif</span>
                                        )}
                                    </div>
                                    <div className="rsx-row-meta">
                                        <span><ListChecks size={13} style={{ verticalAlign: -2 }} /> {t.section_count || 0} rubriques</span>
                                        <span><Clock size={13} style={{ verticalAlign: -2 }} /> {fmtDuration(t.total_duration)}</span>
                                        <span><Users size={13} style={{ verticalAlign: -2 }} /> {t.participant_count || 0} présents possibles</span>
                                        <span><Calendar size={13} style={{ verticalAlign: -2 }} /> {t.meeting_count || 0} réunions</span>
                                    </div>
                                    {t.description && <div className="rsx-row-meta" style={{ color: '#94a3b8' }}>{t.description}</div>}
                                </div>
                                {isAdmin && (
                                    <>
                                        <button className="rsx-icon-btn" title="Modifier" onClick={() => navigate(`/reunions-service/templates/${t.id}`)}>
                                            <Pencil size={16} />
                                        </button>
                                        <button className="rsx-icon-btn" title="Dupliquer" onClick={() => duplicateTemplate(t.id)}>
                                            <Copy size={16} />
                                        </button>
                                        <button className="rsx-icon-btn danger" title="Supprimer" onClick={() => deleteTemplate(t.id, t.name)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showSearch && (
                <div className="rsx-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSearch(false); }}>
                    <div className="rsx-modal" style={{ maxWidth: 920 }}>
                        <div className="rsx-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Search size={18} /> Recherche transverse dans les réunions
                            </h3>
                            <button onClick={() => setShowSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div className="rsx-modal-body">
                            <div className="rsx-field">
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchQ}
                                    onChange={e => setSearchQ(e.target.value)}
                                    placeholder="Un ou plusieurs mots clés (contenu des items, titres, participants)…"
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                                <div className="rsx-field" style={{ marginBottom: 0 }}>
                                    <label>Correspondance</label>
                                    <select value={searchMatch} onChange={e => setSearchMatch(e.target.value as 'all' | 'any')}>
                                        <option value="all">Tous les mots</option>
                                        <option value="any">Au moins un mot</option>
                                    </select>
                                </div>
                                <div className="rsx-field" style={{ marginBottom: 0 }}>
                                    <label>Type de réunion</label>
                                    <select value={searchTemplate} onChange={e => setSearchTemplate(e.target.value)}>
                                        <option value="">Tous les types</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="rsx-field" style={{ marginBottom: 0 }}>
                                    <label>Mode</label>
                                    <select value={searchMode} onChange={e => setSearchMode(e.target.value)}>
                                        <option value="">Présentiel + distanciel</option>
                                        <option value="presentiel">Présentiel</option>
                                        <option value="distanciel">Distanciel</option>
                                    </select>
                                </div>
                                <div className="rsx-field" style={{ marginBottom: 0 }}>
                                    <label>Du</label>
                                    <input type="date" value={searchFrom} onChange={e => setSearchFrom(e.target.value)} />
                                </div>
                                <div className="rsx-field" style={{ marginBottom: 0 }}>
                                    <label>Au</label>
                                    <input type="date" value={searchTo} onChange={e => setSearchTo(e.target.value)} />
                                </div>
                            </div>

                            <div style={{ fontSize: '.76rem', color: '#94a3b8' }}>
                                {searchLoading && 'Recherche en cours…'}
                                {!searchLoading && searchRan && `${searchResults.length} réunion(s) — ${searchResults.reduce((n, r) => n + (r.match_count || 0), 0)} correspondance(s)`}
                            </div>
                            {searchError && <div className="rsx-err">{searchError}</div>}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {searchResults.map(r => (
                                    <div key={r.meeting_id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                        <button
                                            onClick={() => { setShowSearch(false); navigate(`/reunions-service/meetings/${r.meeting_id}`); }}
                                            style={{ width: '100%', textAlign: 'left', border: 'none', background: '#f8fafc', padding: '.55rem .7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                                        >
                                            <b style={{ color: '#0f172a', fontSize: '.88rem' }}>{r.meeting_title}</b>
                                            <ModeBadge mode={r.meeting_mode} />
                                            <span style={{ color: '#64748b', fontSize: '.74rem' }}>{fmtDate(r.meeting_date)}</span>
                                            {r.template_name && <span style={{ color: '#94a3b8', fontSize: '.72rem' }}>{r.template_name}</span>}
                                            <span style={{ marginLeft: 'auto', color: '#0078a4', fontWeight: 800, fontSize: '.74rem' }}>{r.match_count} résultat(s)</span>
                                        </button>
                                        <div style={{ padding: '.3rem .7rem .5rem' }}>
                                            {r.matches.map((m, i) => (
                                                <div key={i} style={{ fontSize: '.8rem', color: '#334155', padding: '.25rem 0', borderBottom: i < r.matches.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                                    {m.kind === 'item' && (
                                                        <span style={{ display: 'inline-block', fontSize: '.68rem', fontWeight: 800, color: '#0078a4', background: '#e0f2fe', borderRadius: 999, padding: '0 7px', marginRight: 6 }}>
                                                            {m.section_title}{m.item_title ? ` · ${m.item_title}` : ''}
                                                        </span>
                                                    )}
                                                    {m.kind === 'meeting' && (
                                                        <span style={{ display: 'inline-block', fontSize: '.68rem', fontWeight: 800, color: '#7c3aed', background: '#ede9fe', borderRadius: 999, padding: '0 7px', marginRight: 6 }}>titre</span>
                                                    )}
                                                    {m.kind === 'participant' && (
                                                        <span style={{ display: 'inline-block', fontSize: '.68rem', fontWeight: 800, color: '#15803d', background: '#dcfce7', borderRadius: 999, padding: '0 7px', marginRight: 6 }}>participant</span>
                                                    )}
                                                    <span style={{ color: '#475569' }}>{highlightSnippet(m.snippet)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {!searchLoading && searchRan && searchResults.length === 0 && (
                                <div className="rsx-empty" style={{ padding: '1.5rem' }}>Aucune correspondance pour ces critères.</div>
                            )}
                        </div>
                        <div className="rsx-modal-foot">
                            <button className="rsx-btn rsx-btn-secondary" onClick={() => setShowSearch(false)}>Fermer</button>
                        </div>
                    </div>
                </div>
            )}

            {showCreate && (
                <div className="rsx-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !creating) setShowCreate(false); }}>
                    <div className="rsx-modal">
                        <div className="rsx-modal-head">
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Play size={18} /> Nouvelle réunion
                            </h3>
                            <button onClick={() => setShowCreate(false)} disabled={creating} style={{ background: 'none', border: 'none', cursor: creating ? 'default' : 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div className="rsx-modal-body">
                            <div className="rsx-field">
                                <label>Modèle de réunion</label>
                                <select value={createTemplateId} onChange={e => onSelectTemplate(e.target.value ? Number(e.target.value) : '')} disabled={creating}>
                                    <option value="">— Choisir —</option>
                                    {templates.filter(t => t.is_active !== false).map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="rsx-field">
                                <label>Titre de la réunion</label>
                                <input value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="Ex. REDI du 12 mai" disabled={creating} />
                            </div>
                            <div className="rsx-field">
                                <label>Date et heure (minutes : 00, 15, 30 ou 45)</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="date"
                                        value={splitLocalDateTime(createDate).datePart}
                                        onChange={e => updateCreateWhen({ datePart: e.target.value })}
                                        disabled={creating}
                                        style={{ flex: 1, minWidth: 0 }}
                                    />
                                    <select
                                        value={splitLocalDateTime(createDate).hour}
                                        onChange={e => updateCreateWhen({ hour: e.target.value })}
                                        disabled={creating}
                                        style={{ width: 78 }}
                                    >
                                        {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => (
                                            <option key={h} value={h}>{h} h</option>
                                        ))}
                                    </select>
                                    <select
                                        value={splitLocalDateTime(createDate).minute}
                                        onChange={e => updateCreateWhen({ minute: e.target.value })}
                                        disabled={creating}
                                        style={{ width: 78 }}
                                    >
                                        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="rsx-field">
                                <label>Mode de tenue</label>
                                <div className="rsx-mode-row">
                                    <button type="button" className={`rsx-mode-btn ${createMode === 'presentiel' ? 'active' : ''}`} onClick={() => setCreateMode('presentiel')} disabled={creating}>
                                        <Building2 size={15} /> Présentiel
                                    </button>
                                    <button type="button" className={`rsx-mode-btn ${createMode === 'distanciel' ? 'active' : ''}`} onClick={() => setCreateMode('distanciel')} disabled={creating}>
                                        <Video size={15} /> Distanciel (Teams)
                                    </button>
                                </div>
                            </div>

                            <div className="rsx-field">
                                <label><Video size={14} style={{ verticalAlign: -2 }} /> Réunion Exchange/O365 du {createDate ? new Date(createDate).toLocaleDateString('fr-FR') : '—'} (facultatif)</label>
                                <div style={{ fontSize: '.76rem', color: '#94a3b8', marginBottom: 4 }}>
                                    Recherche dans votre calendrier Outlook (Graph). Si un transcript est disponible, il sera importé et le CR IA généré ; sinon la réunion Exchange sera simplement associée.
                                </div>
                                {exchangeLoading && <div style={{ fontSize: '.8rem', color: '#64748b' }}><RefreshCw size={13} className="animate-spin" /> Recherche des réunions Exchange…</div>}
                                {!exchangeLoading && exchangeError && <div className="rsx-err">{exchangeError}</div>}
                                {!exchangeLoading && !exchangeError && exchangeList.length === 0 && (
                                    <div style={{ fontSize: '.8rem', color: '#94a3b8' }}>Aucune réunion Exchange/O365 trouvée à cette date.</div>
                                )}
                                {exchangeList.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                        <label className={`rsx-teams-item ${exchangeSelected === '' ? 'active' : ''}`}>
                                            <input type="radio" name="exchange" checked={exchangeSelected === ''} onChange={() => setExchangeSelected('')} disabled={creating} />
                                            <span><b>Aucune association</b><span>Créer la réunion sans occurrence Exchange.</span></span>
                                        </label>
                                        {exchangeList.map(t => (
                                            <label key={t.eventId} className={`rsx-teams-item ${exchangeSelected === t.eventId ? 'active' : ''}`}>
                                                <input type="radio" name="exchange" checked={exchangeSelected === t.eventId} onChange={() => setExchangeSelected(t.eventId)} disabled={creating} />
                                                <span>
                                                    <b>{t.subject || 'Réunion'}</b>
                                                    <span>
                                                        {t.startDateTime ? new Date(t.startDateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        {t.location ? ` · ${t.location}` : ''}
                                                        {t.transcriptId ? ' · transcript disponible' : t.isOnline ? ' · en ligne (transcript non encore disponible)' : ' · hors ligne'}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                                            L'occurrence DSIHub sera rattachée à l'occurrence Exchange sélectionnée.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {createStep && <div className="rsx-step"><RefreshCw size={14} className="animate-spin" /> {createStep}</div>}
                            {createError && <div className="rsx-err">{createError}</div>}
                        </div>
                        <div className="rsx-modal-foot">
                            <button className="rsx-btn rsx-btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>Annuler</button>
                            <button className="rsx-btn rsx-btn-primary" onClick={submitCreate} disabled={creating}>
                                <CheckCircle2 size={16} /> {creating ? 'Création…' : 'Créer la réunion'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
