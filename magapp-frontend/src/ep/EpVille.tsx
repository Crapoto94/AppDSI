import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  X, Loader2, Users, CalendarDays, ShieldCheck, Plus, Trash2, Search, CalendarClock, Eye, UserPlus, AlertTriangle, CheckCircle2, UserCog, UserMinus, ArrowRightLeft, ClipboardCheck, ChevronDown, ChevronRight, FileDown, TrendingUp, BookOpen, History,
  GraduationCap,
} from 'lucide-react';
import type { Entretien, MeData } from './types';
import MonEntretien from './MonEntretien';
import Reglages from './Reglages';
import Evaluations from './Evaluations';
import Journal from './Journal';
import AideEp from './AideEp';
import Formations from './Formations';
import TutoEp, { tutoMarkSeen, tutoSeen } from './TutoEp';
import type { TutoRole } from './TutoEp';
import { STATUTS, PREP_STATUTS, EVAL_STATUTS, crepMeta } from './types';
import EntretienDetailModal from './EntretienDetailModal';
import PlanningModal from './PlanningModal';
import { Avatar, Badge, COLORS, EmptyState, btnGhost, btnPrimary, btnDanger, card, input, useConfirm } from './ui';
import { useDocViewer } from './DocViewerModal';

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
  id: number; rattachement_id?: number | null; parent_valideur_id?: number | null; username: string; email: string; display_name: string; matricule: string; grade: string; niveau: 'direction' | 'dga' | 'dg' | 'sous';
  parent_nom?: string | null;
  direction_code: string; direction_libelle: string; directions: string[]; nb_agents?: number;
}
interface Me { isAdmin: boolean; isValideur: boolean; hasSubValideurs?: boolean; valideur: Valideur | null; campaign: { annee: number; libelle?: string } | null; sedit_configured: boolean }
interface MonAgent {
  id: number; username: string; ad: boolean; matricule: string; nom: string; prenom: string; grade: string; email: string; direction: string; service: string; poste: string;
  saisi_a_la_volee: boolean;
  sous_valideur?: { id: number; nb_agents: number } | null;
  entretien: { id: number; statut: string; date_entretien: string | null; date_entretien_label: string; preparation_statut: string; evaluation_statut: string; crep_statut: string; crep_signed_at?: string | null; crep_parapheur_status?: string | null } | null;
}

const NIVEAU_LABEL: Record<string, string> = { direction: 'Directeur·trice', dga: 'DGA', dg: 'DG', sous: 'Sous-valideur' };
const foldTxt = (v?: string | null) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Grade · fonction · direction · service (seulement s'il diffère de la direction) · matricule. */
const ficheLine = (a: { grade?: string; poste?: string; direction?: string; service?: string; matricule?: string }) => [
  a.grade, a.poste, a.direction, a.service && foldTxt(a.service) !== foldTxt(a.direction) ? a.service : '', a.matricule && `mat. ${a.matricule}`,
].filter(Boolean).join(' · ');
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
interface AdUser { username: string; displayName: string; email: string; service?: string; direction?: string; matricule?: string }

/** Recherche distante avec délai (AD, RH) : renvoie les résultats de `url` pour le texte saisi. */
function useRemoteSearch<T>(url: string, q: string, field: string) {
  const [results, setResults] = useState<T[]>([]);
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
        const r = await axios.get(url, { params: { q: query }, headers: api() });
        if (id === seq.current) { setResults(r.data[field] || []); setError(''); }
      } catch (e) {
        if (id === seq.current) { setResults([]); setError(errMsg(e, 'Recherche impossible pour le moment.')); }
      } finally { if (id === seq.current) setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, url, field]);
  return { results, loading, error };
}

/**
 * Désignation d'un valideur, en deux temps : 1) on le cherche dans l'Active Directory (son compte de connexion) ;
 * 2) on fait le lien avec SEDIT RH, de préférence par le matricule. Sans lien, on le dit et on propose de chercher l'agent
 * dans la base RH (nom, prénom, direction, service…).
 */
