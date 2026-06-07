import React, { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, ArrowLeft, Flag, CheckSquare } from 'lucide-react';

interface Item {
  kind: 'tache' | 'jalon';
  id: number;
  titre: string;
  date: string | null;
  statut?: string;
  atteint?: number;
  projet_id: number;
  projet_titre?: string;
  projet_code?: string;
}

export default function PlanningGeneral() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<{ taches: any[]; jalons: any[]; projets: any[] }>({ taches: [], jalons: [], projets: [] });
  const [loading, setLoading] = useState(true);
  const [projFilter, setProjFilter] = useState<number | 'all'>('all');
  const [hideDone, setHideDone] = useState(false);

  useEffect(() => {
    fetch('/api/projets/planning-global', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { taches: [], jalons: [], projets: [] })
      .then(d => setData(d && d.taches ? d : { taches: [], jalons: [], projets: [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const items: Item[] = useMemo(() => {
    const t: Item[] = (data.taches || []).map((x: any) => ({ kind: 'tache', id: x.id, titre: x.titre, date: x.date_fin || x.date_debut || null, statut: x.statut, projet_id: x.projet_id, projet_titre: x.projet_titre, projet_code: x.projet_code }));
    const j: Item[] = (data.jalons || []).map((x: any) => ({ kind: 'jalon', id: x.id, titre: x.titre, date: x.date_jalon || null, atteint: x.atteint, projet_id: x.projet_id, projet_titre: x.projet_titre, projet_code: x.projet_code }));
    let all = [...t, ...j];
    if (projFilter !== 'all') all = all.filter(i => i.projet_id === projFilter);
    if (hideDone) all = all.filter(i => !(i.kind === 'tache' ? i.statut === 'terminee' : i.atteint));
    return all.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  }, [data, projFilter, hideDone]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const isDone = (i: Item) => i.kind === 'tache' ? i.statut === 'terminee' : !!i.atteint;
  const isLate = (i: Item) => !isDone(i) && i.date && new Date(i.date) < today;

  return (
    <div>
      <Header />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/portefeuille-projets')} style={{ border: '1px solid #e2e8f0', background: 'white', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569' }}><ArrowLeft size={16} /></button>
          <CalendarRange size={22} color="#2563eb" />
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Planning général</h1>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>{data.projets?.length || 0} projet(s) · {items.length} échéance(s)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={projFilter} onChange={e => setProjFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }}>
              <option value="all">Tous mes projets</option>
              {(data.projets || []).map((p: any) => <option key={p.id} value={p.id}>{p.titre}</option>)}
            </select>
            <button onClick={() => setHideDone(v => !v)} style={{ padding: '8px 12px', border: '1px solid', borderColor: hideDone ? '#2563eb' : '#e2e8f0', background: hideDone ? '#eff6ff' : 'white', color: hideDone ? '#2563eb' : '#475569', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {hideDone ? '☑' : '☐'} Masquer les terminés
            </button>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucune échéance dans votre périmètre</div>
          ) : items.map(i => (
            <div key={`${i.kind}-${i.id}`} onClick={() => navigate(`/projets/${i.projet_id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              <span style={{ color: i.kind === 'jalon' ? '#ea580c' : '#0d9488', flexShrink: 0 }}>{i.kind === 'jalon' ? <Flag size={15} /> : <CheckSquare size={15} />}</span>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, fontWeight: 600, color: isLate(i) ? '#dc2626' : '#64748b' }}>{fmt(i.date)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1e293b', textDecoration: isDone(i) ? 'line-through' : 'none', opacity: isDone(i) ? 0.6 : 1 }}>{i.titre}</span>
              <span style={{ fontSize: 11, color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.projet_titre}</span>
              {isLate(i) && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 8, padding: '1px 6px' }}>en retard</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
