import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Mail, Search, Plus, Trash2, Loader2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';

interface Recipient { id: number; username?: string; email: string; display_name?: string }
interface Agent { username?: string; displayName: string; email?: string; service?: string; direction?: string }

/** Agents qui reçoivent un e-mail à chaque nouvelle demande du backlog (DSI Hub) et à chaque nouvelle idée MagApp. */
export default function BacklogRecipients() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Recipient[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Agent[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try { const r = await axios.get<Recipient[]>('/api/admin/backlog-recipients', { headers }); setList(r.data); } catch { setList([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { const r = await axios.get<Agent[]>('/api/agents/search', { headers, params: { q: q.trim() } }); setResults(Array.isArray(r.data) ? r.data : []); }
      catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  };

  const add = async (a: Agent) => {
    setMessage(null);
    try {
      await axios.post('/api/admin/backlog-recipients', { username: a.username, email: a.email, displayName: a.displayName }, { headers });
      setQuery(''); setResults([]); setMessage({ ok: true, text: `${a.displayName} recevra les nouvelles demandes.` }); load();
    } catch (e: any) { setMessage({ ok: false, text: e.response?.data?.message || 'Erreur' }); }
  };
  const remove = async (id: number) => {
    try { await axios.delete(`/api/admin/backlog-recipients/${id}`, { headers }); load(); } catch { /* ignore */ }
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, margin: '14px 0', background: '#fff' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155' }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Mail size={15} color="#a16207" />
        Destinataires des e-mails de nouvelle demande
        <span style={{ marginLeft: 6, background: list.length ? '#fef3c7' : '#f1f5f9', color: list.length ? '#92400e' : '#64748b', borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>
          {list.length ? `${list.length} agent${list.length > 1 ? 's' : ''}` : 'aucun'}
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>
            Ces agents reçoivent un e-mail à chaque <b>nouvelle demande DSI Hub</b> (backlog) et à chaque <b>nouvelle idée MagApp</b>. Aucun destinataire : aucun e-mail n'est envoyé.
          </p>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
              <Search size={15} color="#94a3b8" />
              <input value={query} onChange={e => search(e.target.value)} placeholder="Ajouter un agent par nom ou login…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13 }} />
              {searching && <Loader2 size={14} className="spin" color="#94a3b8" />}
            </div>
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #fde68a', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,.12)', marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
                {results.map((a, i) => (
                  <div key={`${a.username || a.email || a.displayName}-${i}`} onClick={() => add(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', opacity: a.email ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fffbeb')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <UserPlus size={14} color="#a16207" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{a.displayName}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{a.email || 'pas d\'e-mail connu'}{a.service ? ` · ${a.service}` : ''}</div>
                    </div>
                    <Plus size={14} style={{ marginLeft: 'auto', color: '#a16207' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {message && <div style={{ fontSize: 12.5, marginBottom: 8, color: message.ok ? '#16a34a' : '#dc2626' }}>{message.text}</div>}
          {list.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Aucun destinataire pour l'instant.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {list.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <Mail size={14} color="#94a3b8" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.display_name || r.email}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{r.email}</div>
                  </div>
                  <button onClick={() => remove(r.id)} title="Retirer" style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
