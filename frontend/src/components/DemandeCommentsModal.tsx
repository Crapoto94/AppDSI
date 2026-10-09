import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { CornerDownRight, Edit2, Send, Trash2, X } from 'lucide-react';

interface Commentaire {
  id: number;
  demande_id: number;
  parent_id: number | null;
  author_username: string;
  author_name: string;
  content: string;
  mentions: string[] | null;
  is_system: boolean;
  created_at: string;
  edited_at: string | null;
}

interface Props {
  demandeId: number;
  designation: string;
  canManage: boolean; // gestionnaire : peut supprimer n'importe quel commentaire
  onClose: () => void;
  onChanged?: () => void; // pour rafraîchir le compteur de la liste
}

const box: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', minHeight: 64, fontFamily: 'inherit' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.9rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0 };

const initials = (n: string) => (n || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Met en évidence les @mentions (noms retrouvés par le serveur + saisies directes « @identifiant »)
function renderContent(c: Commentaire): React.ReactNode {
  const names = (c.mentions || []).filter(Boolean).sort((a, b) => b.length - a.length).map(escRe);
  const re = new RegExp(`(@(?:${[...names, '[A-Za-z0-9._-]+'].join('|')}))`, 'g');
  return c.content.split(re).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '0 3px', fontWeight: 600 }}>{part}</span>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

const DemandeCommentsModal: React.FC<Props> = ({ demandeId, designation, canManage, onClose, onChanged }) => {
  const { token, user } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [items, setItems] = useState<Commentaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Commentaire | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState<Commentaire | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const r = await axios.get<Commentaire[]>(`/api/demandes-commande/${demandeId}/commentaires`, { headers });
      setItems(r.data);
    } catch (e) {
      setError('Impossible de charger les commentaires');
    } finally {
      setLoading(false);
    }
  }, [demandeId, headers]);

  useEffect(() => { load(); }, [load]);

  const send = async (content: string, parentId: number | null) => {
    if (!content.trim()) return;
    setSending(true);
    setError('');
    try {
      await axios.post(`/api/demandes-commande/${demandeId}/commentaires`, { content, parent_id: parentId }, { headers });
      if (parentId) { setReplyTo(null); setReplyText(''); } else setText('');
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editText.trim()) return;
    try {
      await axios.put(`/api/demandes-commande/${demandeId}/commentaires/${editing.id}`, { content: editText }, { headers });
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la modification');
    }
  };

  const remove = async (c: Commentaire) => {
    const hasReplies = items.some(i => i.parent_id === c.id);
    if (!window.confirm(hasReplies ? 'Supprimer ce commentaire et ses réponses ?' : 'Supprimer ce commentaire ?')) return;
    try {
      await axios.delete(`/api/demandes-commande/${demandeId}/commentaires/${c.id}`, { headers });
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const roots = items.filter(i => !i.parent_id);
  const repliesOf = (id: number) => items.filter(i => i.parent_id === id);
  const fmt = (d: string) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const renderOne = (c: Commentaire, isReply: boolean) => {
    const mine = c.author_username === user?.username;
    if (c.is_system) {
      return (
        <div key={c.id} style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', padding: '4px 0 4px 8px', borderLeft: '3px solid #e2e8f0' }}>
          ✏️ {c.author_name || c.author_username} — {c.content} <span style={{ color: '#94a3b8' }}>({fmt(c.created_at)})</span>
        </div>
      );
    }
    return (
      <div key={c.id} style={{ display: 'flex', gap: 10, marginLeft: isReply ? 38 : 0, marginTop: isReply ? 8 : 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: mine ? '#2563eb' : '#64748b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {initials(c.author_name || c.author_username)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '0.85rem' }}>{c.author_name || c.author_username}</b>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmt(c.created_at)}{c.edited_at ? ' · modifié' : ''}</span>
          </div>
          {editing?.id === c.id ? (
            <div data-mentions style={{ marginTop: 4 }}>
              <textarea style={box} autoFocus value={editText} onChange={e => setEditText(e.target.value)} />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button style={btn} onClick={saveEdit}>Enregistrer</button>
                <button style={{ ...btn, background: '#64748b' }} onClick={() => setEditing(null)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{renderContent(c)}</div>
          )}
          {editing?.id !== c.id && (
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button style={linkBtn} onClick={() => { setReplyTo(c); setReplyText(`@${c.author_name || c.author_username} `); }}><CornerDownRight size={12} /> Répondre</button>
              {(mine || isAdmin) && <button style={linkBtn} onClick={() => { setEditing(c); setEditText(c.content); }}><Edit2 size={12} /> Modifier</button>}
              {(mine || canManage) && <button style={{ ...linkBtn, color: '#dc2626' }} onClick={() => remove(c)}><Trash2 size={12} /> Supprimer</button>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(680px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Commentaires</h3>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{designation}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          {loading ? <div style={{ color: '#64748b' }}>Chargement…</div> : roots.length === 0 && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '1.5rem 0' }}>Aucun commentaire. Lancez la discussion — tapez @ pour mentionner quelqu'un.</div>
          )}
          {roots.map(c => (
            <div key={c.id}>
              {renderOne(c, false)}
              {repliesOf(c.id).map(r => renderOne(r, true))}
              {replyTo && (replyTo.id === c.id || replyTo.parent_id === c.id) && (
                <div data-mentions style={{ marginLeft: 38, marginTop: 8 }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 3 }}>Réponse à {replyTo.author_name || replyTo.author_username}</div>
                  <textarea style={box} autoFocus value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(replyText, replyTo.id); } }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button style={btn} disabled={sending} onClick={() => send(replyText, replyTo.id)}><Send size={13} /> Répondre</button>
                    <button style={{ ...btn, background: '#64748b' }} onClick={() => { setReplyTo(null); setReplyText(''); }}>Annuler</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div data-mentions style={{ padding: '0.75rem 1.25rem 1rem', borderTop: '1px solid #e2e8f0' }}>
          {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: 4 }}>{error}</div>}
          <textarea style={box} placeholder="Écrire un commentaire… (@ pour mentionner, Ctrl+Entrée pour envoyer)" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(text, null); } }} />
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button style={btn} disabled={sending || !text.trim()} onClick={() => send(text, null)}><Send size={13} /> Commenter</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemandeCommentsModal;
