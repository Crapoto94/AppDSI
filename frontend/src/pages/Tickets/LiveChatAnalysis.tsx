import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MessageCircle, X, Paperclip, Star, ExternalLink } from 'lucide-react';

interface Responder { username: string; name: string; messages: number }
interface Chat {
  id: number; ticket_id: number | null; ticket_title: string | null; user: string; user_username: string; tech: string | null; tech_username: string | null;
  chat_type: string; auth_method: string | null; status: string; close_reason: string | null;
  created_at: string; claimed_at: string | null; closed_at: string | null;
  attente_prise_en_charge_s: number | null; premiere_reponse_s: number | null; reponse_moyenne_s: number | null; reponse_max_s: number | null; nb_reponses: number;
  duree_s: number | null; echange_s: number | null; msgs_total: number; msgs_user: number; msgs_tech: number; pieces_jointes: number;
  sans_reponse: boolean; repondants: Responder[]; satisfaction: { rating: number; comment: string | null } | null;
  timeline?: Array<{ id: number; sender_type: string; sender_name: string; content: string; created_at: string; attachment_name: string | null; attachment_url: string | null; reponse_s: number | null }>;
}
interface Analysis {
  from: string; to: string;
  kpis: {
    total: number; repondus: number; sans_reponse: number; premiere_reponse_moy_s: number | null; premiere_reponse_mediane_s: number | null; attente_moy_s: number | null;
    duree_moy_s: number | null; msgs_moy: number; msgs_total: number; satisfaction_moy: number | null; satisfaction_nb: number;
    par_motif_cloture: Record<string, number>; par_type: Record<string, number>;
  };
  techniciens: Array<{ username: string; name: string; chats: number; messages: number; premiere_reponse_moy_s: number | null; reponse_moyenne_s: number | null }>;
  chats: Chat[];
}

const C = { indigo: '#6366f1', green: '#22c55e', red: '#ef4444', amber: '#f59e0b', slate: '#64748b', border: '#e2e8f0', teal: '#14b8a6' };
const MOTIFS: Record<string, string> = { inactivity: 'Inactivité', user_left: 'Demandeur parti', rejected: 'Rejeté', clos: 'Clos par le technicien', closed: 'Clos', pre_closed: 'Pré-clos', waiting: 'En attente', active: 'En cours' };

function dur(s: number | null | undefined): string {
  if (s == null) return '—';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
}
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const hms = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const strip = (html: string) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// Couleur du délai : vert < 2 min, orange < 10 min, rouge au-delà
const delayColor = (s: number | null) => (s == null ? C.slate : s < 120 ? C.green : s < 600 ? C.amber : C.red);

function Kpi({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 130, flex: 1, background: '#fff' }}>
      <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#1e293b', lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

