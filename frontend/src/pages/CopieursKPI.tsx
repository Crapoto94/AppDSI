import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, ComposedChart,
} from 'recharts';
import {
  Printer, TrendingUp, TrendingDown, AlertTriangle, BarChart2,
  ArrowLeft, ChevronUp, ChevronDown, Minus, Building2, School,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString('fr-FR');
};
const fmtEur  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${n.toFixed(0)} €`;
const fmtPct  = (n: number | null) => n === null ? '—' : `${n.toFixed(1)} %`;
const fmtDate = (s: string | null) => !s ? 'Jamais' : new Date(s).toLocaleDateString('fr-FR');

const COLORS_NB   = '#475569';
const COLORS_COUL = '#0891b2';
const COLORS_COST = '#16a34a';
const COLORS_COST2 = '#22d3ee';
const COLORS_TOTAL = '#7c3aed';
const COLORS_COUL_LIGHT = '#bae6fd';

const PIE_COLORS = [COLORS_NB, COLORS_COUL];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIData {
  global: {
    totalNB: number; totalCoul: number; totalPages: number;
    coutNB: number; coutCoul: number; coutTotal: number;
    nbCopieursActifs: number; nbCopieursTotaux: number;
    ratio: number | null; anneeMin: number | null; anneeMax: number | null;
    coutMoyenNB: number | null; coutMoyenCoul: number | null;
  };
  byYear: Array<{
    year: number; deltaNB: number; deltaCoul: number; deltaTotal: number;
    coutNB: number; coutCoul: number; coutTotal: number;
    nbCopieurs: number; ratio: number | null;
    // Projection année courante
    isCurrentYear?: boolean;
    deltaNB_ext?: number | null; deltaCoul_ext?: number | null;
    coutNB_proj?: number | null; coutCoul_proj?: number | null; coutTotal_proj?: number | null;
  }>;
  byDirection: Array<{
    direction: string; deltaNB: number; deltaCoul: number;
    totalPages: number; coutTotal: number; nbCopieurs: number;
  }>;
  top10Volume: Array<{
    copieur_id: number; direction: string; service: string;
    numero_serie: string; modele: string; source: string;
    totalNB: number; totalCoul: number; totalPages: number; coutTotal: number;
  }>;
  top10Growing: Array<{
    copieur_id: number; direction: string; service: string;
    numero_serie: string; modele: string;
    lastTotal: number; lastRaw: number; prevTotal: number; deltaAbs: number;
    growth: number; lastYear: number; prevYear: number; isProjected: boolean;
  }>;
  top10Shrinking: Array<{
    copieur_id: number; direction: string; service: string;
    numero_serie: string; modele: string;
    lastTotal: number; lastRaw: number; prevTotal: number; deltaAbs: number;
    growth: number; lastYear: number; prevYear: number; isProjected: boolean;
  }>;
  alertsNoReleve: Array<{
    id: number; direction: string; service: string;
    numero_serie: string; modele: string; source: string;
    last_releve: string | null;
  }>;
}

// ─── Composant sparkline mini ─────────────────────────────────────────────────

const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => (
  <ResponsiveContainer width="100%" height={40}>
    <LineChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string; value: string; sub?: string;
  color: string; bg: string; sparkValues?: number[];
  trend?: number | null; icon?: React.ReactNode;
}> = ({ label, value, sub, color, bg, sparkValues, trend, icon }) => (
  <div style={{
    background: bg, border: `1px solid ${color}22`, borderRadius: 14,
    padding: '14px 18px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 160,
  }}>
    {sparkValues && sparkValues.length >= 2 && (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 44, opacity: 0.15, pointerEvents: 'none' }}>
        <Sparkline data={sparkValues} color={color} />
      </div>
    )}
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        {icon && <span style={{ color, opacity: 0.7 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
      {trend !== undefined && trend !== null && (
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
          {trend > 0 ? <ChevronUp size={12} /> : trend < 0 ? <ChevronDown size={12} /> : <Minus size={12} />}
          {Math.abs(trend).toFixed(1)} % vs an précédent
        </div>
      )}
    </div>
  </div>
);

// ─── Custom Tooltip recharts ───────────────────────────────────────────────────

const PROJ_KEYS = new Set(['deltaNB_ext','deltaCoul_ext','coutTotal_proj_seg','coutNB_proj_seg','coutCoul_proj_seg']);

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const main = payload.filter((p: any) => !PROJ_KEYS.has(p.dataKey));
  // Vérifier si on a des valeurs projetées dans ce payload
  const projTotal = payload.find((p: any) => p.dataKey === 'coutTotal_proj_seg' && p.value != null);
  const projNBExt = payload.find((p: any) => p.dataKey === 'deltaNB_ext' && (p.value ?? 0) > 0);
  const projCoulExt = payload.find((p: any) => p.dataKey === 'deltaCoul_ext' && (p.value ?? 0) > 0);
  const hasAnyProj = projTotal || projNBExt || projCoulExt;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#334155' }}>{label}</div>
      {main.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <strong>{typeof p.value === 'number' && p.value > 10000 ? fmtM(p.value) : p.value?.toLocaleString('fr-FR')}</strong>
        </div>
      ))}
      {hasAnyProj && (
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px dashed #e2e8f0', color: '#7c3aed', fontSize: 11 }}>
          📐 Proj. 31/12 :
          {(projNBExt || projCoulExt) && (() => {
            const nbReal  = payload.find((p: any) => p.dataKey === 'deltaNB')?.value   ?? 0;
            const coulReal= payload.find((p: any) => p.dataKey === 'deltaCoul')?.value  ?? 0;
            const nbProj  = nbReal  + (projNBExt?.value  ?? 0);
            const coulProj= coulReal+ (projCoulExt?.value ?? 0);
            return <> <span>NB {fmtM(nbProj)}</span> · <span>Coul. {fmtM(coulProj)}</span></>;
          })()}
          {projTotal && <> · <span>Coût {fmtEur(projTotal.value)}</span></>}
        </div>
      )}
    </div>
  );
};

// ─── Composant principal ───────────────────────────────────────────────────────

export default function CopieursKPI() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');

  const fetchKPI = useCallback(async () => {
    const tok = token || localStorage.getItem('token');
    if (!tok) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/copieurs/kpi', { headers: { Authorization: `Bearer ${tok}` } });
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchKPI(); }, [fetchKPI]);

  if (loading) return (
    <div>
      <Header />
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16, color: '#64748b' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span>Chargement des données…</span>
      </div>
    </div>
  );

  if (error || !data) return (
    <div>
      <Header />
      <div style={{ textAlign: 'center', padding: 60, color: '#dc2626' }}>❌ {error || 'Erreur inconnue'}</div>
    </div>
  );

  const { global: g, byYear, byDirection, top10Volume, top10Growing, top10Shrinking, alertsNoReleve } = data;

  // Données filtrées par année sélectionnée + enrichissement pour projection
  const hasProj = yearFilter === 'all' && byYear.some(y => y.isCurrentYear);

  const chartData = (yearFilter === 'all' ? byYear : byYear.filter(y => y.year === yearFilter))
    .map((y, idx, arr) => {
      // Le segment pointillé relie l'avant-dernier point (valeur réelle) au point projeté de l'année courante
      const isPrev = hasProj && idx === arr.length - 2 && Boolean(arr[arr.length - 1]?.isCurrentYear);
      return {
        ...y,
        // Barres d'extension (0 pour les années historiques, extension projetée pour l'année courante)
        deltaNB_ext:   y.deltaNB_ext   ?? 0,
        deltaCoul_ext: y.deltaCoul_ext ?? 0,
        // Segments pointillés coûts : défini seulement sur avant-dernière et dernière année
        coutTotal_proj_seg: y.isCurrentYear ? y.coutTotal_proj : isPrev ? y.coutTotal : undefined,
        coutNB_proj_seg:    y.isCurrentYear ? y.coutNB_proj    : isPrev ? y.coutNB    : undefined,
        coutCoul_proj_seg:  y.isCurrentYear ? y.coutCoul_proj  : isPrev ? y.coutCoul  : undefined,
      };
    });

  const filtered = yearFilter === 'all' ? null : byYear.find(y => y.year === yearFilter);

  const kpiNB   = filtered ? filtered.deltaNB   : g.totalNB;
  const kpiCoul = filtered ? filtered.deltaCoul : g.totalCoul;
  const kpiCout = filtered ? filtered.coutTotal  : g.coutTotal;
  const kpiRatio= filtered ? filtered.ratio     : g.ratio;

  // Trend YoY pour les cartes (seulement si all)
  const lastYearData = byYear[byYear.length - 1];
  const prevYearData = byYear.length >= 2 ? byYear[byYear.length - 2] : null;
  const trendPages = prevYearData && prevYearData.deltaTotal > 0
    ? ((lastYearData?.deltaTotal - prevYearData.deltaTotal) / prevYearData.deltaTotal) * 100 : null;
  const trendCout  = prevYearData && prevYearData.coutTotal  > 0
    ? ((lastYearData?.coutTotal  - prevYearData.coutTotal)  / prevYearData.coutTotal)  * 100 : null;

  // Donut data
  const donutData = [
    { name: 'NB (mono)', value: kpiNB },
    { name: 'Couleur',   value: kpiCoul },
  ];

  const years = byYear.map(y => y.year);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .kpi-section { background:#fff; border:1px solid #e2e8f0; borderRadius:14px; padding:24px; margin-bottom:20px; }
        .table-kpi { width:100%; border-collapse:collapse; font-size:13px; }
        .table-kpi th { padding:8px 12px; text-align:left; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #f1f5f9; }
        .table-kpi td { padding:9px 12px; border-bottom:1px solid #f8fafc; color:#334155; }
        .table-kpi tr:hover td { background:#f8fafc; }
        .badge-src { display:inline-flex; align-items:center; gap:3px; padding:1px 7px; border-radius:20px; font-size:10px; font-weight:600; }
      `}</style>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '28px 32px' }}>

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <button onClick={() => navigate('/copieurs')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                <ArrowLeft size={14} /> Retour
              </button>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={22} color="#7c3aed" /> Tableau de bord copieurs
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              {g.anneeMin && g.anneeMax ? `Données ${g.anneeMin}–${g.anneeMax}` : 'Aucune donnée'}
              {' · '}{g.nbCopieursActifs} copieur{g.nbCopieursActifs > 1 ? 's' : ''} avec relevés
              {' / '}{g.nbCopieursTotaux} total
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer' }}
            >
              <option value="all">Toutes les années</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={fetchKPI} style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
              ↻ Actualiser
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          <KpiCard
            label="Copies NB (mono)"
            value={fmtM(kpiNB)}
            sub={g.coutMoyenNB ? `${(g.coutMoyenNB * 1000).toFixed(3)} €/1000` : undefined}
            color={COLORS_NB} bg="#f8fafc"
            sparkValues={yearFilter === 'all' ? byYear.map(y => y.deltaNB) : undefined}
            trend={yearFilter === 'all' ? trendPages : undefined}
            icon={<Printer size={14} />}
          />
          <KpiCard
            label="Copies couleur"
            value={fmtM(kpiCoul)}
            sub={g.coutMoyenCoul ? `${(g.coutMoyenCoul * 1000).toFixed(3)} €/1000` : undefined}
            color={COLORS_COUL} bg="#e0f2fe"
            sparkValues={yearFilter === 'all' ? byYear.map(y => y.deltaCoul) : undefined}
            icon={<Printer size={14} />}
          />
          <KpiCard
            label="Ratio NB"
            value={kpiRatio !== null ? `${kpiRatio} %` : '—'}
            sub="part des copies mono"
            color="#f59e0b" bg="#fffbeb"
            sparkValues={yearFilter === 'all' ? byYear.map(y => y.ratio ?? 0) : undefined}
          />
          <KpiCard
            label="Coût total"
            value={fmtEur(kpiCout)}
            sub={filtered ? `NB ${fmtEur(filtered.coutNB)} · Coul ${fmtEur(filtered.coutCoul)}` : `NB ${fmtEur(g.coutNB)} · Coul ${fmtEur(g.coutCoul)}`}
            color={COLORS_COST} bg="#f0fdf4"
            sparkValues={yearFilter === 'all' ? byYear.map(y => y.coutTotal) : undefined}
            trend={yearFilter === 'all' ? trendCout : undefined}
            icon={<span style={{ fontSize: 14 }}>€</span>}
          />
          <KpiCard
            label="Copieurs actifs"
            value={String(filtered?.nbCopieurs ?? g.nbCopieursActifs)}
            sub={`${g.nbCopieursTotaux} au total · ${alertsNoReleve.length} sans relevé récent`}
            color={alertsNoReleve.length > 0 ? '#dc2626' : '#7c3aed'} bg={alertsNoReleve.length > 0 ? '#fef2f2' : '#f5f3ff'}
            icon={alertsNoReleve.length > 0 ? <AlertTriangle size={14} /> : <BarChart2 size={14} />}
          />
        </div>

        {/* ── Section principale : évolution + répartition ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>

          {/* Bar chart stacked NB/Couleur */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 8px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              📊 Évolution annuelle des copies
            </h3>
            {hasProj && <p style={{ margin: '0 0 12px', fontSize: 11, color: '#92400e', background: '#fef9c3', padding: '3px 8px', borderRadius: 5, display: 'inline-block' }}>📐 Zone hachurée = projection au 31/12</p>}
            {!hasProj && <div style={{ marginBottom: 12 }} />}
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis yAxisId="left" tickFormatter={v => fmtM(v)} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtEur(v)} tick={{ fontSize: 11, fill: '#16a34a' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                {/* Barres réelles */}
                <Bar yAxisId="left" dataKey="deltaNB"   name="NB (mono)" stackId="a" fill={COLORS_NB}   radius={[0,0,0,0]} />
                <Bar yAxisId="left" dataKey="deltaCoul" name="Couleur"    stackId="a" fill={COLORS_COUL} radius={[0,0,0,0]} />
                {/* Barres d'extension projetées (empilées au-dessus, pointillées) */}
                {hasProj && <Bar yAxisId="left" dataKey="deltaNB_ext"   stackId="a" fill={COLORS_NB}   fillOpacity={0.18} stroke={COLORS_NB}   strokeDasharray="4 3" strokeWidth={1.5} legendType="none" />}
                {hasProj && <Bar yAxisId="left" dataKey="deltaCoul_ext" stackId="a" fill={COLORS_COUL} fillOpacity={0.18} stroke={COLORS_COUL} strokeDasharray="4 3" strokeWidth={1.5} legendType="none" radius={[3,3,0,0]} />}
                {/* Ligne coût réel */}
                <Line yAxisId="right" type="monotone" dataKey="coutTotal" name="Coût total €" stroke={COLORS_COST} strokeWidth={2.5} dot={{ r: 3, fill: COLORS_COST }} />
                {/* Ligne coût projeté (pointillée) */}
                {hasProj && <Line yAxisId="right" type="monotone" dataKey="coutTotal_proj_seg" stroke={COLORS_COST} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#fff', stroke: COLORS_COST, strokeWidth: 2 }} legendType="none" connectNulls={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Donut NB vs Couleur */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 8px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              🍩 Répartition NB / Couleur
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8' }}>
              {yearFilter === 'all' ? 'Toutes années' : `Année ${yearFilter}`}
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {donutData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 4 }}>
              {donutData.map((d, i) => (
                <div key={d.name} style={{ textAlign: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[i], margin: '0 auto 4px' }} />
                  <div style={{ fontSize: 10, color: '#64748b' }}>{d.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: PIE_COLORS[i] }}>{fmtM(d.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Coûts + Ratio ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Area coûts → ComposedChart pour mixer Area + Line projetée */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 8px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              💶 Évolution des coûts (€)
            </h3>
            {hasProj && <p style={{ margin: '0 0 12px', fontSize: 11, color: '#92400e', background: '#fef9c3', padding: '3px 8px', borderRadius: 5, display: 'inline-block' }}>📐 Ligne pointillée = projection au 31/12</p>}
            {!hasProj && <div style={{ marginBottom: 12 }} />}
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gNB"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={COLORS_NB}   stopOpacity={0.25} /><stop offset="95%" stopColor={COLORS_NB}   stopOpacity={0} /></linearGradient>
                  <linearGradient id="gCoul" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={COLORS_COUL} stopOpacity={0.35} /><stop offset="95%" stopColor={COLORS_COUL} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={v => fmtEur(v)} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                {/* Aires coût réel */}
                <Area type="monotone" dataKey="coutNB"   name="Coût NB"     stroke={COLORS_NB}   fill="url(#gNB)"   strokeWidth={2} />
                <Area type="monotone" dataKey="coutCoul" name="Coût couleur" stroke={COLORS_COUL} fill="url(#gCoul)" strokeWidth={2} />
                {/* Lignes projetées (pointillées, relient dernier réel → projection 31/12) */}
                {hasProj && <Line type="monotone" dataKey="coutNB_proj_seg"   stroke={COLORS_NB}   strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#fff', stroke: COLORS_NB,   strokeWidth: 2 }} legendType="none" connectNulls={false} />}
                {hasProj && <Line type="monotone" dataKey="coutCoul_proj_seg" stroke={COLORS_COUL} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#fff', stroke: COLORS_COUL, strokeWidth: 2 }} legendType="none" connectNulls={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Line ratio NB/couleur */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 8px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              ⚖️ Évolution du ratio NB (%)
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8' }}>
              Part des copies monochrome — la baisse signifie plus d'impression couleur
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(v: any) => `${v} %`} labelFormatter={l => `Année ${l}`} />
                <Line type="monotone" dataKey="ratio" name="Ratio NB %" stroke="#f59e0b" strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Top Directions ── */}
        {byDirection.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 20px 8px', marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              🏢 Top directions — volume de copies
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDirection.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtM(v)} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="direction" width={160} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="deltaNB"   name="NB"      stackId="a" fill={COLORS_NB}   radius={[0,0,0,0]} />
                <Bar dataKey="deltaCoul" name="Couleur"  stackId="a" fill={COLORS_COUL} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Top 10 croissance / décroissance ── */}
        {(top10Growing.length > 0 || top10Shrinking.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Croissance */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} color="#16a34a" /> Top 10 croissance
                {top10Growing[0] && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{top10Growing[0].prevYear} → {top10Growing[0].lastYear}</span>}
              </h3>
              {top10Growing[0]?.isProjected && (
                <div style={{ marginBottom: 10, padding: '5px 10px', background: '#fef9c3', borderRadius: 6, fontSize: 11, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📐</span> An N projeté au 31/12 au prorata de la consommation actuelle
                </div>
              )}
              <table className="table-kpi">
                <thead>
                  <tr>
                    <th>N° Série</th>
                    <th>Direction</th>
                    <th style={{ textAlign: 'right' }}>An N-1</th>
                    <th style={{ textAlign: 'right' }}>An N {top10Growing[0]?.isProjected ? '(proj.)' : ''}</th>
                    <th style={{ textAlign: 'right' }}>Évol.</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Growing.map(c => (
                    <tr key={c.copieur_id}>
                      <td><code style={{ fontSize: 11, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{c.numero_serie}</code></td>
                      <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.direction}{c.service ? ` / ${c.service}` : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{fmtM(c.prevTotal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                        {fmtM(c.lastTotal)}
                        {c.isProjected && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{fmtM(c.lastRaw)} réel</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: c.growth > 0 ? '#16a34a' : c.growth < 0 ? '#dc2626' : '#94a3b8', fontSize: 12 }}>
                          {c.growth > 0 ? '▲' : '▼'} {Math.abs(c.growth).toFixed(0)} %
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Décroissance */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingDown size={16} color="#dc2626" /> Top 10 décroissance
                {top10Shrinking[0] && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{top10Shrinking[0].prevYear} → {top10Shrinking[0].lastYear}</span>}
              </h3>
              {top10Shrinking[0]?.isProjected && (
                <div style={{ marginBottom: 10, padding: '5px 10px', background: '#fef9c3', borderRadius: 6, fontSize: 11, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📐</span> An N projeté au 31/12 au prorata de la consommation actuelle
                </div>
              )}
              <table className="table-kpi">
                <thead>
                  <tr>
                    <th>N° Série</th>
                    <th>Direction</th>
                    <th style={{ textAlign: 'right' }}>An N-1</th>
                    <th style={{ textAlign: 'right' }}>An N {top10Shrinking[0]?.isProjected ? '(proj.)' : ''}</th>
                    <th style={{ textAlign: 'right' }}>Évol.</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Shrinking.map(c => (
                    <tr key={c.copieur_id}>
                      <td><code style={{ fontSize: 11, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{c.numero_serie}</code></td>
                      <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.direction}{c.service ? ` / ${c.service}` : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{fmtM(c.prevTotal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                        {fmtM(c.lastTotal)}
                        {c.isProjected && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{fmtM(c.lastRaw)} réel</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 12 }}>
                          ▼ {Math.abs(c.growth).toFixed(0)} %
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Top 10 volume + Alertes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Top 10 volume */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
              🏆 Top 10 — volume total (toutes années)
            </h3>
            <table className="table-kpi">
              <thead>
                <tr>
                  <th>#</th>
                  <th>N° Série / Modèle</th>
                  <th>Direction</th>
                  <th style={{ textAlign: 'right' }}>NB</th>
                  <th style={{ textAlign: 'right' }}>Coul.</th>
                  <th style={{ textAlign: 'right' }}>Coût</th>
                </tr>
              </thead>
              <tbody>
                {top10Volume.map((c, i) => (
                  <tr key={c.copieur_id}>
                    <td style={{ color: i < 3 ? '#f59e0b' : '#94a3b8', fontWeight: 700, fontSize: 13 }}>{i + 1}</td>
                    <td>
                      <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{c.numero_serie}</code>
                      {c.source === 'ecoles' ? <span className="badge-src" style={{ background: '#fef9c3', color: '#92400e', marginLeft: 4 }}><School size={9} />Éc.</span>
                        : <span className="badge-src" style={{ background: '#e0f2fe', color: '#0369a1', marginLeft: 4 }}><Building2 size={9} />M.</span>}
                      {c.modele && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{c.modele}</div>}
                    </td>
                    <td style={{ fontSize: 11, color: '#64748b', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.direction}{c.service ? ` / ${c.service}` : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: COLORS_NB }}>{fmtM(c.totalNB)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: COLORS_COUL }}>{fmtM(c.totalCoul)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 11, color: COLORS_COST }}>{fmtEur(c.coutTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Alertes — sans relevé récent */}
          <div style={{ background: '#fff', border: `1px solid ${alertsNoReleve.length > 0 ? '#fecaca' : '#e2e8f0'}`, borderRadius: 14, padding: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: alertsNoReleve.length > 0 ? '#dc2626' : '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={15} color={alertsNoReleve.length > 0 ? '#dc2626' : '#94a3b8'} />
              {alertsNoReleve.length > 0 ? `${alertsNoReleve.length} copieurs sans relevé récent` : 'Aucune alerte'}
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8' }}>Dernière lecture &gt; 12 mois ou jamais</p>
            {alertsNoReleve.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                ✅ Tous les copieurs sont à jour
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table className="table-kpi">
                  <thead>
                    <tr>
                      <th>N° Série</th>
                      <th>Direction</th>
                      <th style={{ textAlign: 'right' }}>Dernier relevé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertsNoReleve.map(c => (
                      <tr key={c.id} style={{ background: !c.last_releve ? '#fef2f2' : undefined }}>
                        <td>
                          <code style={{ fontSize: 10, background: !c.last_releve ? '#fee2e2' : '#f1f5f9', color: !c.last_releve ? '#dc2626' : '#334155', padding: '1px 5px', borderRadius: 4 }}>{c.numero_serie}</code>
                        </td>
                        <td style={{ fontSize: 11, color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.direction}{c.service ? ` / ${c.service}` : ''}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: !c.last_releve ? '#dc2626' : '#f59e0b' }}>
                          {fmtDate(c.last_releve)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Résumé coût moyen par copie ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#334155' }}>
            💡 Coûts moyens par copie
          </h3>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { label: 'Coût moyen / 1 000 copies NB',     value: g.coutMoyenNB   ? `${(g.coutMoyenNB * 1000).toFixed(3)} €`   : '—', color: COLORS_NB   },
              { label: 'Coût moyen / 1 000 copies couleur', value: g.coutMoyenCoul ? `${(g.coutMoyenCoul * 1000).toFixed(3)} €` : '—', color: COLORS_COUL },
              { label: 'Rapport couleur / NB',              value: g.coutMoyenNB && g.coutMoyenCoul ? `× ${(g.coutMoyenCoul / g.coutMoyenNB).toFixed(1)}` : '—', color: '#7c3aed' },
              { label: 'Total copies (all time)',            value: fmtM(g.totalPages), color: '#334155' },
              { label: 'Coût total (all time)',              value: fmtEur(g.coutTotal), color: COLORS_COST },
            ].map(k => (
              <div key={k.label} style={{ textAlign: 'center', minWidth: 160 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
