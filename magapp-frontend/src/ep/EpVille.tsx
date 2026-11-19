import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  X, Loader2, Users, ShieldCheck, Plus, Trash2, Search, CalendarClock, Eye, UserPlus, AlertTriangle, CheckCircle2, UserCog, ArrowRightLeft,
} from 'lucide-react';
import type { Entretien } from './types';
import { STATUTS, PREP_STATUTS, EVAL_STATUTS, crepMeta } from './types';
import EntretienDetailModal from './EntretienDetailModal';
import PlanningModal from './PlanningModal';
import { Avatar, Badge, COLORS, EmptyState, btnGhost, btnPrimary, btnDanger, card, input } from './ui';

// Entretiens professionnels de la Ville (MagApp).
//  - Administrateurs de l'application : désignent les valideurs (directeurs, DGA, DG). Ils ne voient pas le contenu des EP.
//  - Valideurs : choisissent les agents dont ils valident l'EP (périmètre RH proposé, recherche SEDIT RH, ou saisie à la volée)
//    puis conduisent préparation / compte rendu. Un agent n'a qu'un seul valideur.

const api = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

interface RhAgent {
  matricule: string; nom: string; prenom: string; grade: string; poste: string; direction: string; direction_code: string;
  service: string; est_directeur?: boolean; est_dg_dga?: boolean; valideur?: string | null; mien?: boolean;
}
interface Valideur {
  id: number; username: string; email: string; display_name: string; matricule: string; grade: string; niveau: 'direction' | 'dga' | 'dg';
  direction_code: string; direction_libelle: string; directions: string[]; nb_agents?: number;
}
interface Me { isAdmin: boolean; isValideur: boolean; valideur: Valideur | null; campaign: { annee: number; libelle?: string } | null; sedit_configured: boolean }
interface MonAgent {
  id: number; matricule: string; nom: string; prenom: string; grade: string; email: string; direction: string; service: string; poste: string;
  saisi_a_la_volee: boolean;
  entretien: { id: number; statut: string; date_entretien: string | null; date_entretien_label: string; preparation_statut: string; evaluation_statut: string; crep_statut: string } | null;
}

const NIVEAU_LABEL: Record<string, string> = { direction: 'Directeur·trice', dga: 'DGA', dg: 'DG' };
const fullName = (a: { nom: string; prenom?: string }) => `${a.prenom || ''} ${a.nom || ''}`.trim();

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '9px 12px', borderRadius: 8, marginBottom: 12,
      background: ok ? '#dcfce7' : '#fef2f2', color: ok ? '#166534' : '#991b1b', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
      {ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div>{children}</div>
    </div>
  );
}

