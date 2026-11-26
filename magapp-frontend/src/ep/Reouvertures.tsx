import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Unlock, Check, X, Loader2, Inbox } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, EmptyState, btnGhost, btnPrimary, card } from './ui';

interface Req { id: number; entretien_id: number; requested_name: string; requested_email: string; reason: string; status: 'en_attente' | 'acceptee' | 'refusee'; created_at: string; decided_by?: string; decided_at?: string; decision_note?: string; agent_nom?: string; agent_prenom?: string; direction?: string; service?: string; evaluator_nom?: string; annee?: number; campagne_statut?: string }

const fmt = (d?: string) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '');

/** Menu administrateur « Demandes de réouverture » : un évaluateur justifie sa demande, l'administrateur accepte ou refuse. */
export default function Reouvertures({ onChanged }: { onChanged?: (pending: number) => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [list, setList] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<'en_attente' | 'toutes'>('en_attente');

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/reopen-requests', { headers });
      const rows: Req[] = r.data.requests || [];
      setList(rows);
      onChanged?.(rows.filter(x => x.status === 'en_attente').length);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
  }, [headers, onChanged]);
  useEffect(() => { load(); }, [load]);

  const decide = async (rq: Req, accept: boolean) => {
    let note = '';
    if (!accept) {
      const n = window.prompt('Motif du refus (obligatoire) :', '');
      if (!n || n.trim().length < 3) return;
      note = n.trim();
    } else if (!window.confirm(`Accepter la réouverture de l’entretien de ${rq.agent_prenom || ''} ${rq.agent_nom || ''} ?\n\nL’entretien redevient modifiable et le CREP signé archivé est retiré.`)) return;
    setBusy(rq.id); setMsg(null);
    try {
      await axios.post(`/api/entretiens/reopen-requests/${rq.id}/decide`, { accept, note }, { headers });
      setMsg({ ok: true, text: accept ? 'Réouverture acceptée : le demandeur est prévenu par e-mail.' : 'Demande refusée : le demandeur est prévenu par e-mail.' });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Traitement impossible.' }); } finally { setBusy(null); }
  };

  if (!list) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  const shown = filter === 'en_attente' ? list.filter(r => r.status === 'en_attente') : list;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, fontWeight: 800, color: COLORS.text }}><Unlock size={18} color={COLORS.primary} /> Demandes de réouverture</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={filter === 'en_attente' ? btnPrimary : btnGhost} onClick={() => setFilter('en_attente')}>En attente ({list.filter(r => r.status === 'en_attente').length})</button>
          <button style={filter === 'toutes' ? btnPrimary : btnGhost} onClick={() => setFilter('toutes')}>Toutes ({list.length})</button>
        </div>
      </div>
      {msg && <div style={{ ...card, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.text}</div>}
      {shown.length === 0 ? <EmptyState icon={<Inbox size={40} />} title="Aucune demande" text="Les demandes de réouverture d’entretiens clôturés apparaîtront ici, avec leur justification." /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map(r => (
            <div key={r.id} style={{ ...card, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{r.agent_prenom} {r.agent_nom}</strong>
                <span style={{ fontSize: 11.5, color: '#64748b' }}>{[r.direction, r.service].filter(Boolean).join(' · ')}{r.annee ? ` · campagne ${r.annee}` : ''}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px',
                  background: r.status === 'en_attente' ? '#fef3c7' : r.status === 'acceptee' ? '#dcfce7' : '#fee2e2', color: r.status === 'en_attente' ? '#92400e' : r.status === 'acceptee' ? '#166534' : '#991b1b' }}>
                  {r.status === 'en_attente' ? 'En attente' : r.status === 'acceptee' ? 'Acceptée' : 'Refusée'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Demandé par <strong>{r.requested_name || r.requested_email}</strong> le {fmt(r.created_at)}{r.evaluator_nom ? ` · évaluateur : ${r.evaluator_nom}` : ''}</div>
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>{r.reason}</div>
              {r.status !== 'en_attente' && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>Traitée le {fmt(r.decided_at)}{r.decision_note ? ` — ${r.decision_note}` : ''}</div>}
              {r.status === 'en_attente' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy === r.id} onClick={() => decide(r, true)}>{busy === r.id ? <Loader2 size={14} /> : <Check size={14} />} Accepter</button>
                  <button style={btnGhost} disabled={busy === r.id} onClick={() => decide(r, false)}><X size={14} /> Refuser</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
