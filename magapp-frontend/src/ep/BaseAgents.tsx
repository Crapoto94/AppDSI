import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Upload, Users, RefreshCw, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Mail } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnGhost, btnPrimary, card, input } from './ui';

interface Candidat { matricule: string; nom: string; fonction?: string; poste?: string }
interface BaseAgent {
  matricule: string; nom_prenom: string; modele: string; direction: string; service: string; poste: string; grade: string;
  chemin: string; unit_code: string; email: string; email_deduit?: boolean; ad_username: string; ad_status: string;
  valideur_candidats: Candidat[]; valideur_matricule: string; valideur_source: string; valideur_nom: string;
}
interface Stats {
  a_evaluer: number; avec_email: number; email_deduit: number; avec_valideur: number; valideur_a_choisir: number; sans_valideur: number;
  par_modele: Array<{ modele: string; n: number }>;
  facettes?: { directions: string[]; services: string[]; grades: string[] };
  dernier_import: { filename: string; uploaded_by: string; uploaded_at: string } | null;
  ad: { running: boolean; done: number; total: number; found: number; error: string };
}
interface Template { name: string; definition: { categorie: string; criteria_groups: Array<{ items: unknown[] }>; flags?: { objectifs_service?: boolean } } }

const AD_LABEL: Record<string, string> = {
  manuel: 'AD · associé à la main', matricule: 'AD · matricule', nom: 'AD · nom + prénom', ambigu: 'Plusieurs comptes AD possibles', introuvable: 'Introuvable dans l’AD', non_verifie: 'Non vérifié',
};

