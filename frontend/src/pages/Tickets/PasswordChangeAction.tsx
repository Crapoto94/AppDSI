import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// Détection heuristique : un ticket "de gestion de mot de passe" pour proposer
// l'action rapide dans TicketDetail (cf. l'action équivalente dans les
// Actions automatiques de /tickets, qui crée son propre ticket).
export function looksLikePasswordTicket(ticket: any): boolean {
  if (!ticket) return false;
  const haystack = [
    ticket.title,
    ticket.category_name,
    ticket.subcategory_name,
    ticket.content,
  ].filter(Boolean).join(' ').toLowerCase();
  return /mot de passe|mdp\b|password|compte (bloqu|verrouill)|d[ée]verrouill/i.test(haystack);
}

interface Props {
  ticketId: number;
  requesterName?: string;
  requesterEmail?: string;
  onClose: () => void;
  onResolved?: (result: any) => void;
}

export default function PasswordChangeModal({ ticketId, requesterName, requesterEmail, onClose, onResolved }: Props) {
  const [pwdConfigured, setPwdConfigured] = useState('');
  const [searchQuery, setSearchQuery] = useState(requesterName || requesterEmail || '');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const tk = localStorage.getItem('token');
    axios.get('/api/tickets/auto-actions/settings', { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => setPwdConfigured(r.data?.pwd_change_value || ''))
      .catch(() => {});
  }, []);

  const runSearch = async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    if (query.length < 2) return;
    setSearching(true); setError(''); setSelected(null);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.get(`/api/tickets/auto-actions/ad-search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${tk}` } });
      setSearchResults(r.data || []);
      if (!r.data?.length) setError('Aucun compte trouvé.');
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur de recherche.'); }
    finally { setSearching(false); }
  };

  // Recherche automatique au chargement avec le nom/email du demandeur du ticket.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (searchQuery.trim().length >= 2) runSearch(searchQuery); }, []);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true); setError('');
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.post('/api/tickets/auto-actions/password-change-ticket', {
        sam: selected.sam,
        display_name: selected.displayName,
        mail: selected.mail,
        ticket_id: ticketId,
      }, { headers: { Authorization: `Bearer ${tk}` } });
      setResult(r.data);
      onResolved?.(r.data);
    } catch (e: any) { setError(e.response?.data?.message || 'Erreur lors du changement de mot de passe.'); }
    finally { setSubmitting(false); }
  };

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 480, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 16, color: '#0f172a' }}>🔐 Changement de mot de passe</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {!result ? (
            <>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Recherchez le compte AD concerné : le ticket <strong>#{ticketId}</strong> sera automatiquement résolu une fois le mot de passe changé.
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Rechercher un compte AD (nom, login, email…)"
                  onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
                  style={{ flex: 1, boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                <button onClick={() => runSearch()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>OK</button>
              </div>

              {searching && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Recherche…</div>}

              {!searching && searchResults.length > 0 && (
                <div style={{ marginBottom: 14, maxHeight: 200, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Résultats ({searchResults.length})</div>
                  {searchResults.map(u => (
                    <div key={u.sam} onClick={() => { setSelected(u); setError(''); }}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, border: `1px solid ${selected?.sam === u.sam ? '#fbbf24' : '#e2e8f0'}`, background: selected?.sam === u.sam ? '#fffbeb' : '#fff' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{u.displayName || u.sam}</div>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{u.sam}{u.mail ? ` · ${u.mail}` : " · Pas d'email AD"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selected && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{selected.displayName || selected.sam}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selected.sam}{selected.mail ? ` · ${selected.mail}` : ''}</div>
                  <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Mot de passe provisoire qui sera appliqué</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginTop: 2, fontFamily: 'monospace' }}>{pwdConfigured || '⚠️ non configuré'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                      Le compte sera marqué « changement de mot de passe à l'ouverture de session suivante ». Communiquez ce mot de passe de vive voix à l'agent.
                    </div>
                  </div>
                </div>
              )}

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                {selected && (
                  <button disabled={submitting || !pwdConfigured} onClick={submit}
                    style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: (submitting || !pwdConfigured) ? '#e2e8f0' : '#0f172a', color: (submitting || !pwdConfigured) ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: 14, cursor: (submitting || !pwdConfigured) ? 'default' : 'pointer' }}>
                    {submitting ? '⏳ Traitement…' : `🔐 Changer le mot de passe et résoudre le ticket`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', color: '#166534', fontSize: 13 }}>
                ✅ Mot de passe réinitialisé pour <strong>{selected?.displayName || selected?.sam}</strong> · Ticket <strong>#{result.ticket_id}</strong> résolu.
              </div>
              <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>{result.force_pwd_change ? '✅' : '⚠️'} Changement de mot de passe à l'ouverture de session {result.force_pwd_change ? 'activé' : `— échec : ${result.force_pwd_error || ''}`}</div>
                <div>{result.o365_changed ? '✅ Synchronisation O365 effectuée' : `ℹ️ O365 : ${result.o365_error || 'non synchronisé'}`}</div>
                <div>{result.mail_sent ? '✅ Mail de rappel envoyé au demandeur' : `ℹ️ Mail non envoyé${result.mail_error ? ` : ${result.mail_error}` : ''}`}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
