import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Header';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, ComposedChart,
} from 'recharts';
import {
  AlertTriangle, TrendingUp, TrendingDown, Minus, Clock,
  Ticket, CheckCircle, XCircle, Users, AlertCircle,
  ArrowLeft, Calendar,
} from 'lucide-react';

const COLORS = {
  indigo: '#6366f1', indigoLight: '#a5b4fc', indigoBg: '#eef2ff',
  amber: '#f59e0b', amberLight: '#fcd34d', amberBg: '#fffbeb',
  green: '#22c55e', greenLight: '#86efac', greenBg: '#f0fdf4',
  red: '#ef4444', redLight: '#fca5a5', redBg: '#fef2f2',
  slate: '#64748b', slateLight: '#cbd5e1',
  blue: '#3b82f6', blueLight: '#93c5fd',
  teal: '#14b8a6',
  pink: '#ec4899',
  purple: '#a855f7',
};

const STATUS_COLORS: Record<string, string> = {
  'Nouveau': '#6366f1', 'Affecté': '#3b82f6', 'En cours': '#f59e0b',
  'En attente utilisateur': '#64748b', 'En attente fournisseur': '#94a3b8',
  'Résolu': '#22c55e', 'Fermé': '#16a34a', 'Rejeté': '#ef4444',
};

const PIE_COLORS = [COLORS.indigo, COLORS.amber, COLORS.green, COLORS.red, COLORS.blue, COLORS.teal, COLORS.pink, COLORS.purple];