/** Recherche prédictive dans SEDIT RH (n'importe quel agent en poste). */
function useRhSearch(q: string) {
  const [results, setResults] = useState<RhAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setError(''); setLoading(false); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await axios.get('/api/ep-ville/rh/agents', { params: { q: query }, headers: api() });
        if (id === seq.current) { setResults(r.data.agents || []); setError(''); }
      } catch (e) {
        if (id === seq.current) { setResults([]); setError(errMsg(e, 'Recherche impossible pour le moment.')); }
      } finally { if (id === seq.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return { results, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Administrateurs : désignation des valideurs
// ─────────────────────────────────────────────────────────────────────────────
function ValideursAdmin() {
  const [items, setItems] = useState<Valideur[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const { results, loading: searching, error: searchError } = useRhSearch(adding ? q : '');
  const [candidats, setCandidats] = useState<RhAgent[]>([]);
  const [directions, setDirections] = useState<{ code: string; libelle: string }[]>([]);
  const [picked, setPicked] = useState<RhAgent | null>(null);
  const [niveau, setNiveau] = useState<'direction' | 'dga' | 'dg'>('direction');
  const [dirs, setDirs] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [needUsername, setNeedUsername] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agentsOf, setAgentsOf] = useState<{ v: Valideur; agents: any[] } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/ep-ville/valideurs', { headers: api() })
      .then(r => setItems(r.data.valideurs || []))
      .catch(e => setMsg({ ok: false, text: errMsg(e, 'Impossible de charger les valideurs.') }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openAdd = () => {
    setAdding(true); setPicked(null); setQ(''); setUsername(''); setNeedUsername(false); setNiveau('direction'); setDirs([]); setMsg(null);
    axios.get('/api/ep-ville/rh/candidats', { headers: api() }).then(r => setCandidats(r.data.agents || [])).catch(() => setCandidats([]));
    axios.get('/api/ep-ville/rh/directions', { headers: api() }).then(r => setDirections(r.data.directions || [])).catch(() => setDirections([]));
  };

  const shown = useMemo(() => {
    if (q.trim().length >= 2) return results;
    return candidats.slice(0, 40);
  }, [q, results, candidats]);

  const save = async () => {
    if (!picked) return;
    setBusy(true); setMsg(null);
    try {
      await axios.post('/api/ep-ville/valideurs', { matricule: picked.matricule, niveau, directions: niveau === 'direction' ? [] : dirs, username: username.trim() || undefined }, { headers: api() });
      setAdding(false); setMsg({ ok: true, text: `${fullName(picked)} est désigné·e valideur.` }); load();
    } catch (e: any) {
      if (e?.response?.data?.need_username) setNeedUsername(true);
      setMsg({ ok: false, text: errMsg(e, 'Désignation impossible.') });
    } finally { setBusy(false); }
  };

  const remove = async (v: Valideur) => {
    if (!window.confirm(`Retirer ${v.display_name} de la liste des valideurs ?`)) return;
    try { await axios.delete(`/api/ep-ville/valideurs/${v.id}`, { headers: api() }); setMsg({ ok: true, text: 'Valideur retiré.' }); load(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Suppression impossible.') }); }
  };

  const showAgents = async (v: Valideur) => {
    try { const r = await axios.get(`/api/ep-ville/valideurs/${v.id}/agents`, { headers: api() }); setAgentsOf({ v, agents: r.data.agents || [] }); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Chargement impossible.') }); }
  };

  const reassign = async (ratId: number, valideurId: number) => {
    try {
      await axios.put(`/api/ep-ville/rattachements/${ratId}`, { valideur_id: valideurId }, { headers: api() });
      setMsg({ ok: true, text: 'Agent réaffecté.' }); setAgentsOf(null); load();
    } catch (e) { setMsg({ ok: false, text: errMsg(e, 'Réaffectation impossible.') }); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted, maxWidth: 640 }}>
          Les valideurs sont les directeurs, DGA et DG de la collectivité. Chacun choisit ensuite les agents dont il valide l’entretien.
          En tant qu’administrateur, vous ne voyez que l’effectif de chaque valideur, jamais le contenu des entretiens.
        </div>
        {!adding && <button style={btnPrimary} onClick={openAdd}><Plus size={14} /> Désigner un valideur</button>}
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}

      {adding && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Désigner un valideur</div>
          {!picked ? (
            <>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                <input style={{ ...input, paddingLeft: 30 }} autoFocus placeholder="Rechercher un agent (nom, prénom, matricule) — sinon, directeurs et DGA proposés ci-dessous"
                  value={q} onChange={e => setQ(e.target.value)} />
              </div>
              {searching && <div style={{ fontSize: 12, color: '#94a3b8' }}><Loader2 size={12} style={{ verticalAlign: -2 }} /> Recherche…</div>}
              {searchError && <Notice ok={false}>{searchError}</Notice>}
              <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                {shown.map(a => (
                  <button key={a.matricule} onClick={() => { setPicked(a); setNiveau(a.est_dg_dga ? 'dga' : 'direction'); }}
                    style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer' }}>
                    <Avatar name={fullName(a)} size={30} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{a.nom} {a.prenom} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>· {a.matricule}</span></div>
                      <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.poste, a.direction].filter(Boolean).join(' · ')}</div>
                    </div>
                  </button>
                ))}
                {!shown.length && !searching && <div style={{ padding: 16, fontSize: 12.5, color: '#94a3b8', textAlign: 'center' }}>Aucun agent.</div>}
              </div>
              <div style={{ marginTop: 10 }}><button style={btnGhost} onClick={() => setAdding(false)}>Annuler</button></div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <Avatar name={fullName(picked)} size={36} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{fullName(picked)}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>{[picked.grade, picked.poste, picked.direction].filter(Boolean).join(' · ')}</div>
                </div>
                <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={() => { setPicked(null); setNeedUsername(false); }}>Changer</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['direction', 'dga', 'dg'] as const).map(n => (
                  <label key={n} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${niveau === n ? COLORS.primary : COLORS.border}`, background: niveau === n ? '#eef2ff' : '#fff' }}>
                    <input type="radio" checked={niveau === n} onChange={() => setNiveau(n)} /> {NIVEAU_LABEL[n]}
                  </label>
                ))}
              </div>
              {niveau !== 'direction' ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Directions placées sous sa responsabilité (agents proposés en priorité)</div>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
                    {directions.map(d => (
                      <label key={d.code} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={dirs.includes(d.code)} onChange={e => setDirs(p => e.target.checked ? [...p, d.code] : p.filter(c => c !== d.code))} /> {d.libelle}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Les directeurs de la collectivité lui sont toujours proposés. Il peut de toute façon choisir n’importe quel agent.</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Périmètre proposé : sa direction ({picked.direction || 'non renseignée'}).</div>
              )}
              {needUsername && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Identifiant de connexion (compte non retrouvé automatiquement)</div>
                  <input style={{ ...input, maxWidth: 280 }} value={username} onChange={e => setUsername(e.target.value)} placeholder="ex. jdupont" />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} disabled={busy} onClick={save}>{busy ? <Loader2 size={14} /> : <UserCog size={14} />} Désigner</button>
                <button style={btnGhost} onClick={() => setAdding(false)}>Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} /></div>
        : !items.length ? <EmptyState icon={<ShieldCheck size={28} />} title="Aucun valideur désigné" text="Désignez les directeurs, DGA et DG qui valideront les entretiens de leurs agents." />
          : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {items.map(v => (
                <div key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
                  <Avatar name={v.display_name} size={34} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.display_name} <span style={{ fontSize: 11, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px', marginLeft: 4 }}>{NIVEAU_LABEL[v.niveau]}</span></div>
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[v.grade, v.direction_libelle, v.username].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button style={btnGhost} onClick={() => showAgents(v)}><Users size={13} /> {v.nb_agents || 0} agent{(v.nb_agents || 0) > 1 ? 's' : ''}</button>
                  <button style={btnDanger} onClick={() => remove(v)} title="Retirer ce valideur"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

      {agentsOf && (
        <Overlay onClose={() => setAgentsOf(null)} title={`Agents de ${agentsOf.v.display_name}`}>
          {!agentsOf.agents.length ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Aucun agent rattaché.</div> : agentsOf.agents.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fullName(a)}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.grade, a.service].filter(Boolean).join(' · ')}</div>
              </div>
              <select style={{ ...input, width: 'auto', fontSize: 12 }} value="" onChange={e => e.target.value && reassign(a.id, Number(e.target.value))}>
                <option value="">Réaffecter à…</option>
                {items.filter(v => v.id !== agentsOf.v.id).map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
              </select>
            </div>
          ))}
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, onClose, children, width = 620 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: width }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 30, height: 30, borderRadius: 8, cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Valideur : mes agents
// ─────────────────────────────────────────────────────────────────────────────
function AjoutAgents({ onClose, onDone }: { onClose: () => void; onDone: (r: { added: string[]; conflits: any[]; erreurs: any[] }) => void }) {
  const [mode, setMode] = useState<'perimetre' | 'recherche' | 'libre'>('perimetre');
  const [perimetre, setPerimetre] = useState<RhAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const { results, loading: searching, error: searchError } = useRhSearch(mode === 'recherche' ? q : '');
  const [libre, setLibre] = useState({ nom: '', prenom: '', grade: '', service: '', poste: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/ep-ville/mon-perimetre', { headers: api() })
      .then(r => setPerimetre(r.data.agents || []))
      .catch(e => setError(errMsg(e, 'Impossible de charger votre périmètre.')))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (m: string) => setSel(p => { const n = new Set(p); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  const list = (mode === 'perimetre' ? perimetre : results).filter(a => {
    if (mode !== 'perimetre' || !filter.trim()) return true;
    return `${a.nom} ${a.prenom} ${a.matricule} ${a.service} ${a.grade}`.toLowerCase().includes(filter.trim().toLowerCase());
  });
  const dispo = list.filter(a => !a.valideur);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body = mode === 'libre' ? { libres: [libre] } : { matricules: [...sel] };
      const r = await axios.post('/api/ep-ville/mes-agents', body, { headers: api() });
      onDone(r.data);
    } catch (e) { setError(errMsg(e, 'Ajout impossible.')); } finally { setBusy(false); }
  };

  const Tab = ({ k, label, icon }: { k: typeof mode; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setMode(k)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
      borderBottom: `2px solid ${mode === k ? COLORS.primary : 'transparent'}`, color: mode === k ? COLORS.primary : '#64748b' }}>{icon}{label}</button>
  );

  return (
    <Overlay title="Ajouter des agents" onClose={onClose} width={760}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12, flexWrap: 'wrap' }}>
        <Tab k="perimetre" label="Mon périmètre" icon={<Users size={14} />} />
        <Tab k="recherche" label="Rechercher un agent" icon={<Search size={14} />} />
        <Tab k="libre" label="Saisir un agent" icon={<UserPlus size={14} />} />
      </div>
      {error && <Notice ok={false}>{error}</Notice>}

      {mode === 'libre' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: COLORS.muted }}>Pour un agent absent de SEDIT RH. Il n’aura pas de matricule : à privilégier seulement si la recherche ne le trouve pas.</div>
          {([['nom', 'Nom *'], ['prenom', 'Prénom'], ['grade', 'Grade'], ['service', 'Service'], ['poste', 'Poste'], ['email', 'E-mail (facultatif)']] as const).map(([k, label]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}
              <input style={input} value={libre[k]} onChange={e => setLibre(p => ({ ...p, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
      ) : (
        <>
          {mode === 'perimetre' ? (
            <input style={{ ...input, marginBottom: 8 }} placeholder="Filtrer (nom, service, grade…)" value={filter} onChange={e => setFilter(e.target.value)} />
          ) : (
            <input style={{ ...input, marginBottom: 8 }} autoFocus placeholder="Nom, prénom ou matricule dans SEDIT RH" value={q} onChange={e => setQ(e.target.value)} />
          )}
          {mode === 'perimetre' && !loading && dispo.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <button style={{ ...btnGhost, padding: '3px 9px', fontSize: 11.5 }} onClick={() => setSel(new Set([...sel, ...dispo.filter(a => !a.mien).map(a => a.matricule)]))}>Tout sélectionner ({dispo.filter(a => !a.mien).length})</button>
              {sel.size > 0 && <button style={{ ...btnGhost, padding: '3px 9px', fontSize: 11.5, marginLeft: 6 }} onClick={() => setSel(new Set())}>Tout décocher</button>}
            </div>
          )}
          {(loading || searching) && <div style={{ color: '#94a3b8', fontSize: 12 }}><Loader2 size={12} style={{ verticalAlign: -2 }} /> Chargement…</div>}
          {searchError && <Notice ok={false}>{searchError}</Notice>}
          <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
            {list.map(a => {
              const taken = !!a.valideur && !a.mien;
              return (
                <label key={a.matricule} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 12px', borderBottom: `1px solid ${COLORS.border}`, opacity: taken || a.mien ? .55 : 1, cursor: taken || a.mien ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" disabled={taken || !!a.mien} checked={sel.has(a.matricule)} onChange={() => toggle(a.matricule)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{a.nom} {a.prenom} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>· {a.matricule}</span></div>
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.grade, a.poste, a.service].filter(Boolean).join(' · ')}</div>
                  </div>
                  {a.mien && <span style={{ fontSize: 11, color: COLORS.success, fontWeight: 700 }}>Déjà dans ma liste</span>}
                  {taken && <span style={{ fontSize: 11, color: COLORS.warning, fontWeight: 700 }}>Valideur : {a.valideur}</span>}
                </label>
              );
            })}
            {!list.length && !loading && !searching && <div style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>{mode === 'recherche' ? 'Tapez au moins 2 caractères.' : 'Aucun agent.'}</div>}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <button style={btnPrimary} disabled={busy || (mode === 'libre' ? !libre.nom.trim() : sel.size === 0)} onClick={submit}>
          {busy ? <Loader2 size={14} /> : <Plus size={14} />} {mode === 'libre' ? 'Ajouter cet agent' : `Ajouter ${sel.size || ''} agent${sel.size > 1 ? 's' : ''}`}
        </button>
        <button style={btnGhost} onClick={onClose}>Fermer</button>
      </div>
    </Overlay>
  );
}

function MesAgents({ campaignLabel }: { campaignLabel: string }) {
  const [agents, setAgents] = useState<MonAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [planning, setPlanning] = useState<Entretien | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/ep-ville/mes-agents', { headers: api() })
      .then(r => setAgents(r.data.agents || []))
      .catch(e => setMsg({ ok: false, text: errMsg(e, 'Impossible de charger vos agents.') }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const remove = async (a: MonAgent) => {
    if (!window.confirm(`Retirer ${fullName(a)} de votre liste ?`)) return;
    try { await axios.delete(`/api/ep-ville/mes-agents/${a.id}`, { headers: api() }); load(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Suppression impossible.') }); }
  };

  const plan = async (a: MonAgent) => {
    if (!a.entretien) return;
    try { const r = await axios.get(`/api/entretiens/${a.entretien.id}`, { headers: api() }); setPlanning(r.data); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Impossible d’ouvrir la planification.') }); }
  };

  const shown = agents.filter(a => !filter.trim() || `${a.nom} ${a.prenom} ${a.service} ${a.grade}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const realises = agents.filter(a => a.entretien && ['realise', 'cloture'].includes(a.entretien.statut)).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted }}>
          {campaignLabel} · {agents.length} agent{agents.length > 1 ? 's' : ''}{agents.length ? ` · ${realises} entretien${realises > 1 ? 's' : ''} réalisé${realises > 1 ? 's' : ''}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {agents.length > 6 && <input style={{ ...input, width: 200 }} placeholder="Filtrer…" value={filter} onChange={e => setFilter(e.target.value)} />}
          <button style={btnPrimary} onClick={() => setAdding(true)}><UserPlus size={14} /> Ajouter des agents</button>
        </div>
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} /></div>
        : !agents.length ? <EmptyState icon={<Users size={28} />} title="Aucun agent dans votre liste" text="Ajoutez les agents dont vous validez l’entretien : choisissez-les dans votre périmètre RH, recherchez-les dans SEDIT RH, ou saisissez-les." />
          : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {shown.map(a => {
                const e = a.entretien;
                const st = e ? STATUTS[e.statut] || STATUTS.a_planifier : null;
                const crep = e ? crepMeta({ statut: e.statut, crep_statut: e.crep_statut }) : null;
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
                    <Avatar name={fullName(a)} size={34} />
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.nom} {a.prenom}
                        {a.saisi_a_la_volee && <span style={{ fontSize: 10.5, color: COLORS.warning, background: '#fef3c7', borderRadius: 999, padding: '1px 7px', marginLeft: 6 }}>saisi à la main</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.grade, a.service || a.direction, a.matricule && `mat. ${a.matricule}`].filter(Boolean).join(' · ')}</div>
                      {e?.date_entretien_label && <div style={{ fontSize: 11.5, color: COLORS.primary }}>{e.date_entretien_label}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {st && <Badge {...st} />}
                      {e && e.preparation_statut !== 'non_commencee' && <Badge {...(PREP_STATUTS[e.preparation_statut] || PREP_STATUTS.non_commencee)} />}
                      {e && e.evaluation_statut !== 'non_commencee' && <Badge {...(EVAL_STATUTS[e.evaluation_statut] || EVAL_STATUTS.non_commencee)} />}
                      {crep && <Badge {...crep} />}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btnGhost} disabled={!e} onClick={() => e && setOpenId(e.id)}><Eye size={13} /> Ouvrir</button>
                      <button style={btnGhost} disabled={!e} onClick={() => plan(a)}><CalendarClock size={13} /> Planifier</button>
                      <button style={btnDanger} onClick={() => remove(a)} title="Retirer de ma liste"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

      {adding && <AjoutAgents onClose={() => setAdding(false)} onDone={(r) => {
        const parts: string[] = [];
        if (r.added.length) parts.push(`${r.added.length} agent${r.added.length > 1 ? 's ajoutés' : ' ajouté'}.`);
        if (r.conflits.length) parts.push(`Déjà rattaché à un autre valideur : ${r.conflits.map((c: any) => `${c.agent} (${c.valideur})`).join(', ')}.`);
        if (r.erreurs.length) parts.push(r.erreurs.map((x: any) => x.message).join(' '));
        setMsg({ ok: r.added.length > 0 && !r.conflits.length && !r.erreurs.length, text: parts.join(' ') || 'Aucun agent ajouté.' });
        if (r.added.length) { setAdding(false); load(); }
      }} />}
      {openId && <EntretienDetailModal entretienId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
      {planning && <PlanningModal entretien={planning} onClose={() => setPlanning(null)} onSaved={() => { setPlanning(null); load(); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fenêtre principale
// ─────────────────────────────────────────────────────────────────────────────
export default function EpVille({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'agents' | 'valideurs'>('agents');

  useEffect(() => {
    axios.get('/api/ep-ville/me', { headers: api() })
      .then(r => { setMe(r.data); setTab(r.data.isValideur ? 'agents' : 'valideurs'); })
      .catch(e => setError(errMsg(e, 'Impossible de charger les entretiens professionnels.')));
  }, []);

  const tabs = [
    { key: 'agents' as const, label: 'Mes agents', icon: <Users size={15} />, visible: !!me?.isValideur },
    { key: 'valideurs' as const, label: 'Valideurs', icon: <ShieldCheck size={15} />, visible: !!me?.isAdmin },
  ].filter(t => t.visible);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 1100, background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}`, background: '#fff', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>Entretiens professionnels</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{me?.campaign ? me.campaign.libelle || `Campagne ${me.campaign.annee}` : 'Campagne annuelle'} · tous les services de la Ville</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 34, height: 34, borderRadius: 8, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>
          {error ? <Notice ok={false}>{error}</Notice> : !me ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={24} /></div> : (
            <>
              {!me.sedit_configured && <Notice ok={false}>L’API SEDIT RH n’est pas configurée sur le serveur (SEDITRH_API_URL et SEDITRH_API_KEY) : la recherche d’agents est indisponible.</Notice>}
              {tabs.length > 1 && (
                <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 18 }}>
                  {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', marginBottom: -2,
                      borderBottom: `2px solid ${tab === t.key ? COLORS.primary : 'transparent'}`, color: tab === t.key ? COLORS.primary : '#64748b', fontSize: 14, fontWeight: 600 }}>{t.icon}{t.label}</button>
                  ))}
                </div>
              )}
              {tab === 'agents' && me.isValideur && <MesAgents campaignLabel={me.campaign?.libelle || (me.campaign ? `Campagne ${me.campaign.annee}` : 'Aucune campagne ouverte')} />}
              {tab === 'valideurs' && me.isAdmin && <ValideursAdmin />}
              {!me.isAdmin && !me.isValideur && <EmptyState icon={<ArrowRightLeft size={28} />} title="Accès non ouvert" text="Vous n’avez pas été désigné valideur des entretiens professionnels." />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
