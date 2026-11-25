import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import AgentSearch from '../../components/AgentSearch';
import type { AgentOption } from '../../components/AgentSearch';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';
import { useAuth } from '../../contexts/AuthContext';
import useReunionAccess from './useReunionAccess';
import {
    ArrowLeft, Plus, Trash2, Clock, Users, ChevronUp, ChevronDown, Save, X, Presentation,
    ListChecks, Sparkles, Lock, Pause, Gamepad2, BarChart3,
} from 'lucide-react';
import KpiConfigurator from './KpiConfigurator';
import type { KpiCatalog, KpiConfig } from './KpiConfigurator';

interface SectionDraft {
    title: string;
    duration_minutes: number;
    is_pause?: boolean;
    kpis?: KpiConfig[];
}

interface ParticipantDraft {
    email: string;
    name: string;
    username?: string | null;
}

interface ApiErrorLike {
    response?: { data?: { error?: string } };
    message?: string;
}

// Trame proposée par défaut pour une réunion de direction (REDI), reprise des
// comptes rendus OneNote 2026 (rubriques et durées constatées).
const REDI_SECTIONS: SectionDraft[] = [
    { title: 'DG/DGA', duration_minutes: 10 },
    { title: 'DSI', duration_minutes: 15 },
    { title: 'VIBECODING', duration_minutes: 15 },
    { title: 'RSSI', duration_minutes: 10 },
    { title: 'SERVICE DESK', duration_minutes: 15 },
    { title: 'SYSTEME & RESEAU', duration_minutes: 15 },
    { title: 'MCO & PROJETS', duration_minutes: 15 },
    { title: 'ECOLES', duration_minutes: 5 },
    {
        title: 'ADMINISTRATIF', duration_minutes: 5,
        kpis: [
            { id: 'kpi_ens_count', key: 'budget.ens_count', name: 'ENS — engagements non soldés', period: null, compare: 'none', display: 'number', filters: {} },
            { id: 'kpi_ens_list', key: 'budget.ens_list', name: 'ENS — détail', period: null, compare: 'none', display: 'list', filters: {} },
            { id: 'kpi_ens_section', key: 'budget.ens_par_section', name: 'ENS par section', period: null, compare: 'none', display: 'list', filters: {} },
        ],
    },
    { title: 'RELEVE DE DECISIONS', duration_minutes: 10 },
];
const DEFAULT_META_DURATION = 10;

