import { useEffect, useRef, useState } from 'react';
import { KeyRound, Search, Plus, Trash2, Loader2, UserPlus, ChevronDown, ChevronRight, Globe } from 'lucide-react';

interface FeatureUser { id: number; feature: string; username?: string; email?: string; display_name?: string; added_by?: string }
interface ADUser { username: string; displayName: string; email: string }

// Fonctionnalités du MagApp : clé = colonne magapp.settings.show_<clé>
const FEATURES: { key: string; label: string }[] = [
  { key: 'tickets', label: 'Mes tickets' },
  { key: 'subscriptions', label: 'Mes abonnements' },
  { key: 'health_check', label: 'État des services' },
  { key: 'create_buttons', label: 'Boutons de création' },
  { key: 'ideas', label: 'Boîte à idées' },
  { key: 'rencontres', label: 'Rencontres annuelles' },
  { key: 'library', label: 'Bibliothèque' },
  { key: 'consommables', label: 'Consommables' },
  { key: 'chat_live', label: 'Chat en direct' },
  { key: 'transcript_manager', label: 'Transcript manager' },
  { key: 'parapheur', label: 'Parapheur' },
  { key: 'pdf_tools', label: 'Outils PDF' },
  { key: 'tool_incident', label: 'Déclarer un incident' },
  { key: 'tool_demande', label: 'Faire une demande' },
  { key: 'tasks', label: 'Mes tâches' },
  { key: 'notes', label: 'Mes notes IA' },
  { key: 'reunions', label: 'Mes réunions' },
  { key: 'agent_search', label: "Recherche d'agent" },
];

interface Props { token: string | null; settings: Record<string, boolean> }

/**
 * Accès par fonctionnalité : quand une fonctionnalité n'est PAS publiée pour tous (case décochée), on peut la réserver
 * à quelques agents nommés (badge BETA chez eux). Case cochée = disponible pour tous, la liste est sans effet.
 */
export default function FeatureUsersAdmin({ token, settings }: Props) {
  const [users, setUsers] = useState<FeatureUser[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = { Authorization: `Bearer ${token}` };

  const load = async () => {
    try {
      const r = await fetch('/api/admin/magapp/feature-users', { headers: auth });
      setUsers(r.ok ? await r.json() : []);
    } catch { setUsers([]); }
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
          method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }),
        });
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  };

  const add = async (feature: string, u: ADUser) => {
    setMessage(null);
    try {
      const r = await fetch('/api/admin/magapp/feature-users', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, username: u.username, email: u.email, displayName: u.displayName }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Erreur');
      setQuery(''); setResults([]); setMessage(`${u.displayName} ajouté·e`); load();
    } catch (e: any) { setMessage(e.message); }
  };

  const remove = async (id: number) => {
    try { await fetch(`/api/admin/magapp/feature-users/${id}`, { method: 'DELETE', headers: auth }); load(); }
    catch (e: any) { setMessage(e.message); }
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <KeyRound size={18} color="#b45309" />
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Accès par fonctionnalité</span>
      </div>
      <p style={{ margin: '4px 0 12px', fontSize: '0.85rem', color: '#64748b' }}>
        Case <strong>cochée</strong> ci-dessus : la fonctionnalité est disponible pour tous. Case <strong>décochée</strong> : réservée aux agents BETA,
        plus aux agents que vous nommez ici pour cette seule fonctionnalité (badge BETA chez eux).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FEATURES.map((f) => {
          const published = !!settings[`show_${f.key}`];
          const list = users.filter((u) => u.feature === f.key);
          const isOpen = open === f.key;
          return (
            <div key={f.key} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => { setOpen(isOpen ? null : f.key); setQuery(''); setResults([]); setMessage(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', background: isOpen ? '#fffbeb' : '#fff' }}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: published ? '#15803d' : '#b45309', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {published ? <><Globe size={13} /> Disponible pour tous</> : `BETA : ${list.length} agent${list.length > 1 ? 's' : ''} nommé${list.length > 1 ? 's' : ''}`}
                </span>
              </div>
              {isOpen && (
                <div style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9' }}>
                  {published && <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>Disponible pour tous : cette liste n'a d'effet que si la case est décochée.</div>}
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
                      <Search size={15} color="#94a3b8" />
                      <input value={query} onChange={(e) => search(e.target.value)} placeholder="Ajouter un agent (AD) par nom ou login…"
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.88rem' }} />
                      {searching && <Loader2 size={14} className="spin" color="#94a3b8" />}
                    </div>
                    {results.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #fde68a', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                        {results.map((u) => (
                          <div key={u.username} onClick={() => add(f.key, u)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#fffbeb')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                            <UserPlus size={14} color="#b45309" />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{u.displayName}</div>
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{u.email || u.username}</div>
                            </div>
                            <Plus size={14} style={{ marginLeft: 'auto', color: '#b45309' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {message && <div style={{ fontSize: '0.8rem', color: '#16a34a', marginBottom: 8 }}>{message}</div>}
                  {list.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.83rem' }}>Aucun agent nommé pour cette fonctionnalité.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {list.map((u) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1e293b' }}>{u.display_name || u.email || u.username}</div>
                            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{u.email || u.username}</div>
                          </div>
                          <button onClick={() => remove(u.id)} title="Retirer" style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
