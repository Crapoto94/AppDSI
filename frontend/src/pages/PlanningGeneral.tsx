import React, { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, ArrowLeft } from 'lucide-react';

interface Tache { id: number; titre: string; date_debut?: string; date_fin?: string; statut?: string; projet_id: number; projet_titre?: string; }
interface Jalon { id: number; titre: string; date_jalon: string; atteint?: number; projet_id: number; projet_titre?: string; }
interface Projet { id: number; code: string; titre: string; }

const STATUT_COLORS_TACHE: Record<string, string> = { a_faire: '#94a3b8', en_cours: '#3b82f6', terminee: '#22c55e', bloquee: '#ef4444' };
const LABEL_W = 260;
const PX_PER_DAY = 4;
const DAY = 86400000;

export default function PlanningGeneral() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<{ taches: Tache[]; jalons: Jalon[]; projets: Projet[] }>({ taches: [], jalons: [], projets: [] });
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

  const projets = useMemo(() => {
    let ps = data.projets || [];
    if (projFilter !== 'all') ps = ps.filter(p => p.id === projFilter);
    // Ne garder que les projets ayant au moins une tâche/jalon (après filtres)
    return ps.filter(p =>
      (data.taches || []).some(t => t.projet_id === p.id && (!hideDone || t.statut !== 'terminee')) ||
      (data.jalons || []).some(j => j.projet_id === p.id && (!hideDone || !j.atteint))
    );
  }, [data, projFilter, hideDone]);

  // Échelle temporelle globale
  const { minMs, ganttW, monthTicks } = useMemo(() => {
    const ds: number[] = [];
    for (const t of data.taches || []) { if (t.date_debut) ds.push(+new Date(t.date_debut)); if (t.date_fin) ds.push(+new Date(t.date_fin)); }
    for (const j of data.jalons || []) { if (j.date_jalon) ds.push(+new Date(j.date_jalon)); }
    const valid = ds.filter(n => !isNaN(n));
    let min = valid.length ? Math.min(...valid) : Date.now();
    let max = valid.length ? Math.max(...valid) : Date.now() + 30 * DAY;
    min -= 5 * DAY; max += 5 * DAY;
    const totalDays = Math.max((max - min) / DAY, 30);
    const w = Math.max(totalDays * PX_PER_DAY, 700);
    // ticks mensuels
    const ticks: { x: number; label: string }[] = [];
    const d = new Date(min); d.setDate(1); d.setHours(0, 0, 0, 0);
    while (+d <= max) {
      const x = ((+d - min) / (max - min)) * w;
      if (x >= 0) ticks.push({ x, label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) });
      d.setMonth(d.getMonth() + 1);
    }
    return { minMs: min, maxMs: max, ganttW: w, monthTicks: ticks };
  }, [data]);

  const range = useMemo(() => {
    const ds: number[] = [];
    for (const t of data.taches || []) { if (t.date_debut) ds.push(+new Date(t.date_debut)); if (t.date_fin) ds.push(+new Date(t.date_fin)); }
    for (const j of data.jalons || []) { if (j.date_jalon) ds.push(+new Date(j.date_jalon)); }
    const valid = ds.filter(n => !isNaN(n));
    const max = (valid.length ? Math.max(...valid) : Date.now() + 30 * DAY) + 5 * DAY;
    return Math.max(max - minMs, 1);
  }, [data, minMs]);

  const toX = (d?: string) => d ? ((+new Date(d) - minMs) / range) * ganttW : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const totalItems = (data.taches?.length || 0) + (data.jalons?.length || 0);

  return (
    <div>
      <Header />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/portefeuille-projets')} style={{ border: '1px solid #e2e8f0', background: 'white', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569' }}><ArrowLeft size={16} /></button>
          <CalendarRange size={22} color="#2563eb" />
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Planning général</h1>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>{data.projets?.length || 0} projet(s) · {totalItems} échéance(s)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={projFilter} onChange={e => setProjFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }}>
              <option value="all">Tous mes projets</option>
              {(data.projets || []).map(p => <option key={p.id} value={p.id}>{p.titre}</option>)}
            </select>
            <button onClick={() => setHideDone(v => !v)} style={{ padding: '8px 12px', border: '1px solid', borderColor: hideDone ? '#2563eb' : '#e2e8f0', background: hideDone ? '#eff6ff' : 'white', color: hideDone ? '#2563eb' : '#475569', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {hideDone ? '☑' : '☐'} Masquer les terminés
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
        ) : projets.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>Aucune échéance dans votre périmètre</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
            {/* En-tête timeline */}
            <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
              <div style={{ width: LABEL_W, flexShrink: 0, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', position: 'sticky', left: 0, background: 'white', zIndex: 3 }}>Projet / Échéance</div>
              <div style={{ position: 'relative', width: ganttW, height: 28 }}>
                {monthTicks.map((t, i) => (
                  <div key={i} style={{ position: 'absolute', left: t.x, top: 0, height: '100%', borderLeft: '1px solid #f1f5f9', paddingLeft: 4, fontSize: 10, color: '#94a3b8' }}>{t.label}</div>
                ))}
              </div>
            </div>

            {/* Lignes par projet */}
            {projets.map(p => {
              const ptaches = (data.taches || []).filter(t => t.projet_id === p.id && (!hideDone || t.statut !== 'terminee'));
              const pjalons = (data.jalons || []).filter(j => j.projet_id === p.id && (!hideDone || !j.atteint));
              return (
                <div key={p.id}>
                  <div onClick={() => navigate(`/projets/${p.id}`)} style={{ display: 'flex', cursor: 'pointer', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ width: LABEL_W, flexShrink: 0, padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#1e293b', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.titre}>📁 {p.titre}</div>
                    <div style={{ width: ganttW, flexShrink: 0 }} />
                  </div>
                  {ptaches.map(t => {
                    const x = toX(t.date_debut || t.date_fin);
                    const x2 = toX(t.date_fin || t.date_debut);
                    const w = Math.max(x2 - x, 8);
                    const color = STATUT_COLORS_TACHE[t.statut || 'a_faire'] || '#94a3b8';
                    return (
                      <div key={`t${t.id}`} style={{ display: 'flex', borderBottom: '1px solid #f8fafc', minHeight: 26, alignItems: 'center' }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: '3px 12px 3px 24px', fontSize: 12, color: '#475569', position: 'sticky', left: 0, background: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.titre}>{t.titre}</div>
                        <div style={{ position: 'relative', width: ganttW, flexShrink: 0, height: 26 }}>
                          <div title={`${t.titre} (${t.statut || ''})`} style={{ position: 'absolute', left: x, top: 6, width: w, height: 14, borderRadius: 4, background: color, opacity: t.statut === 'terminee' ? 0.55 : 1 }} />
                        </div>
                      </div>
                    );
                  })}
                  {pjalons.map(j => {
                    const x = toX(j.date_jalon);
                    const late = !j.atteint && new Date(j.date_jalon) < today;
                    const color = j.atteint ? '#22c55e' : late ? '#dc2626' : '#ea580c';
                    return (
                      <div key={`j${j.id}`} style={{ display: 'flex', borderBottom: '1px solid #f8fafc', minHeight: 26, alignItems: 'center' }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: '3px 12px 3px 24px', fontSize: 12, color: '#475569', position: 'sticky', left: 0, background: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={j.titre}>📍 {j.titre}</div>
                        <div style={{ position: 'relative', width: ganttW, flexShrink: 0, height: 26 }}>
                          <div title={`${j.titre} — ${new Date(j.date_jalon).toLocaleDateString('fr-FR')}`} style={{ position: 'absolute', left: x - 6, top: 6, width: 12, height: 12, background: color, transform: 'rotate(45deg)', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#3b82f6', borderRadius: 3, verticalAlign: 'middle' }} /> Tâche en cours</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#22c55e', borderRadius: 3, verticalAlign: 'middle' }} /> Terminée</span>
          <span><span style={{ display: 'inline-block', width: 11, height: 11, background: '#ea580c', transform: 'rotate(45deg)', verticalAlign: 'middle' }} /> Jalon</span>
          <span><span style={{ display: 'inline-block', width: 11, height: 11, background: '#dc2626', transform: 'rotate(45deg)', verticalAlign: 'middle' }} /> Jalon en retard</span>
        </div>
      </div>
    </div>
  );
}
