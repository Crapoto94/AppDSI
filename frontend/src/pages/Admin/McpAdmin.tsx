import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plug, RefreshCw, Users, LogIn, History, ShieldCheck, ShieldOff, Shield, X, Search, Ban } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'all' | 'restricted' | 'blocked';
type Tab = 'agents' | 'connexions' | 'consultations';

interface Droits { mode: Mode; schemas: string[]; write_actions?: string[]; note: string | null; source: 'agent' | 'defaut' | 'historique'; updated_by?: string; updated_at?: string }
interface Agent {
  username: string; display_name: string | null; nb_requetes: number; nb_refus: number; nb_connexions: number;
  derniere_activite: string | null; sessions_actives: number; droits: Droits;
}
interface Overview { sessions_actives: number; requetes_24h: number; refus_24h: number; echecs_connexion_24h: number; agents_30j: number; enabled: boolean }
interface SchemaItem { schema: string; label: string }
interface UserItem { username: string; displayName: string | null }
interface Session { jti: string; username: string; display_name: string | null; ip: string | null; client: string | null; created_at: string; expires_at: string; last_used_at: string | null; revoked_at: string | null; revoked_reason: string | null; active: boolean }
interface AuditRow { id: number; created_at: string; username: string | null; api_key_name: string | null; ip: string | null; action: string; sql_text?: string | null; client?: string | null; row_count?: number | null; duration_ms?: number | null; error: string | null; trace_id: string | null }
interface Page { total: number; limit: number; offset: number; rows: AuditRow[] }

const WRITE_LABEL: Record<string, string> = { tickets: 'tickets', tasks: 'tâches', reunions: 'réunions' };
const MODE_LABEL: Record<Mode, string> = { all: 'Tous les modules', restricted: 'Modules choisis', blocked: 'Bloqué' };
const MODE_COLOR: Record<Mode, { bg: string; fg: string }> = {
  all: { bg: '#dcfce7', fg: '#166534' }, restricted: { bg: '#fef3c7', fg: '#92400e' }, blocked: { bg: '#fee2e2', fg: '#991b1b' },
};
const ACTION_LABEL: Record<string, string> = {
  login: 'Connexion', logout: 'Déconnexion', login_echec: 'Échec de connexion', login_bloque: 'Connexion bloquée (trop d\'essais)',
  session_refusee: 'Session refusée', query: 'Requête', query_refusee: 'Requête refusée', catalog: 'Catalogue', describe: 'Description de table',
};
const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 };
const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.84rem', background: '#fff', color: '#0f172a' };
const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : `1px solid ${danger ? '#fecaca' : '#cbd5e1'}`,
  background: primary ? '#3b82f6' : danger ? '#fef2f2' : '#fff', color: primary ? '#fff' : danger ? '#b91c1c' : '#0f172a',
});
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 10px', fontSize: '0.84rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

