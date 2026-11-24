import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import useReunionAccess from './useReunionAccess';
import {
    BarChart3, ArrowLeft, Users, Clock, XCircle, AlertTriangle, Timer, RefreshCw,
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend,
} from 'recharts';

interface ApiErrorLike { response?: { status?: number; data?: { error?: string } }; message?: string; }
interface Rubrique { title: string; is_meta: boolean; meetings: number; total_min: number; avg_min: number; items: number; }
interface ServiceRow { service: string; total: number; present: number; excused: number; absent: number; }
interface AbsentRow { name: string; service: string; total: number; present: number; excused: number; absent: number; }
interface OverrunDetail { id: number; title: string; date: string; theoretical: number; actual: number; overrun: number; }
interface DetailedStats {
    year: number | null;
    kpis: {
        meetings: number; planned: number; in_progress: number; finished: number;
        total_min: number; avg_min: number; participants_total: number;
        present: number; excused: number; absent: number;
        presence_rate: number; excused_rate: number; absence_rate: number;
        items: number; attachments: number; with_transcript: number;
        presentiel: number; distanciel: number;
    };
    by_year: { year: number; meetings: number; total_min: number }[];
    by_month: { month: number; meetings: number }[];
    by_status: { status: string; n: number }[];
    rubriques: Rubrique[];
    services: ServiceRow[];
    top_absent: AbsentRow[];
    overruns: { available: boolean; count: number; avg_min: number; max_min: number; details: OverrunDetail[] };
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const fmtMin = (m: number) => {
    const v = Math.round(Number(m) || 0);
    const h = Math.floor(v / 60);
    const r = v % 60;
    return h ? `${h} h${r ? ` ${r}` : ''}` : `${r} min`;
};

export default function ReunionsServiceStats() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const isAdmin = useReunionAccess();
    const [year, setYear] = useState<string>('');
    const [data, setData] = useState<DetailedStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const load = async (y = year) => {
        if (!token || !isAdmin) { setLoading(false); return; }
        setLoading(true);
        setError('');
        try {
            const res = await axios.get('/api/reunions-service/stats/detailed', { params: y ? { year: y } : {}, headers: auth });
            setData(res.data);
        } catch (e) {
            const err = e as ApiErrorLike;
            const status = err?.response?.status;
            const msg = err?.response?.data?.error || err?.message || 'Erreur de chargement des statistiques';
            setError(status ? `${status} — ${msg}${status === 404 ? " (redémarrez le backend pour activer l'endpoint /stats/detailed)" : ''}` : msg);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [token, isAdmin]);

    if (!isAdmin) {
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
                <Header />
                <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', color: '#475569' }}>
                    <BarChart3 size={40} color="#7c3aed" />
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>Statistiques réservées aux administrateurs</h1>
                    <button className="rs-st-btn rs-st-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/reunions-service')}>Retour aux réunions</button>
                </div>
            </div>
        );
    }

    const k = data?.kpis;
    const years = data?.by_year?.map(y => String(y.year)) || [];
    const presencePie = k ? [
        { name: 'Présents', value: k.present, color: '#16a34a' },
        { name: 'Excusés', value: k.excused, color: '#f59e0b' },
        { name: 'Absents', value: k.absent, color: '#94a3b8' },
    ] : [];
    const rubriques = (data?.rubriques || []).filter(r => !r.is_meta).slice(0, 12);
    const services = (data?.services || []).slice(0, 10).map(s => ({
        ...s,
        presence_rate: s.total ? Math.round((s.present / s.total) * 100) : 0,
    }));

