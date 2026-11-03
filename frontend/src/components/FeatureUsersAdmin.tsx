import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Plus, Trash2, Loader2, UserPlus, ChevronDown, ChevronRight, Users } from 'lucide-react';

interface FeatureUser { id: number; feature: string; username?: string; email?: string; display_name?: string; added_by?: string }
interface ADUser { username: string; displayName: string; email: string }

interface Ctx { users: FeatureUser[]; reload: () => void; token: string | null }
const FeatureUsersContext = createContext<Ctx>({ users: [], reload: () => {}, token: null });

/** Charge une seule fois la liste des agents nommés par fonctionnalité pour toutes les tuiles de paramètres. */
export function FeatureUsersProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [users, setUsers] = useState<FeatureUser[]>([]);
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/magapp/feature-users', { headers: { Authorization: `Bearer ${token}` } });
      setUsers(r.ok ? await r.json() : []);
    } catch { setUsers([]); }
  }, [token]);
  useEffect(() => { reload(); }, [reload]);
  return <FeatureUsersContext.Provider value={{ users, reload, token }}>{children}</FeatureUsersContext.Provider>;
}

/**
 * À placer dans la tuile d'une fonctionnalité du MagApp : quand la case est décochée (non publiée pour tous), permet de
 * nommer quelques agents qui auront cette seule fonctionnalité (badge BETA chez eux). Case cochée : rien à afficher.
 */
export function FeatureAgents({ feature, published }: { feature: string; published: boolean }) {
  const { users, reload, token } = useContext(FeatureUsersContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = { Authorization: `Bearer ${token}` };
  const list = users.filter((u) => u.feature === feature);

  if (published) return null;

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch('/api/magapp/ad/search', {
          method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }),
        });
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  };

  const add = async (u: ADUser) => {
    setMessage(null);
    try {
      const r = await fetch('/api/admin/magapp/feature-users', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, username: u.username, email: u.email, displayName: u.displayName }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Erreur');
      setQuery(''); setResults([]); setMessage(`${u.displayName} ajouté·e`); reload();
    } catch (e: any) { setMessage(e.message); }
  };

  const remove = async (id: number) => {
    try { await fetch(`/api/admin/magapp/feature-users/${id}`, { method: 'DELETE', headers: auth }); reload(); }
    catch (e: any) { setMessage(e.message); }
  };

  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.82rem', color: '#b45309', fontWeight: 600 }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Users size={14} /> Agents ayant accès en BETA ({list.length})
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 12px' }}>
              <Search size={14} color="#94a3b8" />
              <input value={query} onChange={(e) => search(e.target.value)} placeholder="Ajouter un agent (AD) par nom ou login…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem' }} />
              {searching && <Loader2 size={14} className="spin" color="#94a3b8" />}
            </div>
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #fde68a', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                {results.map((u) => (
                  <div key={u.username} onClick={() => add(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fffbeb')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                    <UserPlus size={14} color="#b45309" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.displayName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{u.email || u.username}</div>
                    </div>
                    <Plus size={14} style={{ marginLeft: 'auto', color: '#b45309' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {message && <div style={{ fontSize: '0.8rem', color: '#16a34a', marginBottom: 6 }}>{message}</div>}
          {list.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Aucun agent nommé : seuls les agents BETA y ont accès.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>{u.display_name || u.email || u.username}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{u.email || u.username}</div>
                  </div>
                  <button onClick={() => remove(u.id)} title="Retirer" style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