function Badge({ mode }: { mode: Mode }) {
  const c = MODE_COLOR[mode];
  return <span style={{ background: c.bg, color: c.fg, padding: '2px 9px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{MODE_LABEL[mode]}</span>;
}

export default function McpAdmin() {
  const { token } = useAuth();
  const H = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const [tab, setTab] = useState<Tab>('agents');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [schemas, setSchemas] = useState<SchemaItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [defaultRights, setDefaultRights] = useState<Droits | null>(null);
  const [editing, setEditing] = useState<{ username: string; label: string; droits: Droits; hasOwn: boolean } | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [conn, setConn] = useState<Page | null>(null);
  const [connFilter, setConnFilter] = useState({ username: '', action: '', from: '', to: '' });
  const [cons, setCons] = useState<Page | null>(null);
  const [consFilter, setConsFilter] = useState({ username: '', action: '', q: '', from: '', to: '', errors_only: false });
  const [consOffset, setConsOffset] = useState(0);
  const [connOffset, setConnOffset] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/admin/dataquery${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }, [H]);

  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const qs = (o: Record<string, string | boolean | number>) =>
    Object.entries(o).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v === true ? '1' : v))}`).join('&');

  const loadAgents = useCallback(async () => {
    try {
      const [o, a, r] = await Promise.all([api('/overview'), api('/agents'), api('/rights')]);
      setOverview(o); setAgents(a);
      const def = (r as Array<Droits & { username: string }>).find(x => x.username === '*');
      setDefaultRights(def ? { mode: def.mode, schemas: def.schemas || [], write_actions: def.write_actions || [], note: def.note, source: 'defaut' } : null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }, [api]);

  const loadConnexions = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api('/sessions'), api(`/connections?${qs({ ...connFilter, offset: connOffset })}`)]);
      setSessions(s); setConn(c);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }, [api, connFilter, connOffset]);

  const loadConsultations = useCallback(async () => {
    try { setCons(await api(`/queries?${qs({ ...consFilter, offset: consOffset })}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }, [api, consFilter, consOffset]);

  const refresh = useCallback(async () => {
    await (tab === 'agents' ? loadAgents() : tab === 'connexions' ? loadConnexions() : loadConsultations());
    setError(e => e); setLoading(false);
  }, [tab, loadAgents, loadConnexions, loadConsultations]);
  const manualRefresh = () => { setLoading(true); setError(''); refresh(); };

  // Les filtres ne relancent la requête que par le bouton « Filtrer » (pas à chaque frappe).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) refresh(); }, [token, tab, connOffset, consOffset]);
  useEffect(() => {
    if (!token) return;
    api('/schemas').then(setSchemas).catch(() => {});
    api('/users').then(setUsers).catch(() => {});
  }, [token, api]);

  const openEditor = (username: string, label: string, droits: Droits | null, hasOwn: boolean) =>
    setEditing({ username, label, hasOwn, droits: droits || { mode: 'all', schemas: [], write_actions: [], note: null, source: 'historique' } });

  const saveRights = async () => {
    if (!editing) return;
    try {
      await api(`/rights/${encodeURIComponent(editing.username)}`, { method: 'PUT', body: JSON.stringify({ mode: editing.droits.mode, schemas: editing.droits.schemas, write_actions: editing.droits.write_actions || [], note: editing.droits.note }) });
      setEditing(null); flash('Droits enregistrés'); await loadAgents();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const resetRights = async () => {
    if (!editing) return;
    try {
      await api(`/rights/${encodeURIComponent(editing.username)}`, { method: 'DELETE' });
      setEditing(null); flash('Droits réinitialisés (droits par défaut)'); await loadAgents();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const revokeUser = async (username: string) => {
    if (!confirm(`Révoquer toutes les sessions MCP de ${username} ?`)) return;
    try { const r = await api('/sessions/revoke-user', { method: 'POST', body: JSON.stringify({ username }) }); flash(`${r.revoked} session(s) révoquée(s)`); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const revokeSession = async (jti: string) => {
    try { await api(`/sessions/${jti}/revoke`, { method: 'POST' }); flash('Session révoquée'); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const showHistory = (username: string) => { setConsFilter(f => ({ ...f, username })); setConsOffset(0); setTab('consultations'); };

  const toggleSchema = (s: string) => editing && setEditing({
    ...editing, droits: { ...editing.droits, schemas: editing.droits.schemas.includes(s) ? editing.droits.schemas.filter(x => x !== s) : [...editing.droits.schemas, s] },
  });

  const knownUsernames = new Set(agents.map(a => a.username));
  const pager = (p: Page | null, setOff: (n: number) => void) => p && (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, fontSize: '0.82rem', color: '#475569' }}>
      <span>{p.total === 0 ? 0 : p.offset + 1}–{Math.min(p.offset + p.limit, p.total)} sur {p.total}</span>
      <button style={btn()} disabled={p.offset === 0} onClick={() => setOff(Math.max(p.offset - p.limit, 0))}>Précédent</button>
      <button style={btn()} disabled={p.offset + p.limit >= p.total} onClick={() => setOff(p.offset + p.limit)}>Suivant</button>
    </div>
  );

  const tile = (label: string, value: number | string, color = '#0f172a') => (
    <div style={{ ...card, padding: '12px 16px', flex: '1 1 150px' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#fff', padding: '22px 26px', borderRadius: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,.2)', color: '#93c5fd' }}><Plug size={26} /></div>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800 }}>Serveur MCP</h1>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#cbd5e1' }}>
            Historique des connexions et des consultations, droits d'interrogation par agent.
            {overview && !overview.enabled && <strong style={{ color: '#fca5a5' }}> Module désactivé (DATAQUERY_ENABLED).</strong>}
          </p>
        </div>
        <button style={{ ...btn(), marginLeft: 'auto', background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }} onClick={manualRefresh}>
          <RefreshCw size={15} className={loading ? 'api-spin' : ''} /> Actualiser
        </button>
      </div>

      {overview && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {tile('Sessions actives', overview.sessions_actives)}
          {tile('Requêtes (24 h)', overview.requetes_24h)}
          {tile('Requêtes refusées (24 h)', overview.refus_24h, overview.refus_24h ? '#b45309' : '#0f172a')}
          {tile('Échecs de connexion (24 h)', overview.echecs_connexion_24h, overview.echecs_connexion_24h ? '#b91c1c' : '#0f172a')}
          {tile('Agents actifs (30 j)', overview.agents_30j)}
        </div>
      )}

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '11px 16px', borderRadius: 10, fontSize: '0.86rem' }}>{error}</div>}
      {message && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '11px 16px', borderRadius: 10, fontSize: '0.86rem', fontWeight: 600 }}>{message}</div>}

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0' }}>
        {([['agents', 'Agents et droits', Users], ['connexions', 'Connexions', LogIn], ['consultations', 'Consultations', History]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.86rem',
            color: tab === k ? '#2563eb' : '#64748b', borderBottom: `2px solid ${tab === k ? '#2563eb' : 'transparent'}`, marginBottom: -1,
          }}><Icon size={16} />{l}</button>
        ))}
      </div>

      {tab === 'agents' && (
        <>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Shield size={20} color="#64748b" />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Droits par défaut</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Appliqués aux agents sans droits propres, y compris ceux qui ne se sont pas encore connectés.</div>
            </div>
            <Badge mode={defaultRights?.mode || 'all'} />
            {defaultRights?.mode === 'restricted' && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{defaultRights.schemas.join(', ')}</span>}
            <button style={btn()} onClick={() => openEditor('*', 'Droits par défaut', defaultRights, !!defaultRights)}>Modifier</button>
          </div>

          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 10, padding: 14, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: '0.9rem' }}>Agents</strong>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b' }}>Ajouter un agent :</span>
              <input list="dq-users" placeholder="identifiant" style={{ ...input, width: 180 }} id="dq-add"
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                  if (!v) return;
                  const u = users.find(x => x.username === v);
                  openEditor(v, u?.displayName || v, null, false);
                  (e.target as HTMLInputElement).value = '';
                }} />
              <datalist id="dq-users">{users.filter(u => !knownUsernames.has(u.username)).map(u => <option key={u.username} value={u.username}>{u.displayName || ''}</option>)}</datalist>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Agent</th><th style={th}>Droits</th><th style={th}>Requêtes</th><th style={th}>Refus</th>
                <th style={th}>Connexions</th><th style={th}>Dernière activité</th><th style={th}>Sessions</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {agents.length === 0 && <tr><td style={td} colSpan={8}>Aucun agent pour le moment.</td></tr>}
                {agents.map(a => (
                  <tr key={a.username}>
                    <td style={td}><strong>{a.display_name || a.username}</strong><div style={{ fontSize: '0.75rem', color: '#64748b' }}>{a.username}</div></td>
                    <td style={td}>
                      <Badge mode={a.droits.mode} />
                      {a.droits.mode === 'restricted' && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 3, maxWidth: 220 }}>{a.droits.schemas.join(', ')}</div>}
                      {(a.droits.write_actions || []).length > 0 && <div style={{ fontSize: '0.74rem', color: '#9a3412', background: '#ffedd5', borderRadius: 999, padding: '1px 8px', marginTop: 4, display: 'inline-block', fontWeight: 700 }}>Peut créer : {(a.droits.write_actions || []).map(x => WRITE_LABEL[x] || x).join(', ')}</div>}
                      {a.droits.source !== 'agent' && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>{a.droits.source === 'defaut' ? 'par défaut' : 'historique'}</div>}
                    </td>
                    <td style={td}>{a.nb_requetes}</td>
                    <td style={{ ...td, color: a.nb_refus ? '#b45309' : undefined }}>{a.nb_refus}</td>
                    <td style={td}>{a.nb_connexions}</td>
                    <td style={td}>{fmt(a.derniere_activite)}</td>
                    <td style={td}>{a.sessions_actives}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button style={btn()} onClick={() => openEditor(a.username, a.display_name || a.username, a.droits, a.droits.source === 'agent')}>Droits</button>{' '}
                      <button style={btn()} onClick={() => showHistory(a.username)}>Historique</button>{' '}
                      {a.sessions_actives > 0 && <button style={btn(false, true)} onClick={() => revokeUser(a.username)}><Ban size={13} />Révoquer</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'connexions' && (
        <>
          <div style={card}>
            <strong style={{ fontSize: '0.9rem' }}>Sessions actives</strong>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Agent</th><th style={th}>Ouverte</th><th style={th}>Dernier usage</th><th style={th}>Expire</th><th style={th}>IP</th><th style={th}>Client</th><th style={th}></th></tr></thead>
                <tbody>
                  {sessions.length === 0 && <tr><td style={td} colSpan={7}>Aucune session active.</td></tr>}
                  {sessions.map(s => (
                    <tr key={s.jti}>
                      <td style={td}><strong>{s.display_name || s.username}</strong><div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.username}</div></td>
                      <td style={td}>{fmt(s.created_at)}</td><td style={td}>{fmt(s.last_used_at)}</td><td style={td}>{fmt(s.expires_at)}</td>
                      <td style={td}>{s.ip || '—'}</td><td style={td}>{s.client || '—'}</td>
                      <td style={td}><button style={btn(false, true)} onClick={() => revokeSession(s.jti)}><Ban size={13} />Révoquer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <strong style={{ fontSize: '0.9rem' }}>Historique des connexions</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
              <input style={input} placeholder="Agent (identifiant)" value={connFilter.username} onChange={e => setConnFilter({ ...connFilter, username: e.target.value })} />
              <select style={input} value={connFilter.action} onChange={e => setConnFilter({ ...connFilter, action: e.target.value })}>
                <option value="">Tous les événements</option>
                {['login', 'logout', 'login_echec', 'login_bloque', 'session_refusee'].map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
              </select>
              <input type="date" style={input} value={connFilter.from} onChange={e => setConnFilter({ ...connFilter, from: e.target.value })} />
              <input type="date" style={input} value={connFilter.to} onChange={e => setConnFilter({ ...connFilter, to: e.target.value })} />
              <button style={btn(true)} onClick={() => { setConnOffset(0); loadConnexions(); }}><Search size={14} />Filtrer</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Agent</th><th style={th}>Événement</th><th style={th}>IP</th><th style={th}>Détail</th></tr></thead>
                <tbody>
                  {conn?.rows.length === 0 && <tr><td style={td} colSpan={5}>Aucun événement.</td></tr>}
                  {conn?.rows.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{fmt(r.created_at)}</td><td style={td}>{r.username || '—'}</td>
                      <td style={{ ...td, color: r.action.includes('echec') || r.action.includes('bloque') || r.action.includes('refusee') ? '#b91c1c' : undefined, fontWeight: 600 }}>{ACTION_LABEL[r.action] || r.action}</td>
                      <td style={td}>{r.ip || '—'}</td><td style={{ ...td, color: '#64748b' }}>{r.error || r.client || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager(conn, setConnOffset)}
          </div>
        </>
      )}

      {tab === 'consultations' && (
        <div style={card}>
          <strong style={{ fontSize: '0.9rem' }}>Historique des consultations</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            <input list="dq-users-all" style={input} placeholder="Agent (identifiant)" value={consFilter.username} onChange={e => setConsFilter({ ...consFilter, username: e.target.value })} />
            <datalist id="dq-users-all">{agents.map(a => <option key={a.username} value={a.username}>{a.display_name || ''}</option>)}</datalist>
            <select style={input} value={consFilter.action} onChange={e => setConsFilter({ ...consFilter, action: e.target.value })}>
              <option value="">Toutes les actions</option>
              {['query', 'query_refusee', 'catalog', 'describe'].map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </select>
            <input style={{ ...input, minWidth: 180 }} placeholder="Texte dans la requête SQL" value={consFilter.q} onChange={e => setConsFilter({ ...consFilter, q: e.target.value })} />
            <input type="date" style={input} value={consFilter.from} onChange={e => setConsFilter({ ...consFilter, from: e.target.value })} />
            <input type="date" style={input} value={consFilter.to} onChange={e => setConsFilter({ ...consFilter, to: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
              <input type="checkbox" checked={consFilter.errors_only} onChange={e => setConsFilter({ ...consFilter, errors_only: e.target.checked })} />Erreurs / refus
            </label>
            <button style={btn(true)} onClick={() => { setConsOffset(0); loadConsultations(); }}><Search size={14} />Filtrer</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Agent</th><th style={th}>Action</th><th style={th}>Requête</th><th style={th}>Lignes</th><th style={th}>Durée</th></tr></thead>
              <tbody>
                {cons?.rows.length === 0 && <tr><td style={td} colSpan={6}>Aucune consultation.</td></tr>}
                {cons?.rows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                      <td style={td}>{r.username || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600, color: r.error ? '#b91c1c' : undefined }}>{ACTION_LABEL[r.action] || r.action}</td>
                      <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.78rem', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sql_text || ''}</td>
                      <td style={td}>{r.row_count ?? '—'}</td><td style={td}>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
                    </tr>
                    {open === r.id && (
                      <tr><td style={{ ...td, background: '#f8fafc' }} colSpan={6}>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.78rem', fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.sql_text || '(vide)'}</pre>
                        {r.error && <div style={{ color: '#b91c1c', marginTop: 8, fontSize: '0.8rem' }}>Erreur : {r.error}</div>}
                        <div style={{ color: '#64748b', marginTop: 8, fontSize: '0.75rem' }}>
                          Clé : {r.api_key_name || '—'} · IP : {r.ip || '—'} · trace : {r.trace_id || '—'}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {pager(cons, setConsOffset)}
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ ...card, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Droits : {editing.label}</h3>
              <button style={{ ...btn(), marginLeft: 'auto', padding: 5 }} onClick={() => setEditing(null)}><X size={16} /></button>
            </div>
            {([['all', 'Tous les modules', ShieldCheck], ['restricted', 'Seulement les modules choisis', Shield], ['blocked', 'Bloqué (aucune interrogation)', ShieldOff]] as const).map(([m, l, Icon]) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${editing.droits.mode === m ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 10, marginBottom: 8, cursor: 'pointer', background: editing.droits.mode === m ? '#eff6ff' : '#fff' }}>
                <input type="radio" checked={editing.droits.mode === m} onChange={() => setEditing({ ...editing, droits: { ...editing.droits, mode: m } })} />
                <Icon size={16} /><span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{l}</span>
              </label>
            ))}
            {editing.droits.mode === 'restricted' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, maxHeight: 260, overflowY: 'auto', marginBottom: 8 }}>
                {schemas.map(s => (
                  <label key={s.schema} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 2px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editing.droits.schemas.includes(s.schema)} onChange={() => toggleSchema(s.schema)} />
                    <span><strong>{s.schema}</strong> <span style={{ color: '#64748b' }}>{s.label}</span></span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#9a3412', marginBottom: 4 }}>Création (écriture) via le MCP</div>
              <div style={{ fontSize: '0.74rem', color: '#7c2d12', marginBottom: 6 }}>
                Permet à cet agent de faire créer par Claude des éléments à son nom (création seulement, jamais de modification ni de suppression). Aucune case = lecture seule. Exige aussi une clé API en « read_write ».
              </div>
              {(['tickets', 'tasks', 'reunions'] as const).map(w => (
                <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 2px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(editing.droits.write_actions || []).includes(w)}
                    onChange={() => setEditing({ ...editing, droits: { ...editing.droits, write_actions: (editing.droits.write_actions || []).includes(w) ? (editing.droits.write_actions || []).filter(x => x !== w) : [...(editing.droits.write_actions || []), w] } })} />
                  <span>Créer des <strong>{WRITE_LABEL[w]}</strong></span>
                </label>
              ))}
            </div>
            <textarea placeholder="Note (facultatif)" rows={2} style={{ ...input, width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
              value={editing.droits.note || ''} onChange={e => setEditing({ ...editing, droits: { ...editing.droits, note: e.target.value } })} />
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '0 0 12px' }}>
              Le contrôle se fait sur les tables réellement lues par la requête. Un agent bloqué perd ses sessions immédiatement.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {editing.hasOwn && <button style={btn()} onClick={resetRights}>Revenir au défaut</button>}
              <button style={btn()} onClick={() => setEditing(null)}>Annuler</button>
              <button style={btn(true)} onClick={saveRights}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
