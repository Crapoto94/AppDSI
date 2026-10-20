import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatOrgName } from '../utils/orgName';

type Totals = { vote: number; disponible: number; engage: number; enCours: number };
type Node = { key: string; label: string; totals: Totals; children: Node[] };

const num = (v: any) => parseFloat(String(v ?? 0).replace(',', '.')) || 0;
const zero = (): Totals => ({ vote: 0, disponible: 0, engage: 0, enCours: 0 });
const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const sectionName = (raw: string) => {
  const s = (raw || '').trim().toUpperCase();
  if (s === 'F' || s.startsWith('FONC')) return 'Fonctionnement';
  if (s === 'I' || s.startsWith('INV')) return 'Investissement';
  return raw?.trim() || 'Sans section';
};

const LEVELS = ['Section', 'Chapitre', 'Nature', 'Service'];

function build(rows: any[]): Node[] {
  const root: Node = { key: '', label: '', totals: zero(), children: [] };
  const getChild = (parent: Node, key: string, label: string) => {
    let c = parent.children.find(x => x.key === key);
    if (!c) { c = { key, label, totals: zero(), children: [] }; parent.children.push(c); }
    return c;
  };
  for (const r of rows) {
    const t: Totals = { vote: num(r.vote), disponible: num(r.disponible), engage: num(r.engage), enCours: num(r.en_cours) };
    const section = sectionName(r.section);
    if (r.source === 'demande') {
      // Demande de commande pas encore commandée : chapitre dédié, une ligne par demande.
      let node = root;
      for (const [k, label] of [[section, section], ['~DEMANDES', 'Demandes de commande à passer'], [`d${r.demande_id}`, r.demande_designation || `Demande ${r.demande_id}`]] as [string, string][]) {
        node = getChild(node, k, label);
        node.totals.vote += t.vote; node.totals.disponible += t.disponible;
        node.totals.engage += t.engage; node.totals.enCours += t.enCours;
      }
      continue;
    }
    const chapitre = r.chapitre || 'Sans chapitre';
    const nature = r.nature || 'Sans nature';
    const service = r.service || 'Sans service';
    const svcLabel = r.service ? `${r.service} — ${formatOrgName(r.service_libelle)}` : service;
    let node = root;
    const path: [string, string][] = [
      [section, section],
      [chapitre, `Chapitre ${chapitre}`],
      [nature, `Nature ${nature}`],
      [service, svcLabel],
    ];
    for (const [k, label] of path) {
      node = getChild(node, k, label);
      node.totals.vote += t.vote; node.totals.disponible += t.disponible;
      node.totals.engage += t.engage; node.totals.enCours += t.enCours;
    }
  }
  const sort = (n: Node) => { n.children.sort((a, b) => a.key.localeCompare(b.key, 'fr', { numeric: true })); n.children.forEach(sort); };
  sort(root);
  return root.children;
}