/** Valideur d'un agent : propositions automatiques, ou choix « à la main » parmi tous les agents (recherche). */
function ValideurCell({ agent, headers, onChoose }: { agent: BaseAgent; headers: Record<string, string>; onChoose: (matricule: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ matricule: string; nom: string; fonction?: string; poste?: string }>>([]);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try { const r = await axios.get('/api/ep-base/valideurs/search', { headers, params: { q } }); setHits(r.data.valideurs || []); } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, headers]);
  const cands = agent.valideur_candidats;
  const current = agent.valideur_nom || cands.find(c => c.matricule === agent.valideur_matricule)?.nom || '';
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {cands.length > 1 ? (
          <select style={{ ...input, padding: '5px 8px', fontSize: 12, maxWidth: 220, borderColor: agent.valideur_matricule ? COLORS.border : '#f59e0b' }}
            value={cands.some(c => c.matricule === agent.valideur_matricule) ? agent.valideur_matricule : ''} onChange={e => onChoose(e.target.value)}>
            <option value="">{agent.valideur_matricule ? current + ' (choix manuel)' : `— choisir (${cands.length} possibles) —`}</option>
            {cands.map(c => <option key={c.matricule} value={c.matricule}>{c.nom}{c.poste ? ` · ${c.poste}` : ''}</option>)}
          </select>
        ) : current ? <span>{current}</span> : <span style={{ fontSize: 12, color: '#b91c1c' }}>Aucun valideur</span>}
        {agent.valideur_source === 'admin' && <span style={{ fontSize: 10.5, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 7px' }}>choisi</span>}
        <button style={{ ...btnGhost, padding: '3px 8px', fontSize: 11.5 }} onClick={() => setOpen(o => !o)}>{open ? 'Fermer' : 'Choisir ailleurs…'}</button>
        {agent.valideur_matricule && agent.valideur_source === 'admin' && (
          <button style={{ ...btnGhost, padding: '3px 8px', fontSize: 11.5 }} onClick={() => onChoose('')} title="Revenir à la proposition automatique">Réinitialiser</button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 6, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, background: '#fff', maxWidth: 340 }}>
          <input autoFocus style={{ ...input, padding: '5px 8px', fontSize: 12 }} placeholder="Nom ou matricule du valideur (2 lettres min.)" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
            {hits.map(h => (
              <button key={h.matricule} onClick={() => { onChoose(h.matricule); setOpen(false); setQ(''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                <b>{h.nom}</b> <span style={{ color: COLORS.muted }}>· {h.poste || h.fonction || h.matricule}</span>
              </button>
            ))}
            {q.trim().length >= 2 && !hits.length && <div style={{ fontSize: 12, color: COLORS.muted, padding: 4 }}>Aucun agent trouvé.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** E-mail / compte AD d'un agent, avec recherche dans l'AD et association manuelle (agent introuvable ou mal rapproché). */
function AdCell({ agent, headers, onLinked, onError }: { agent: BaseAgent; headers: Record<string, string>; onLinked: () => void; onError: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ username: string; displayName: string; email: string; service: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await axios.get('/api/ep-base/ad/search', { headers, params: { q } }); setHits(r.data.users || []); }
      catch (e: any) { setHits([]); onError(e?.response?.data?.message || 'Recherche AD impossible.'); }
      finally { setBusy(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [q, open, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (username: string) => {
    try { await axios.put(`/api/ep-base/agents/${encodeURIComponent(agent.matricule)}/ad`, { username }, { headers }); setOpen(false); setQ(''); onLinked(); }
    catch (e: any) { onError(e?.response?.data?.message || 'Association impossible.'); }
  };
  const found = !!agent.email;
  return (
    <div>
      {found
        ? <><div>{agent.email}</div><div style={{ fontSize: 11, color: '#166534' }}>{AD_LABEL[agent.ad_status] || agent.ad_status}{agent.ad_username ? ` · ${agent.ad_username}` : ''}{agent.email_deduit ? ' · adresse déduite' : ''}</div></>
        : <div style={{ fontSize: 11.5, color: agent.ad_status === 'non_verifie' ? COLORS.muted : '#b45309' }}>{AD_LABEL[agent.ad_status] || agent.ad_status}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
        <button style={{ ...btnGhost, padding: '3px 8px', fontSize: 11.5 }}
          onClick={() => { setOpen(o => !o); if (!open && !q) setQ(agent.nom_prenom.split(' ')[0] || ''); }}>{open ? 'Fermer' : found ? 'Changer (AD)' : 'Rechercher dans l’AD'}</button>
        {found && agent.ad_status === 'manuel' && <button style={{ ...btnGhost, padding: '3px 8px', fontSize: 11.5 }} onClick={() => link('')}>Dissocier</button>}
      </div>
      {open && (
        <div style={{ marginTop: 6, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, background: '#fff', maxWidth: 360 }}>
          <input autoFocus style={{ ...input, padding: '5px 8px', fontSize: 12 }} placeholder="Nom, prénom, identifiant ou e-mail dans l’AD…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6 }}>
            {busy && <div style={{ fontSize: 12, color: COLORS.muted, padding: 4 }}>Recherche…</div>}
            {hits.map(h => (
              <button key={h.username} onClick={() => link(h.username)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                <b>{h.displayName}</b> <span style={{ color: COLORS.muted }}>· {h.username}{h.email ? ` · ${h.email}` : ' · pas d’e-mail'}{h.service ? ` · ${h.service}` : ''}</span>
              </button>
            ))}
            {!busy && q.trim().length >= 2 && !hits.length && <div style={{ fontSize: 12, color: COLORS.muted, padding: 4 }}>Aucun compte trouvé : essayez un autre mot (prénom ou nom d’usage).</div>}
          </div>
        </div>
      )}
    </div>
  );
}

interface TreeNode extends BaseAgent { a_conserver: boolean; est_valideur: boolean }

/** Vue hiérarchique globale : valideurs et agents (chaque agent sous son valideur), valideur modifiable sur chaque ligne. */
interface ViewFilters { q: string; modele: string; statut: string; direction: string; service: string; grade: string }

function HierarchyView({ headers, reloadKey, onChoose, filters }: { headers: Record<string, string>; reloadKey: number; onChoose: (a: BaseAgent, m: string) => Promise<void>; filters: ViewFilters }) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    axios.get('/api/ep-base/tree', { headers }).then(r => setNodes(r.data.nodes || [])).catch(() => setNodes([])).finally(() => setLoading(false));
  }, [headers, reloadKey]);

  const { children, roots, byId } = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.matricule, n]));
    const children = new Map<string, TreeNode[]>();
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      const p = n.valideur_matricule && byId.has(n.valideur_matricule) && n.valideur_matricule !== n.matricule ? n.valideur_matricule : '';
      if (p) { if (!children.has(p)) children.set(p, []); children.get(p)!.push(n); } else roots.push(n);
    }
    const byName = (a: TreeNode, b: TreeNode) => a.nom_prenom.localeCompare(b.nom_prenom);
    children.forEach(l => l.sort(byName)); roots.sort(byName);
    return { children, roots, byId };
  }, [nodes]);

  const count = useCallback((id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0; seen.add(id);
    let n = 0; for (const c of children.get(id) || []) n += (c.a_conserver ? 1 : 0) + count(c.matricule, seen);
    return n;
  }, [children]);

  const { q, modele, statut, direction, service, grade } = filters;
  const ql = q.trim().toLowerCase();
  const filtering = !!(ql || modele || statut || direction || service || grade);
  // Avec un filtre : on ne garde que les agents qui correspondent, plus la chaîne de leurs valideurs (dépliée).
  const matchSet = useMemo(() => {
    if (!filtering) return null;
    const set = new Set<string>();
    for (const n of nodes) {
      if (!n.a_conserver) continue;
      if (ql && !n.nom_prenom.toLowerCase().includes(ql) && !n.matricule.includes(ql) && !(n.service || '').toLowerCase().includes(ql)) continue;
      if (modele && n.modele !== modele) continue;
      if (direction && n.direction !== direction) continue;
      if (service && n.service !== service) continue;
      if (grade && n.grade !== grade) continue;
      if (statut === 'sans_email' && n.email) continue;
      if (statut === 'avec_email' && !n.email) continue;
      if (statut === 'email_deduit' && !n.email_deduit) continue;
      if (statut === 'avec_valideur' && !n.valideur_matricule) continue;
      if (statut === 'sans_valideur' && !(n.valideur_candidats.length === 0 && !n.valideur_matricule)) continue;
      if (statut === 'valideur_a_choisir' && !(n.valideur_candidats.length > 1 && !n.valideur_matricule)) continue;
      let cur: TreeNode | undefined = n; const guard = new Set<string>();
      while (cur && !guard.has(cur.matricule)) { set.add(cur.matricule); guard.add(cur.matricule); cur = byId.get(cur.valideur_matricule); }
    }
    return set;
  }, [filtering, ql, modele, statut, direction, service, grade, nodes, byId]);

  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setOpen(open.size ? new Set() : new Set([...children.keys()]));

  const render = (n: TreeNode, depth: number, trail: Set<string>): React.ReactNode => {
    if (trail.has(n.matricule)) return null;
    if (matchSet && !matchSet.has(n.matricule)) return null;
    const kids = children.get(n.matricule) || [];
    const isOpen = !!matchSet || open.has(n.matricule);
    const nbDesc = kids.length ? count(n.matricule) : 0;
    const next = new Set(trail); next.add(n.matricule);
    return (
      <div key={n.matricule}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 10px', paddingLeft: 10 + depth * 24, borderBottom: `1px solid ${COLORS.border}`, background: kids.length ? '#fafbff' : '#fff' }}>
          <button onClick={() => kids.length && toggle(n.matricule)} style={{ border: 'none', background: 'none', cursor: kids.length ? 'pointer' : 'default', width: 18, padding: 0, color: COLORS.muted, fontSize: 12 }}>
            {kids.length ? (isOpen ? '▾' : '▸') : ''}
          </button>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: kids.length ? 800 : 600 }}>
              {n.nom_prenom}
              {kids.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px' }}>{nbDesc} agent{nbDesc > 1 ? 's' : ''}</span>}
              {!n.a_conserver && <span style={{ marginLeft: 6, fontSize: 10.5, color: COLORS.muted }}>(non évalué)</span>}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.muted }}>{n.poste}{n.service ? ` · ${n.service}` : ''}{n.modele ? ` · ${n.modele.replace(/^Template_/i, '')}` : ''}</div>
          </div>
          {n.a_conserver && <div style={{ minWidth: 230 }}><ValideurCell agent={n} headers={headers} onChoose={m => onChoose(n, m)} /></div>}
        </div>
        {isOpen && kids.map(c => render(c, depth + 1, next))}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={20} className="spin" /></div>;
  const sansValideur = roots.filter(r => r.a_conserver && r.valideur_candidats.length === 0 && !r.valideur_matricule);
  const tops = roots.filter(r => !sansValideur.includes(r));
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button style={btnGhost} onClick={toggleAll}>{open.size ? 'Tout replier' : 'Tout déplier'}</button>
      </div>
      <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, maxHeight: 620, overflowY: 'auto' }}>
        {tops.map(r => render(r, 0, new Set()))}
        {sansValideur.length > 0 && (!matchSet || sansValideur.some(r => matchSet.has(r.matricule))) && (
          <div>
            <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#b91c1c', background: '#fef2f2' }}>
              Sans valideur ({sansValideur.length}) : affectez-en un avec « Choisir ailleurs… »
            </div>
            {sansValideur.map(r => render(r, 1, new Set()))}
          </div>
        )}
        {!nodes.length && <div style={{ padding: 16, textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>Aucune donnée.</div>}
      </div>
    </div>
  );
}

/**
 * Administration des entretiens : base des agents à évaluer, issue du classeur « Outil CREP DSI.xlsm »
 * (onglet Base_agents, « à conserver » = O), avec modèle de CREP (onglet Template_*), valideur proposé et adresse e-mail (AD).
 */
export default function BaseAgents() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<BaseAgent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [modele, setModele] = useState('');
  const [statut, setStatut] = useState('');
  const [direction, setDirection] = useState('');
  const [service, setService] = useState('');
  const [grade, setGrade] = useState('');
  const [vue, setVue] = useState<'liste' | 'hierarchie'>('liste');
  const [treeKey, setTreeKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, t] = await Promise.all([
        axios.get('/api/ep-base/stats', { headers }),
        axios.get('/api/ep-base/agents', { headers, params: { q: q || undefined, modele: modele || undefined, statut: statut || undefined, direction: direction || undefined, service: service || undefined, grade: grade || undefined } }),
        axios.get('/api/ep-base/templates', { headers }),
      ]);
      setStats(s.data); setAgents(a.data.agents || []); setTemplates(t.data.templates || []);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
    finally { setLoading(false); }
  }, [headers, q, modele, statut, direction, service, grade]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  // Suivi du rapprochement AD en arrière-plan
  useEffect(() => {
    if (!stats?.ad?.running) return;
    const t = setInterval(async () => {
      try {
        const r = await axios.get('/api/ep-base/ad-refresh', { headers });
        setStats(s => (s ? { ...s, ad: r.data } : s));
        if (!r.data.running) load();
      } catch { /* on réessaie */ }
    }, 3000);
    return () => clearInterval(t);
  }, [stats?.ad?.running, headers, load]);

  const upload = async (file: File) => {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await axios.post('/api/ep-base/import', fd, { headers });
      const d = r.data;
      const en = d.entretiens || {};
      setMsg({ ok: !en.erreur, text: `${d.a_evaluer} agent(s) à évaluer sur ${d.agents} · ${d.modeles.length} modèle(s) de CREP lus · ${d.a_choisir} valideur(s) à choisir · ${d.sans_valideur} agent(s) sans valideur trouvé.${en.erreur ? ' Entretiens non générés : ' + en.erreur : ` Entretiens : ${en.crees || 0} créé(s), ${en.mis_a_jour || 0} mis à jour.`}` });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Import impossible.' }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const syncEntretiens = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post('/api/ep-base/entretiens/sync', {}, { headers });
      const d = r.data;
      setMsg({ ok: !d.erreurs?.length, text: `Entretiens : ${d.crees} créé(s), ${d.mis_a_jour} mis à jour, ${d.retires} retiré(s), ${d.deja_commences} déjà commencé(s) (inchangés), ${d.sans_valideur} agent(s) sans valideur (aucun entretien).${d.erreurs?.length ? ' Erreurs : ' + d.erreurs.slice(0, 3).join(' · ') : ''}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || ('Génération impossible' + (e?.response?.status ? ' (HTTP ' + e.response.status + ')' : ' : ' + (e?.message || ''))) }); }
    finally { setBusy(false); }
  };

  const purgeLegacy = async () => {
    if (!window.confirm('Supprimer TOUS les anciens entretiens (tests, DSI comprise) et TOUS les anciens valideurs avec leurs listes d’agents ?\n\nSeuls les entretiens générés depuis la base des agents sont conservés. Les entretiens supprimés sont masqués (suppression logique).')) return;
    if (window.prompt('Tapez SUPPRIMER pour confirmer') !== 'SUPPRIMER') return;
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post('/api/ep-base/entretiens/purge', { confirm: 'SUPPRIMER' }, { headers });
      const d = r.data;
      setMsg({ ok: !d.erreurs?.length, text: `${d.entretiens} ancien(s) entretien(s), ${d.valideurs} ancien(s) valideur(s) et ${d.listes} liste(s) d’agents supprimé(s).${d.erreurs?.length ? ' Erreurs : ' + d.erreurs.join(' · ') : ''}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || ('Suppression impossible' + (e?.response?.status ? ' (HTTP ' + e.response.status + (e.response.status === 404 ? ' : route absente, le backend n’a pas été redémarré avec la nouvelle version ?' : '') + ')' : ' : ' + (e?.message || ''))) }); }
    finally { setBusy(false); }
  };

  const refreshAd = async (all: boolean) => {
    setMsg(null);
    try {
      const r = await axios.post('/api/ep-base/ad-refresh', { all }, { headers });
      setStats(s => (s ? { ...s, ad: r.data } : s));
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Rapprochement AD impossible.' }); }
  };

  const chooseValideur = async (a: BaseAgent, matricule: string) => {
    try {
      await axios.put(`/api/ep-base/agents/${encodeURIComponent(a.matricule)}/valideur`, { valideur_matricule: matricule }, { headers });
      setAgents(list => list.map(x => x.matricule === a.matricule ? {
        ...x, valideur_matricule: matricule, valideur_source: matricule ? 'admin' : '',
        valideur_nom: x.valideur_candidats.find(c => c.matricule === matricule)?.nom || x.valideur_nom,
      } : x));
      setTreeKey(k => k + 1);
      load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); }
  };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.muted, padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: 12.5, padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`, verticalAlign: 'top' };
  const ad = stats?.ad;

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          <Users size={17} color={COLORS.primary} /> Agents à évaluer
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".xlsm,.xlsx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <button style={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Déposer le classeur (Outil CREP)
          </button>
          <button style={btnGhost} disabled={busy || !stats?.a_evaluer} onClick={syncEntretiens} title="Crée l’entretien de chaque agent qui a un valideur (l’évaluateur est son valideur)">
            <Users size={14} /> Générer les entretiens
          </button>
          <button style={{ ...btnGhost, color: '#b91c1c' }} disabled={busy} onClick={purgeLegacy} title="Supprime les anciens entretiens de test">
            Supprimer les anciens entretiens
          </button>
          <button style={btnGhost} disabled={!!ad?.running || !stats?.a_evaluer} onClick={() => refreshAd(false)} title="Cherche l’adresse e-mail dans l’AD (matricule, puis nom + prénom)">
            <Mail size={14} /> Rapprocher avec l’AD
          </button>
          <button style={btnGhost} disabled={!!ad?.running || !stats?.a_evaluer} onClick={() => refreshAd(true)} title="Refait aussi les agents déjà rapprochés">
            <RefreshCw size={14} /> Tout refaire
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
        Source : onglet <b>Base_agents</b> du classeur (agents dont « à conserver » = O). Le champ <b>Modèle</b> désigne le formulaire de CREP (un onglet <b>Template_*</b> = un modèle).
        Le valideur est proposé d’après le « Chemin publication » (code de l’unité) et le « Poste fonction » (Direc, DGA_1, DGS_1, DGST_, Respo). Redéposer le classeur met tout à jour ; vos choix de valideur sont conservés.
      </p>

      {msg && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12.5,
          background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#166534' : '#991b1b', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {msg.text}
        </div>
      )}

      {stats && !stats.dernier_import && !loading && (
        <div style={{ padding: 18, textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>
          <FileSpreadsheet size={26} style={{ marginBottom: 6 }} /><br />Aucun classeur déposé : déposez « Outil CREP DSI.xlsm » pour charger les agents et les modèles.
        </div>
      )}

      {stats && stats.dernier_import && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
            {([
              ['Agents à évaluer', stats.a_evaluer, COLORS.primary, ''],
              ['Avec e-mail (AD)', stats.avec_email, '#166534', 'avec_email'],
              ['Dont adresse déduite', stats.email_deduit, '#b45309', 'email_deduit'],
              ['Valideur défini', stats.avec_valideur, '#166534', 'avec_valideur'],
              ['Valideur à choisir', stats.valideur_a_choisir, '#b45309', 'valideur_a_choisir'],
              ['Sans valideur trouvé', stats.sans_valideur, '#b91c1c', 'sans_valideur'],
            ] as Array<[string, number, string, string]>).map(([l, v, c, k]) => {
              const active = statut === k;
              return (
                <button key={l} onClick={() => setStatut(k)} title="Filtrer la liste et la hiérarchie"
                  style={{ border: `1px solid ${active ? c : COLORS.border}`, background: active ? '#f8fafc' : '#fff', boxShadow: active ? `0 0 0 2px ${c}33` : 'none',
                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ color: COLORS.muted }}>{l}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 10 }}>
            Dernier dépôt : {stats.dernier_import.filename} · {new Date(stats.dernier_import.uploaded_at).toLocaleString('fr-FR')} · {stats.dernier_import.uploaded_by}
          </div>
          {ad?.running && (
            <div style={{ fontSize: 12.5, color: COLORS.primary, marginBottom: 10 }}>
              <Loader2 size={13} className="spin" /> Rapprochement AD en cours : {ad.done} / {ad.total} · {ad.found} trouvé(s)
            </div>
          )}
          {ad?.error && !ad.running && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>Erreur AD : {ad.error}</div>}

          {templates.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {templates.map(t => {
                const n = stats.par_modele.find(m => m.modele === t.name)?.n || 0;
                const nb = t.definition.criteria_groups.reduce((s, g) => s + g.items.length, 0);
                return (
                  <button key={t.name} onClick={() => setModele(modele === t.name ? '' : t.name)}
                    title={`${nb} critères de grille${t.definition.flags?.objectifs_service === false ? ' · sans « objectifs du service »' : ''}`}
                    style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${modele === t.name ? COLORS.primary : COLORS.border}`, background: modele === t.name ? '#eef2ff' : '#fff',
                      color: modele === t.name ? COLORS.primary : '#64748b' }}>
                    {t.name.replace(/^Template_/i, '')} <span style={{ opacity: .7 }}>· {n}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {([['liste', 'Liste'], ['hierarchie', 'Hiérarchie (vue globale)']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setVue(k)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${vue === k ? COLORS.primary : COLORS.border}`, background: vue === k ? '#eef2ff' : '#fff', color: vue === k ? COLORS.primary : '#64748b' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input style={{ ...input, maxWidth: 260 }} placeholder="Rechercher (nom, matricule, service)…" value={q} onChange={e => setQ(e.target.value)} />
            <select style={{ ...input, maxWidth: 230 }} value={statut} onChange={e => setStatut(e.target.value)}>
              <option value="">Tous les agents</option>
              <option value="valideur_a_choisir">Valideur à choisir</option>
              <option value="sans_valideur">Sans valideur trouvé</option>
              <option value="sans_email">Sans e-mail</option>
              <option value="avec_email">Avec e-mail</option>
              <option value="email_deduit">Adresse déduite (AD sans e-mail)</option>
              <option value="avec_valideur">Valideur défini</option>
            </select>
            <select style={{ ...input, maxWidth: 220 }} value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="">Toutes les directions</option>
              {(stats?.facettes?.directions || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={{ ...input, maxWidth: 220 }} value={service} onChange={e => setService(e.target.value)}>
              <option value="">Tous les services</option>
              {(stats?.facettes?.services || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={{ ...input, maxWidth: 220 }} value={grade} onChange={e => setGrade(e.target.value)}>
              <option value="">Tous les grades</option>
              {(stats?.facettes?.grades || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {vue === 'liste' && <span style={{ alignSelf: 'center', fontSize: 12, color: COLORS.muted }}>{agents.length} agent(s) affiché(s)</span>}
          </div>
          {vue === 'hierarchie' && <HierarchyView headers={headers} reloadKey={treeKey} onChoose={(a, m) => chooseValideur(a, m)} filters={{ q, modele, statut, direction, service, grade }} />}
          {vue === 'liste' && <>

          {loading ? <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={20} className="spin" /></div> : (
            <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr><th style={th}>Agent</th><th style={th}>Modèle</th><th style={th}>Service</th><th style={th}>E-mail</th><th style={th}>Valideur</th></tr>
                </thead>
                <tbody>
                  {agents.slice(0, 600).map(a => (
                    <tr key={a.matricule}>
                      <td style={td}><div style={{ fontWeight: 700 }}>{a.nom_prenom}</div><div style={{ fontSize: 11, color: COLORS.muted }}>{a.matricule} · {a.grade}</div></td>
                      <td style={td}>{a.modele.replace(/^Template_/i, '')}</td>
                      <td style={td}><div>{a.service}</div><div style={{ fontSize: 11, color: COLORS.muted }}>{a.unit_code}</div></td>
                      <td style={td}><AdCell agent={a} headers={headers} onLinked={load} onError={t => setMsg({ ok: false, text: t })} /></td>
                      <td style={td}><ValideurCell agent={a} headers={headers} onChoose={m => chooseValideur(a, m)} /></td>
                    </tr>
                  ))}
                  {!agents.length && <tr><td style={{ ...td, textAlign: 'center', color: COLORS.muted }} colSpan={5}>Aucun agent.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {agents.length > 600 && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 6 }}>Les 600 premiers agents sont affichés : affinez la recherche.</div>}
          </>}
        </>
      )}
    </div>
  );
}
