import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Search, Users, ClipboardCheck, CalendarClock, TrendingUp, Eye, AlertTriangle, FileDown, Printer, UserPlus, UserCog, Loader2, X, Mail, Link2, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Undo2, MoreHorizontal, ScanLine, Inbox } from 'lucide-react';
import { useAuth } from './useAuth';
import type { Campaign, Entretien, Stats } from './types';
import { STATUTS, formatDateCourte, nomComplet, personneNom, repairText } from './types';
import EntretienDetailModal from './EntretienDetailModal';
import PlanningModal from './PlanningModal';
import { Avatar, Badge, COLORS, EmptyState, KpiCard, Td, Th, btnDanger, btnGhost, btnPrimary, card, input, useConfirm } from './ui';
import { useDocViewer } from './DocViewerModal';

/**
 * Tableau de bord des EP. Par défaut : ceux que je réalise (évaluateur). Avec `endpoint=/api/ep-ville/equipe` et `readOnly` :
 * les EP des agents placés sous ma responsabilité (cascade de valideurs, ou toute ma direction), en lecture seule.
 */
/** Pastille d'information (grade, direction, service). */
const Pill = ({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) => (
  <span style={{ background: bg, color, borderRadius: 6, padding: '1px 7px', fontSize: 10.5, fontWeight: 700, lineHeight: 1.6, whiteSpace: 'nowrap' }}>{children}</span>
);
const foldTxt = (v?: string | null) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Service, seulement s'il diffère de la direction. */
const uniteService = (e: Entretien) => ((e.service || '').trim() && foldTxt(e.service) !== foldTxt(e.direction) ? (e.service || '').trim() : '');

// ─── Pilotage : découpage par direction \ service \ secteur (chemin de publication) ─────────────────
const segs = (e: Entretien) => String(e.chemin || '').split('\\').map(x => x.trim()).filter(Boolean);
const isDone = (e: Entretien) => ['realise', 'cloture'].includes(e.statut);
const nowIso = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Les mêmes indicateurs que ceux du serveur, recalculés sur la sélection (direction, service, secteur). */
function localStats(rows: Entretien[]): Stats {
  const now = nowIso();
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const p = (n: number) => String(n).padStart(2, '0');
  const lim = `${in7.getFullYear()}-${p(in7.getMonth() + 1)}-${p(in7.getDate())}T${p(in7.getHours())}:${p(in7.getMinutes())}`;
  let realises = 0, planifies = 0, aVenir = 0, retard = 0;
  for (const r of rows) {
    const d = String(r.date_entretien || '').slice(0, 16).replace(' ', 'T');
    if (isDone(r)) realises++;
    else if (d) planifies++;
    if (d && d >= now && d <= lim) aVenir++;
    if (d && d < now && !isDone(r)) retard++;
  }
  return { total: rows.length, planifies, realises, a_venir_7j: aVenir, en_retard: retard, taux_realisation: rows.length ? Math.round((realises / rows.length) * 100) : 0 } as unknown as Stats;
}

interface PNode { key: string; label: string; total: number; done: number; children: Map<string, PNode> }
function buildTree(rows: Entretien[]): PNode {
  const root: PNode = { key: '', label: 'Ville', total: 0, done: 0, children: new Map() };
  for (const e of rows) {
    const path = segs(e).slice(0, 3);
    let node = root; node.total++; if (isDone(e)) node.done++;
    for (let i = 0; i < path.length; i++) {
      const key = path.slice(0, i + 1).join('\\');
      let child = node.children.get(key);
      if (!child) { child = { key, label: path[i], total: 0, done: 0, children: new Map() }; node.children.set(key, child); }
      child.total++; if (isDone(e)) child.done++;
      node = child;
    }
  }
  return root;
}

/** Avancement des entretiens (% réalisés) par direction, déroulable par service puis par secteur. */
function ProgressTree({ rows }: { rows: Entretien[] }) {
  const root = useMemo(() => buildTree(rows), [rows]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Par défaut : seules les directions sont affichées (déroulées depuis la racine) ; services et secteurs restent repliés, l'utilisateur les déplie à sa guise
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || root.total === 0) return;
    autoOpened.current = true;
    setOpen(new Set<string>(['']));
  }, [root]);
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const render = (n: PNode, depth: number): React.ReactNode => {
    const pct = n.total ? Math.round((n.done / n.total) * 100) : 0;
    const kids = [...n.children.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    const isOpen = open.has(n.key);
    return (
      <div key={n.key || 'root'}>
        <div onClick={() => kids.length && toggle(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', paddingLeft: 10 + depth * 22, borderBottom: `1px solid ${COLORS.border}`, cursor: kids.length ? 'pointer' : 'default' }}>
          <span style={{ width: 14, color: COLORS.muted, fontSize: 12 }}>{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
          <div style={{ flex: '0 1 340px', minWidth: 160, fontSize: depth === 0 ? 13.5 : 12.5, fontWeight: depth < 2 ? 800 : 600 }}>{n.label}</div>
          <div style={{ flex: 1, minWidth: 100 }}><div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}><div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? COLORS.success : COLORS.primary, borderRadius: 999 }} /></div></div>
          <div style={{ width: 120, textAlign: 'right', fontSize: 12, color: '#475569' }}><b>{pct} %</b> <span style={{ color: '#94a3b8' }}>({n.done}/{n.total})</span></div>
        </div>
        {isOpen && kids.map(c => render(c, depth + 1))}
      </div>
    );
  };
  const dirs = [...root.children.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return (
    <div style={{ ...card, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 800, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` }}>Avancement par direction <span style={{ fontWeight: 500, color: COLORS.muted, fontSize: 12 }}>(entretiens réalisés, cliquez pour dérouler les services et secteurs)</span></div>
      {render({ ...root, label: 'Ensemble', key: '' }, 0)}
      {dirs.length === 0 && <div style={{ padding: 14, color: COLORS.muted, fontSize: 12.5 }}>Aucune donnée.</div>}
    </div>
  );
}

/** Valideur sans adresse e-mail : il n’utilise pas l’outil, ses EP sont gérés (planification, saisie, scan signé) par son N+1. */
const sansMailValideur = (e: Entretien) => !(e.evaluator_email || '').trim();

/** Où en est le compte rendu après sa validation : à envoyer / à imprimer, chez l’agent, en signature, signé. */
function crepEtat(e: Entretien): { label: string; hint?: string; color: string; bg: string } | null {
  if (e.evaluation_statut !== 'soumis') return null;
  const cs = e.crep_statut || 'non_envoye';
  if (cs === 'signe_papier') return { label: 'Signé (papier)', hint: 'CREP manuscrit archivé', color: '#065f46', bg: '#d1fae5' };
  if (cs === 'envoye_agent') return { label: 'Chez l’agent·e', hint: 'En attente de sa relecture et de sa validation', color: '#6b21a8', bg: '#f3e8ff' };
  if (cs === 'en_signature') {
    const ps = e.crep_parapheur_status || '';
    if (ps === 'termine') return { label: 'Signé', hint: 'Parapheur terminé', color: '#065f46', bg: '#d1fae5' };
    if (ps === 'refuse' || ps === 'annule') return { label: ps === 'refuse' ? 'Signature refusée' : 'Signature annulée', hint: 'Reprendre : envoyer de nouveau ou passer au papier', color: '#991b1b', bg: '#fee2e2' };
    return { label: 'En signature', hint: 'Parapheur en cours', color: '#9a3412', bg: '#ffedd5' };
  }
  const paper = !(e.agent_email || '').trim() || sansMailValideur(e);
  return paper
    ? { label: 'À imprimer et signer', hint: 'Circuit papier : imprimer, faire signer, scanner', color: '#92400e', bg: '#fef3c7' }
    : { label: 'À envoyer', hint: 'Cliquer sur « Envoyer à l’agent·e » (ou passer au papier)', color: '#1e40af', bg: '#dbeafe' };
}

export default function Evaluations({ onChanged, endpoint = '/api/entretiens/evaluateur', readOnly = false, pilotage = false, canReset = false, noActions = false }: { onChanged?: () => void; endpoint?: string; readOnly?: boolean; pilotage?: boolean; canReset?: boolean; noActions?: boolean }) {
  const { token } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [openViewer, viewerElement, openViews] = useDocViewer();
  const [menu, setMenu] = useState<{ e: Entretien; x: number; y: number } | null>(null);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  /** Aperçu du CREP (administrateur) : choix entre le CREP numérisé (document téléversé) et le CREP reconstruit. */
  const openApercu = (e: Entretien) => {
    const scans = e.crep_scans || [];
    const blob = async (url: string) => (await axios.get(url, { headers, responseType: 'blob' })).data as Blob;
    const views = [
      ...(e.crep_signed_at ? [{ label: 'CREP numérisé', fetch: () => blob(`/api/entretiens/${e.id}/crep-signe.pdf`) }]
        : scans.length ? [{ label: 'CREP numérisé', fetch: () => blob(`/api/entretiens/${e.id}/crep/scans/${scans.length - 1}.pdf`) }] : []),
      { label: scans.slice(-1)[0]?.kind === 'agent' ? 'Éléments relevés' : 'CREP reconstruit', fetch: () => blob(`/api/entretiens/${e.id}/${e.lecture_arriere_plan ? 'crep/digital.pdf' : 'crep.pdf'}`) },
    ];
    openViews(`Aperçu du CREP — ${e.agent_prenom || ''} ${e.agent_nom || ''}`.trim(), views, 0);
  };

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Entretien[]>([]);
  // Fiche et chef hiérarchique de chaque évaluateur·rice (vue « EP de mon équipe »), même sans EP propre dans la liste
  type EvalInfo = { matricule?: string; nom?: string; poste?: string; grade?: string; direction?: string; service?: string; email?: string; valideur_matricule?: string };
  const [evalInfo, setEvalInfo] = useState<Record<string, EvalInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [valideur, setValideur] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [page, setPage] = useState(1);
  const [openEvaluators, setOpenEvaluators] = useState<Set<string>>(new Set());
  // Lien d'un mail : ouvre directement l'entretien indiqué (sessionStorage posé par EpVille)
  const [openId, setOpenId] = useState<number | null>(() => {
    try { const v = sessionStorage.getItem('ep_open_entretien'); if (v) { sessionStorage.removeItem('ep_open_entretien'); return Number(v) || null; } } catch { /* ignore */ }
    return null;
  });
  const [planning, setPlanning] = useState<Entretien | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printBusy, setPrintBusy] = useState<'blank' | 'filled' | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addItems, setAddItems] = useState<Entretien[]>([]);
  const [addQ, setAddQ] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [reassignFor, setReassignFor] = useState<Entretien | null>(null);
  const [reassignCandidates, setReassignCandidates] = useState<Array<{ matricule: string; nom: string; fonction?: string; poste?: string; email?: string }>>([]);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignMsg, setReassignMsg] = useState<string | null>(null);
  const [reassignQ, setReassignQ] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkFor, setLinkFor] = useState<Entretien | null>(null);
  const [razBusy, setRazBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    axios.get(endpoint, { headers })
      .then(r => {
        setCampaign(r.data.campaign || null);
        setStats(r.data.stats || null);
        setItems(Array.isArray(r.data.items) ? r.data.items : []);
        setEvalInfo(r.data.evaluateurs && typeof r.data.evaluateurs === 'object' ? r.data.evaluateurs : {});
      })
      .catch(e => setError(e.response?.data?.message || 'Impossible de charger vos entretiens'))
      .finally(() => setLoading(false));
  }, [token, endpoint]);

  useEffect(load, [load]);

  const openSigned = async (id: number) => {
    try {
      await openViewer('CREP signé', async () => (await axios.get(`/api/entretiens/${id}/crep-signe.pdf`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })).data);
    } catch { setError('PDF signé indisponible.'); }
  };

  const printCrep = async (mode: 'blank' | 'filled', ids?: number[]) => {
    const list = ids || [...selected];
    if (!list.length) { setError('Sélectionnez au moins un entretien.'); return; }
    setPrintBusy(mode); setError(null);
    try {
      await openViewer(mode === 'blank' ? 'CREP vierge' : 'CREP', async () => (await axios.post('/api/entretiens/print/crep', { ids: list, mode }, { headers, responseType: 'blob' })).data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impression impossible.');
    } finally { setPrintBusy(null); }
  };

  // « Dévalider » un CREP (administrateurs, erreur manifeste) : l'évaluateur peut à nouveau le modifier
  const unvalidateEp = async (e: Entretien) => {
    const nom = nomComplet(e);
    const reason = window.prompt(`Dévalider le CREP de ${nom} ?

Il redeviendra modifiable par son évaluateur. À n'utiliser qu'en cas d'erreur manifeste.

Motif (obligatoire) :`, '');
    if (!reason || reason.trim().length < 5) return;
    setRazBusy(e.id);
    try {
      await axios.post(`/api/entretiens/${e.id}/crep/unvalidate`, { reason }, { headers });
      setNotice({ ok: true, text: `CREP de ${nom} dévalidé : son évaluateur peut le modifier.` });
      load(); onChanged?.();
    } catch (err: any) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Dévalidation impossible.' });
    } finally { setRazBusy(null); }
  };

  const resetEp = async (e: Entretien) => {
    const nom = nomComplet(e);
    const ok = await confirm(
      `Remettre à zéro l'EP de ${nom} ?\n\n` +
      `Seront supprimés : le rendez-vous et l'invitation Outlook, la préparation, le compte rendu, les commentaires, les objectifs, les formations et les pièces jointes (CREP signé).\n\n` +
      `L'agent·e et son évaluateur sont conservés. Cette action est irréversible.`,
      { title: 'RAZ – Remettre l’EP à zéro', confirmLabel: 'Remettre à zéro', danger: true }
    );
    if (!ok) return;
    setRazBusy(e.id);
    try {
      const r = await axios.post(`/api/entretiens/${e.id}/reset`, {}, { headers });
      const warns = Array.isArray(r.data?.warnings) ? r.data.warnings : [];
      setNotice({ ok: true, text: `EP de ${nom} remis à zéro.${warns.length ? ' ' + warns.join(' ') : ''}` });
      load(); onChanged?.();
    } catch (err: any) {
      setNotice({ ok: false, text: err.response?.data?.message || 'RAZ impossible.' });
    } finally { setRazBusy(null); }
  };

  const loadAdd = useCallback((q = addQ) => {
    setAddBusy(true); setAddMsg(null);
    axios.get('/api/entretiens/evaluateur/sans-evaluateur', { headers, params: { q: q || undefined } })
      .then(r => setAddItems(Array.isArray(r.data?.items) ? r.data.items : []))
      .catch(e => setAddMsg(e.response?.data?.message || 'Impossible de charger les agent·e·s sans évaluateur.'))
      .finally(() => setAddBusy(false));
  }, [headers, addQ]);

  const openAdd = () => { setShowAdd(true); setAddQ(''); loadAdd(''); };
  const claim = async (id: number) => {
    setAddBusy(true); setAddMsg(null);
    try {
      await axios.post(`/api/entretiens/evaluateur/agents/${id}/claim`, {}, { headers });
      await load();
      setShowAdd(false);
      setNotice({ ok: true, text: 'Agent·e ajouté : vous êtes désormais son évaluateur.' });
    } catch (e: any) { setAddMsg(e.response?.data?.message || 'Ajout impossible.'); }
    finally { setAddBusy(false); }
  };

  const openReassign = async (e: Entretien) => {
    setReassignFor(e); setReassignMsg(null); setReassignCandidates([]); setReassignQ('');
    try {
      const r = await axios.get(`/api/entretiens/${e.id}/evaluator-candidates`, { headers });
      setReassignCandidates(Array.isArray(r.data?.candidates) ? r.data.candidates : []);
    } catch (err: any) { setReassignMsg(err.response?.data?.message || 'Chargement des évaluateurs impossible.'); }
  };
  const doReassign = async (matricule: string) => {
    if (!reassignFor) return;
    setReassignBusy(true); setReassignMsg(null);
    try {
      await axios.post(`/api/entretiens/${reassignFor.id}/reassign-evaluator`, { evaluator_matricule: matricule }, { headers });
      await load();
      setNotice({ ok: true, text: 'Évaluateur changé avec succès.' });
      setReassignFor(null);
    } catch (e: any) { setReassignMsg(e.response?.data?.message || 'Changement impossible.'); }
    finally { setReassignBusy(false); }
  };

  const toggleSelect = (id: number) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = (ids: number[]) => setSelected(new Set(ids));


  const [fDir, setFDir] = useState('');
  const [fSvc, setFSvc] = useState('');
  const [fSec, setFSec] = useState('');
  const [fCat, setFCat] = useState('');
  // Lecture en arrière-plan (réglage « Lecture des entretiens numérisés » désactivé) : filtre pour les sélectionner ou les écarter
  const [fLecture, setFLecture] = useState<'' | 'avec' | 'sans'>('');
  // Les compteurs du haut sont cliquables : un clic filtre la liste (un second clic retire le filtre)
  const [kpiF, setKpiF] = useState<'' | 'planifies' | 'a_venir' | 'realises' | 'retard' | 'recus_drh' | 'a_transmettre'>('');
  const toggleKpi = (k: typeof kpiF) => { if (k === 'realises') setOnlyTodo(false); setKpiF(cur => (cur === k ? '' : k)); };
  const dirOptions = useMemo(() => [...new Set(items.map(e => segs(e)[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [items]);
  const svcOptions = useMemo(() => [...new Set(items.filter(e => !fDir || segs(e)[0] === fDir).map(e => segs(e)[1]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [items, fDir]);
  const secOptions = useMemo(() => [...new Set(items.filter(e => (!fDir || segs(e)[0] === fDir) && (!fSvc || segs(e)[1] === fSvc)).map(e => segs(e)[2]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [items, fDir, fSvc]);
  const scopedItems = useMemo(() => !pilotage ? items : items.filter(e => {
    const sg = segs(e);
    return (!fDir || sg[0] === fDir) && (!fSvc || sg[1] === fSvc) && (!fSec || sg[2] === fSec) && (!fCat || e.categorie === fCat) && (!fLecture || (fLecture === 'avec') === !!e.lecture_arriere_plan);
  }), [items, pilotage, fDir, fSvc, fSec, fCat, fLecture]);
  const kpi = pilotage ? localStats(scopedItems) : stats;
  // Réception du CREP signé par la DRH (déclarée par les administrateurs) : compteurs pour le pilotage comme pour les valideurs
  const drhRecus = useMemo(() => scopedItems.filter(e => !!e.drh_received_at).length, [scopedItems]);
  const drhATransmettre = useMemo(() => scopedItems.filter(e => e.statut === 'cloture' && !e.drh_received_at).length, [scopedItems]);
  const declareDrh = async (ids: number[], received: boolean) => {
    if (!ids.length) return;
    setNotice(null);
    try {
      const r = await axios.post('/api/entretiens/drh-reception', { ids, received }, { headers });
      const refused: string[] = r.data?.refused || [];
      setNotice({ ok: !refused.length, text: `${received ? 'CREP déclaré(s) reçu(s) par la DRH' : 'Réception DRH annulée'} : ${r.data?.updated || 0} entretien(s).${refused.length ? ' Non traités : ' + refused.join(' ; ') : ''}` });
      load();
    } catch (err: any) { setNotice({ ok: false, text: err?.response?.data?.message || 'Opération impossible.' }); }
  };
  const todoCount = useMemo(() => scopedItems.filter(e => !['realise', 'cloture'].includes(e.statut)).length, [scopedItems]);

  const valideurLabel = (e: Entretien) => personneNom(e.evaluator_nom) || e.evaluator_email || '—';
  const valideurs = useMemo(() => [...new Set(items.map(valideurLabel))].sort((a, b) => a.localeCompare(b, 'fr')), [items]);

  const filtered = useMemo(() => scopedItems.filter(e => {
    if (valideur && valideurLabel(e) !== valideur) return false;
    if (onlyTodo && ['realise', 'cloture'].includes(e.statut)) return false;
    if (statut && e.statut !== statut) return false;
    if (kpiF) {
      const now = nowIso();
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const lim = `${in7.getFullYear()}-${p2(in7.getMonth() + 1)}-${p2(in7.getDate())}T${p2(in7.getHours())}:${p2(in7.getMinutes())}`;
      const d = String(e.date_entretien || '').slice(0, 16).replace(' ', 'T');
      const done = isDone(e);
      if (kpiF === 'realises' && !done) return false;
      if (kpiF === 'planifies' && !(!done && d)) return false;
      if (kpiF === 'a_venir' && !(d && d >= now && d <= lim)) return false;
      if (kpiF === 'retard' && !(d && d < now && !done)) return false;
      if (kpiF === 'recus_drh' && !e.drh_received_at) return false;
      if (kpiF === 'a_transmettre' && !(e.statut === 'cloture' && !e.drh_received_at)) return false;
    }
    if (q) {
      const hay = `${nomComplet(e)} ${e.agent_email || ''} ${e.service || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => readOnly
    ? valideurLabel(a).localeCompare(valideurLabel(b), 'fr') || nomComplet(a).localeCompare(nomComplet(b), 'fr')
    : 0), [scopedItems, q, statut, onlyTodo, valideur, readOnly, kpiF]);
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id));
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { setPage(1); }, [q, statut, onlyTodo, valideur, fDir, fSvc, fSec, fCat, pilotage, kpiF]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const paged = pilotage ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
  const qr = reassignQ.trim().toLowerCase();
  const visibleReassign = qr
    ? reassignCandidates.filter(c => repairText(`${c.nom || ''} ${c.matricule || ''} ${c.email || ''} ${c.poste || ''}`).toLowerCase().includes(qr))
    : reassignCandidates;

  // « EP de mon équipe » / pilotage : arborescence récursive évaluateur → agents,
  // un agent qui évalue lui-même des agents étant dépliable à son tour.
  type EvalTreeNode = { key: string; name: string; items: Entretien[]; agent: Entretien | null; children: EvalTreeNode[]; info?: EvalInfo };
  const lc = (v?: string | null) => String(v || '').trim().toLowerCase();
  /** Toutes les façons de reconnaître une même personne : matricule, compte, e-mail. */
  const agentKeys = (e: Entretien) => [lc(e.agent_matricule), lc(e.agent_username), lc(e.agent_email)].filter(Boolean);
  const evaluatorKey = (e: Entretien) => (e.evaluator_username || e.evaluator_email || e.evaluator_nom || '').toLowerCase();
  const nodeIndexRef = useRef<Map<string, EvalTreeNode>>(new Map());
  const evalTree = useMemo(() => {
    const byEvaluator = new Map<string, Entretien[]>();
    const agentByKey = new Map<string, Entretien>();
    for (const e of filtered) {
      const k = evaluatorKey(e);
      if (k) {
        if (!byEvaluator.has(k)) byEvaluator.set(k, []);
        byEvaluator.get(k)!.push(e);
      }
    }
    // L'EP de l'évaluateur lui-même (en tant qu'évalué) vient de la liste complète : il reste visible et réinitialisable même si la recherche ne le cible pas
    for (const e of items) for (const ak of agentKeys(e)) if (!agentByKey.has(ak)) agentByKey.set(ak, e);
    const nodes = new Map<string, EvalTreeNode>();
    for (const [k, list] of byEvaluator) {
      const first = list[0];
      const info = evalInfo[k];
      const ids = [k, lc(first.evaluator_username), lc(first.evaluator_email), lc(info?.matricule)].filter(Boolean);
      nodes.set(k, {
        key: k,
        name: personneNom(info?.nom || first.evaluator_nom) || repairText(first.evaluator_email || first.evaluator_username || k),
        info,
        items: list,
        agent: ids.map(x => agentByKey.get(x)).find(Boolean) || null,
        children: [],
      });
    }
    const roots: EvalTreeNode[] = [];
    // Hiérarchie : par l'EP de l'évaluateur·rice (qui l'évalue) ou, à défaut, par son chef dans la base des agent·e·s
    const byMatricule = new Map<string, EvalTreeNode>();
    for (const nd of nodes.values()) if (nd.info?.matricule) byMatricule.set(nd.info.matricule, nd);
    // Index « n'importe quelle clé » -> nœud évaluateur
    const nodeByAny = new Map<string, EvalTreeNode>();
    for (const nd of nodes.values()) {
      const f = nd.items[0];
      for (const x of [nd.key, lc(f?.evaluator_username), lc(f?.evaluator_email), lc(nd.info?.matricule)]) if (x && !nodeByAny.has(x)) nodeByAny.set(x, nd);
    }
    nodeIndexRef.current = nodeByAny;
    const parentOf = (nd: EvalTreeNode): EvalTreeNode | null => {
      const pk = nd.agent ? evaluatorKey(nd.agent) : '';
      if (pk && pk !== nd.key && nodes.has(pk)) return nodes.get(pk)!;
      if (nd.agent) {
        const ek = [lc(nd.agent.evaluator_username), lc(nd.agent.evaluator_email)].filter(Boolean).map(x => nodeByAny.get(x)).find(Boolean);
        if (ek && ek !== nd) return ek;
      }
      const vm = nd.info?.valideur_matricule;
      const p = vm ? byMatricule.get(vm) : undefined;
      return p && p !== nd ? p : null;
    };
    const wouldCycle = (nd: EvalTreeNode, p: EvalTreeNode) => { let c: EvalTreeNode | null = p; for (let g = 0; c && g < 50; g++) { if (c === nd) return true; c = parentOf(c); } return false; };
    for (const nd of nodes.values()) {
      const p = parentOf(nd);
      if (p && !wouldCycle(nd, p)) p.children.push(nd);
      else roots.push(nd);
    }
    const sortNode = (n: EvalTreeNode) => {
      n.items.sort((a, b) => nomComplet(a).localeCompare(nomComplet(b), 'fr'));
      n.children.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      n.children.forEach(sortNode);
    };
    roots.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    roots.forEach(sortNode);
    return roots;
  }, [filtered, items, readOnly, evalInfo]);
  const allNodeKeys = useMemo(() => {
    const keys = new Set<string>();
    const walk = (n: EvalTreeNode) => { keys.add(n.key); n.children.forEach(walk); };
    evalTree.forEach(walk);
    return keys;
  }, [evalTree]);
  useEffect(() => { setOpenEvaluators(new Set()); }, [q, statut, valideur, campaign?.id]);
  // Pendant une recherche, les listes (valideurs) qui contiennent un résultat sont dépliées d'office
  useEffect(() => { if (q.trim()) setOpenEvaluators(new Set(allNodeKeys)); }, [q, allNodeKeys]);
  type DisplayItem = { kind: 'evaluator'; key: string; node: EvalTreeNode; depth: number } | { kind: 'ep'; key: string; e: Entretien; depth: number; child?: EvalTreeNode };
  const displayItems: DisplayItem[] = [];
  // Nombre d'évaluations d'un nœud : directes, et au total dans toute sa branche
  const totalOf = (n: EvalTreeNode, seen = new Set<string>()): number => { if (seen.has(n.key)) return 0; seen.add(n.key); return n.items.length + n.children.reduce((a, c) => a + totalOf(c, seen), 0); };
  const childOfEp = (node: EvalTreeNode, e: Entretien): EvalTreeNode | undefined => {
    for (const k of agentKeys(e)) { const n = nodeIndexRef.current.get(k); if (n && n !== node && node.children.includes(n)) return n; }
    return undefined;
  };
  if (readOnly) {
    // Un·e évalué·e qui évalue lui·elle-même des agent·e·s apparaît comme une ligne d'EP dépliable, avec ses propres évalué·e·s dessous (autant de niveaux que nécessaire)
    const pushItems = (node: EvalTreeNode, depth: number, trail: Set<string>) => {
      const shown = new Set<string>();
      for (const e of node.items) {
        const child = childOfEp(node, e);
        displayItems.push({ kind: 'ep', key: 'e:' + e.id, e, depth: depth + 1, child });
        if (child && !trail.has(child.key)) {
          shown.add(child.key);
          if (openEvaluators.has(child.key)) { const nx = new Set(trail); nx.add(child.key); pushItems(child, depth + 1, nx); }
        }
      }
      // Sous-évaluateur·rice·s rattaché·e·s à ce niveau sans EP dans la liste
      for (const c of node.children) if (!shown.has(c.key) && !trail.has(c.key)) pushNode(c, depth + 1, trail);
    };
    const pushNode = (node: EvalTreeNode, depth: number, trail: Set<string>) => {
      if (trail.has(node.key)) return;
      displayItems.push({ kind: 'evaluator', key: node.key, node, depth });
      if (!openEvaluators.has(node.key)) return;
      const next = new Set(trail); next.add(node.key);
      pushItems(node, depth, next);
    };
    evalTree.forEach(root => pushNode(root, 0, new Set()));
  } else {
    for (const e of paged) displayItems.push({ kind: 'ep', key: 'e:' + e.id, e, depth: 0 });
  }

  return (
    <div>
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 18, overflowX: 'auto' }}>
          <KpiCard onClick={() => setKpiF('')} active={false} label={pilotage ? 'Entretiens (sélection)' : readOnly ? 'EP de mon équipe' : 'EP que je réalise'} value={kpi.total} color={COLORS.primary} sub={campaign ? `Campagne ${campaign.annee}` : undefined} />
          <KpiCard onClick={() => toggleKpi('planifies')} active={kpiF === 'planifies'} label="Planifiés" value={kpi.planifies || 0} color="#2563eb" sub={`${kpi.total ? Math.round(((kpi.planifies || 0) / kpi.total) * 100) : 0}% des entretiens`} />
          <KpiCard onClick={() => toggleKpi('a_venir')} active={kpiF === 'a_venir'} label="À venir sous 7 jours" value={kpi.a_venir_7j} color="#7c3aed" sub="Prochaines échéances" />
          <KpiCard onClick={() => toggleKpi('realises')} active={kpiF === 'realises'} label="Réalisés" value={kpi.realises} color={COLORS.success} sub={`${kpi.taux_realisation}% de réalisation`} />
          <KpiCard onClick={() => toggleKpi('a_transmettre')} active={kpiF === 'a_transmettre'} label="À transmettre à la DRH" value={drhATransmettre} color={drhATransmettre > 0 ? '#b45309' : '#94a3b8'} sub="Clôturés, non reçus" />
          <KpiCard onClick={() => toggleKpi('recus_drh')} active={kpiF === 'recus_drh'} label="Reçus par la DRH" value={drhRecus} color="#0f766e" sub={`${kpi.total ? Math.round((drhRecus / kpi.total) * 100) : 0}% des entretiens`} />
          <KpiCard onClick={() => toggleKpi('retard')} active={kpiF === 'retard'} label="En retard" value={kpi.en_retard} color={kpi.en_retard > 0 ? COLORS.danger : '#94a3b8'} sub="Date dépassée" />
        </div>
      )}

      {pilotage && (
        <>
          <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ ...input, width: 'auto', minWidth: 190 }} value={fDir} onChange={e => { setFDir(e.target.value); setFSvc(''); setFSec(''); }}>
              <option value="">Toutes les directions</option>
              {dirOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={{ ...input, width: 'auto', minWidth: 240, maxWidth: 360 }} value={fSvc} onChange={e => { setFSvc(e.target.value); setFSec(''); }} disabled={!svcOptions.length}>
              <option value="">{fDir ? 'Tous les services de la direction' : 'Tous les services'}</option>
              {svcOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={{ ...input, width: 'auto', minWidth: 240, maxWidth: 360 }} value={fSec} onChange={e => setFSec(e.target.value)} disabled={!secOptions.length}>
              <option value="">{fSvc ? 'Tous les secteurs du service' : 'Tous les secteurs'}</option>
              {secOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={{ ...input, width: 'auto', minWidth: 150 }} value={fCat} onChange={e => setFCat(e.target.value)}>
              <option value="">Toutes catégories</option>
              {['A', 'B', 'C'].map(c => <option key={c} value={c}>Catégorie {c}</option>)}
            </select>
            <select style={{ ...input, width: 'auto', minWidth: 210 }} value={fLecture} onChange={e => setFLecture(e.target.value as '' | 'avec' | 'sans')} title="Entretiens dont le document a été lu en arrière-plan">
              <option value="">Lecture en arrière-plan : tous</option>
              <option value="avec">Avec lecture en arrière-plan</option>
              <option value="sans">Sans lecture en arrière-plan</option>
            </select>
            {(fDir || fSvc || fSec || fCat || fLecture) && <button style={btnGhost} onClick={() => { setFDir(''); setFSvc(''); setFSec(''); setFCat(''); setFLecture(''); }}>Réinitialiser</button>}
          </div>
          <ProgressTree rows={scopedItems} />
        </>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input style={{ ...input, paddingLeft: 32 }} placeholder="Rechercher un·e agent·e, un service…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select style={{ ...input, width: 'auto', minWidth: 170 }} value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).filter(([k]) => k !== 'preparation_recue').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {readOnly && valideurs.length > 1 && (
          <select style={{ ...input, width: 'auto', minWidth: 190 }} value={valideur} onChange={e => setValideur(e.target.value)}>
            <option value="">Tous les évaluateur·rice·s</option>
            {valideurs.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <div style={{ display: 'inline-flex', border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[{ k: true, l: `À faire (${todoCount})` }, { k: false, l: `Tous (${items.length})` }].map(o => (
            <button key={String(o.k)} type="button" onClick={() => setOnlyTodo(o.k)}
              style={{ padding: '8px 13px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: onlyTodo === o.k ? COLORS.primary : '#fff', color: onlyTodo === o.k ? '#fff' : '#475569' }}>{o.l}</button>
          ))}
        </div>
        <button style={btnGhost} onClick={load} disabled={loading}>Actualiser</button>
      </div>

      <div style={{ ...card, padding: 12, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!pilotage && (
          <button style={btnPrimary} onClick={openAdd}>
            <UserPlus size={14} /> Ajouter un·e agent·e
          </button>
        )}
        {!noActions && <button style={btnGhost} onClick={() => allFilteredSelected ? setSelected(new Set()) : selectAll(filtered.map(e => e.id))} disabled={!filtered.length}>
          {allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>}
        {!noActions && <span style={{ fontSize: 12, color: COLORS.muted, marginRight: 4 }}>{selected.size} sélectionné(s)</span>}
        {!noActions && <button style={btnGhost} disabled={!selected.size || printBusy !== null} onClick={() => printCrep('blank')}>
          {printBusy === 'blank' ? <Loader2 size={14} /> : <Printer size={14} />} Imprimer CREP vierges
        </button>}
        {pilotage && canReset && (
          <button style={{ ...btnGhost, color: '#0f766e', borderColor: '#99f6e4' }} disabled={!selected.size} onClick={() => declareDrh([...selected], true)} title="Déclarer reçus par la DRH les CREP validés de la sélection">
            <Inbox size={14} /> Reçus par la DRH
          </button>
        )}
        {!noActions && <button style={btnGhost} disabled={!selected.size || printBusy !== null} onClick={() => printCrep('filled')}>
          {printBusy === 'filled' ? <Loader2 size={14} /> : <Printer size={14} />} Imprimer CREP renseignés
        </button>}
        {readOnly && (
          <>
            <button style={btnGhost} onClick={() => setOpenEvaluators(new Set(allNodeKeys))}>Tout déplier</button>
            <button style={btnGhost} onClick={() => setOpenEvaluators(new Set())}>Tout replier</button>
          </>
        )}
      </div>

      {notice && (
        <div style={{ ...card, padding: '9px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: notice.ok ? COLORS.success : COLORS.danger }}>
          {notice.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {notice.text}
          <button style={{ ...btnGhost, marginLeft: 'auto', padding: '2px 7px' }} onClick={() => setNotice(null)}><X size={12} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
      ) : error ? (
        <div style={{ ...card, padding: 20, color: COLORS.danger, fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title={onlyTodo && items.length > 0 ? 'Aucun EP à faire' : readOnly ? 'Aucun entretien dans votre équipe' : 'Aucun entretien à évaluer'}
          text={items.length === 0 ? (readOnly ? 'Les entretiens des agent·e·s de vos sous-évaluateur·rice·s (et, pour un directeur, de toute sa direction) apparaîtront ici, en lecture seule.' : "Aucun entretien professionnel ne vous est encore attribué pour cette campagne.") : onlyTodo ? "Tous vos entretiens sont réalisés. Basculez sur « Tous » pour les consulter." : "Aucun entretien ne correspond à vos filtres."} />
      ) : (
        <>
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <Th style={{ width: 34 }}>
                  {!noActions && <input type="checkbox" checked={allFilteredSelected} onChange={e => e.target.checked ? selectAll(filtered.map(x => x.id)) : setSelected(new Set())} title="Tout sélectionner" />}
                </Th>
                <Th>Agent·e</Th>
                <Th>E-mail</Th>
                {readOnly && <Th>Évaluateur·rice</Th>}
                <Th>Date de l’entretien</Th>
                <Th>Statut</Th>
                {(pilotage || readOnly) && <Th>Modèle</Th>}
                <Th>Compte rendu</Th>
                <Th style={{ textAlign: 'right' }}>Action</Th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => {
                if (item.kind === 'evaluator') {
                  const node = item.node;
                  const agent = node.agent;
                  const isOpen = openEvaluators.has(node.key);
                  return (
                    <tr key={item.key} onClick={() => setOpenEvaluators(prev => { const n = new Set(prev); if (n.has(node.key)) n.delete(node.key); else n.add(node.key); return n; })}
                      style={{ background: item.depth ? '#f8fafc' : '#f1f5f9', cursor: 'pointer' }}>
                      <td colSpan={9} style={{ padding: `9px 12px 9px ${12 + item.depth * 22}px`, borderBottom: `1px solid ${COLORS.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ marginTop: 2 }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 800, color: COLORS.text }}>
                              <Avatar name={agent ? nomComplet(agent) : node.name} size={36} />
                              <span>{agent ? nomComplet(agent) : node.name}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px' }}>
                                {node.items.length} évalué·e{node.items.length > 1 ? '·s' : ''}{totalOf(node) > node.items.length ? ` · ${totalOf(node)} au total dans l’équipe` : ''}
                              </span>
                              {!pilotage && node.items.length > 0 && node.items.every(sansMailValideur) && (
                                <span title="Cet·te évaluateur·rice n’a pas d’adresse e-mail : il n’utilise pas l’outil. C’est à vous de planifier, saisir ou importer les comptes rendus et de téléverser les CREP signés." style={{ fontSize: 11, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '1px 8px' }}>
                                  Évaluateur·rice sans e-mail : vous gérez ses EP
                                </span>
                              )}
                            </div>
                            {(() => {
                              // Fiche de l'évaluateur·rice : son EP s'il est dans la liste, sinon la base des agent·e·s
                              const poste = agent?.poste || node.info?.poste || '';
                              const grade = agent?.agent_grade || node.info?.grade || '';
                              const direction = agent?.direction || node.info?.direction || '';
                              const service = (agent ? uniteService(agent) : '') || node.info?.service || '';
                              const mail = agent?.agent_email || node.info?.email || '';
                              if (!poste && !grade && !direction && !service && !mail) return null;
                              return (
                                <div style={{ marginTop: 4, paddingLeft: 44 }}>
                                  {poste && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.35 }}>{repairText(poste)}</div>}
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                                    {grade && <Pill bg="#eef2ff" color="#4338ca">{repairText(grade)}</Pill>}
                                    {direction && <Pill bg="#f1f5f9" color="#475569">{repairText(direction)}</Pill>}
                                    {service && <Pill bg="#f0fdf4" color="#166534">{repairText(service)}</Pill>}
                                    {mail && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#64748b' }}><Mail size={11} />{mail}</span>}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                          {agent && !canReset && !noActions && (
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={ev => ev.stopPropagation()}>
                              <button style={btnGhost} onClick={() => printCrep('filled', [agent.id])} disabled={printBusy !== null} title="Imprimer le CREP"><Printer size={13} /></button>
                              <button style={btnGhost} onClick={() => setOpenId(agent.id)}><Eye size={13} /> Ouvrir</button>
                            </div>
                          )}
                          {canReset && agent && (
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={ev => ev.stopPropagation()}>
                              {agent.evaluation_statut === 'soumis' && (
                                <button style={btnGhost} disabled={razBusy === agent.id} onClick={() => unvalidateEp(agent)} title="Dévalider le CREP de cette personne en cas d’erreur manifeste (administrateur)">
                                  <Undo2 size={13} /> Dévalider
                                </button>
                              )}
                              <button style={btnDanger} disabled={razBusy === agent.id} onClick={() => resetEp(agent)} title="Remettre à zéro l’EP de cette personne (administrateur)">
                                {razBusy === agent.id ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />} RAZ
                              </button>
                              <button style={btnGhost} onClick={() => printCrep('filled', [agent.id])} disabled={printBusy !== null} title="Imprimer le CREP"><Printer size={13} /></button>
                              <button style={btnGhost} onClick={() => setOpenId(agent.id)}><Eye size={13} /> Ouvrir</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
                const e = item.e;
                const st = STATUTS[e.statut] || STATUTS.a_planifier;
                return (
                  <tr key={e.id} style={{ background: e.statut === 'realise' || e.statut === 'cloture' ? '#fafdfb' : '#fff' }}>
                    <Td>{!noActions && <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />}</Td>
                    <Td style={{ minWidth: 260, paddingLeft: 10 + item.depth * 22 }}>
                      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                        {item.child && (
                          <button type="button" aria-label="Déplier ses évalué·e·s" title="Cette personne évalue elle-même des agent·e·s : cliquer pour déplier"
                            onClick={() => setOpenEvaluators(prev => { const n = new Set(prev); if (n.has(item.child!.key)) n.delete(item.child!.key); else n.add(item.child!.key); return n; })}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, marginLeft: -6, display: 'inline-flex', color: '#475569' }}>
                            {openEvaluators.has(item.child.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        <Avatar name={nomComplet(e)} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13.5, color: COLORS.text, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{nomComplet(e)}
                            {item.child && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 8px' }}>
                              évalue {item.child.items.length} agent·e{item.child.items.length > 1 ? '·s' : ''}{totalOf(item.child) > item.child.items.length ? ` · ${totalOf(item.child)} au total` : ''}
                            </span>}
                          </div>
                          {e.poste && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.35 }}>{repairText(e.poste)}</div>}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {e.agent_grade && <Pill bg="#eef2ff" color="#4338ca">{repairText(e.agent_grade)}</Pill>}
                            {e.categorie === 'C' && /A&B/i.test(e.modele || '') && <Pill bg="#fef3c7" color="#92400e">Faisant fonction</Pill>}
                            {e.direction && <Pill bg="#f1f5f9" color="#475569">{repairText(e.direction)}</Pill>}
                            {uniteService(e) && <Pill bg="#f0fdf4" color="#166534">{repairText(uniteService(e))}</Pill>}
                            {!e.agent_grade && !e.poste && !e.direction && !e.service && e.agent_email && <Pill bg="#f1f5f9" color="#64748b">{e.agent_email}</Pill>}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {e.agent_email
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569' }}><Mail size={12} />{e.agent_email}</span>
                        : <button style={{ ...btnGhost, padding: '3px 7px', fontSize: 11 }} onClick={() => setLinkFor(e)} title="Rattacher un compte AD"><Link2 size={12} /> Lier l’AD</button>}
                    </Td>
                    {readOnly && <Td>
                      <span style={{ fontSize: 12.5, color: '#334155' }}>{personneNom(e.evaluator_nom) || e.evaluator_email || '—'}</span>
                      {sansMailValideur(e) && <div title="Cet·te évaluateur·rice n’a pas d’adresse e-mail : ses EP sont gérés par son N+1" style={{ marginTop: 3, fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '1px 6px', display: 'inline-block' }}>Sans e-mail · géré par son N+1</div>}
                    </Td>}
                    <Td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: e.date_entretien ? '#334155' : '#94a3b8' }}>
                        <CalendarClock size={13} /> {formatDateCourte(e.date_entretien)}
                      </div>
                    </Td>
                    <Td>
                      <Badge {...st} />
                      {pilotage && e.lecture_arriere_plan && <div title="Le document téléversé a été lu en arrière-plan : version numérique visible des seuls administrateurs" style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, color: '#5b21b6', background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 999, padding: '1px 8px' }}><ScanLine size={11} /> Lue en arrière-plan</div>}
                    </Td>
                    {(pilotage || readOnly) && <Td><span style={{ fontSize: 12, color: '#475569' }}>{(e.modele || '').replace(/^Template_/i, '') || '—'}</span></Td>}
                    <Td>
                      {e.evaluation_statut === 'soumis'
                        ? (() => {
                          const c = crepEtat(e);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, color: COLORS.success, fontWeight: 700 }}><ClipboardCheck size={13} /> Validé</span>
                              {e.drh_received_at && <span title={`CREP signé reçu par la DRH le ${new Date(e.drh_received_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, fontWeight: 800, color: '#0f766e', background: '#ccfbf1', borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}><Inbox size={11} /> Reçu DRH</span>}
                              {c && <span title={c.hint} style={{ fontSize: 11, fontWeight: 800, color: c.color, background: c.bg, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>{c.label}</span>}
                            </div>
                          );
                        })()
                        : e.evaluation_statut === 'brouillon'
                          ? <span style={{ fontSize: 11.5, color: COLORS.warning, fontWeight: 700 }}>Brouillon</span>
                          : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>À faire</span>}
                    </Td>
                    <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {(!readOnly || (!pilotage && sansMailValideur(e))) && !['realise', 'cloture'].includes(e.statut) && (
                          <button style={e.date_entretien ? btnGhost : btnPrimary} onClick={() => setPlanning(e)}>
                            <CalendarClock size={13} /> {e.date_entretien ? 'Modifier le RDV' : 'Planifier'}
                          </button>
                        )}
                        {!noActions && <button style={btnGhost} onClick={() => printCrep('filled', [e.id])} disabled={printBusy !== null} title="Imprimer le CREP">
                          <Printer size={13} />
                        </button>}
                        {canReset && (e.crep_signed_at || (e.crep_scans || []).length > 0 || e.evaluation_statut === 'soumis') && (
                          <button style={{ ...btnGhost, color: '#5b21b6', borderColor: '#ddd6fe', background: '#faf5ff' }} onClick={() => openApercu(e)} title="Aperçu : CREP numérisé ou CREP reconstruit">
                            <Eye size={13} /> Aperçu CREP
                          </button>
                        )}
                        {canReset && (
                          <button style={{ ...btnGhost, padding: '6px 8px' }} onClick={(ev) => { const b = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenu(m => (m && m.e.id === e.id ? null : { e, x: b.right, y: b.bottom + 4 })); }} title="Actions administrateur" aria-label="Actions administrateur">
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                        {!pilotage && (
                          <button style={btnGhost} onClick={() => openReassign(e)} title="Changer l’évaluateur">
                            <UserCog size={13} />
                          </button>
                        )}
                        {!noActions && (e.crep_statut === 'signe_papier' || (e.crep_statut === 'en_signature' && e.crep_parapheur_status === 'termine')) && (
                          <button style={{ ...btnGhost, color: '#166534', borderColor: '#bbf7d0' }} onClick={() => openSigned(e.id)} title="Compte rendu signé">
                            <FileDown size={13} /> CREP signé
                          </button>
                        )}
                        {!noActions && <button style={btnGhost} onClick={() => setOpenId(e.id)}>
                          <Eye size={13} /> {(readOnly && !(!pilotage && sansMailValideur(e))) || ['realise', 'cloture'].includes(e.statut) ? 'Ouvrir' : 'Saisir l’EP'}
                        </button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pilotage && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{filtered.length} entretien(s) · page {page} / {pageCount}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnGhost} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Précédent</button>
              <button style={btnGhost} disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Suivant</button>
            </div>
          </div>
        )}
        </>
      )}

      {stats && stats.total > 0 && stats.total === stats.realises && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 14, color: COLORS.success, fontSize: 12.5, fontWeight: 700 }}>
          <TrendingUp size={15} /> Tous les entretiens de votre périmètre sont réalisés.
        </div>
      )}
      {stats && stats.en_retard > 0 && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 14, color: COLORS.warning, fontSize: 12.5, fontWeight: 600 }}>
          <AlertTriangle size={15} /> {stats.en_retard} entretien(s) ont dépassé leur date prévue.
        </div>
      )}

      {planning && (
        <PlanningModal entretien={planning} onClose={() => setPlanning(null)} onSaved={() => { load(); onChanged?.(); }} />
      )}

      {openId && (
        <EntretienDetailModal entretienId={openId} onClose={() => setOpenId(null)} onSaved={() => { load(); onChanged?.(); }} />
      )}

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
          <div style={{ ...card, width: '100%', maxWidth: 720, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Ajouter un·e agent·e</div>
              <button style={btnGhost} onClick={() => setShowAdd(false)}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input style={{ ...input, flex: 1 }} placeholder="Rechercher un·e agent·e sans évaluateur…" value={addQ}
                onChange={e => setAddQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadAdd(addQ); }} />
              <button style={btnPrimary} onClick={() => loadAdd(addQ)} disabled={addBusy}>
                {addBusy ? <Loader2 size={14} /> : <Search size={14} />} Rechercher
              </button>
            </div>
            {addMsg && <div style={{ fontSize: 12.5, color: COLORS.danger, marginBottom: 8 }}>{addMsg}</div>}
            {addBusy ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} /></div> : addItems.length === 0 ? (
              <div style={{ padding: 18, fontSize: 12.5, color: '#94a3b8' }}>Aucun agent·e sans évaluateur dans votre périmètre.</div>
            ) : (
              <div style={{ maxHeight: 420, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 9 }}>
                {addItems.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 11px', borderBottom: `1px solid ${COLORS.border}` }}>
                    <Avatar name={nomComplet(a)} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{nomComplet(a)}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[a.poste, a.direction || a.service].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button style={btnPrimary} disabled={addBusy}
                      onClick={() => { if (readOnly) { setShowAdd(false); openReassign(a); } else claim(a.id); }}>
                      {readOnly ? 'Choisir l’évaluateur' : 'Ajouter'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {linkFor && (
        <LinkAdModal entretien={linkFor} headers={headers} onClose={() => setLinkFor(null)}
          onLinked={() => { setLinkFor(null); load(); setNotice({ ok: true, text: 'Compte AD rattaché à l’agent·e.' }); }} />
      )}

      {reassignFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
          <div style={{ ...card, width: '100%', maxWidth: 620, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {reassignFor.evaluator_nom || reassignFor.evaluator_email ? 'Changer l’évaluateur' : 'Choisir l’évaluateur'}
              </div>
              <button style={btnGhost} onClick={() => setReassignFor(null)}><X size={15} /></button>
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
              {nomComplet(reassignFor)}{reassignFor.evaluator_nom || reassignFor.evaluator_email ? <> · évaluateur actuel : <strong>{reassignFor.evaluator_nom || reassignFor.evaluator_email}</strong></> : ''}
            </div>
            {reassignMsg && <div style={{ fontSize: 12.5, color: COLORS.danger, marginBottom: 8 }}>{reassignMsg}</div>}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
              <input style={{ ...input, paddingLeft: 31 }} placeholder="Rechercher un évaluateur (nom, matricule, e-mail)…" value={reassignQ} onChange={e => setReassignQ(e.target.value)} />
            </div>
            {visibleReassign.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12.5, color: '#94a3b8' }}>Aucun évaluateur proposé pour cet·te agent·e.</div>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 9 }}>
                {visibleReassign.map(c => (
                  <div key={c.matricule} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 11px', borderBottom: `1px solid ${COLORS.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{repairText(c.nom) || c.matricule}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[repairText(c.poste), c.email].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button style={btnGhost} onClick={() => doReassign(c.matricule)} disabled={reassignBusy}>
                      {reassignBusy ? <Loader2 size={13} /> : <UserCog size={13} />} Choisir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDialog}
      {viewerElement}
      {menu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 2900 }} onClick={() => setMenu(null)} />
          <div style={{ position: 'fixed', top: menu.y, left: Math.max(8, menu.x - 210), width: 210, zIndex: 2901, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.18)', padding: 4 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, color: '#94a3b8', padding: '6px 10px 2px', textTransform: 'uppercase' }}>Administrateur</div>
            {menu.e.evaluation_statut === 'soumis' && (
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0f766e', textAlign: 'left' }}
                onClick={() => { const x = menu.e; setMenu(null); declareDrh([x.id], !x.drh_received_at); }}>
                <Inbox size={14} /> {menu.e.drh_received_at ? 'Annuler la réception DRH' : 'CREP reçu par la DRH'}</button>
            )}
            {menu.e.evaluation_statut === 'soumis' && (
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: COLORS.text, textAlign: 'left' }}
                onClick={() => { const x = menu.e; setMenu(null); unvalidateEp(x); }}><Undo2 size={14} /> Dévalider le CREP</button>
            )}
            <button style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: COLORS.danger, textAlign: 'left' }}
              onClick={() => { const x = menu.e; setMenu(null); resetEp(x); }}><RotateCcw size={14} /> Remettre l’EP à zéro</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Rattachement d'un compte AD à un agent sans e-mail (même logique que l'ajout d'un administrateur). */
function LinkAdModal({ entretien, headers, onClose, onLinked }: {
  entretien: Entretien;
  headers: Record<string, string>;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ username: string; displayName: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await axios.get('/api/ad/search', { params: { q: query }, headers });
        if (alive) setResults(Array.isArray(r.data) ? r.data : []);
      } catch { if (alive) setResults([]); }
      finally { if (alive) setLoading(false); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, headers]);
  const link = async (u: { username: string; displayName: string; email: string }) => {
    setBusy(true); setError('');
    try {
      await axios.post(`/api/entretiens/${entretien.id}/link-ad`, { username: u.username }, { headers });
      onLinked();
    } catch (e: any) { setError(e.response?.data?.message || 'Rattachement impossible.'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2050, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div style={{ ...card, width: '100%', maxWidth: 620, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Lier un compte AD</div>
          <button style={btnGhost} onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
          {nomComplet(entretien)} n’a pas d’adresse e-mail. Recherchez son compte dans l’annuaire pour le rattacher.
        </div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input style={{ ...input, paddingLeft: 31 }} placeholder="Nom, login ou e-mail AD…" value={q} onChange={e => setQ(e.target.value)} />
          {loading && <Loader2 size={14} className="spin" style={{ position: 'absolute', right: 10, top: 10, color: '#94a3b8' }} />}
        </div>
        {error && <div style={{ fontSize: 12.5, color: COLORS.danger, marginBottom: 8 }}>{error}</div>}
        <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 9 }}>
          {results.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12.5, color: '#94a3b8' }}>{q.trim().length < 2 ? 'Saisissez au moins 2 caractères.' : 'Aucun compte trouvé.'}</div>
          ) : results.map(u => (
            <div key={u.username} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 11px', borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.displayName}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted }}>{[u.username, u.email].filter(Boolean).join(' · ')}</div>
              </div>
              <button style={btnPrimary} disabled={busy} onClick={() => link(u)}>{busy ? <Loader2 size={13} /> : <Link2 size={13} />} Lier</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}