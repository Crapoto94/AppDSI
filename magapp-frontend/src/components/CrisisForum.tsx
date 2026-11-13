import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { X, MessageSquare, Send, CheckCircle2, EyeOff, Eye, RefreshCw, Lock } from 'lucide-react';

interface Post { id: number; author: string; username: string; is_staff: boolean; body: string; created_at: string; hidden: boolean; }
interface Thread extends Post { resolved: boolean; replies: Post[]; }
interface ForumData { enabled: boolean; locked?: boolean; title?: string; me?: string; is_admin?: boolean; threads?: Thread[]; }

const fmt = (d: string) => {
  const dt = new Date(d.includes('Z') || d.includes('+') ? d : d + 'Z');
  return dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const initials = (name: string) => name.split(/[\s.\-_]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';

/** Forum de crise : fil de questions / réponses associé au bandeau d'actualité, en panneau latéral. */
export default function CrisisForum({ displayName, onClose }: { displayName: string; onClose: () => void }) {
  const [data, setData] = useState<ForumData | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/magapp/forum', { headers: headers() });
      setData(r.data);
      setError('');
    } catch (e: any) {
      setError(e.response?.status === 401 || e.response?.status === 403 ? 'Connectez-vous pour accéder au forum.' : 'Impossible de charger le forum.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const send = async (body: string, parentId?: number) => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await axios.post('/api/magapp/forum/posts', { body, parent_id: parentId, author_name: displayName }, { headers: headers() });
      if (parentId) { setReply(''); setReplyTo(null); } else { setQuestion(''); topRef.current?.scrollIntoView({ behavior: 'smooth' }); }
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Envoi impossible');
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string) => {
    try { await axios.post(`/api/magapp/forum/posts/${path}`, {}, { headers: headers() }); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Action impossible'); }
  };

  const PostView = ({ p, isReply }: { p: Post; isReply?: boolean }) => (
    <div style={{ display: 'flex', gap: 10, opacity: p.hidden ? 0.45 : 1 }}>
      <div style={{ width: isReply ? 28 : 34, height: isReply ? 28 : 34, borderRadius: '50%', flexShrink: 0, background: p.is_staff ? '#0078a4' : '#e2e8f0', color: p.is_staff ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isReply ? 11 : 13, fontWeight: 800 }}>
        {initials(p.author)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
          <strong style={{ fontSize: 13 }}>{p.author}</strong>
          {p.is_staff && <span style={{ background: '#0078a4', color: '#fff', borderRadius: 8, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>DSI</span>}
          <span style={{ color: '#94a3b8' }}>{fmt(p.created_at)}</span>
          {p.hidden && <span style={{ color: '#dc2626', fontWeight: 700 }}>masqué</span>}
          {data?.is_admin && (
            <button onClick={() => act(`${p.id}/hide`)} title={p.hidden ? 'Ré-afficher' : 'Masquer ce message'} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
              {p.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          )}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{p.body}</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100vw)', height: '100%', background: '#fff', color: '#1e293b', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <MessageSquare size={22} color="#0078a4" style={{ marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Forum de crise</div>
            {data?.title && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{data.title}</div>}
          </div>
          <button onClick={load} title="Actualiser" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><RefreshCw size={18} /></button>
          <button onClick={onClose} title="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={22} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
          <div ref={topRef} />
          {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {data && !data.enabled && <div style={{ color: '#64748b', textAlign: 'center', padding: 30 }}>Aucun forum n'est ouvert actuellement.</div>}
          {data?.enabled && data.threads?.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 30, fontSize: 14 }}>Aucune question pour le moment. Soyez le premier à écrire !</div>
          )}
          {data?.threads?.map(t => (
            <div key={t.id} style={{ background: '#fff', border: `1px solid ${t.resolved ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <PostView p={t} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 0 44px', fontSize: 12 }}>
                {t.resolved && <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Résolu</span>}
                {!data.locked && <button onClick={() => setReplyTo(replyTo === t.id ? null : t.id)} style={{ background: 'none', border: 'none', color: '#0078a4', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Répondre</button>}
                {(t.username === data.me || data.is_admin) && (
                  <button onClick={() => act(`${t.id}/resolve`)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>
                    {t.resolved ? 'Rouvrir' : 'Marquer comme résolu'}
                  </button>
                )}
              </div>
              {t.replies.length > 0 && (
                <div style={{ marginTop: 10, marginLeft: 20, paddingLeft: 12, borderLeft: '2px solid #e2e8f0', display: 'grid', gap: 12 }}>
                  {t.replies.map(r => <PostView key={r.id} p={r} isReply />)}
                </div>
              )}
              {replyTo === t.id && (
                <div style={{ marginTop: 10, marginLeft: 44, display: 'flex', gap: 8 }}>
                  <textarea autoFocus value={reply} maxLength={2000} onChange={e => setReply(e.target.value)} placeholder="Votre réponse…"
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(reply, t.id); }}
                    style={{ flex: 1, minHeight: 56, padding: 8, borderRadius: 10, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }} />
                  <button onClick={() => send(reply, t.id)} disabled={busy || !reply.trim()} style={{ alignSelf: 'flex-end', background: '#0078a4', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', opacity: busy || !reply.trim() ? 0.5 : 1 }}><Send size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {data?.enabled && (
          <div style={{ padding: 14, borderTop: '1px solid #e2e8f0', background: '#fff' }}>
            {data.locked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}><Lock size={16} /> Le forum est en lecture seule.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} placeholder="Posez votre question à la DSI et à vos collègues…"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(question); }}
                  style={{ flex: 1, minHeight: 60, padding: 10, borderRadius: 12, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 14, resize: 'none' }} />
                <button onClick={() => send(question)} disabled={busy || !question.trim()} style={{ alignSelf: 'flex-end', background: '#0078a4', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, opacity: busy || !question.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={16} /> Publier
                </button>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Ctrl + Entrée pour envoyer. Restez courtois : les messages sont visibles de tous les agents.</div>
          </div>
        )}
      </div>
    </div>
  );
}
