import { BarChart3, Clock3, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { KpiConfig } from './KpiConfigurator';

export interface KpiSeriesKey {
  key: string; label: string; color?: string; type?: 'line' | 'bar' | 'area';
}
export interface KpiSnapshot {
  key: string;
  name: string;
  module: string;
  unit: string;
  display: string;
  kind?: 'value' | 'list' | 'chart';
  source?: string | null;
  multi?: boolean;
  chart?: 'line' | 'bar' | 'area' | 'composed' | null;
  periodic?: boolean;
  filters?: Record<string, { value: string; label: string }>;
  period?: { from: string | null; to: string | null; label: string } | null;
  compare?: string;
  current?: {
    value?: number;
    text?: string | null;
    sub?: string;
    items?: { label: string; value?: number; text?: string; sub?: string }[];
    series?: Record<string, any>[];
    seriesKeys?: KpiSeriesKey[];
  };
  previous?: { value?: number; text?: string | null; label?: string | null; period?: { from: string; to: string } } | null;
  delta_pct?: number | null;
  delta_abs?: number | null;
  computed_at?: string;
  error?: string;
}

const fmt = (n: number | undefined | null, unit?: string) => {
  const v = Number(n ?? 0);
  if (unit === 'percent') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  if (unit === 'currency') return `${Math.round(v).toLocaleString('fr-FR')} €`;
  if (unit === 'days') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
  if (unit === 'minutes') return `${Math.round(v)} min`;
  if (unit === 'years') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`;
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
};

const fmtDateTime = (s?: string) => {
  if (!s) return null;
  try { return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
};

const Delta = ({ snapshot }: { snapshot: KpiSnapshot }) => {
  if (snapshot.previous == null) {
    if (snapshot.compare && snapshot.compare !== 'none') {
      return <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Comparaison indisponible</span>;
    }
    return null;
  }
  const d = snapshot.delta_pct;
  const up = d != null && d > 0;
  const flat = d == null || d === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? '#64748b' : '#475569';
  return (
    <div style={{ fontSize: '.73rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 800, color }}>
        <Icon size={12} /> {d == null ? '—' : `${d > 0 ? '+' : ''}${d} %`}
      </span>
      <span>vs {snapshot.previous.label
        ? `${snapshot.previous.label} (${snapshot.previous.text ?? fmt(snapshot.previous.value, snapshot.unit)})`
        : (snapshot.previous.text ?? fmt(snapshot.previous.value, snapshot.unit))}</span>
    </div>
  );
};

/** Mini-courbe d'un KPI « chart » (line / bar / area / composed). */
export function KpiChart({ snapshot, height = 170 }: { snapshot: KpiSnapshot; height?: number }) {
  const data = snapshot.current?.series || [];
  const keys = snapshot.current?.seriesKeys || [];
  if (!data.length || !keys.length) {
    return <div style={{ fontSize: '.75rem', color: '#94a3b8', padding: '8px 0' }}>Aucune donnée sur la période.</div>;
  }
  const chart = snapshot.chart || (keys.some(k => k.type === 'bar') ? 'composed' : 'line');
  const axis = { fontSize: 9, fill: '#64748b' } as const;
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
      <XAxis dataKey="label" tick={axis} minTickGap={18} />
      <YAxis tick={axis} width={34} allowDecimals={false} />
      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
    </>
  );
  const render = (type: 'line' | 'bar' | 'area') => keys
    .filter(k => (k.type || type) === type)
    .map(k => {
      if (type === 'bar') return <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color || '#2563eb'} stackId={chart === 'bar' ? 'a' : undefined} opacity={0.85} />;
      if (type === 'area') return <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} fill={k.color} fillOpacity={0.25} stackId="a" />;
      return <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color || '#2563eb'} strokeWidth={2} dot={false} />;
    });
  const content = (
    <>
      {common}
      {render('bar')}
      {render('area')}
      {render('line')}
    </>
  );
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {chart === 'bar' ? <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>{content}</BarChart>
          : chart === 'area' ? <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>{content}</AreaChart>
          : chart === 'composed' ? <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>{content}</ComposedChart>
          : <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>{content}</LineChart>}
      </ResponsiveContainer>
    </div>
  );
}

/** Bloc KPI affiché automatiquement en tête d'une rubrique (valeurs figées au lancement). */
export default function KpiSnapshots({
  snapshots, configs, status, title = 'Indicateurs',
}: {
  snapshots?: KpiSnapshot[] | null;
  configs?: KpiConfig[] | null;
  status?: 'planned' | 'in_progress' | 'finished';
  title?: string;
}) {
  const cfgCount = Array.isArray(configs) ? configs.length : 0;
  const hasSnapshots = Array.isArray(snapshots) && snapshots.length > 0;

  if (!hasSnapshots) {
    if (!cfgCount) return null;
    const planned = status === 'planned';
    return (
      <div style={{
        marginBottom: '1rem', padding: '.7rem .9rem', borderRadius: 12,
        border: '1px dashed #cbd5e1', background: '#f8fafc',
        fontSize: '.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <BarChart3 size={15} color="#0078a4" />
        <b style={{ color: '#334155' }}>{cfgCount} indicateur{cfgCount > 1 ? 's' : ''}</b>
        {planned
          ? <span>seront calculés et figés au lancement de la réunion.</span>
          : <span>n'ont pas pu être calculés (relancez la réunion ou utilisez « Recalculer les KPI »).</span>}
        <span style={{ color: '#94a3b8' }}>· {(configs || []).map(c => c.name).join(' · ')}</span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <BarChart3 size={15} color="#0078a4" />
        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '.86rem' }}>{title}</span>
        <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>figés au lancement</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
        {snapshots!.map(s => {
          const isChart = s.display === 'chart' || s.kind === 'chart' || !!(s.current as any)?.series;
          const items = s.current?.items || [];
          return (
          <div key={s.key + (s.name || '')} title={s.error || ''} style={{
            background: '#fff', border: `1px solid ${s.error ? '#fecaca' : '#e2e8f0'}`, borderRadius: 10,
            padding: '.55rem .7rem', minWidth: 0,
            ...(isChart ? { gridColumn: '1 / -1' } : {}),
          }}>
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>{s.name}</div>
            <div style={{ fontSize: '.66rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span style={{ background: '#f1f5f9', borderRadius: 8, padding: '0 5px', fontWeight: 700 }}>{s.module}</span>
              {s.period?.label && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.period.label}</span>}
            </div>
            {s.filters && Object.keys(s.filters).length > 0 && (
              <div style={{ fontSize: '.66rem', color: '#0369a1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={Object.values(s.filters).map(f => f.label).join(' · ')}>
                {Object.values(s.filters).map(f => f.label).join(' · ')}
              </div>
            )}
            {s.source && (
              <div style={{ fontSize: '.63rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Source : ${s.source}`}>
                Source : {s.source}
              </div>
            )}
            {s.error ? (
              <div style={{ color: '#b91c1c', fontSize: '.74rem', marginTop: 6 }}>{s.error}</div>
            ) : isChart ? (
              <KpiChart snapshot={s} />
            ) : items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, maxHeight: 190, overflowY: 'auto' }}>
                {items.slice(0, 15).map((it, idx) => (
                  <div key={`${it.label}-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '.73rem', lineHeight: 1.25 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</div>
                      {it.sub && <div style={{ color: '#94a3b8', fontSize: '.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.sub}>{it.sub}</div>}
                    </div>
                    <b style={{ color: '#0f172a', whiteSpace: 'nowrap' }}>{it.text || (it.value != null ? fmt(it.value) : '')}</b>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
                    {s.current?.text || fmt(s.current?.value, s.unit)}
                  </span>
                  {s.current?.sub && <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>{s.current.sub}</span>}
                </div>
                {s.display === 'bar' && s.previous && (
                  <div style={{ marginTop: 5, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: '#0078a4',
                      width: `${Math.min(100, Math.max(0, Math.round((Number(s.current?.value || 0) / Math.max(Number(s.current?.value || 0), Number(s.previous?.value || 0), 1)) * 100)))}%`,
                    }} />
                  </div>
                )}
                <div style={{ marginTop: 3 }}><Delta snapshot={s} /></div>
              </>
            )}
            {s.computed_at && (
              <div style={{ fontSize: '.64rem', color: '#cbd5e1', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock3 size={9} /> {fmtDateTime(s.computed_at)}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