export default function BudgetHierarchy({ token, fiscalYear, budgetScope, carry }: { token: string | null; fiscalYear: number; budgetScope: string; carry?: { reportsI: number; rattachF: number } }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetch(`/api/budget/synthese-sedit?fiscalYear=${fiscalYear}&budgetScope=${budgetScope}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) setRows(d.rows || []); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, fiscalYear, budgetScope]);
  const tree = useMemo(() => build(rows), [rows]);
  const kpi = useMemo(() => {
    const k = { total: zero(), sections: {} as Record<string, Totals> };
    for (const n of tree) {
      k.sections[n.key] = n.totals;
      (['vote', 'disponible', 'engage', 'enCours'] as const).forEach(f => { k.total[f] += n.totals[f]; });
    }
    return k;
  }, [tree]);
  const reel = (t: Totals) => t.vote - t.engage - t.enCours;
  const stat: React.CSSProperties = { flex: '1 1 0', minWidth: 130, padding: '0 1.1rem', display: 'flex', flexDirection: 'column', gap: 2 };
  const lab: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const val: React.CSSProperties = { fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.2 };
  const sub: React.CSSProperties = { fontSize: '0.7rem', color: '#94a3b8' };
  const fmtC = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€`;
    if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('fr-FR')} k€`;
    return `${Math.round(n)} €`;
  };
  const sectionSub = (f: (t: Totals) => number) => Object.entries(kpi.sections).map(([k, t]) => `${k.startsWith('Fonc') ? 'F' : k.startsWith('Inv') ? 'I' : k} ${fmtC(f(t))}`).join(' · ');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandTo = (depth: number) => {
    const ids = new Set<string>();
    const walk = (nodes: Node[], d: number, prefix: string) => nodes.forEach(n => {
      const id = prefix + '/' + n.key;
      if (d < depth) { ids.add(id); walk(n.children, d + 1, id); }
    });
    walk(tree, 0, '');
    setOpen(ids);
  };

  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 12px', fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 };
  const btn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.75rem', cursor: 'pointer' };

  const renderRows = (nodes: Node[], depth: number, prefix: string): React.ReactNode[] =>
    nodes.flatMap(n => {
      const id = prefix + '/' + n.key;
      const hasChildren = n.children.length > 0;
      const isOpen = open.has(id);
      const bold = depth <= 1;
      const bg = depth === 0 ? '#f1f5f9' : depth === 1 ? '#f8fafc' : '#fff';
      const row = (
        <tr key={id} style={{ background: bg, borderTop: '1px solid #e2e8f0', cursor: hasChildren ? 'pointer' : 'default' }} onClick={() => hasChildren && toggle(id)}>
          <td style={{ padding: '7px 12px', paddingLeft: 12 + depth * 22, fontWeight: bold ? 700 : 500, color: '#0f172a', fontSize: depth === 3 ? '0.8rem' : '0.85rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {hasChildren ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
              {n.label}
            </span>
          </td>
          <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: bold ? 700 : 400 }}>{fmt(n.totals.vote)}</td>
          <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: bold ? 700 : 400, color: n.totals.disponible < 0 ? '#dc2626' : '#16a34a' }}>{fmt(n.totals.disponible)}</td>
          <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: bold ? 700 : 400, color: '#1d4ed8' }}>{fmt(n.totals.engage)}</td>
          <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: bold ? 700 : 400, color: '#b45309' }}>{fmt(n.totals.enCours)}</td>
          <td style={{ textAlign: 'right', padding: '7px 12px', fontWeight: 700, color: reel(n.totals) < 0 ? '#dc2626' : '#16a34a' }}>{fmt(reel(n.totals))}</td>
        </tr>
      );
      return isOpen && hasChildren ? [row, ...renderRows(n.children, depth + 1, id)] : [row];
    });

  return (
    <>
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.8rem 0', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 10 }}>
        {[
          { l: 'Budget voté', v: kpi.total.vote, c: 'var(--color-navy)', f: (t: Totals) => t.vote },
          { l: 'Engagé', v: kpi.total.engage, c: '#1d4ed8', f: (t: Totals) => t.engage },
          { l: "En cours d'engagement", v: kpi.total.enCours, c: '#b45309', f: (t: Totals) => t.enCours },
          { l: 'Disponible réel', v: reel(kpi.total), c: reel(kpi.total) < 0 ? '#dc2626' : '#16a34a', f: reel },
        ].map((x, i) => (
          <div key={x.l} style={{ ...stat, borderLeft: i ? '1px solid #e2e8f0' : 'none' }} title={fmt(x.v)}>
            <span style={lab}>{x.l}</span>
            <span style={{ ...val, color: x.c }}>{fmtC(x.v)}</span>
            <span style={sub}>{sectionSub(x.f)}</span>
          </div>
        ))}
      </div>
      {kpi.total.vote > 0 && (() => {
        const pct = (n: number) => Math.max(0, Math.min(100, (n / kpi.total.vote) * 100));
        return (
          <div style={{ padding: '0.7rem 1.1rem 0' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f1f5f9' }}
                 title={`Engagé ${pct(kpi.total.engage).toFixed(0)} % · en cours ${pct(kpi.total.enCours).toFixed(0)} % · disponible ${pct(reel(kpi.total)).toFixed(0)} %`}>
              <div style={{ width: `${pct(kpi.total.engage)}%`, background: '#3b82f6' }} />
              <div style={{ width: `${pct(kpi.total.enCours)}%`, background: '#f59e0b' }} />
              <div style={{ width: `${pct(reel(kpi.total))}%`, background: '#22c55e' }} />
            </div>
            {carry && (carry.reportsI > 0 || carry.rattachF > 0) && (
              <div style={{ ...sub, marginTop: 6 }}>
                Dont reports (I) {fmtC(carry.reportsI)} · rattachements (F) {fmtC(carry.rattachF)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
    <div className="table-card" style={{ marginBottom: '1rem' }}>
      <div style={{ padding: '0.9rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-navy)' }}>Synthèse par section</h3>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{LEVELS.join(' › ')} · « En cours d'engagement » = pré-engagé non encore engagé + demandes de commande sans commande · données Sedit en direct</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn} onClick={() => expandTo(1)}>Chapitres</button>
          <button style={btn} onClick={() => expandTo(2)}>Natures</button>
          <button style={btn} onClick={() => expandTo(3)}>Services</button>
          <button style={btn} onClick={() => setOpen(new Set())}>Replier</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fff', borderTop: '1px solid #e2e8f0' }}>
              <th style={{ ...th, textAlign: 'left' }}>Libellé</th>
              <th style={th}>Budget voté</th>
              <th style={th} title="Sedit : voté − prévision">Disponible Sedit</th>
              <th style={th}>Engagé</th>
              <th style={th}>En cours d'engagement</th>
              <th style={th}>Dispo réel</th>
            </tr>
          </thead>
          <tbody>
            {tree.length === 0
              ? <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: error ? '#dc2626' : '#94a3b8' }}>{loading ? 'Chargement depuis Sedit…' : error ? `Erreur Sedit : ${error}` : 'Aucune ligne budgétaire'}</td></tr>
              : renderRows(tree, 0, '')}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