function fmt(n: number | undefined | null): string {
  if (n == null) return '0';
  return n.toLocaleString('fr-FR');
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtHours(h: number | undefined | null): string {
  if (h == null || h === 0) return '-';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} j`;
}

export default function TicketsStats() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const tok = token || localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${tok}` };

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filtre groupe ───────────────────────────────────────────
  const [groups, setGroups] = useState<any[]>([]);
  const [fGroup, setFGroup] = useState<string>('');

  useEffect(() => {
    if (!tok) return;
    axios.get('/api/tickets/admin/groups', { headers })
      .then(r => setGroups(r.data || []))
      .catch(() => {});
  }, [tok]);

  // ── Filtres période (année / mois / glissante) ──────────────
  const _now = new Date();
  const [filterMode, setFilterMode] = useState<'all' | 'year' | 'month' | 'rolling'>('all');
  const [fYear, setFYear] = useState(_now.getFullYear());
  const [fMonth, setFMonth] = useState(_now.getMonth() + 1);
  const [fRolling, setFRolling] = useState<'today' | '7d' | '30d' | '90d'>('30d');

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const computeRange = useCallback((): { from: string | null; to: string | null } => {
    if (filterMode === 'year') return { from: `${fYear}-01-01`, to: `${fYear}-12-31` };
    if (filterMode === 'month') {
      const last = new Date(fYear, fMonth, 0).getDate();
      return { from: `${fYear}-${pad2(fMonth)}-01`, to: `${fYear}-${pad2(fMonth)}-${pad2(last)}` };
    }
    if (filterMode === 'rolling') {
      const days = { today: 0, '7d': 6, '30d': 29, '90d': 89 }[fRolling];
      const to = new Date();
      const from = new Date(); from.setDate(from.getDate() - days);
      return { from: ymd(from), to: ymd(to) };
    }
    return { from: null, to: null };
  }, [filterMode, fYear, fMonth, fRolling]);

  const fetchStats = useCallback(async () => {
    if (!tok) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeRange();
      const params: any = (from && to) ? { from, to } : {};
      if (fGroup) params.group_id = fGroup;
      const { data } = await axios.get('/api/tickets/stats', { headers, params });
      setStats(data);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [tok, computeRange, fGroup]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading && !stats) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: COLORS.indigo, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 16 }} />
        <span style={{ color: COLORS.slate }}>Chargement des statistiques…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !stats) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ textAlign: 'center', padding: 60, color: COLORS.red }}>
        <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Erreur</div>
        <div style={{ fontSize: 14, marginTop: 8 }}>{error || 'Impossible de charger les données'}</div>
      </div>
    </div>
  );

  const { overview, statusDistribution, typeDistribution, priorityDistribution,
    monthlyTrend, weeklyCreated, categoryDistribution, groupDistribution, topRequesters,
    technicianAssignments, resolutionTimeTrend, backlogAging,
    slaOverview, hourlyDistribution, reopened30d,
    avgResolutionHours, avgClosureHours, weeklyComparison,
    topRequestersExtended, technicianPerformance, topSoftwares, vipByPriority,
    statusTrend, incidentVsRequestTrend, topObservers, categoryPerformance } = stats;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .stats-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 24px; }
        .stats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .stats-table th { text-align: left; padding: 8px 12px; color: #64748b; font-weight: 600; font-size: 12px; border-bottom: 2px solid #e2e8f0; }
        .stats-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
        .stats-table tr:hover td { background: #f8fafc; }
      `}</style>
      <Header />

      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <button onClick={() => navigate('/tickets')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}><ArrowLeft size={16} /> Retour aux tickets</button>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: 0 }}>Statistiques du helpdesk</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Sélecteur de mode */}
            <div style={{ display: 'inline-flex', background: '#eef2ff', borderRadius: 8, padding: 3 }}>
              {([['all', 'Tout'], ['year', 'Année'], ['month', 'Mois'], ['rolling', 'Période']] as const).map(([m, lbl]) => (
                <button key={m} onClick={() => setFilterMode(m)}
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: filterMode === m ? '#fff' : 'transparent', color: filterMode === m ? COLORS.indigo : COLORS.slate,
                    boxShadow: filterMode === m ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                  {lbl}
                </button>
              ))}
            </div>
            {(filterMode === 'year' || filterMode === 'month') && (
              <select value={fYear} onChange={e => setFYear(Number(e.target.value))}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                {Array.from({ length: 8 }, (_, i) => _now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {filterMode === 'month' && (
              <select value={fMonth} onChange={e => setFMonth(Number(e.target.value))}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
              </select>
            )}
            {filterMode === 'rolling' && (
              <select value={fRolling} onChange={e => setFRolling(e.target.value as any)}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="today">Aujourd'hui</option>
                <option value="7d">7 derniers jours</option>
                <option value="30d">30 derniers jours</option>
                <option value="90d">90 derniers jours</option>
              </select>
            )}
            <select value={fGroup} onChange={e => setFGroup(e.target.value)}
              title="Filtrer par groupe assigné"
              style={{ padding: '7px 10px', border: `1px solid ${fGroup ? COLORS.indigo : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, background: fGroup ? COLORS.indigoBg : '#fff', color: fGroup ? COLORS.indigo : COLORS.slate, fontWeight: fGroup ? 600 : 400 }}>
              <option value="">👥 Tous les groupes</option>
              {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={fetchStats} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: COLORS.slate }}>{loading ? '⏳' : '🔄'} Actualiser</button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          <KpiCard label="Ouverts" value={overview?.open} sub={`${overview?.in_progress || 0} en cours`} color={COLORS.indigo} bg={COLORS.indigoBg} icon={<Ticket size={20} />} />
          <KpiCard label="Critiques" value={overview?.critical_open} sub="Priorité 5" color={COLORS.red} bg={COLORS.redBg} icon={<AlertCircle size={20} />} />
          <KpiCard label="Résolus / mois" value={monthlyTrend?.[monthlyTrend.length - 1]?.resolved || 0} sub="Ce mois-ci" color={COLORS.green} bg={COLORS.greenBg} icon={<CheckCircle size={20} />} />
          <KpiCard label="VIP ouverts" value={overview?.vip_open} sub="Élus / directions" color={COLORS.amber} bg={COLORS.amberBg} icon={<Users size={20} />} />
          <KpiCard label="SLA violés" value={overview?.sla_breached} sub="Engagements" color={COLORS.red} bg={COLORS.redBg} icon={<AlertTriangle size={20} />} />
          <KpiCard label="Résolution moy." value={fmtHours(avgResolutionHours)} sub="Ce mois" color={COLORS.teal} bg="#f0fdfa" icon={<Clock size={20} />} />
        </div>

        {/* Row 2 : cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Trend chart : barres = créés ventilés par état (empilé) ; ligne = résolus dans le mois */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Tendance mensuelle</div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={monthlyTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="nouveau" stackId="c" name="Nouveau" fill={STATUS_COLORS['Nouveau']} />
                <Bar dataKey="en_cours" stackId="c" name="En cours" fill={STATUS_COLORS['En cours']} />
                <Bar dataKey="en_attente" stackId="c" name="En attente" fill={COLORS.amber} />
                <Bar dataKey="resolu" stackId="c" name="Résolu" fill={STATUS_COLORS['Résolu']} />
                <Bar dataKey="clos" stackId="c" name="Clos" fill={STATUS_COLORS['Fermé']} radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejete" stackId="c" name="Rejeté" fill={STATUS_COLORS['Rejeté']} />
                <Line dataKey="resolved" name="Résolus (mois)" stroke={COLORS.teal} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 6 }}>
              Barres : tickets créés dans le mois (par état actuel). Ligne : tickets résolus durant le mois (peut dépasser les créations).
            </div>
          </div>

          {/* Status distribution */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Répartition par statut</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width="50%" height={280}>
                <PieChart>
                  <Pie data={statusDistribution || []} cx="50%" cy="50%" innerRadius={50} outerRadius={100}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {(statusDistribution || []).map((e: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[e.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {(statusDistribution || []).slice(0, 7).map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[s.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ flex: 1, color: '#374151' }}>{s.name}</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{fmt(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: three columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Type distribution */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Par type</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeDistribution || []} cx="50%" cy="50%" innerRadius={45} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {(typeDistribution || []).map((e: any, i: number) => (
                    <Cell key={i} fill={[COLORS.indigo, COLORS.blue, COLORS.amber, COLORS.slate][i % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: COLORS.slate, textAlign: 'center' }}>
              {(typeDistribution || []).map((t: any) => `${t.name}: ${fmt(t.value)}`).join(' · ')}
            </div>
          </div>

          {/* Priority distribution */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Priorités (ouverts)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(priorityDistribution || []).slice().reverse()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis dataKey="priority" type="category"
                  tick={{ fontSize: 13, fill: COLORS.slate }}
                  tickFormatter={(v: number) => ['', '1-Très basse', '2-Basse', '3-Normale', '4-Haute', '5-Critique'][v] || `P${v}`} />
                <Tooltip />
                <Bar dataKey="value" name="Tickets" radius={[0, 6, 6, 0]}>
                  {(priorityDistribution || []).map((e: any) => (
                    <Cell key={e.priority} fill={e.priority >= 5 ? COLORS.red : e.priority >= 4 ? COLORS.amber : COLORS.indigo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* SLA status */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Statut SLA</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={slaOverview || []} cx="50%" cy="50%" innerRadius={45} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {(slaOverview || []).map((e: any, i: number) => (
                    <Cell key={i} fill={e.name === 'OK' ? COLORS.green : e.name === 'Violé' ? COLORS.red : e.name === 'Avertissement' ? COLORS.amber : COLORS.slate} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: COLORS.slate, textAlign: 'center' }}>
              {(slaOverview || []).map((s: any) => `${s.name}: ${fmt(s.value)}`).join(' · ')}
            </div>
          </div>
        </div>

        {/* Row 4: two columns - categories + techs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Top categories */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Catégories les plus sollicitées</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(categoryDistribution || []).slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" fill={COLORS.indigo} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Technician workload */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Charge par technicien (ouverts)</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Technicien</th>
                  <th style={{ textAlign: 'center' }}>Tickets</th>
                  <th style={{ width: 100 }}>Charge</th>
                </tr>
              </thead>
              <tbody>
                {(technicianAssignments || []).slice(0, 10).map((t: any, i: number) => {
                  const maxCount = Math.max(...(technicianAssignments || []).map((x: any) => x.count), 1);
                  const pct = (t.count / maxCount) * 100;
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{t.name || t.username}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{t.count}</td>
                      <td>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: COLORS.indigo, borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!technicianAssignments || technicianAssignments.length === 0) && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: COLORS.slate }}>Aucune affectation</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Répartition par groupe assigné */}
        <div className="stats-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>Répartition par groupe assigné</div>
            <div style={{ fontSize: 12, color: COLORS.slate }}>{(groupDistribution || []).length} groupe(s)</div>
          </div>
          {(groupDistribution || []).length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.slate, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>Aucune affectation de groupe</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, (groupDistribution || []).length * 34)}>
              <BarChart data={groupDistribution || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" radius={[0, 6, 6, 0]} cursor="pointer"
                  onClick={(d: any) => { if (d?.group_id) setFGroup(String(d.group_id)); }}>
                  {(groupDistribution || []).map((e: any, i: number) => (
                    <Cell key={e.group_id} fill={String(e.group_id) === fGroup ? COLORS.amber : PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 6 }}>Cliquez sur une barre pour filtrer toutes les stats sur ce groupe.</div>
        </div>

        {/* Row 5: backlog aging + hourly + resolution time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Backlog aging */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Âge du backlog</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={backlogAging || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: COLORS.slate }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" radius={[4, 4, 0, 0]}>
                  {(backlogAging || []).map((e: any) => (
                    <Cell key={e.range} fill={e.range?.includes('+') || e.range?.includes('mois') ? COLORS.red : e.range?.includes('sem') ? COLORS.amber : COLORS.indigo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Hourly distribution */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Création par heure</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hourlyDistribution || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: COLORS.slate }} tickFormatter={(h: number) => `${h}h`} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke={COLORS.indigo} fill={COLORS.indigoBg} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Resolution time trend */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Temps de résolution</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={resolutionTimeTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.slate }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} tickFormatter={(v: number) => `${v}h`} />
                <Tooltip formatter={(v: any) => [`${v} h`, 'Moyenne']} />
                <Line type="monotone" dataKey="avg_hours" name="Heures" stroke={COLORS.teal} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 8, textAlign: 'center' }}>
              Résolu : <strong>{fmtHours(avgResolutionHours)}</strong> · Clôture : <strong>{fmtHours(avgClosureHours)}</strong>
            </div>
          </div>
        </div>

        {/* Row 6: top requesters + weekly comparison + reopened */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Top requesters */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Top demandeurs</div>
            <table className="stats-table">
              <thead>
                <tr><th>Demandeur</th><th style={{ textAlign: 'center' }}>Tickets</th></tr>
              </thead>
              <tbody>
                {(topRequesters || []).slice(0, 8).map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.name || r.email}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Weekly comparison + Reopened */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Activité hebdomadaire</div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
              <div style={{ textAlign: 'center', flex: 1, padding: 16, background: '#f8fafc', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Cette semaine</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b' }}>{weeklyComparison?.this_week || 0}</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1, padding: 16, background: '#f8fafc', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Semaine dernière</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b' }}>{weeklyComparison?.last_week || 0}</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1, padding: 16, background: '#f8fafc', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Variation</div>
                <div style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  color: (weeklyComparison?.change_pct || 0) > 0 ? COLORS.red : (weeklyComparison?.change_pct || 0) < 0 ? COLORS.green : COLORS.slate }}>
                  {(weeklyComparison?.change_pct || 0) > 0 ? <TrendingUp size={20} /> : (weeklyComparison?.change_pct || 0) < 0 ? <TrendingDown size={20} /> : <Minus size={20} />}
                  {fmtPct(weeklyComparison?.change_pct)}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>Réouvertures (30 jours)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.amber }}>{fmt(reopened30d)}</span>
                <span style={{ fontSize: 13, color: COLORS.slate }}>tickets rouverts après résolution</span>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Vue d'ensemble</div>
            <table className="stats-table">
              <tbody>
                <tr><td>Total tickets</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(overview?.total)}</td></tr>
                <tr><td>Incidents</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(overview?.total_incidents)}</td></tr>
                <tr><td>Demandes</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(overview?.total_requests)}</td></tr>
                <tr><td>Problèmes ouverts</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(overview?.open_problems)}</td></tr>
                <tr><td>Résolus</td><td style={{ textAlign: 'right', fontWeight: 600, color: COLORS.green }}>{fmt(overview?.resolved)}</td></tr>
                <tr><td>Fermés</td><td style={{ textAlign: 'right', fontWeight: 600, color: COLORS.green }}>{fmt(overview?.closed)}</td></tr>
                <tr><td><span style={{ color: COLORS.red }}>SLA violés</span></td><td style={{ textAlign: 'right', fontWeight: 600, color: COLORS.red }}>{fmt(overview?.sla_breached)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Optional: weekly created sparklines */}
        {weeklyCreated && weeklyCreated.length > 0 && (
          <div className="stats-card" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Créations hebdomadaires (90 jours)</div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={weeklyCreated || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week_start" tick={{ fontSize: 10, fill: COLORS.slate }} tickFormatter={(d: string) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch { return d; }}} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke={COLORS.indigo} fill={COLORS.indigoBg} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Row 7: Advanced analytics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Top demandeurs avec détails */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Top 15 demandeurs</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Ouverts</th>
                  <th style={{ textAlign: 'right' }}>Résol. moy.</th>
                </tr>
              </thead>
              <tbody>
                {(topRequestersExtended || []).slice(0, 12).map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.name || r.email}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.total_count}</td>
                    <td style={{ textAlign: 'center', color: r.open_count > 0 ? COLORS.red : COLORS.green, fontWeight: 500 }}>{r.open_count}</td>
                    <td style={{ textAlign: 'right', color: COLORS.slate, fontSize: 11 }}>{fmtHours(r.avg_resolution_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top logiciels */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Logiciels les plus demandés</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={(topSoftwares || []).slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis type="category" dataKey="software" width={150} tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip formatter={(v: any, name: any) => name === 'count' ? [v, 'Tickets'] : [`${v}h`, 'Résol. moy.']} />
                <Bar dataKey="count" name="Tickets" fill={COLORS.blue} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 8: Performance & VIP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Performance techniciens */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Performance des techniciens</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Technicien</th>
                  <th style={{ textAlign: 'center' }}>Tickets</th>
                  <th style={{ textAlign: 'center' }}>Résolus</th>
                  <th style={{ textAlign: 'right' }}>Temps moy.</th>
                  <th style={{ textAlign: 'center' }}>Taux</th>
                </tr>
              </thead>
              <tbody>
                {(technicianPerformance || []).slice(0, 10).map((t: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{t.name || t.username}</td>
                    <td style={{ textAlign: 'center' }}>{t.tickets_count}</td>
                    <td style={{ textAlign: 'center', color: COLORS.green, fontWeight: 600 }}>{t.resolved_count}</td>
                    <td style={{ textAlign: 'right', color: COLORS.slate, fontSize: 11 }}>{fmtHours(t.avg_resolution_hours)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: t.resolution_rate >= 80 ? COLORS.green : t.resolution_rate >= 60 ? COLORS.amber : COLORS.red }}>{t.resolution_rate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* VIP par priorité */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>VIP par priorité</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={(vipByPriority || []).slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.slate }} />
                <YAxis dataKey="priority" type="category" tickFormatter={(v: number) => `P${v}`} tick={{ fontSize: 12, fill: COLORS.slate }} />
                <Tooltip />
                <Bar dataKey="count" name="VIP" radius={[0, 6, 6, 0]}>
                  {(vipByPriority || []).map((e: any) => (
                    <Cell key={e.priority} fill={e.priority >= 4 ? COLORS.red : e.priority >= 3 ? COLORS.amber : COLORS.indigo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 9: Trends & Observers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Status trend 12 months */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Statuts (12 mois)</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={statusTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: COLORS.slate }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Area type="monotone" dataKey="open" stackId="1" stroke={COLORS.indigo} fill={COLORS.indigoBg} />
                <Area type="monotone" dataKey="resolved" stackId="1" stroke={COLORS.green} fill={COLORS.greenBg} />
                <Area type="monotone" dataKey="rejected" stackId="1" stroke={COLORS.red} fill={COLORS.redBg} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Incidents vs Requests */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Incidents vs Demandes</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={incidentVsRequestTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week_start" tick={{ fontSize: 10, fill: COLORS.slate }} tickFormatter={(d: string) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch { return d; }}} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incidents" name="Incidents" stroke={COLORS.red} strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="requests" name="Demandes" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top observers */}
          <div className="stats-card">
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Top observateurs</div>
            <table className="stats-table">
              <thead>
                <tr><th>Observateur</th><th style={{ textAlign: 'center' }}>Tickets</th></tr>
              </thead>
              <tbody>
                {(topObservers || []).slice(0, 10).map((o: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{o.name || o.username}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{o.observed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Row 10: Category performance */}
        <div className="stats-card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Temps de résolution par catégorie</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={(categoryPerformance || []).slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: COLORS.slate }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.slate }} tickFormatter={(v: number) => `${v}h`} />
              <Tooltip formatter={(v: any, name: any) => name === 'avg_resolution_hours' ? [`${v}h`, 'Temps moy.'] : [v, 'Tickets']} />
              <Bar dataKey="count" name="Tickets" fill={COLORS.slate} radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg_resolution_hours" name="Temps (h)" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, bg, icon }: { label: string; value: any; sub: string; color: string; bg: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '16px 18px', border: `1px solid ${color}20` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{value ?? '-'}</div>
      <div style={{ fontSize: 12, color: COLORS.slate }}>{sub}</div>
    </div>
  );
}