function ValideurDesignation({ onCancel, onDone }: { onCancel: () => void; onDone: (text: string) => void }) {
  const [adQ, setAdQ] = useState('');
  const ad = useRemoteSearch<AdUser>('/api/ep-ville/ad/search', adQ, 'users');
  const [user, setUser] = useState<AdUser | null>(null);
  const [resolving, setResolving] = useState(false);
  const [lien, setLien] = useState<'matricule' | 'nom' | 'manuel' | null>(null);
  const [notFound, setNotFound] = useState('');
  const [rhQ, setRhQ] = useState('');
  const rh = useRemoteSearch<RhAgent>('/api/ep-ville/rh/recherche', notFound ? rhQ : '', 'agents');
  const [agent, setAgent] = useState<RhAgent | null>(null);
  const [directions, setDirections] = useState<{ code: string; libelle: string }[]>([]);
  const [niveau, setNiveau] = useState<'direction' | 'dga' | 'dg'>('direction');
  const [dirs, setDirs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/ep-ville/rh/directions', { headers: api() }).then(r => setDirections(r.data.directions || [])).catch(() => setDirections([]));
  }, []);

  const pickUser = async (u: AdUser) => {
    setUser(u); setAgent(null); setLien(null); setNotFound(''); setError(''); setRhQ(''); setResolving(true);
    try {
      const r = await axios.post('/api/ep-ville/valideurs/resolve', { username: u.username, displayName: u.displayName, matricule: u.matricule }, { headers: api() });
      if (r.data.agent) { setAgent(r.data.agent); setLien(r.data.lien); if (r.data.agent.est_dg_dga) setNiveau('dga'); }
      else setNotFound(r.data.message || `« ${u.displayName} » n’existe pas écrit comme ça en RH.`);
    } catch (e) { setError(errMsg(e, 'Lien RH impossible pour le moment.')); }
    finally { setResolving(false); }
  };

  const save = async () => {
    if (!user || !agent) return;
    setBusy(true); setError('');
    try {
      await axios.post('/api/ep-ville/valideurs', { account: { username: user.username, displayName: user.displayName, email: user.email }, matricule: agent.matricule, niveau, directions: niveau === 'direction' ? [] : dirs }, { headers: api() });
      onDone(`${user.displayName} (${user.username}) est désigné·e valideur.`);
    } catch (e) { setError(errMsg(e, 'Désignation impossible.')); } finally { setBusy(false); }
  };

  const rowBtn: React.CSSProperties = { display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer' };

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Désigner un valideur</div>

      {!user ? (
        <>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>1. Recherchez la personne dans l’Active Directory (nom, prénom, identifiant ou e-mail).</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            <input style={{ ...input, paddingLeft: 30 }} autoFocus placeholder="Ex. presset, François Presset…" value={adQ} onChange={e => setAdQ(e.target.value)} />
          </div>
          {ad.loading && <div style={{ fontSize: 12, color: '#94a3b8' }}><Loader2 size={12} style={{ verticalAlign: -2 }} /> Recherche dans l’AD…</div>}
          {ad.error && <Notice ok={false}>{ad.error}</Notice>}
          {adQ.trim().length >= 2 && (
            <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
              {ad.results.map(u => (
                <button key={u.username} onClick={() => pickUser(u)} style={rowBtn}>
                  <Avatar name={u.displayName} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{u.displayName} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>· {u.username}{u.matricule ? ` · mat. ${u.matricule}` : ''}</span></div>
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[u.service, u.direction, u.email].filter(Boolean).join(' · ')}</div>
                  </div>
                </button>
              ))}
              {!ad.results.length && !ad.loading && <div style={{ padding: 16, fontSize: 12.5, color: '#94a3b8', textAlign: 'center' }}>Aucun compte trouvé dans l’AD.</div>}
            </div>
          )}
          <div style={{ marginTop: 10 }}><button style={btnGhost} onClick={onCancel}>Annuler</button></div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <Avatar name={user.displayName} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{user.displayName} <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>· compte AD « {user.username} »</span></div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>{[user.service, user.direction, user.email].filter(Boolean).join(' · ')}</div>
            </div>
            <button style={btnGhost} onClick={() => { setUser(null); setAgent(null); setNotFound(''); setError(''); }}>Changer</button>
          </div>

          {resolving && <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 8 }}><Loader2 size={13} style={{ verticalAlign: -2 }} /> Recherche dans SEDIT RH…</div>}
          {error && <Notice ok={false}>{error}</Notice>}

          {notFound && !agent && (
            <div style={{ marginBottom: 10 }}>
              <Notice ok={false}>{notFound}</Notice>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                <input style={{ ...input, paddingLeft: 30 }} autoFocus placeholder="Rechercher dans la base RH : nom, prénom, direction, service, matricule…" value={rhQ} onChange={e => setRhQ(e.target.value)} />
              </div>
              {rh.loading && <div style={{ fontSize: 12, color: '#94a3b8' }}><Loader2 size={12} style={{ verticalAlign: -2 }} /> Recherche RH…</div>}
              {rh.error && <Notice ok={false}>{rh.error}</Notice>}
              {rhQ.trim().length >= 2 && (
                <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                  {rh.results.map(a => (
                    <button key={a.matricule} onClick={() => { setAgent(a); setLien('manuel'); if (a.est_dg_dga) setNiveau('dga'); }} style={rowBtn}>
                      <Avatar name={fullName(a)} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{a.nom} {a.prenom} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>· mat. {a.matricule}</span></div>
                        <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.grade, a.poste, a.service || a.direction].filter(Boolean).join(' · ')}</div>
                      </div>
                    </button>
                  ))}
                  {!rh.results.length && !rh.loading && <div style={{ padding: 16, fontSize: 12.5, color: '#94a3b8', textAlign: 'center' }}>Aucun agent trouvé en RH.</div>}
                </div>
              )}
            </div>
          )}

          {agent && (
            <>
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '9px 12px', background: '#f8fafc', marginBottom: 12, fontSize: 12.5 }}>
                <div style={{ fontWeight: 700 }}>Lien RH : {agent.nom} {agent.prenom} <span style={{ fontWeight: 400, color: '#94a3b8' }}>· mat. {agent.matricule}</span></div>
                <div style={{ color: COLORS.muted }}>{[agent.grade, agent.poste, agent.direction].filter(Boolean).join(' · ')}</div>
                <div style={{ fontSize: 11, color: lien === 'matricule' ? COLORS.success : COLORS.warning, marginTop: 2 }}>
                  {lien === 'matricule' ? 'Lien établi par le matricule.' : lien === 'nom' ? 'Lien établi par le nom (aucun matricule dans l’AD).' : 'Agent choisi à la main dans la base RH : vérifiez que c’est bien la même personne.'}
                </div>
                {lien === 'manuel' && <button style={{ ...btnGhost, marginTop: 6, padding: '3px 9px', fontSize: 11.5 }} onClick={() => { setAgent(null); setLien(null); }}>Choisir un autre agent</button>}
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
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Périmètre proposé : sa direction ({agent.direction || 'non renseignée'}).</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} disabled={busy} onClick={save}>{busy ? <Loader2 size={14} /> : <UserCog size={14} />} Désigner</button>
                <button style={btnGhost} onClick={onCancel}>Annuler</button>
              </div>
            </>
          )}
          {!agent && <div style={{ marginTop: 6 }}><button style={btnGhost} onClick={onCancel}>Annuler</button></div>}
        </>
      )}
    </div>
  );
}