/** Analyse fine des chats en direct : indicateurs, performance par technicien, liste des chats et détail de chaque échange. */
export default function LiveChatAnalysis({ headers }: { headers: Record<string, string> }) {
  const auth = headers.Authorization;
  const [days, setDays] = useState<number>(90);
  const [type, setType] = useState<'' | 'ville' | 'ecole'>('');
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Chat | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    setLoading(true); setError('');
    const to = new Date(); const from = new Date(Date.now() - days * 86400000);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    axios.get<Analysis>('/api/live/analysis', { headers: { Authorization: auth }, params: { from: iso(from), to: iso(to), ...(type ? { chat_type: type } : {}) } })
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(e => { if (!cancelled) setError(e.response?.data?.message || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth, days, type]);

  const openDetail = async (c: Chat) => {
    setDetail(c); setDetailLoading(true);
    try {
      const r = await axios.get<Chat>(`/api/live/analysis/${c.id}`, { headers: { Authorization: auth } });
      setDetail(r.data);
    } catch { /* on garde les métriques de la ligne */ } finally { setDetailLoading(false); }
  };

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 8, border: `1px solid ${active ? C.indigo : C.border}`, background: active ? C.indigo : '#fff',
    color: active ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  });
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: C.slate, borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
  const k = data?.kpis;
  const motifs = useMemo(() => Object.entries(k?.par_motif_cloture || {}).sort((a, b) => b[1] - a[1]), [k]);

  return (
    <div className="stats-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={18} color={C.indigo} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>Chats en direct — analyse détaillée</div>
            <div style={{ fontSize: 12, color: C.slate }}>Qui a répondu, délais de réponse, volume de messages ; cliquez sur un chat pour voir l'échange.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['', 'Tous'], ['ville', 'Ville'], ['ecole', 'Écoles']] as const).map(([v, l]) => <button key={v} type="button" style={pill(type === v)} onClick={() => setType(v)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[30, '30 j'], [90, '90 j'], [365, '12 mois'], [3650, 'Tout']].map(([d, l]) => <button key={d} type="button" style={pill(days === d)} onClick={() => setDays(Number(d))}>{l}</button>)}
          </div>
        </div>
      </div>

      {loading && !data && <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>}
      {error && <div style={{ color: C.red, padding: 12 }}>{error}</div>}
      {data && k && !error && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label="Chats" value={k.total} sub={`${k.msgs_total} messages · ${k.msgs_moy} / chat`} />
            <Kpi label="Avec réponse" value={k.total ? `${Math.round((k.repondus / k.total) * 100)} %` : '—'} sub={`${k.repondus} répondus · ${k.sans_reponse} sans réponse`} color={k.sans_reponse ? C.amber : C.green} />
            <Kpi label="1ʳᵉ réponse (moy.)" value={dur(k.premiere_reponse_moy_s)} sub={`médiane ${dur(k.premiere_reponse_mediane_s)}`} color={delayColor(k.premiere_reponse_moy_s)} />
            <Kpi label="Attente de prise en charge" value={dur(k.attente_moy_s)} sub="création → prise en charge (moy.)" />
            <Kpi label="Durée (moy.)" value={dur(k.duree_moy_s)} />
            <Kpi label="Satisfaction" value={k.satisfaction_moy != null ? `${k.satisfaction_moy} / 5` : '—'} sub={`${k.satisfaction_nb} avis`} color={C.amber} />
          </div>
          {motifs.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, fontSize: 12, color: '#475569' }}>
              <span style={{ color: C.slate }}>Fin de chat :</span>
              {motifs.map(([m, n]) => <span key={m} style={{ background: '#f1f5f9', borderRadius: 12, padding: '2px 10px' }}>{MOTIFS[m] || m} : <b>{n}</b></span>)}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '4px 0 6px' }}>Par technicien</div>
          <div style={{ overflowX: 'auto', marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Technicien</th><th style={th}>Chats</th><th style={th}>Messages envoyés</th><th style={th}>1ʳᵉ réponse (moy.)</th><th style={th}>Délai de réponse (moy.)</th></tr></thead>
              <tbody>
                {data.techniciens.length === 0 && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={5}>Aucune réponse de technicien sur la période.</td></tr>}
                {data.techniciens.map(t => (
                  <tr key={t.username}>
                    <td style={{ ...td, fontWeight: 600 }}>{t.name}</td><td style={td}>{t.chats}</td><td style={td}>{t.messages}</td>
                    <td style={{ ...td, color: delayColor(t.premiere_reponse_moy_s), fontWeight: 600 }}>{dur(t.premiere_reponse_moy_s)}</td>
                    <td style={{ ...td, color: delayColor(t.reponse_moyenne_s), fontWeight: 600 }}>{dur(t.reponse_moyenne_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '4px 0 6px' }}>Détail des chats ({data.chats.length})</div>
          <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
                <tr><th style={th}>Date</th><th style={th}>Demandeur</th><th style={th}>A répondu</th><th style={th}>Messages</th><th style={th}>Attente</th><th style={th}>1ʳᵉ réponse</th><th style={th}>Durée</th><th style={th}>Fin</th><th style={th}>Avis</th></tr>
              </thead>
              <tbody>
                {data.chats.length === 0 && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={9}>Aucun chat sur la période.</td></tr>}
                {data.chats.map(c => (
                  <tr key={c.id} onClick={() => openDetail(c)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{dt(c.created_at)}{c.chat_type === 'ecole' && <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '1px 6px' }}>École</span>}</td>
                    <td style={td}>{c.user}</td>
                    <td style={td}>{c.sans_reponse ? <span style={{ color: C.red, fontWeight: 600 }}>Personne</span> : c.repondants.map(r => `${r.name} (${r.messages})`).join(', ')}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.msgs_total} <span style={{ color: '#94a3b8', fontSize: 11 }}>({c.msgs_user} demandeur · {c.msgs_tech} tech.)</span></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{dur(c.attente_prise_en_charge_s)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: delayColor(c.premiere_reponse_s), fontWeight: 600 }}>{dur(c.premiere_reponse_s)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{dur(c.duree_s)}</td>
                    <td style={{ ...td, fontSize: 12 }}>{MOTIFS[c.close_reason || (c.status === 'closed' ? 'clos' : c.status)] || c.close_reason || c.status}</td>
                    <td style={td}>{c.satisfaction ? <span style={{ color: C.amber, whiteSpace: 'nowrap' }}>{c.satisfaction.rating}<Star size={12} fill={C.amber} style={{ verticalAlign: 'middle' }} /></span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 14, width: 'min(860px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Chat avec {detail.user}</div>
                <div style={{ fontSize: 12, color: C.slate }}>
                  {dt(detail.created_at)} · {detail.chat_type === 'ecole' ? 'École' : 'Ville'} · {MOTIFS[detail.close_reason || (detail.status === 'closed' ? 'clos' : detail.status)] || detail.status}
                  {detail.ticket_id && <> · <a href={`/tickets/${detail.ticket_id}`} target="_blank" rel="noreferrer" style={{ color: C.indigo }}>ticket #{detail.ticket_id} <ExternalLink size={11} style={{ verticalAlign: 'middle' }} /></a></>}
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
              <Kpi label="Messages" value={detail.msgs_total} sub={`${detail.msgs_user} demandeur · ${detail.msgs_tech} technicien`} />
              <Kpi label="Attente" value={dur(detail.attente_prise_en_charge_s)} sub="avant prise en charge" />
              <Kpi label="1ʳᵉ réponse" value={dur(detail.premiere_reponse_s)} color={delayColor(detail.premiere_reponse_s)} />
              <Kpi label="Délai moyen" value={dur(detail.reponse_moyenne_s)} sub={`max ${dur(detail.reponse_max_s)} · ${detail.nb_reponses} réponse(s)`} color={delayColor(detail.reponse_moyenne_s)} />
              <Kpi label="Durée" value={dur(detail.duree_s)} sub={`échange ${dur(detail.echange_s)}`} />
              {detail.pieces_jointes > 0 && <Kpi label="Pièces jointes" value={detail.pieces_jointes} />}
            </div>
            <div style={{ padding: '10px 20px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${C.border}` }}>
              <b>A répondu :</b>{' '}
              {detail.repondants.length ? detail.repondants.map(r => `${r.name} (${r.messages} message${r.messages > 1 ? 's' : ''})`).join(', ') : <span style={{ color: C.red }}>personne</span>}
              {detail.tech && <span style={{ color: '#94a3b8' }}> · pris en charge par {detail.tech}</span>}
              {detail.satisfaction && <span> · avis : <b style={{ color: C.amber }}>{detail.satisfaction.rating}/5</b>{detail.satisfaction.comment ? ` « ${detail.satisfaction.comment} »` : ''}</span>}
            </div>
            <div style={{ padding: '14px 20px', overflowY: 'auto', background: '#f8fafc', flex: 1 }}>
              {detailLoading && !detail.timeline && <div style={{ color: '#94a3b8', textAlign: 'center' }}>Chargement des messages…</div>}
              {(detail.timeline || []).map(m => {
                const mine = m.sender_type === 'tech';
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div style={{ maxWidth: '75%' }}>
                      <div style={{ fontSize: 11, color: C.slate, marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>
                        <b>{m.sender_name}</b> · {hms(m.created_at)}
                        {m.reponse_s != null && <span style={{ marginLeft: 6, color: delayColor(m.reponse_s), fontWeight: 600 }}>répondu en {dur(m.reponse_s)}</span>}
                      </div>
                      <div style={{ background: mine ? '#e0e7ff' : '#fff', border: `1px solid ${mine ? '#c7d2fe' : C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {strip(m.content) || <i style={{ color: '#94a3b8' }}>(vide)</i>}
                        {m.attachment_name && <div style={{ marginTop: 4, fontSize: 12, color: C.indigo }}><Paperclip size={12} style={{ verticalAlign: 'middle' }} /> {m.attachment_name}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {detail.timeline && detail.timeline.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center' }}>Aucun message dans ce chat.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