    return (
        <div className="rs-st-page">
            <style>{`
                .rs-st-page { min-height: 100vh; background: #f1f5f9; }
                .rs-st-container { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }
                .rs-st-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.2rem; }
                .rs-st-title { margin: 0; font-size: 1.45rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
                .rs-st-btn { display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 9px; padding: .55rem 1rem; font-weight: 700; font-size: .84rem; cursor: pointer; }
                .rs-st-primary { background: #0078a4; color: #fff; }
                .rs-st-secondary { background: #fff; color: #334155; border: 1px solid #e2e8f0; }
                .rs-st-filters { display: flex; gap: .6rem; align-items: center; margin-bottom: 1rem; }
                .rs-st-select { padding: .5rem .7rem; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; font-weight: 700; font-size: .84rem; color: #334155; }
                .rs-st-kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: .7rem; margin-bottom: 1rem; }
                @media (max-width: 1100px) { .rs-st-kpis { grid-template-columns: repeat(3, 1fr); } }
                @media (max-width: 640px) { .rs-st-kpis { grid-template-columns: repeat(2, 1fr); } }
                .rs-st-kpi { background: #fff; border: 1px solid #e6edf5; border-radius: 12px; padding: .75rem .9rem; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
                .rs-st-kpi .v { font-size: 1.35rem; font-weight: 800; line-height: 1.15; color: #0f172a; }
                .rs-st-kpi .l { font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; color: #64748b; font-weight: 800; margin-top: 3px; }
                .rs-st-kpi .s { font-size: .68rem; color: #94a3b8; margin-top: 2px; }
                .rs-st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                @media (max-width: 980px) { .rs-st-grid { grid-template-columns: 1fr; } }
                .rs-st-card { background: #fff; border: 1px solid #e6edf5; border-radius: 14px; padding: 1rem 1.1rem; min-width: 0; }
                .rs-st-card h3 { margin: 0 0 .7rem; font-size: .92rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px; }
                .rs-st-card.full { grid-column: 1 / -1; }
                .rs-st-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
                .rs-st-table th { text-align: left; color: #64748b; font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; padding: .4rem .3rem; border-bottom: 1px solid #e2e8f0; }
                .rs-st-table td { padding: .38rem .3rem; border-bottom: 1px solid #f1f5f9; color: #334155; }
                .rs-st-table tr:last-child td { border-bottom: none; }
                .rs-st-empty { padding: 1.2rem; text-align: center; color: #94a3b8; font-size: .82rem; }
                .rs-st-err { color: #b91c1c; font-size: .85rem; }
            `}</style>
            <Header />
            <div className="rs-st-container">
                <div className="rs-st-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="rs-st-btn rs-st-secondary" onClick={() => navigate('/reunions-service')}><ArrowLeft size={16} /> Retour</button>
                        <h1 className="rs-st-title"><BarChart3 size={24} color="#7c3aed" /> Statistiques & KPI</h1>
                    </div>
                    <div className="rs-st-filters">
                        <select className="rs-st-select" value={year} onChange={e => { setYear(e.target.value); load(e.target.value); }}>
                            <option value="">Toutes les années</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button className="rs-st-btn rs-st-secondary" onClick={() => load(year)} disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
                        </button>
                    </div>
                </div>

                {error && <div className="rs-st-err" style={{ marginBottom: 10 }}>{error}</div>}
                {loading && !data && <div className="rs-st-card">Chargement des statistiques…</div>}

                {data && k && (
                    <>
                        <div className="rs-st-kpis">
                            <div className="rs-st-kpi"><div className="v">{k.meetings}</div><div className="l">Réunions</div><div className="s">{k.finished} terminées · {k.planned} planifiées</div></div>
                            <div className="rs-st-kpi"><div className="v">{fmtMin(k.avg_min)}</div><div className="l">Durée moyenne</div><div className="s">{fmtMin(k.total_min)} au total</div></div>
                            <div className="rs-st-kpi"><div className="v" style={{ color: '#15803d' }}>{k.presence_rate} %</div><div className="l">Taux de présence</div><div className="s">{k.present} présences</div></div>
                            <div className="rs-st-kpi"><div className="v" style={{ color: '#b45309' }}>{k.excused_rate} %</div><div className="l">Excusés</div><div className="s">{k.excused} sur {k.participants_total}</div></div>
                            <div className="rs-st-kpi"><div className="v" style={{ color: '#64748b' }}>{k.absence_rate} %</div><div className="l">Absents</div><div className="s">{k.absent} non excusés</div></div>
                            <div className="rs-st-kpi"><div className="v">{k.with_transcript}</div><div className="l">CR associés</div><div className="s">{k.items} items · {k.attachments} PJ</div></div>
                        </div>

                        <div className="rs-st-grid">
                            <div className="rs-st-card">
                                <h3><BarChart3 size={15} /> Réunions par année</h3>
                                <ResponsiveContainer width="100%" height={230}>
                                    <BarChart data={data.by_year}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="meetings" name="Réunions" fill="#0078a4" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rs-st-card">
                                <h3><Clock size={15} /> Réunions par mois ({year || new Date().getFullYear()})</h3>
                                <ResponsiveContainer width="100%" height={230}>
                                    <BarChart data={(data.by_month || []).map(m => ({ ...m, label: MONTHS[m.month - 1] }))}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="meetings" name="Réunions" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rs-st-card">
                                <h3><Users size={15} /> Présence globale</h3>
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={presencePie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                                            {presencePie.map(p => <Cell key={p.name} fill={p.color} />)}
                                        </Pie>
                                        <Legend />
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rs-st-card">
                                <h3><Timer size={15} /> Temps théorique par rubrique</h3>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={rubriques} layout="vertical" margin={{ left: 20, right: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="title" width={120} tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Bar dataKey="total_min" name="Minutes" fill="#0891b2" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rs-st-card">
                                <h3><Users size={15} /> Présence par service</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={services} layout="vertical" margin={{ left: 20, right: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                        <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                                        <YAxis type="category" dataKey="service" width={150} tick={{ fontSize: 10 }} />
                                        <Tooltip formatter={(v) => `${v ?? 0} %`} />
                                        <Bar dataKey="presence_rate" name="Présence" fill="#16a34a" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rs-st-card">
                                <h3><AlertTriangle size={15} /> Dépassements de temps</h3>
                                {!data.overruns.available ? (
                                    <div className="rs-st-empty">
                                        Aucune donnée de dépassement pour l'instant.<br />
                                        Les dépassements seront calculés à partir des réunions ouvertes et clôturées avec un vrai temps de séance.
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <span className="rs-st-kpi" style={{ padding: '.45rem .7rem' }}><span style={{ fontWeight: 800 }}>{data.overruns.count}</span> <span style={{ fontSize: '.72rem', color: '#64748b' }}>dépassements</span></span>
                                            <span className="rs-st-kpi" style={{ padding: '.45rem .7rem' }}><span style={{ fontWeight: 800 }}>{fmtMin(data.overruns.avg_min)}</span> <span style={{ fontSize: '.72rem', color: '#64748b' }}>moyenne</span></span>
                                            <span className="rs-st-kpi" style={{ padding: '.45rem .7rem' }}><span style={{ fontWeight: 800 }}>{fmtMin(data.overruns.max_min)}</span> <span style={{ fontSize: '.72rem', color: '#64748b' }}>maximum</span></span>
                                        </div>
                                        <table className="rs-st-table">
                                            <thead><tr><th>Réunion</th><th>Théorique</th><th>Réel</th><th>Dépass.</th></tr></thead>
                                            <tbody>
                                                {data.overruns.details.map(d => (
                                                    <tr key={d.id}><td>{d.title}</td><td>{fmtMin(d.theoretical)}</td><td>{fmtMin(d.actual)}</td><td style={{ color: '#b91c1c', fontWeight: 700 }}>+{fmtMin(d.overrun)}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>
                            <div className="rs-st-card full">
                                <h3><XCircle size={15} /> Principaux absents / excusés</h3>
                                {data.top_absent.length === 0 ? <div className="rs-st-empty">Aucune absence enregistrée sur la période.</div> : (
                                    <table className="rs-st-table">
                                        <thead><tr><th>Agent</th><th>Service</th><th>Réunions</th><th>Présent</th><th>Excusé</th><th>Absent</th></tr></thead>
                                        <tbody>
                                            {data.top_absent.map((p, i) => (
                                                <tr key={`${p.name}-${i}`}>
                                                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                                                    <td style={{ color: '#64748b' }}>{p.service || '—'}</td>
                                                    <td>{p.total}</td>
                                                    <td style={{ color: '#15803d' }}>{p.present}</td>
                                                    <td style={{ color: '#b45309' }}>{p.excused}</td>
                                                    <td style={{ color: '#b91c1c' }}>{p.absent}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