function ValideursAdmin() {
  const [confirm, confirmDialog] = useConfirm();
  const [items, setItems] = useState<Valideur[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([axios.get('/api/ep-ville/valideurs', { headers: api() }), axios.get('/api/ep-ville/valideurs/agents', { headers: api() })])
      .then(([r, a]) => { setItems(r.data.valideurs || []); setAllAgents(a.data.agents || []); })
      .catch(e => setMsg({ ok: false, text: errMsg(e, 'Impossible de charger les valideurs.') }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openAdd = () => { setAdding(true); setMsg(null); };

  const remove = async (v: Valideur) => {
    if (!(await confirm(`Retirer ${v.display_name} de la liste des valideurs ?`, { title: 'Retirer un valideur', confirmLabel: 'Retirer', danger: true }))) return;
    try { await axios.delete(`/api/ep-ville/valideurs/${v.id}`, { headers: api() }); setMsg({ ok: true, text: 'Valideur retiré.' }); load(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Suppression impossible.') }); }
  };

  const reassign = async (ratId: number, valideurId: number) => {
    try {
      await axios.put(`/api/ep-ville/rattachements/${ratId}`, { valideur_id: valideurId }, { headers: api() });
      setMsg({ ok: true, text: 'Agent réaffecté.' }); load();
    } catch (e) { setMsg({ ok: false, text: errMsg(e, 'Réaffectation impossible.') }); }
  };

  // Arbre : valideur → ses agents ; un agent qui est lui-même valideur se déroule à son tour, jusqu'aux agents non valideurs.
  const ratsOf = (vid: number) => allAgents.filter(a => a.valideur_id === vid);
  const valideurOfRat = (rat: any, parent: Valideur) =>
    items.find(w => w.rattachement_id === rat.id) || items.find(w => w.parent_valideur_id === parent.id && rat.matricule && w.matricule === rat.matricule) || null;
  const placed = new Set<number>();
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const countAll = (v: Valideur, seen = new Set<number>()): number => {
    if (seen.has(v.id)) return 0;
    seen.add(v.id);
    return ratsOf(v.id).reduce((n, r) => { const w = valideurOfRat(r, v); return n + 1 + (w ? countAll(w, seen) : 0); }, 0);
  };
  const renderValideur = (v: Valideur, depth: number, trail: Set<number>): React.ReactNode => {
    placed.add(v.id);
    const key = 'v' + v.id;
    const isOpen = open.has(key);
    const rats = ratsOf(v.id);
    const matched = new Set<number>();
    const children = rats.map(r => { const w = valideurOfRat(r, v); if (w) matched.add(w.id); return { r, w }; });
    // Sous-valideurs désignés par ce valideur mais pas retrouvés dans sa liste d'agents
    const extras = items.filter(w => w.parent_valideur_id === v.id && !matched.has(w.id));
    const total = countAll(v);
    const sub = new Set([...trail, v.id]);
    return (
      <div key={key}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', paddingLeft: 14 + depth * 26, borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
          <button onClick={() => toggle(key)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: COLORS.muted, display: 'inline-flex' }} aria-label={isOpen ? 'Replier' : 'Déplier'}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <Avatar name={v.display_name} size={32} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.display_name} <span style={{ fontSize: 11, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px', marginLeft: 4 }}>{NIVEAU_LABEL[v.niveau]}</span></div>
            <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[v.grade, v.direction_libelle, v.username, v.parent_nom && `désigné par ${v.parent_nom}`].filter(Boolean).join(' · ')}</div>
          </div>
          <span style={{ fontSize: 11.5, color: COLORS.muted }}><Users size={12} style={{ verticalAlign: -2 }} /> {rats.length} direct{rats.length > 1 ? 's' : ''}{total !== rats.length ? ` · ${total} au total` : ''}</span>
          <button style={btnDanger} onClick={() => remove(v)} title="Retirer ce valideur"><Trash2 size={13} /></button>
        </div>
        {isOpen && (
          <div>
            {children.map(({ r, w }) => w && !trail.has(w.id)
              ? renderValideur(w, depth + 1, sub)
              : (
                <div key={'a' + r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 14px', paddingLeft: 14 + (depth + 1) * 26 + 24, borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap', background: '#fcfdff' }}>
                  <Avatar name={fullName(r)} size={26} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.nom} {r.prenom}{r.saisi_a_la_volee && <span style={{ fontSize: 10.5, color: COLORS.warning, marginLeft: 6 }}>saisi à la main</span>}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>{ficheLine(r)}</div>
                  </div>
                  <select style={{ ...input, width: 'auto', fontSize: 11.5, padding: '4px 6px' }} value="" onChange={e => e.target.value && reassign(r.id, Number(e.target.value))}>
                    <option value="">Réaffecter à…</option>
                    {items.filter(x => x.id !== v.id).map(x => <option key={x.id} value={x.id}>{x.display_name}</option>)}
                  </select>
                </div>
              ))}
            {extras.filter(w => !trail.has(w.id)).map(w => renderValideur(w, depth + 1, sub))}
            {!children.length && !extras.length && <div style={{ padding: '7px 14px', paddingLeft: 14 + (depth + 1) * 26 + 24, fontSize: 12, color: '#94a3b8', borderBottom: `1px solid ${COLORS.border}` }}>Aucun agent rattaché.</div>}
          </div>
        )}
      </div>
    );
  };
  // Racines : valideurs sans valideur au-dessus (désignés par l'administrateur) ; les autres sont rendus dans l'arbre de leur parent.
  const roots = items.filter(v => !v.parent_valideur_id);
  const expandAll = () => setOpen(new Set(items.map(v => 'v' + v.id)));

  return (
    <div>
      {confirmDialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted, maxWidth: 640 }}>
          Les valideurs sont les directeurs, DGA et DG de la collectivité. Chacun choisit ensuite les agents dont il valide l’entretien.
          En tant qu’administrateur, vous ne voyez que l’effectif de chaque valideur, jamais le contenu des entretiens.
        </div>
        {!adding && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnGhost} onClick={expandAll}>Tout déplier</button>
            <button style={btnGhost} onClick={() => setOpen(new Set())}>Tout replier</button>
            <button style={btnPrimary} onClick={openAdd}><Plus size={14} /> Désigner un valideur</button>
          </div>
        )}
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}

      {adding && <ValideurDesignation onCancel={() => setAdding(false)} onDone={(t) => { setAdding(false); setMsg({ ok: true, text: t }); load(); }} />}

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} /></div>
        : !items.length ? <EmptyState icon={<ShieldCheck size={28} />} title="Aucun valideur désigné" text="Désignez les directeurs, DGA et DG qui valideront les entretiens de leurs agents." />
          : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {roots.map(v => renderValideur(v, 0, new Set()))}
              {items.filter(v => !placed.has(v.id)).map(v => renderValideur(v, 0, new Set()))}
            </div>
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

