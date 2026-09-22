import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, Search, Plus, Trash2, Loader2, UserPlus } from 'lucide-react';

interface BetaUser { id: number; username?: string; email?: string; display_name?: string; added_by?: string; created_at?: string }
interface ADUser { username: string; displayName: string; email: string }

interface Props { token: string | null }

/**
 * Gestion des agents BETA : ces agents accèdent en avance aux fonctionnalités
 * non encore activées pour tout le monde (mêmes droits que les admins en termes
 * de visibilité « beta »).
 */
export default function BetaUsersAdmin({ token }: Props) {
  const [users, setUsers] = useState<BetaUser[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = { Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/magapp/beta-users', { headers: auth });
      setUsers(r.ok ? await r.json() : []);
    } catch { setUsers([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch('/api/magapp/ad/search', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim() }),
        });
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  };

  const add = async (u: ADUser) => {
    setMessage(null);
    try {
      const r = await fetch('/api/admin/magapp/beta-users', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.username, email: u.email, displayName: u.displayName }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Erreur');
      setQuery(''); setResults([]); setMessage(`${u.displayName} ajouté à la BETA`); load();
    } catch (e: any) { setMessage(e.message); }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Retirer cet agent de la BETA ?')) return;
    try {
      await fetch(`/api/admin/magapp/beta-users/${id}`, { method: 'DELETE', headers: auth });
      load();
    } catch (e: any) { setMessage(e.message); }
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FlaskConical size={18} color="#7c3aed" />
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Agents BETA</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>{users.length} agent(s)</span>
      </div>
      <p style={{ margin: '4px 0 12px', fontSize: '0.85rem', color: '#64748b' }}>
        Ces agents accèdent <strong>en avance</strong> aux fonctionnalités non encore activées pour tout le monde (outils PDF, parapheur, transcript…), avec le badge BETA.
      </p>

      <div style={{ position: 'relative', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px' }}>
          <Search size={16} color="#94a3b8" />
          <input value={query} onChange={(e) => search(e.target.value)} placeholder="Rechercher un agent (AD) par nom ou login…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.9rem' }} />
          {searching && <Loader2 size={15} className="spin" color="#94a3b8" />}
        </div>
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #c7d2fe', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
            {results.map((u) => (
              <div key={u.username} onClick={() => add(u)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f3ff')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                <UserPlus size={14} color="#7c3aed" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.displayName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email || u.username}</div>
                </div>
                <Plus size={15} style={{ marginLeft: 'auto', color: '#7c3aed' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {message && <div style={{ fontSize: '0.82rem', color: '#16a34a', marginBottom: 10 }}>{message}</div>}

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 8 }}>Chargement…</div>
      ) : users.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 8 }}>Aucun agent BETA pour l'instant.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <FlaskConical size={15} color="#7c3aed" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.display_name || u.email || u.username}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email || u.username}{u.added_by ? ` · ajouté par ${u.added_by}` : ''}</div>
              </div>
              <button onClick={() => remove(u.id)} title="Retirer" style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
