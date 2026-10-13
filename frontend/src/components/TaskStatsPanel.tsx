/**
 * TaskStatsPanel — statistiques de « Mes tâches » : KPI pertinents + tâches réalisées par
 * temporalité, par source, par classe. Les tâches réalisées proviennent de hub.user_tasks
 * (seules à porter une date de validation) ; le backlog (ouvert / en retard) vient de la liste
 * affichée, toutes sources confondues.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, X, CheckCircle2, PlusCircle, Timer, Target, TrendingUp, AlertTriangle, Inbox, UserCheck } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';

interface StatRow {
  id: number; source: string; class_id: number | null; software_name: string | null; priority: string;
  created_at: string; done_at: string | null; done_by_other: boolean; refused: boolean;
  echeance: string | null; assigned_by_other: boolean; is_team: boolean;
}
interface TaskLite { source: string; statut: string; echeance: string | null; priority?: string; id: number; }
interface ClassLite { id: number; name: string; color: string; scope?: string; }

const SOURCE_LABELS: Record<string, string> = {
  personal: 'Personnel', projet: 'Projet', projet_standalone: 'Projet', ticket: 'Ticket', reunion: 'Réunion',
  rencontre: 'Réunion BUD', revue: 'Revue', transcript: 'Transcript', todo: 'Microsoft Todo',
};
const SOURCE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#db2777', '#64748b'];
const TERMINAL = ['terminé', 'terminee', 'refuse'];

const PERIODS = [
  { v: 7, l: '7 jours', gran: 'day' },
  { v: 30, l: '30 jours', gran: 'day' },
  { v: 90, l: '3 mois', gran: 'week' },
  { v: 365, l: '12 mois', gran: 'month' },
] as const;

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function mondayOf(d: Date) { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

const card = (color: string, bg: string): React.CSSProperties => ({
  background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
});

const TaskStatsPanel: React.FC<{
  token: string | null;
  tasks: TaskLite[];
  classes: ClassLite[];
  classLinks: Record<string, number>;
  onClose: () => void;
}> = ({ token, tasks, classes, classLinks, onClose }) => {
  const [rows, setRows] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<number>(30);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const cfg = PERIODS.find(p => p.v === period)!;
  const classById = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);

  const data = useMemo(() => {
    const today = dayStart(new Date());
    let start = new Date(today); start.setDate(start.getDate() - (period - 1));
    if (cfg.gran === 'month') start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    if (cfg.gran === 'week') start = mondayOf(start);

    // Seaux de temporalité
    const keyOf = (d: Date) => cfg.gran === 'month' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : cfg.gran === 'week' ? iso(mondayOf(d)) : iso(dayStart(d));
    const labelOf = (k: string) => {
      if (cfg.gran === 'month') { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); }
      const d = new Date(k + 'T00:00:00');
      return (cfg.gran === 'week' ? 'sem. ' : '') + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    };
    const buckets: { key: string; label: string; creees: number; terminees: number }[] = [];
    const idx = new Map<string, number>();
    for (let d = new Date(start); d <= today; cfg.gran === 'month' ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + (cfg.gran === 'week' ? 7 : 1))) {
      const k = keyOf(d);
      if (!idx.has(k)) { idx.set(k, buckets.length); buckets.push({ key: k, label: labelOf(k), creees: 0, terminees: 0 }); }
    }

    const inRange = (s: string | null) => !!s && new Date(s) >= start;
    const done = rows.filter(r => r.done_at && inRange(r.done_at));
    const created = rows.filter(r => inRange(r.created_at));
    for (const r of created) { const i = idx.get(keyOf(new Date(r.created_at))); if (i !== undefined) buckets[i].creees++; }
    for (const r of done) { const i = idx.get(keyOf(new Date(r.done_at!))); if (i !== undefined) buckets[i].terminees++; }

    // KPI
    const delais = done.map(r => (new Date(r.done_at!).getTime() - new Date(r.created_at).getTime()) / 86400000).filter(x => x >= 0);
    const delaiMoyen = delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length : null;
    const avecEch = done.filter(r => r.echeance);
    const dansLesTemps = avecEch.filter(r => iso(new Date(r.done_at!)) <= r.echeance!).length;
    const jours = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
    const debit = done.length / (jours / 7);

    // Réalisées par source / classe
    const bySource: Record<string, number> = {};
    for (const r of done) { const s = r.source === 'projet_standalone' ? 'projet' : r.source; bySource[s] = (bySource[s] || 0) + 1; }
    const sourceData = Object.entries(bySource).map(([s, n]) => ({ name: SOURCE_LABELS[s] || s, n, color: '' })).sort((a, b) => b.n - a.n).map((x, i) => ({ ...x, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

    const byClass: Record<string, number> = {};
    for (const r of done) { const k = r.class_id && classById.has(r.class_id) ? String(r.class_id) : 'none'; byClass[k] = (byClass[k] || 0) + 1; }
    const classData = Object.entries(byClass).map(([k, n]) => ({
      name: k === 'none' ? 'Non classées' : (classById.get(Number(k))!.name), n, color: k === 'none' ? '#94a3b8' : classById.get(Number(k))!.color,
    })).sort((a, b) => b.n - a.n);

    // Réalisées par logiciel (classe « Logiciel ») : 8 premiers + « Autres »
    const bySoft: Record<string, number> = {};
    for (const r of done) if (r.software_name) bySoft[r.software_name] = (bySoft[r.software_name] || 0) + 1;
    const softSorted = Object.entries(bySoft).sort((a, b) => b[1] - a[1]);
    const softData = softSorted.slice(0, 8).map(([name, n], i) => ({ name, n, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
    const autres = softSorted.slice(8).reduce((a, [, n]) => a + n, 0);
    if (autres > 0) softData.push({ name: 'Autres', n: autres, color: '#94a3b8' });

    // Backlog (liste affichée : toutes sources)
    const open = tasks.filter(t => !TERMINAL.includes(t.statut));
    const isLate = (t: TaskLite) => !!t.echeance && /^\d{4}-\d{2}-\d{2}/.test(t.echeance) && t.echeance.slice(0, 10) < iso(today);
    const backlogByClass: Record<string, number> = {};
    for (const t of open) { const cid = classLinks[`${t.source}:${t.id}`]; const k = cid && classById.has(cid) ? String(cid) : 'none'; backlogByClass[k] = (backlogByClass[k] || 0) + 1; }
    const backlogClassData = Object.entries(backlogByClass).map(([k, n]) => ({
      name: k === 'none' ? 'Non classées' : classById.get(Number(k))!.name, n, color: k === 'none' ? '#94a3b8' : classById.get(Number(k))!.color,
    })).sort((a, b) => b.n - a.n);

    return {
      buckets, nDone: done.length, nCreated: created.length, delaiMoyen,
      respect: avecEch.length ? Math.round((dansLesTemps / avecEch.length) * 100) : null, nAvecEch: avecEch.length, debit,
      partAffectees: done.length ? Math.round((done.filter(r => r.assigned_by_other).length / done.length) * 100) : null,
      sourceData, classData, backlogClassData, softData,
      nOpen: open.length, nLate: open.filter(isLate).length, nHigh: open.filter(t => t.priority === 'haute').length,
    };
  }, [rows, period, cfg.gran, classById, tasks, classLinks]);

  const kpis = [
    { label: 'Réalisées', value: data.nDone, sub: `sur ${cfg.l}`, icon: <CheckCircle2 size={18} />, color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Créées', value: data.nCreated, sub: `sur ${cfg.l}`, icon: <PlusCircle size={18} />, color: '#2563eb', bg: '#eff6ff' },
    { label: 'Débit moyen', value: data.debit.toFixed(1), sub: 'tâches réalisées / semaine', icon: <TrendingUp size={18} />, color: '#0891b2', bg: '#ecfeff' },
    { label: 'Délai moyen', value: data.delaiMoyen === null ? '—' : `${data.delaiMoyen.toFixed(1)} j`, sub: 'création → validation', icon: <Timer size={18} />, color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Échéances tenues', value: data.respect === null ? '—' : `${data.respect} %`, sub: `${data.nAvecEch} tâche(s) avec échéance`, icon: <Target size={18} />, color: '#d97706', bg: '#fffbeb' },
    { label: 'Affectées par d\'autres', value: data.partAffectees === null ? '—' : `${data.partAffectees} %`, sub: 'des tâches réalisées', icon: <UserCheck size={18} />, color: '#6366f1', bg: '#eef2ff' },
    { label: 'Backlog ouvert', value: data.nOpen, sub: `dont ${data.nHigh} haute priorité`, icon: <Inbox size={18} />, color: '#475569', bg: '#f8fafc' },
    { label: 'En retard', value: data.nLate, sub: 'échéance dépassée', icon: <AlertTriangle size={18} />, color: '#dc2626', bg: '#fef2f2' },
  ];

  const box: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: 'white' };
  const title = (t: string) => <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{t}</div>;
  // Camembert : une couleur par part, pourcentage affiché sur la part, légende dessous.
  const pie = (items: { name: string; n: number; color: string }[], label: string) => {
    const total = items.reduce((a, b) => a + b.n, 0);
    return (
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={items} dataKey="n" nameKey="name" cx="50%" cy="45%" outerRadius={75} innerRadius={30} paddingAngle={1}
            label={({ percent }: any) => (percent >= 0.05 ? `${Math.round(percent * 100)} %` : '')} labelLine={false}>
            {items.map((it, i) => <Cell key={i} fill={it.color} />)}
          </Pie>
          <Tooltip formatter={(v: any, n: any) => [`${v} (${Math.round((Number(v) / total) * 100)} %)`, `${label} · ${n}`]} />
          <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  };
  const empty = <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 12 }}>Aucune donnée sur la période</div>;

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
          <BarChart2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Statistiques
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: period === p.v ? '2px solid #334155' : '1px solid #e2e8f0', background: period === p.v ? '#334155' : 'white', color: period === p.v ? 'white' : '#475569' }}>
              {p.l}
            </button>
          ))}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', marginLeft: 6 }}><X size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 13 }}>Chargement...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
            {kpis.map(k => (
              <div key={k.label} style={card(k.color, k.bg)}>
                <div style={{ color: k.color }}>{k.icon}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginTop: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{k.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...box, marginBottom: 12 }}>
            {title(`Tâches créées et réalisées — par ${cfg.gran === 'day' ? 'jour' : cfg.gran === 'week' ? 'semaine' : 'mois'}`)}
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data.buckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="creees" name="Créées" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                <Bar dataKey="terminees" name="Réalisées" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <div style={box}>
              {title('Réalisées par source')}
              {data.sourceData.length === 0 ? empty : pie(data.sourceData, 'Réalisées')}
            </div>
            <div style={box}>
              {title('Réalisées par classe')}
              {data.classData.length === 0 ? empty : pie(data.classData, 'Réalisées')}
            </div>
            <div style={box}>
              {title('Réalisées par logiciel')}
              {data.softData.length === 0 ? empty : pie(data.softData, 'Réalisées')}
            </div>
            <div style={box}>
              {title('Backlog ouvert par classe')}
              {data.backlogClassData.length === 0 ? empty : (
                <ResponsiveContainer width="100%" height={Math.max(120, data.backlogClassData.length * 34 + 20)}>
                  <BarChart data={data.backlogClassData} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="n" name="Ouvertes" radius={[0, 3, 3, 0]}>
                      {data.backlogClassData.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>
            Réalisées = tâches de « Mes tâches » dont vous êtes responsable, validées par vous (date de validation). Backlog = toutes sources.
          </div>
        </>
      )}
    </div>
  );
};

export default TaskStatsPanel;