/** Rattache un agent de ma liste à un compte de l'Active Directory (recherche AD par nom, identifiant ou e-mail). */
function LierAd({ agent, onClose, onDone }: { agent: MonAgent; onClose: () => void; onDone: (text: string) => void }) {
  const [q, setQ] = useState(fullName(agent));
  const ad = useRemoteSearch<AdUser>('/api/ep-ville/ad/search', q, 'users');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = async (u: AdUser) => {
    setBusy(true); setError('');
    try { const r = await axios.put(`/api/ep-ville/mes-agents/${agent.id}/compte-ad`, { username: u.username }, { headers: api() }); onDone(`${fullName(agent)} rattaché au compte ${r.data.username}${r.data.email ? ' (' + r.data.email + ')' : ''}.`); }
    catch (e) { setError(errMsg(e, 'Rattachement impossible.')); setBusy(false); }
  };
  const unlink = async () => {
    setBusy(true); setError('');
    try { await axios.delete(`/api/ep-ville/mes-agents/${agent.id}/compte-ad`, { headers: api() }); onDone(`Compte AD détaché de ${fullName(agent)}.`); }
    catch (e) { setError(errMsg(e, 'Détachement impossible.')); setBusy(false); }
  };
  return (
    <Overlay title={`Rattacher ${fullName(agent)} à un compte AD`} onClose={onClose} width={560}>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
        Cet agent n’a pas été retrouvé dans l’Active Directory sous son nom RH. Cherchez son compte (nom, identifiant ou e-mail) : l’adresse e-mail du compte sera utilisée pour les notifications et l’agent retrouvera son entretien à la connexion.
      </div>
      {error && <Notice ok={false}>{error}</Notice>}
      <input style={input} autoFocus value={q} placeholder="Nom, identifiant ou e-mail…" onChange={e => setQ(e.target.value)} />
      <div style={{ marginTop: 10, maxHeight: 280, overflowY: 'auto' }}>
        {ad.loading && <div style={{ color: '#94a3b8', fontSize: 12.5 }}><Loader2 size={14} /> Recherche…</div>}
        {ad.error && <Notice ok={false}>{ad.error}</Notice>}
        {!ad.loading && !ad.error && q.trim().length >= 2 && !ad.results.length && <div style={{ color: '#94a3b8', fontSize: 12.5 }}>Aucun compte trouvé : l’agent n’est probablement pas dans l’AD (il restera sans e-mail).</div>}
        {ad.results.map(u => (
          <div key={u.username} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.displayName} <span style={{ fontWeight: 400, color: COLORS.muted }}>({u.username})</span></div>
              <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[u.email, u.service || u.direction, u.matricule && `mat. ${u.matricule}`].filter(Boolean).join(' · ')}</div>
            </div>
            <button style={btnPrimary} disabled={busy} onClick={() => link(u)}>Rattacher</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {agent.ad && <button style={btnDanger} disabled={busy} onClick={unlink}>Détacher le compte actuel</button>}
        <button style={btnGhost} onClick={onClose}>Fermer</button>
      </div>
    </Overlay>
  );
}

function MesAgents({ campaignLabel }: { campaignLabel: string }) {
  const [confirm, confirmDialog] = useConfirm();
  const [openViewer, viewerElement] = useDocViewer();
  const [agents, setAgents] = useState<MonAgent[]>([]);
  const [sousAgents, setSousAgents] = useState<(MonAgent & { valideur_id: number })[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [planning, setPlanning] = useState<Entretien | null>(null);
  const [filter, setFilter] = useState('');
  const importedRef = useRef(false);
  const [linking, setLinking] = useState<MonAgent | null>(null);
  const [promoting, setPromoting] = useState<{ agent: MonAgent; username: string; needUsername: boolean; busy: boolean; error: string } | null>(null);

  const importDsi = useCallback(async (auto: boolean) => {
    try {
      const r = await axios.post('/api/ep-ville/mes-agents/importer-dsi', {}, { headers: api() });
      const d = r.data as { agents_repris: string[]; sous_valideurs: string[]; non_resolus: { agent: string; raison: string }[]; conflits: { agent: string; message: string }[] };
      if (d.agents_repris.length || !auto) {
        const parts = [`${d.agents_repris.length} agent${d.agents_repris.length > 1 ? 's' : ''} repris de vos entretiens DSI.`];
        if (d.sous_valideurs.length) parts.push(`Désignés valideurs (ils évaluent eux-mêmes des agents) : ${d.sous_valideurs.join(', ')}.`);
        if (d.non_resolus.length) parts.push(d.non_resolus.map(x => `${x.agent} : ${x.raison}`).join(' · '));
        if (d.conflits.length) parts.push(d.conflits.map(x => `${x.agent} : ${x.message}`).join(' · '));
        setMsg({ ok: !d.non_resolus.length && !d.conflits.length, text: parts.join(' ') });
      }
      return d.agents_repris.length > 0;
    } catch (e) { if (!auto) setMsg({ ok: false, text: errMsg(e, 'Reprise impossible.') }); return false; }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/ep-ville/mes-agents', { headers: api() })
      .then(async r => {
        // Première ouverture, liste vide : on reprend automatiquement les agents des EP DSI que j'évalue.
        if (!(r.data.agents || []).length && !importedRef.current) {
          importedRef.current = true;
          if (await importDsi(true)) { const r2 = await axios.get('/api/ep-ville/mes-agents', { headers: api() }); setAgents(r2.data.agents || []); setSousAgents(r2.data.sous_agents || []); return; }
        }
        setAgents(r.data.agents || []);
        setSousAgents(r.data.sous_agents || []);
      })
      .catch(e => setMsg({ ok: false, text: errMsg(e, 'Impossible de charger vos agents.') }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const remove = async (a: MonAgent) => {
    const nb = a.sous_valideur ? sousAgents.filter(x => x.valideur_id === a.sous_valideur!.id).length : 0;
    const txt = a.sous_valideur
      ? `${fullName(a)} est valideur : sa suppression retirera aussi ${nb ? `les ${nb} agent${nb > 1 ? 's' : ''} qu’il évalue (et leurs éventuels sous-agents)` : 'les agents qu’il évalue'}. Continuer ?`
      : `Retirer ${fullName(a)} de votre liste ?`;
    if (!(await confirm(txt, { title: 'Retirer de ma liste', confirmLabel: 'Retirer', danger: true }))) return;
    try { await axios.delete(`/api/ep-ville/mes-agents/${a.id}`, { headers: api() }); setMsg({ ok: true, text: 'Agent retiré.' }); load(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Suppression impossible.') }); }
  };

  const promote = async (p: NonNullable<typeof promoting>) => {
    setPromoting({ ...p, busy: true, error: '' });
    try {
      await axios.post(`/api/ep-ville/mes-agents/${p.agent.id}/valideur`, { username: p.username.trim() || undefined }, { headers: api() });
      setPromoting(null); setMsg({ ok: true, text: `${fullName(p.agent)} est désormais valideur : il peut choisir ses propres agents.` }); load();
    } catch (e: any) {
      setPromoting({ ...p, busy: false, needUsername: p.needUsername || !!e?.response?.data?.need_username, error: errMsg(e, 'Désignation impossible.') });
    }
  };

  const demote = async (a: MonAgent) => {
    if (!(await confirm(`Retirer la fonction de valideur à ${fullName(a)} ? Il restera dans votre liste.`, { title: 'Retirer la fonction de valideur', confirmLabel: 'Retirer', danger: true }))) return;
    try { await axios.delete(`/api/ep-ville/mes-agents/${a.id}/valideur`, { headers: api() }); setMsg({ ok: true, text: 'Fonction de valideur retirée.' }); load(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Retrait impossible.') }); }
  };

  const plan = async (a: MonAgent) => {
    if (!a.entretien) return;
    try { const r = await axios.get(`/api/entretiens/${a.entretien.id}`, { headers: api() }); setPlanning(r.data); }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'Impossible d’ouvrir la planification.') }); }
  };

  const crepSigned = (e: MonAgent['entretien']) => !!e && (e.crep_statut === 'signe_papier' || (e.crep_statut === 'en_signature' && e.crep_parapheur_status === 'termine'));
  const openSigned = async (entId: number) => {
    try {
      await openViewer('CREP signé', async () => (await axios.get(`/api/entretiens/${entId}/crep-signe.pdf`, { headers: api(), responseType: 'blob' })).data);
    } catch (e) { setMsg({ ok: false, text: 'PDF signé indisponible.' }); }
  };
  const toggleSub = (id: number) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const renderSub = (valideurId: number, depth: number, trail: number[]): React.ReactNode => {
    const rows = sousAgents.filter(x => x.valideur_id === valideurId);
    if (!rows.length) return <div style={{ padding: '7px 14px', paddingLeft: 14 + depth * 28 + 30, fontSize: 12, color: '#94a3b8', borderBottom: `1px solid ${COLORS.border}` }}>Aucun agent rattaché.</div>;
    return rows.map(a => {
      const st = a.entretien ? STATUTS[a.entretien.statut] || STATUTS.a_planifier : null;
      const sv = a.sous_valideur && !trail.includes(a.sous_valideur.id) ? a.sous_valideur : null;
      const isOpen = !!sv && expanded.has(sv.id);
      return (
        <div key={'s' + a.id}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 14px', paddingLeft: 14 + depth * 28, borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap', background: '#fcfdff' }}>
            {sv
              ? <button onClick={() => toggleSub(sv.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: COLORS.muted, display: 'inline-flex' }} aria-label={isOpen ? 'Replier' : 'Déplier'}>{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
              : <span style={{ width: 20 }} />}
            <Avatar name={fullName(a)} size={28} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.nom} {a.prenom}{sv && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px', marginLeft: 6 }}>Valideur · {sousAgents.filter(x => x.valideur_id === sv.id).length} agent{sousAgents.filter(x => x.valideur_id === sv.id).length > 1 ? 's' : ''}</span>}</div>
              <div style={{ fontSize: 11.5, color: COLORS.muted }}>{ficheLine(a)}</div>
              {a.ad
                ? <div style={{ fontSize: 11.5, color: '#166534', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CheckCircle2 size={12} /> {a.email ? <a href={`mailto:${a.email}`} style={{ color: '#166534' }}>{a.email}</a> : 'Connu de l’AD · pas d’adresse e-mail'}
                    <button style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }} onClick={() => setLinking(a)}>changer</button>
                  </div>
                : <div style={{ fontSize: 11.5, color: '#92400e', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <AlertTriangle size={12} /> Inconnu de l’AD{a.email ? ` · ${a.email}` : ' · pas d’e-mail'}
                    <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11 }} onClick={() => setLinking(a)}>Rattacher à un compte AD</button>
                  </div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {st && <Badge {...st} />}
              {a.entretien && <button style={btnGhost} onClick={() => setOpenId(a.entretien!.id)}><Eye size={13} /> Ouvrir</button>}
              {crepSigned(a.entretien) && <button style={{ ...btnGhost, color: '#166534', borderColor: '#bbf7d0' }} onClick={() => openSigned(a.entretien!.id)} title="Compte rendu signé"><FileDown size={13} /> CREP signé</button>}
              <button style={btnDanger} onClick={() => remove(a)} title={sv ? 'Retirer cet agent et les agents qu’il évalue' : 'Retirer cet agent'}><Trash2 size={13} /></button>
            </div>
          </div>
          {isOpen && sv && renderSub(sv.id, depth + 1, [...trail, sv.id])}
        </div>
      );
    });
  };

  const shown = agents.filter(a => !filter.trim() || `${a.nom} ${a.prenom} ${a.service} ${a.grade}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const realises = agents.filter(a => a.entretien && ['realise', 'cloture'].includes(a.entretien.statut)).length;

  return (
    <div>
      {confirmDialog}
      {viewerElement}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted }}>
          {campaignLabel} · {agents.length} agent{agents.length > 1 ? 's' : ''}{agents.length ? ` · ${realises} entretien${realises > 1 ? 's' : ''} réalisé${realises > 1 ? 's' : ''}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {sousAgents.length > 0 && <button style={btnGhost} onClick={() => setExpanded(prev => prev.size ? new Set() : new Set([...agents, ...sousAgents].filter(x => x.sous_valideur).map(x => x.sous_valideur!.id)))}>{expanded.size ? 'Tout replier' : 'Tout déplier'}</button>}
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
                const subOpen = !!a.sous_valideur && expanded.has(a.sous_valideur.id);
                return (
                  <div key={a.id}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
                    {a.sous_valideur
                      ? <button onClick={() => toggleSub(a.sous_valideur!.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: COLORS.muted, display: 'inline-flex' }} aria-label={subOpen ? 'Replier' : 'Déplier'}>{subOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                      : <span style={{ width: 20 }} />}
                    <Avatar name={fullName(a)} size={34} />
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.nom} {a.prenom}
                        {a.saisi_a_la_volee && <span style={{ fontSize: 10.5, color: COLORS.warning, background: '#fef3c7', borderRadius: 999, padding: '1px 7px', marginLeft: 6 }}>saisi à la main</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: COLORS.muted }}>{ficheLine(a)}</div>
                      {a.ad
                        ? <div style={{ fontSize: 11.5, color: '#166534', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            <CheckCircle2 size={12} /> {a.email ? <a href={`mailto:${a.email}`} style={{ color: '#166534' }}>{a.email}</a> : 'Connu de l’AD · pas d’adresse e-mail'}
                            <button style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }} onClick={() => setLinking(a)}>changer</button>
                          </div>
                        : <div style={{ fontSize: 11.5, color: '#92400e', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            <AlertTriangle size={12} /> Inconnu de l’AD{a.email ? ` · ${a.email}` : ' · pas d’e-mail : aucun mail ne peut lui être envoyé'}
                            <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11 }} onClick={() => setLinking(a)}>Rattacher à un compte AD</button>
                          </div>}
                      {e?.date_entretien_label && <div style={{ fontSize: 11.5, color: COLORS.primary }}>{e.date_entretien_label}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {st && <Badge {...st} />}
                      {e && e.preparation_statut !== 'non_commencee' && <Badge {...(PREP_STATUTS[e.preparation_statut] || PREP_STATUTS.non_commencee)} />}
                      {e && e.evaluation_statut !== 'non_commencee' && <Badge {...(EVAL_STATUTS[e.evaluation_statut] || EVAL_STATUTS.non_commencee)} />}
                      {crep && <Badge {...crep} />}
                      {a.sous_valideur && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '2px 9px' }}>Valideur · {a.sous_valideur.nb_agents} agent{a.sous_valideur.nb_agents > 1 ? 's' : ''}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btnGhost} disabled={!e} onClick={() => e && setOpenId(e.id)}><Eye size={13} /> Ouvrir</button>
                      {crepSigned(e) && <button style={{ ...btnGhost, color: '#166534', borderColor: '#bbf7d0' }} onClick={() => openSigned(e!.id)} title="Compte rendu signé"><FileDown size={13} /> CREP signé</button>}
                      <button style={btnGhost} disabled={!e} onClick={() => plan(a)}><CalendarClock size={13} /> Planifier</button>
                      {a.sous_valideur
                        ? <button style={btnGhost} onClick={() => demote(a)} title="Retirer la fonction de valideur"><UserMinus size={13} /> Valideur</button>
                        : <button style={btnGhost} onClick={() => setPromoting({ agent: a, username: '', needUsername: false, busy: false, error: '' })} title="Il choisira à son tour ses propres agents"><UserCog size={13} /> Désigner valideur</button>}
                      <button style={btnDanger} onClick={() => remove(a)} title={a.sous_valideur ? 'Retirer cet agent et les agents qu’il évalue' : 'Retirer de ma liste'}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {subOpen && a.sous_valideur && renderSub(a.sous_valideur.id, 1, [a.sous_valideur.id])}
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
      {promoting && (
        <Overlay title={`Désigner ${fullName(promoting.agent)} comme valideur`} onClose={() => setPromoting(null)} width={480}>
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
            Il pourra choisir ses propres agents (de son service, ou n’importe quel agent) et désigner à son tour des valideurs. Son propre entretien reste validé par vous.
          </div>
          {promoting.error && <Notice ok={false}>{promoting.error}</Notice>}
          {promoting.needUsername && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 12 }}>
              Identifiant de connexion de l’agent
              <input style={{ ...input, maxWidth: 280 }} autoFocus value={promoting.username} placeholder="ex. jdupont" onChange={e => setPromoting({ ...promoting, username: e.target.value })} />
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnPrimary} disabled={promoting.busy || (promoting.needUsername && !promoting.username.trim())} onClick={() => promote(promoting)}>
              {promoting.busy ? <Loader2 size={14} /> : <UserCog size={14} />} Désigner
            </button>
            <button style={btnGhost} onClick={() => setPromoting(null)}>Annuler</button>
          </div>
        </Overlay>
      )}
      {linking && <LierAd agent={linking} onClose={() => setLinking(null)} onDone={(t) => { setLinking(null); setMsg({ ok: true, text: t }); load(); }} />}
      {openId && <EntretienDetailModal entretienId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
      {planning && <PlanningModal entretien={planning} onClose={() => setPlanning(null)} onSaved={() => { setPlanning(null); load(); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fenêtre principale
// ─────────────────────────────────────────────────────────────────────────────
export default function EpVille({ onClose, initialTab }: { onClose: () => void; initialTab?: string | null }) {
  const [me, setMe] = useState<Me | null>(null);
  // Module EP existant de la DSI (mêmes tables, mêmes routes /api/entretiens) : mon entretien d'agent et mes entretiens d'évaluateur.
  const [dsi, setDsi] = useState<MeData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'moi' | 'evaluations' | 'equipe' | 'agents' | 'valideurs' | 'pilotage' | 'formations' | 'parametrage' | 'journal' | null>(null);
  const [showAide, setShowAide] = useState(false);
  const [showTuto, setShowTuto] = useState(false);
  // Valideur d'agents dans la base des agents à évaluer (classeur RH) : voit les EP de toute son équipe.
  const [base, setBase] = useState<{ isValideur: boolean; agents: number } | null>(null);

  const loadDsi = useCallback(() => {
    axios.get('/api/entretiens/me', { headers: api() }).then(r => setDsi(r.data)).catch(() => setDsi(null));
  }, []);

  useEffect(() => {
    // Lien d'un mail : « evaluations:<id>:prop » ouvre directement l'entretien (et sa proposition de lecture à relire)
    const [, entArg, propArg] = String(initialTab || '').split(':');
    try {
      if (entArg) sessionStorage.setItem('ep_open_entretien', entArg);
      if (entArg && propArg === 'prop') sessionStorage.setItem('ep_open_proposal', entArg);
    } catch { /* ignore */ }
    Promise.all([
      axios.get('/api/ep-ville/me', { headers: api() }),
      axios.get('/api/entretiens/me', { headers: api() }).then(r => r.data as MeData).catch(() => null),
      axios.get('/api/ep-base/me', { headers: api() }).then(r => r.data as { isValideur: boolean; agents: number }).catch(() => null),
    ]).then(async ([v, d, b]) => {
      setBase(b);
      // Un valideur : on s'assure que les EP de la campagne en cours existent pour tous ses agents avant d'afficher son tableau de bord.
      if (v.data.isValideur) await axios.get('/api/ep-ville/mes-agents', { headers: api() }).catch(() => null);
      const d2 = v.data.isValideur ? await axios.get('/api/entretiens/me', { headers: api() }).then(r => r.data as MeData).catch(() => d) : d;
      d = d2;
      setMe(v.data); setDsi(d);
      const asEvaluator = !!(v.data.isValideur || d?.isEvaluator || b?.isValideur);
      const ent = d?.selfAccess?.allowed ? d?.entretien : null;
      // Lien d'un mail : « moi » = mon entretien d'agent ; « evaluations » = mes EP d'évaluateur ; « auto » = mon entretien s'il attend une action de ma part.
      const needsMe = !!ent && (ent.preparation_statut !== 'soumis' || ent.crep_statut === 'envoye_agent');
      const tabArg = String(initialTab || '').split(':')[0];
      const wanted = tabArg === 'moi' ? (ent ? 'moi' : null)
        : tabArg === 'evaluations' ? (asEvaluator ? 'evaluations' : null)
        : tabArg === 'auto' ? (needsMe && ent?.statut !== 'cloture' ? 'moi' : null) : null;
      setTab(wanted || (asEvaluator ? 'evaluations' : ent ? 'moi' : v.data.isAdmin ? 'pilotage' : null));
    }).catch(e => setError(errMsg(e, 'Impossible de charger les entretiens professionnels.')));
  }, []);

  // Tutoriel de première connexion : s'ouvre une seule fois par personne et par profil, rouvrable depuis l'aide.
  const tutoRole: TutoRole | null = !me ? null
    : (me.isValideur || dsi?.isEvaluator || base?.isValideur) ? 'valideur'
      : (dsi?.entretien && dsi?.selfAccess?.allowed) ? 'agent'
        : me.isAdmin ? 'admin' : null;
  const tutoUser = dsi?.actor?.username || '';
  useEffect(() => {
    if (tutoRole && !tutoSeen(tutoRole, tutoUser)) setShowTuto(true);
  }, [tutoRole, tutoUser]);
  const closeTuto = () => { if (tutoRole) tutoMarkSeen(tutoRole, tutoUser); setShowTuto(false); };

  const tabs = [
    { key: 'moi' as const, label: 'Mon entretien', icon: <CalendarDays size={15} />, visible: !!dsi?.entretien && !!dsi?.selfAccess?.allowed },
    { key: 'evaluations' as const, label: 'EP que je réalise', icon: <ClipboardCheck size={15} />, visible: !!dsi?.isEvaluator || !!me?.isValideur || !!base?.isValideur, badge: dsi?.evaluatorCount || 0 },
    { key: 'equipe' as const, label: 'EP de mon équipe', icon: <Users size={15} />, visible: !!base?.isValideur },
    { key: 'agents' as const, label: 'Mes agents', icon: <Users size={15} />, visible: false },
    { key: 'pilotage' as const, label: 'Pilotage', icon: <TrendingUp size={15} />, visible: !!me?.isAdmin },
    { key: 'formations' as const, label: 'Demandes de formation', icon: <GraduationCap size={15} />, visible: !!me?.isAdmin },
    { key: 'parametrage' as const, label: 'Paramétrage', icon: <ShieldCheck size={15} />, visible: !!me?.isAdmin },
    { key: 'journal' as const, label: 'Journal', icon: <History size={15} />, visible: !!me?.isAdmin },
  ].filter(t => t.visible);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 1560, background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}`, background: '#fff', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>Entretiens professionnels</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{me?.campaign ? me.campaign.libelle || `Campagne ${me.campaign.annee}` : 'Campagne annuelle'} · tous les services de la Ville</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setShowAide(true)} title="Aide" style={{ border: 'none', background: '#eef2ff', color: COLORS.primary, height: 34, borderRadius: 8, cursor: 'pointer', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5 }}>
              <BookOpen size={16} /> Aide
            </button>
            <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 34, height: 34, borderRadius: 8, cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {error ? <Notice ok={false}>{error}</Notice> : !me ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={24} /></div> : (
            <>
              {!me.sedit_configured && (me.isAdmin || me.isValideur) && <Notice ok={false}>L’API SEDIT RH n’est pas configurée sur le serveur (SEDITRH_API_URL et SEDITRH_API_KEY) : la recherche d’agents est indisponible.</Notice>}
              {tabs.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', marginBottom: 18 }}>
                  {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', marginBottom: -2,
                      borderBottom: `2px solid ${tab === t.key ? COLORS.primary : 'transparent'}`, color: tab === t.key ? COLORS.primary : '#64748b', fontSize: 14, fontWeight: 600 }}>
                      {t.icon}{t.label}
                      {'badge' in t && !!t.badge && <span style={{ background: tab === t.key ? COLORS.primary : '#e2e8f0', color: tab === t.key ? '#fff' : '#475569', borderRadius: 999, padding: '1px 7px', fontSize: 10.5, fontWeight: 800 }}>{t.badge}</span>}
                    </button>
                  ))}
                </div>
              )}
              {tab === 'moi' && dsi && <MonEntretien data={dsi} onChanged={loadDsi} />}
              {tab === 'evaluations' && (dsi?.isEvaluator || me.isValideur || base?.isValideur) && <Evaluations onChanged={loadDsi} canReset={!!me.isAdmin} />}
              {tab === 'equipe' && base?.isValideur && <Evaluations endpoint="/api/ep-base/equipe" readOnly />}
              {tab === 'pilotage' && me.isAdmin && <Evaluations endpoint="/api/ep-base/pilotage" readOnly pilotage canReset={!!me.isAdmin} />}
              {tab === 'formations' && me.isAdmin && <Formations />}
              {tab === 'parametrage' && me.isAdmin && <Reglages onChanged={loadDsi} />}
              {tab === 'journal' && me.isAdmin && <Journal />}
              {tab === 'agents' && me.isValideur && <MesAgents campaignLabel={me.campaign?.libelle || (me.campaign ? `Campagne ${me.campaign.annee}` : 'Aucune campagne ouverte')} />}
              {tab === 'valideurs' && me.isAdmin && <ValideursAdmin />} {/* ancien onglet, masqué : remplacé par Paramétrage */}
              {!tab && <EmptyState icon={<ArrowRightLeft size={28} />} title="Aucun entretien à afficher" text="Vous n’avez pas d’entretien dans la campagne en cours et vous n’êtes pas valideur des entretiens professionnels." />}
            </>
          )}
        </div>
      </div>
      {showTuto && tutoRole && <TutoEp role={tutoRole} onClose={closeTuto} onOpenAide={() => setShowAide(true)} />}
      {showAide && (
        <AideEp
          onClose={() => setShowAide(false)}
          onTuto={tutoRole ? () => { setShowAide(false); setShowTuto(true); } : undefined}
          isAdmin={!!me?.isAdmin}
          features={{
            prep: !!dsi?.selfAccess?.enabled,
            aiDraft: !!dsi?.aiAccess?.draft?.allowed,
            aiReview: !!dsi?.aiAccess?.review?.allowed,
            esign: !!dsi?.esignAccess?.enabled,
          }}
        />
      )}
    </div>
  );
}