const fmtTotal = (min: number) => {
    const m = Number(min) || 0;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`;
};

export default function ReunionServiceTemplateEdit() {
    const { token } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isNew = !id || id === 'new';
    const isAdmin = useReunionAccess();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [metaDuration, setMetaDuration] = useState(DEFAULT_META_DURATION);
    const [sections, setSections] = useState<SectionDraft[]>(isNew ? REDI_SECTIONS.map(s => ({ ...s })) : []);
    const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    // Catalogue des KPI du tableau de bord + rubrique en cours de paramétrage.
    const [kpiCatalog, setKpiCatalog] = useState<KpiCatalog | null>(null);
    const [kpiModalIdx, setKpiModalIdx] = useState<number | null>(null);

    const auth = { headers: { Authorization: `Bearer ${token}` } };

    useEffect(() => {
        if (!token) return;
        axios.get('/api/reunions-service/kpi-catalog', auth)
            .then(r => setKpiCatalog(r.data))
            .catch(() => setKpiCatalog(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (!isAdmin || isNew || !token) { setLoading(false); return; }
        setLoading(true);
        axios.get(`/api/reunions-service/templates/${id}`, auth)
            .then(res => {
                const t = res.data;
                setName(t.name || '');
                setDescription(t.description || '');
                setIsActive(t.is_active !== false);
                const allSections: { title: string; duration_minutes?: number; is_meta?: boolean; is_pause?: boolean }[] = Array.isArray(t.sections) ? t.sections : [];
                const meta = allSections.find(s => s.is_meta);
                setMetaDuration(Number(meta?.duration_minutes) || DEFAULT_META_DURATION);
                const secs = allSections
                    .filter(s => !s.is_meta)
                    .map(s => ({ title: s.title, duration_minutes: Number(s.duration_minutes) || 0, is_pause: !!s.is_pause, kpis: Array.isArray(s.kpis_config) ? s.kpis_config : [] }));
                setSections(secs.length ? secs : REDI_SECTIONS.map(s => ({ ...s })));
                setParticipants((Array.isArray(t.participants) ? t.participants : []).map((p: { email: string; name: string; username?: string }) => ({ email: p.email, name: p.name, username: p.username })));
            })
            .catch((e: ApiErrorLike) => setError(e?.response?.data?.error || 'Erreur de chargement'))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, token, isNew, isAdmin]);

    const sectionsTotal = sections.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    const total = sectionsTotal + (Number(metaDuration) || 0);
    const rowCount = sections.length + 1;

    const share = (minutes: number) => {
        const t = total || 1;
        return Math.max(0, Math.min(100, Math.round(((Number(minutes) || 0) / t) * 100)));
    };

    const updateSection = (idx: number, patch: Partial<SectionDraft>) => {
        setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
    };
    const addSection = () => setSections(prev => [...prev, { title: '', duration_minutes: 10 }]);
    const addPauseSection = () => setSections(prev => [...prev, { title: 'Pause', duration_minutes: 10, is_pause: true }]);
    const removeSection = (idx: number) => setSections(prev => prev.filter((_, i) => i !== idx));
    const moveSection = (idx: number, dir: -1 | 1) => {
        setSections(prev => {
            const next = [...prev];
            const target = idx + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    };
    const loadRediTrame = () => {
        if (!window.confirm('Remplacer les rubriques par la trame REDI par défaut ?')) return;
        setSections(REDI_SECTIONS.map(s => ({ ...s })));
        setMetaDuration(DEFAULT_META_DURATION);
    };

    const addParticipant = (a: AgentOption) => {
        const email = String(a.email || '').trim().toLowerCase();
        if (!email.includes('@')) { alert("Cet agent n'a pas d'adresse e-mail exploitable."); return; }
        setParticipants(prev => prev.some(p => p.email.toLowerCase() === email) ? prev : [...prev, { email, name: a.displayName || email, username: a.username }]);
    };
    const removeParticipant = (email: string) => setParticipants(prev => prev.filter(p => p.email.toLowerCase() !== email.toLowerCase()));
    const moveParticipant = (idx: number, dir: -1 | 1) => {
        setParticipants(prev => {
            const next = [...prev];
            const target = idx + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    };

    const save = async () => {
        if (!name.trim()) { setError('Le nom du modèle est requis.'); return; }
        const cleanSections = sections
            .map(s => ({
                title: s.title.trim(),
                duration_minutes: Math.max(0, Number(s.duration_minutes) || 0),
                is_pause: !!s.is_pause,
                kpis: s.is_pause ? [] : (s.kpis || []),
            }))
            .filter(s => s.title);
        if (cleanSections.length === 0) { setError('Ajoutez au moins une rubrique.'); return; }
        setSaving(true);
        setError('');
        try {
            const payload = {
                name: name.trim(),
                description,
                is_active: isActive,
                meta_duration_minutes: Math.max(0, Number(metaDuration) || 0),
                sections: cleanSections,
                participants,
            };
            if (isNew) {
                const res = await axios.post('/api/reunions-service/templates', payload, auth);
                navigate(`/reunions-service/templates/${res.data.id}`);
            } else {
                await axios.put(`/api/reunions-service/templates/${id}`, payload, auth);
                navigate('/reunions-service');
            }
        } catch (e) {
            const err = e as ApiErrorLike;
            setError(err?.response?.data?.error || 'Erreur lors de l\'enregistrement');
        } finally {
            setSaving(false);
        }
    };

    const kpis = useMemo(() => ([
        { label: 'Rubriques', value: rowCount, color: '#0078a4' },
        { label: 'Durée totale', value: fmtTotal(total), color: '#7c3aed' },
        { label: 'Présents', value: participants.length, color: '#15803d' },
    ]), [rowCount, total, participants.length]);

    if (!isAdmin) {
        return (
            <div className="rst-page">
                <Header />
                <div className="rst-container" style={{ textAlign: 'center', paddingTop: 80 }}>
                    <h1 className="rst-title" style={{ justifyContent: 'center' }}><Presentation size={22} color="#0078a4" /> Réservé aux administrateurs</h1>
                    <p style={{ color: '#64748b', marginTop: 10 }}>La création et la modification des modèles de réunion sont réservées aux administrateurs du module.</p>
                    <button className="rst-btn rst-btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/reunions-service')}>Retour aux réunions</button>
                </div>
            </div>
        );
    }

    return (
        <div className="rst-page">
            <style>{`
                .rst-page { min-height: 100vh; background: linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%); }
                .rst-container { max-width: 1160px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
                .rst-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
                .rst-back { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: .55rem .9rem; font-weight: 700; font-size: .82rem; color: #334155; cursor: pointer; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
                .rst-back:hover { background: #f8fafc; }
                .rst-title { margin: 0; font-size: 1.45rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 9px; }
                .rst-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: 1.1rem; }
                .rst-kpi { background: #fff; border: 1px solid #e6edf5; border-radius: 12px; padding: .7rem 1rem; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
                .rst-kpi .n { font-size: 1.35rem; font-weight: 800; line-height: 1.15; }
                .rst-kpi .l { font-size: .72rem; color: #64748b; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; margin-top: 2px; }
                .rst-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 1.25rem; align-items: start; }
                @media (max-width: 920px) { .rst-grid { grid-template-columns: 1fr; } .rst-kpis { grid-template-columns: repeat(3, 1fr); } }
                .rst-card { background: #fff; border: 1px solid #e6edf5; border-radius: 16px; padding: 1.25rem 1.35rem; box-shadow: 0 2px 10px -4px rgba(15,23,42,.08); }
                .rst-card + .rst-card { margin-top: 1.25rem; }
                .rst-card-head { display: flex; align-items: center; justify-content: space-between; gap: .6rem; margin-bottom: 1rem; }
                .rst-card-head h3 { margin: 0; font-size: .98rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
                .rst-count { font-size: .72rem; font-weight: 800; color: #0078a4; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 999px; padding: 2px 10px; }
                .rst-field { margin-bottom: .95rem; }
                .rst-field label { display: block; font-size: .76rem; font-weight: 700; color: #475569; margin-bottom: 5px; }
                .rst-field input, .rst-field textarea { width: 100%; padding: .6rem .75rem; border: 1px solid #d4deea; border-radius: 9px; font-size: .9rem; box-sizing: border-box; outline: none; font-family: inherit; background: #fff; transition: border-color .12s, box-shadow .12s; }
                .rst-field input:focus, .rst-field textarea:focus { border-color: #0078a4; box-shadow: 0 0 0 3px rgba(0,120,164,.12); }
                .rst-toggle { display: flex; align-items: center; gap: 8px; font-size: .82rem; color: #334155; font-weight: 600; padding: .55rem .7rem; background: #f8fafc; border: 1px solid #e6edf5; border-radius: 9px; }

                /* Lignes de rubriques */
                .rst-sec-list { display: flex; flex-direction: column; gap: 7px; }
                .rst-sec-row { display: flex; align-items: center; gap: 8px; padding: .45rem .5rem; border: 1px solid #edf2f7; border-radius: 11px; background: #fff; transition: border-color .12s, background .12s, box-shadow .12s; }
                .rst-sec-row:hover { border-color: #cfe3ef; background: #fbfdff; box-shadow: 0 2px 8px -6px rgba(0,120,164,.35); }
                .rst-sec-row.is-meta { background: linear-gradient(90deg,#f0f9ff,#f8fcff); border-color: #cdeaf7; }
                .rst-badge { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: .78rem; font-weight: 800; color: #0078a4; background: #e0f2fe; border: 1px solid #bae6fd; }
                .rst-badge.meta { background: #dcfce7; border-color: #bbf7d0; color: #15803d; }
                .rst-sec-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
                .rst-sec-title b { font-size: .86rem; color: #1e293b; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .rst-sec-title span { font-size: .68rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .rst-title-input { flex: 1; min-width: 0; border: 1px solid transparent; background: transparent; padding: .35rem .45rem; border-radius: 7px; font-size: .88rem; font-weight: 600; color: #1e293b; outline: none; }
                .rst-title-input:hover { border-color: #e2e8f0; background: #fff; }
                .rst-title-input:focus { border-color: #0078a4; background: #fff; box-shadow: 0 0 0 3px rgba(0,120,164,.1); }
                .rst-dur { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 1px 8px 1px 2px; }
                .rst-dur input { width: 46px; border: none; background: transparent; text-align: right; font-size: .86rem; font-weight: 700; color: #0f172a; padding: .3rem 2px; outline: none; -moz-appearance: textfield; }
                .rst-dur input::-webkit-outer-spin-button, .rst-dur input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                .rst-dur span { font-size: .7rem; color: #94a3b8; font-weight: 700; }
                .rst-share { width: 74px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; }
                .rst-share .bar { height: 4px; border-radius: 3px; background: #eef2f7; overflow: hidden; }
                .rst-share .bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg,#38bdf8,#0078a4); }
                .rst-share .pct { font-size: .64rem; color: #94a3b8; font-weight: 700; text-align: right; }
                .rst-row-actions { display: inline-flex; gap: 3px; flex-shrink: 0; }
                .rst-icon-btn { background: #f8fafc; border: 1px solid #edf2f7; border-radius: 7px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; flex-shrink: 0; transition: background .12s, color .12s, border-color .12s; }
                .rst-icon-btn:hover { background: #eef6fb; border-color: #cfe3ef; color: #0078a4; }
                .rst-icon-btn.danger:hover { background: #fee2e2; border-color: #fecaca; color: #b91c1c; }
                .rst-add { display: inline-flex; align-items: center; gap: 6px; margin-top: .7rem; background: #fff; border: 1px dashed #a9cbe0; border-radius: 9px; padding: .5rem .85rem; color: #0078a4; font-weight: 700; font-size: .82rem; cursor: pointer; }
                .rst-add:hover { background: #f0f9ff; border-color: #0078a4; }
                .rst-total { display: flex; align-items: center; justify-content: space-between; margin-top: 1rem; padding: .85rem 1rem; background: linear-gradient(90deg,#f8fafc,#f1f7fb); border: 1px solid #e6edf5; border-radius: 11px; }
                .rst-total .lab { font-size: .82rem; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px; }
                .rst-total .val { font-size: 1.05rem; font-weight: 800; color: #0f172a; }

                .rst-btn { display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 9px; padding: .6rem 1.05rem; font-weight: 700; font-size: .85rem; cursor: pointer; }
                .rst-btn-primary { background: #0078a4; color: #fff; box-shadow: 0 4px 10px -4px rgba(0,120,164,.5); }
                .rst-btn-primary:hover:not(:disabled) { background: #006a92; }
                .rst-btn-secondary { background: #fff; color: #334155; border: 1px solid #dfe7ef; }
                .rst-btn:disabled { opacity: .6; cursor: default; }
                .rst-trame-btn { display: inline-flex; align-items: center; gap: 5px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: .35rem .7rem; font-size: .74rem; font-weight: 700; cursor: pointer; }
                .rst-trame-btn:hover { background: #fef3c7; }

                .rst-part { display: flex; align-items: center; gap: 8px; padding: .5rem .6rem; border: 1px solid #edf2f7; border-radius: 10px; margin-bottom: 6px; }
                .rst-part:hover { background: #fbfdff; border-color: #cfe3ef; }
                .rst-part .nm { flex: 1; min-width: 0; }
                .rst-part .nm b { display: block; font-size: .84rem; color: #1e293b; }
                .rst-part .nm span { font-size: .72rem; color: #94a3b8; }
                .rst-empty-mini { font-size: .82rem; color: #94a3b8; padding: .4rem 0; }
                .rst-err { color: #b91c1c; font-size: .82rem; margin-top: .6rem; }
            `}</style>
            <Header />
            <div className="rst-container">
                <div className="rst-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="rst-back" onClick={() => navigate('/reunions-service')}><ArrowLeft size={16} /> Retour</button>
                        <h1 className="rst-title"><Presentation size={22} color="#0078a4" /> {isNew ? 'Nouveau modèle' : 'Modifier le modèle'}</h1>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="rst-btn rst-btn-secondary" onClick={() => navigate('/reunions-service')}>Annuler</button>
                        <button className="rst-btn rst-btn-primary" onClick={save} disabled={saving || loading}>
                            <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="rst-card">Chargement…</div>
                ) : (
                    <>
                        <div className="rst-kpis">
                            {kpis.map(k => (
                                <div className="rst-kpi" key={k.label}>
                                    <div className="n" style={{ color: k.color }}>{k.value}</div>
                                    <div className="l">{k.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="rst-grid">
                            <div>
                                <div className="rst-card">
                                    <div className="rst-card-head"><h3><Presentation size={16} /> Informations</h3></div>
                                    <div className="rst-field">
                                        <label>Nom du modèle *</label>
                                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex. REDI — Réunion de direction" />
                                    </div>
                                    <div className="rst-field">
                                        <label>Description</label>
                                        <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Objet, fréquence…" />
                                    </div>
                                    <label className="rst-toggle">
                                        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                        Modèle actif (proposé à la création d'une réunion)
                                    </label>
                                </div>

                                <div className="rst-card">
                                    <div className="rst-card-head">
                                        <h3><Clock size={16} /> Rubriques et durées théoriques</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <button className="rst-trame-btn" onClick={loadRediTrame} title="Pré-remplir avec les rubriques d'une REDI">
                                                <Sparkles size={13} /> Trame REDI
                                            </button>
                                            <span className="rst-count">{rowCount} rubriques</span>
                                        </div>
                                    </div>

                                    <div className="rst-sec-list">
                                        {/* Rubrique meta — automatique, durée modifiable */}
                                        <div className="rst-sec-row is-meta">
                                            <div className="rst-badge meta"><Users size={14} /></div>
                                            <div className="rst-sec-title">
                                                <b>META — Participants</b>
                                                <span>Liste des personnes prévues (ajoutée automatiquement) <Lock size={10} style={{ verticalAlign: -1 }} /></span>
                                            </div>
                                            <div className="rst-dur">
                                                <input type="number" min={0} step={5} value={metaDuration} onChange={e => setMetaDuration(Number(e.target.value))} title="Durée théorique de la rubrique meta (minutes)" />
                                                <span>min</span>
                                            </div>
                                            <div className="rst-share">
                                                <div className="bar"><i style={{ width: `${share(metaDuration)}%` }} /></div>
                                                <div className="pct">{share(metaDuration)}%</div>
                                            </div>
                                            <div className="rst-row-actions">
                                                <button className="rst-icon-btn" disabled title="Rubrique automatique"><Lock size={13} /></button>
                                            </div>
                                        </div>

                                        {sections.map((s, idx) => (
                                            <div key={idx}>
                                            <div className="rst-sec-row" style={s.is_pause ? { background: '#fffbeb', borderColor: '#fcd34d' } : undefined}>
                                                <div className="rst-badge" style={s.is_pause ? { background: '#f59e0b' } : undefined}>{s.is_pause ? <Pause size={12} /> : idx + 1}</div>
                                                <input className="rst-title-input" value={s.title} onChange={e => updateSection(idx, { title: e.target.value })} placeholder={s.is_pause ? 'Pause (Tetris)' : `Rubrique ${idx + 1}`} />
                                                <div className="rst-dur">
                                                    <input type="number" min={0} step={5} value={s.duration_minutes} onChange={e => updateSection(idx, { duration_minutes: Number(e.target.value) })} title="Durée théorique (minutes)" />
                                                    <span>min</span>
                                                </div>
                                                <div className="rst-share">
                                                    <div className="bar"><i style={{ width: `${share(s.duration_minutes)}%`, background: s.is_pause ? '#f59e0b' : undefined }} /></div>
                                                    <div className="pct">{share(s.duration_minutes)}%</div>
                                                </div>
                                                <div className="rst-row-actions">
                                                    {!s.is_pause && (
                                                        <button
                                                            className="rst-icon-btn"
                                                            onClick={() => setKpiModalIdx(idx)}
                                                            title="Associer des KPI à cette rubrique"
                                                            style={{ width: 'auto', padding: '0 8px', gap: 4, color: (s.kpis || []).length ? '#0078a4' : undefined, background: (s.kpis || []).length ? '#eef6fb' : undefined, borderColor: (s.kpis || []).length ? '#cfe3ef' : undefined }}
                                                        >
                                                            <BarChart3 size={14} />{(s.kpis || []).length ? <span style={{ fontSize: '.7rem', fontWeight: 800 }}>{s.kpis!.length}</span> : null}
                                                        </button>
                                                    )}
                                                    <button
                                                        className="rst-icon-btn"
                                                        onClick={() => updateSection(idx, { is_pause: !s.is_pause, title: s.is_pause ? s.title : (s.title || 'Pause'), kpis: s.is_pause ? s.kpis : [] })}
                                                        title={s.is_pause ? 'Repasser en rubrique normale' : 'Marquer comme pause (Tetris multijoueur)'}
                                                        style={s.is_pause ? { color: '#b45309', background: '#fef3c7' } : undefined}
                                                    ><Pause size={15} /></button>
                                                    <button className="rst-icon-btn" onClick={() => moveSection(idx, -1)} disabled={idx === 0} title="Monter"><ChevronUp size={15} /></button>
                                                    <button className="rst-icon-btn" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} title="Descendre"><ChevronDown size={15} /></button>
                                                    <button className="rst-icon-btn danger" onClick={() => removeSection(idx)} title="Supprimer"><Trash2 size={15} /></button>
                                                </div>
                                            </div>
                                            {!s.is_pause && (s.kpis || []).length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '-2px 0 2px 34px' }}>
                                                    {s.kpis!.map(k => (
                                                        <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.72rem', background: '#eff6ff', border: '1px solid #dbeafe', color: '#1d4ed8', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>
                                                            <BarChart3 size={10} /> {k.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button className="rst-add" onClick={addSection}><Plus size={15} /> Ajouter une rubrique</button>
                                        <button className="rst-add" onClick={addPauseSection} style={{ color: '#b45309', borderColor: '#fcd34d', background: '#fffbeb' }}><Gamepad2 size={15} /> Ajouter une pause (Tetris)</button>
                                    </div>

                                    <div className="rst-total">
                                        <span className="lab"><ListChecks size={15} /> Durée théorique globale</span>
                                        <span className="val">{fmtTotal(total)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rst-card">
                                <div className="rst-card-head">
                                    <h3><Users size={16} /> Présents possibles</h3>
                                    <span className="rst-count">{participants.length}</span>
                                </div>
                                <AgentSearch onSelect={addParticipant} placeholder="Rechercher un agent (nom, email…)" />
                                <div style={{ marginTop: 12 }}>
                                    {participants.length === 0 && <div className="rst-empty-mini">Aucun présent pré-enregistré.</div>}
                                    {participants.map((p, idx) => (
                                        <div className="rst-part" key={p.email}>
                                            <div className="nm">
                                                <b>{p.name}</b>
                                                <span>{p.email}</span>
                                            </div>
                                            <AgentPresenceBadge email={p.email} name={p.name} />
                                            <button className="rst-icon-btn" onClick={() => moveParticipant(idx, -1)} disabled={idx === 0} title="Monter"><ChevronUp size={14} /></button>
                                            <button className="rst-icon-btn" onClick={() => moveParticipant(idx, 1)} disabled={idx === participants.length - 1} title="Descendre"><ChevronDown size={14} /></button>
                                            <button className="rst-icon-btn danger" onClick={() => removeParticipant(p.email)} title="Retirer"><X size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: '.75rem', color: '#94a3b8', marginTop: 12, lineHeight: 1.5 }}>
                                    Ces personnes sont recopiées comme participants prévus de chaque réunion créée à partir de ce modèle.
                                </div>
                            </div>
                        </div>
                        {error && <div className="rst-err">{error}</div>}
                    </>
                )}
            </div>

            {kpiModalIdx !== null && sections[kpiModalIdx] && (
                <KpiConfigurator
                    open
                    sectionTitle={sections[kpiModalIdx].title}
                    kpis={sections[kpiModalIdx].kpis || []}
                    catalog={kpiCatalog}
                    templateId={!isNew ? Number(id) : null}
                    meetingDate={null}
                    onClose={() => setKpiModalIdx(null)}
                    onChange={(next) => updateSection(kpiModalIdx, { kpis: next })}
                />
            )}
        </div>
    );
}
