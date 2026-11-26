import React, { useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download, Palette } from 'lucide-react';

// Graphiques de l'assistant finances : tracés à partir des mêmes chiffres que le tableau (jamais de l'IA).

import { chartModel, BAR_COLORS, COLORS, OTHER, MAX_POINTS, MAX_SLICES, type ChartKind, type Data, type Model } from './assistantFinancesChartData';

const compact = (v: number) => v.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function pieSlices(m: Model) {
  const key = m.series[m.series.length - 1].key; // plusieurs colonnes : la dernière (l'année la plus récente)
  const all = m.points.map(p => ({ name: String(p.x), value: Number(p[key]) || 0 })).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const head = all.slice(0, MAX_SLICES);
  const rest = all.slice(MAX_SLICES).reduce((a, s) => a + s.value, 0);
  const slices = head.map((s, i) => ({ ...s, color: COLORS[i] }));
  if (rest > 0) slices.push({ name: `Autres (${all.length - MAX_SLICES})`, value: rest, color: OTHER });
  return { slices, label: m.series[m.series.length - 1].label, total: all.reduce((a, s) => a + s.value, 0) };
}

/** Image PNG (titre, légende et tracé), à insérer dans Word ou PowerPoint. */
function download(svg: SVGSVGElement, title: string, legend: { label: string; color: string }[]) {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('font-family', 'Segoe UI, Arial, sans-serif');
  const img = new Image();
  img.onload = () => {
    const top = 34 + legend.length * 18;
    const w = Math.max(width, 640);
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = (height + top) * 2;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(2, 2);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, height + top);
    g.fillStyle = '#0f172a';
    g.font = 'bold 14px Segoe UI, Arial, sans-serif';
    g.fillText(title, 12, 22, w - 24);
    g.font = '12px Segoe UI, Arial, sans-serif';
    legend.forEach((l, i) => {
      g.fillStyle = l.color;
      g.fillRect(12, 34 + i * 18, 10, 10);
      g.fillStyle = '#334155';
      g.fillText(l.label, 28, 43 + i * 18);
    });
    g.drawImage(img, 0, top, width, height);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'graphique-finances.png';
    a.click();
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
}

const FinanceChart: React.FC<{ data: Data; kind: ChartKind; multicolor?: boolean }> = ({ data, kind, multicolor }) => {
  const box = useRef<HTMLDivElement>(null);
  const [colored, setColored] = useState(!!multicolor);
  const model = chartModel(data, kind !== 'camembert');
  if (!model) return null;
  const fmt = (v: number) => (model.money ? v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : v.toLocaleString('fr-FR'));
  const pie = kind === 'camembert' ? pieSlices(model) : null;
  const legend = pie
    ? pie.slices.map(s => ({ label: `${s.name} — ${fmt(s.value)} (${((s.value / pie.total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`, color: s.color }))
    : model.series.map((s, i) => ({ label: s.label, color: COLORS[i] }));
  const axis = { tick: { fontSize: 11.5, fill: '#52514e' }, tickLine: false };
  const names = model.points.map(p => String(p.x));
  const horizontal = kind === 'histogramme' && !names.every(n => /^(?:(?:janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)(?: \d{4})?|\d{4}(?:-\d{2})?)$/.test(n)) && (names.length > 6 || names.some(n => n.length > 18));
  // Une couleur par barre : seulement pour une série unique (sinon la couleur désigne la série)
  const canColor = kind === 'histogramme' && model.series.length === 1;
  const cells = canColor && colored ? model.points.map((p, i) => <Cell key={String(p.x)} fill={BAR_COLORS[i % BAR_COLORS.length]} />) : null;
  const height = horizontal ? Math.max(270, names.length * (14 * model.series.length + 14) + 40) : 270;
  const common = (
    <>
      <CartesianGrid stroke="#e5e7eb" vertical={false} />
      <XAxis dataKey="x" {...axis} axisLine={{ stroke: '#cbd5e1' }} tickFormatter={(v: string) => clip(v)} interval="preserveStartEnd" />
      <YAxis {...axis} axisLine={false} width={64} tickFormatter={(v: number) => compact(v) + (model.money ? ' €' : '')} />
      <Tooltip formatter={(v) => fmt(Number(v))} />
    </>
  );
  return (
    <div style={{ padding: '10px 12px 4px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: '#334155' }}>
          {pie && <span style={{ width: '100%', color: '#64748b' }}>{pie.label}</span>}
          {(pie || legend.length > 1) && legend.map(l => (
            <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />{l.label}</span>
          ))}
          {!pie && legend.length === 1 && <span style={{ color: '#64748b' }}>{legend[0].label}</span>}
        </div>
        {canColor && (
          <button type="button" onClick={() => setColored(v => !v)} aria-pressed={colored} title={colored ? 'Revenir à une seule couleur' : 'Une couleur par barre'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: colored ? '#ede9fe' : '#fff', color: '#334155', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            <Palette size={13} /> Couleurs
          </button>
        )}
        <button
          type="button" title="Télécharger le graphique en image (PNG)"
          onClick={() => { const svg = box.current?.querySelector('svg.recharts-surface'); if (svg) download(svg as SVGSVGElement, data.titre, legend); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
        >
          <Download size={13} /> Image
        </button>
      </div>
      <div ref={box} style={{ height, marginTop: 6 }}>
        <ResponsiveContainer width="100%" height="100%">
          {pie ? (
            <PieChart>
              <Pie data={pie.slices} dataKey="value" nameKey="name" outerRadius="92%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {pie.slices.map(s => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v))} />
            </PieChart>
          ) : kind === 'courbe' ? (
            <LineChart data={model.points} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              {common}
              {model.series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={COLORS[i]} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />)}
            </LineChart>
          ) : horizontal ? (
            <BarChart data={model.points} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" {...axis} axisLine={false} tickFormatter={(v: number) => compact(v) + (model.money ? ' €' : '')} />
              <YAxis type="category" dataKey="x" {...axis} axisLine={{ stroke: '#cbd5e1' }} width={250} interval={0} tickFormatter={(v: string) => clip(v, 38)} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              {model.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>{cells}</Bar>)}
            </BarChart>
          ) : (
            <BarChart data={model.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2}>
              {common}
              {model.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>{cells}</Bar>)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {model.cut > 0 && <div style={{ fontSize: 11.5, color: '#92400e' }}>Graphique limité aux {MAX_POINTS} premières lignes du tableau.</div>}
    </div>
  );
};

export default FinanceChart;
