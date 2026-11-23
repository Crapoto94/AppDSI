import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FileText, Eye, ClipboardCheck, Loader2, Upload, CheckCircle2, AlertTriangle, RotateCw, X, FileSearch, Trash2, ScanLine } from 'lucide-react';
import { useAuth } from './useAuth';
import type { Campaign, Entretien } from './types';
import CrepForm from './CrepForm';
import type { FieldOrigin } from './CrepForm';
import { COLORS, EmptyState, KpiCard, Th, Td, btnGhost, btnPrimary, card, input, useConfirm } from './ui';

interface Row {
  signatures?: 'ok' | 'manque' | null; signatures_detail?: { agent: boolean; evaluateur: boolean } | null; crep_signe_dispo?: boolean;
  id: number; evaluation_statut?: string; crep_signed_path?: string | null; agent_nom: string; agent_prenom: string; direction: string; service: string; evaluator_nom: string;
  date_entretien: string | null; statut: string; programme: boolean; realise: boolean; retourne: boolean; en_retard: boolean;
  transmis_simple: boolean; simple_sent_at: string | null; crep_canal?: string | null; crep_canal_detail?: string | null; crep_signed_at: string | null; drh_received_at: string | null; lecture_statut: string | null;
}
interface Summary { kpis: { total: number; programmes: number; realises: number; en_retard: number; retournes: number; en_attente_numerisation: number }; rows: Row[] }
interface PageRef { idx: number; page: number; rot: number; manual: boolean }
interface Group {
  entretien_id: number; known: boolean; agent: string | null; direction: string; service: string; evaluateur: string; already_received: boolean;
  signatures?: { agent?: boolean; evaluateur?: boolean; unknown?: boolean } | null; confirmed: { at: string; by: string } | null; pages: PageRef[]; missing: number[]; duplicates: number[]; out_of_range: number[]; complete: boolean; other_campaign: boolean;
}
interface Batch {
  id: number; status: 'analyse' | 'a_verifier' | 'termine' | 'echec' | 'sans_crep'; channel?: string; source_meta?: SourceMeta | null; file_name: string; error?: string | null; pages_total: number; progress: number;
  expected_pages: number; groups: Group[]; orphans: { idx: number; foreign?: string | null }[]; ignored: number[];
}
interface SourceMeta { from?: string; from_name?: string; subject?: string; received_at?: string | null; mailbox?: string }
interface BatchLine { id: number; file_name: string; status: string; pages_total: number; progress: number; created_at: string; created_by: string; channel?: string; source_meta?: SourceMeta | null }

/** CREP signé disponible : champ calculé par le serveur, à défaut le chemin du fichier signé. */
const signedOf = (r: Row) => r.crep_signe_dispo ?? !!r.crep_signed_path;
const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const t = new Date(String(d).replace(' ', 'T'));
  return isNaN(t.getTime()) ? '' : t.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
};
const fmtDay = (d?: string | null) => (fmtDate(d) || '').split(' ')[0].replace(/,$/, '');

function Chip({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ background: bg, color, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>;
}

/** Canal d'entrée d'un CREP : téléversement par la DRH (administrateur) ou boîte mail moissonnée. */
function CanalChip({ canal, detail }: { canal?: string | null; detail?: string | null }) {
  if (!canal) return <span style={{ color: '#94a3b8' }}>—</span>;
  const mail = canal === 'mail';
  return <span title={detail || ''}><Chip text={mail ? 'Mail' : 'Téléversement DRH'} color={mail ? '#075985' : '#5b21b6'} bg={mail ? '#e0f2fe' : '#ede9fe'} /></span>;
}

/** Miniature d'une page du lot (chargée avec le jeton d'authentification). */
function Thumb({ batchId, idx, rot, width = 180, headers }: { batchId: number; idx: number; rot: number; width?: number; headers: any }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url = '';
    let alive = true;
    setFailed(false);
    axios.get(`/api/entretiens/returns/batches/${batchId}/pages/${idx}?w=${width * 2}&r=${rot}`, { headers, responseType: 'blob' })
      .then(r => { if (!alive) return; url = URL.createObjectURL(r.data); setSrc(url); })
      .catch(() => { if (alive) { setSrc(null); setFailed(true); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [batchId, idx, rot, width, headers]);
  return src
    ? <img src={src} alt={`page ${idx}`} style={{ width, border: `1px solid ${COLORS.border}`, borderRadius: 4, background: '#fff', display: 'block' }} />
    : <div style={{ width, height: width * 1.41, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8, boxSizing: 'border-box', border: `1px dashed ${failed ? '#fca5a5' : COLORS.border}`, borderRadius: 4, color: failed ? '#b91c1c' : '#94a3b8', fontSize: 11 }}>{failed ? 'Page illisible : le fichier du lot est introuvable sur ce serveur (stockage non partagé). Ouvrez le lot depuis le serveur qui l’a reçu.' : <Loader2 size={18} className="spin" />}</div>;
}

/** Fenêtre de lecture IA (réservée aux administrateurs). */
function ReadingModal({ entretienId, label, headers, onClose }: { entretienId: number; label: string; headers: any; onClose: () => void }) {
  const [job, setJob] = useState<any | null | undefined>(undefined);
  useEffect(() => { axios.get(`/api/entretiens/returns/reading/${entretienId}`, { headers }).then(r => setJob(r.data.job || null)).catch(() => setJob(null)); }, [entretienId, headers]);
  const leaves = useMemo(() => {
    const out: [string, string][] = [];
    const walk = (v: any, p: string) => {
      if (v === null || v === undefined || v === '' || v === false) return;
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p} ${i + 1}`));
      else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, p ? `${p} › ${k}` : k));
      else out.push([p, String(v)]);
    };
    if (job?.result?.fields) walk(job.result.fields, '');
    return out;
  }, [job]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 'min(860px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <FileSearch size={18} color={COLORS.primary} /><strong style={{ fontSize: 15 }}>Lecture du CREP — {label}</strong>
          <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={onClose}><X size={14} /></button>
        </div>
        {job === undefined && <Loader2 size={18} className="spin" />}
        {job === null && <div style={{ color: COLORS.muted }}>Aucune lecture n’a été lancée pour cet entretien.</div>}
        {job && job.status !== 'termine' && <div style={{ color: job.status === 'echec' ? COLORS.danger : COLORS.muted }}>{job.status === 'echec' ? `Lecture en échec : ${job.error || ''}` : 'Lecture en cours ou en attente (quelques minutes par CREP)…'}</div>}
        {job && job.status === 'termine' && (
          <>
            {(job.result?.warnings || []).length > 0 && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10 }}>{(job.result.warnings as string[]).map((w, i) => <div key={i}>• {w}</div>)}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>{leaves.map(([k, v], i) => <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}><td style={{ padding: '5px 8px', color: COLORS.muted, width: '38%', verticalAlign: 'top' }}>{k}</td><td style={{ padding: '5px 8px', whiteSpace: 'pre-wrap' }}>{v}</td></tr>)}</tbody>
            </table>
            {leaves.length === 0 && <div style={{ color: COLORS.muted }}>Aucun contenu lu.</div>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * CREP numérique « en mode formulaire » : le formulaire de saisie globale du CREP, en lecture seule, renseigné avec le contenu
 * reconstitué par la lecture IA du document signé (complété par la saisie dans l'outil quand le compte rendu avait été validé).
 */
function DigitalCrepModal({ entretienId, label, headers, onClose }: { entretienId: number; label: string; headers: any; onClose: () => void }) {
  const [ent, setEnt] = useState<Entretien | null>(null);
  const [origins, setOrigins] = useState<Record<string, FieldOrigin>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const [e, rd] = await Promise.all([
          axios.get(`/api/entretiens/${entretienId}`, { headers }),
          axios.get(`/api/entretiens/returns/reading/${entretienId}`, { headers }),
        ]);
        const job = rd.data.job;
        if (!job || job.status !== 'termine' || !job.result?.fields) { setError('La lecture du document n’est pas (encore) disponible.'); return; }
        const base = (e.data.crep && typeof e.data.crep === 'object') ? e.data.crep : {};
        const read = job.result.fields || {};
        // Lecture « agent » : seuls les 2 cadres de l'agent·e viennent du papier, le reste est la saisie validée dans l'outil
        const crep = job.mode === 'agent'
          ? { ...base, obs_agent_conditions: read.obs_agent_conditions || base.obs_agent_conditions || '', obs_agent_entretien: read.obs_agent_entretien || base.obs_agent_entretien || '' }
          : { ...read };
        // Origine de chaque champ : lu par l'IA (lecture complète : tout ; lecture « agent » : seulement les 2 cadres de l'agent·e), sinon saisi dans l'outil
        const iaAll = job.mode !== 'agent';
        const ia = (k: string) => iaAll || k === 'obs_agent_conditions' || k === 'obs_agent_entretien';
        const org: Record<string, FieldOrigin> = {};
        const keys = ['missions', 'observations_complementaires', 'appreciation_generale', 'objectifs_service', 'evolution', 'mobilite', 'obs_agent_conditions', 'obs_agent_entretien', 'formations.obligatoires', 'formations.metiers', 'formations.parcours'];
        for (let i = 0; i < 10; i++) keys.push(`objectifs_ecoules.${i}.objectif`, `objectifs_ecoules.${i}.observations`, `objectifs_futurs.${i}.descriptif`, `objectifs_futurs.${i}.moyens`);
        for (const k of keys) org[k] = { kind: ia(k) ? 'ia' : 'saisi' };
        // Lectures incertaines signalées par l'IA (deux lectures différentes d'une même page) : libellé du champ → chemin
        const LABELS: Record<string, string> = { 'Missions': 'missions', 'Observations complémentaires': 'observations_complementaires', 'Appréciation générale': 'appreciation_generale', 'Évolution': 'evolution', 'Mobilité': 'mobilite',
          'Observations de l’agent (conditions de travail)': 'obs_agent_conditions', 'Observations de l’agent (entretien)': 'obs_agent_entretien', 'Objectifs du service': 'objectifs_service',
          'Formations (obligatoires)': 'formations.obligatoires', 'Formations (metiers)': 'formations.metiers', 'Formations (parcours)': 'formations.parcours' };
        for (const d of (job.result.incertains || []) as Array<{ champ: string; valeurs: string[] }>) {
          let path = LABELS[d.champ];
          let m = /^Objectif (\d+) \(bilan\) – observations$/.exec(d.champ); if (m) path = `objectifs_ecoules.${Number(m[1]) - 1}.observations`;
          m = /^Objectif (\d+) \(à venir\) – descriptif$/.exec(d.champ); if (m) path = `objectifs_futurs.${Number(m[1]) - 1}.descriptif`;
          m = /^Objectif (\d+) \(à venir\) – moyens et échéances$/.exec(d.champ); if (m) path = `objectifs_futurs.${Number(m[1]) - 1}.moyens`;
          if (path && org[path]) org[path].doubt = `Deux lectures différentes : « ${d.valeurs?.[0] || '—'} » ou « ${d.valeurs?.[1] || '—'} »`;
        }
        setOrigins(org);
        // Copie d'affichage : aucune reprise de la préparation de l'agent·e (on veut voir exactement le contenu numérisé) et aucune action de parcours
        setEnt({
          ...e.data, crep, objectifs: [], formations: [], realisations: '', difficultes: '', pistes_amelioration: '', competences_a_developper: '',
          perspectives_missions: '', perspectives_responsabilite: '', perspectives_expertise: '', perspectives_projet: '', perspectives_concours: '',
          commentaire_agent: '', avis_agent: '', synthese: '', appreciation_generale: '',
          statut: 'realise', evaluation_statut: 'brouillon', crep_statut: 'non_envoye', crep_mode: 'outil', crep_signed_at: null, crep_scans: [], reopen_request: null,
        } as Entretien);
      } catch (err: any) { setError(err?.response?.data?.message || 'Chargement impossible.'); }
    })();
  }, [entretienId, headers]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 14, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ ...card, width: 'min(960px, 100%)', margin: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <FileText size={18} color={COLORS.primary} /><strong style={{ fontSize: 15 }}>CREP numérique — {label}</strong>
          <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={onClose}><X size={14} /> Fermer</button>
        </div>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#78350f', marginBottom: 12 }}>
          Lecture seule. Contenu reconstitué par la lecture automatique du document signé : il peut comporter des erreurs de lecture ; <strong>l’original papier signé fait foi</strong>.
        </div>
        {error && <div style={{ color: COLORS.danger, fontSize: 13 }}>{error}</div>}
        {!error && !ent && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>}
        {ent && <CrepForm fieldOrigins={origins} entretien={ent} canEdit={false} onSaved={() => {}} isAdminUser aiEnabled={false} aiReviewEnabled={false} eSignEnabled={false} eSignGloballyEnabled={false} prepEnabled={false} />}
      </div>
    </div>
  );
}

/** Vérification d'un lot numérisé : CREP reconstitués, pages à classer, validation par l'administrateur. */
function BatchReview({ batchId, people, headers, onClose, onDone }: { batchId: number; people: Row[]; headers: any; onClose: () => void; onDone: (okMessage?: string) => void }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    try { setBatch((await axios.get(`/api/entretiens/returns/batches/${batchId}`, { headers })).data); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
  }, [batchId, headers]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (batch?.status !== 'analyse') return;
    const t = window.setInterval(load, 2500);
    return () => window.clearInterval(t);
  }, [batch?.status, load]);
  // Par défaut : tous les CREP complets, pas encore reçus ni validés
  useEffect(() => {
    if (batch?.status === 'a_verifier') setSel(prev => (prev.size ? prev : new Set(batch.groups.filter(g => g.complete && !g.confirmed && !g.already_received).map(g => g.entretien_id))));
  }, [batch?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async (idx: number, body: any) => {
    setMsg(null);
    try { setBatch((await axios.put(`/api/entretiens/returns/batches/${batchId}/pages/${idx}`, body, { headers })).data); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Modification impossible.' }); }
  };

  const validate = async () => {
    if (!batch || !sel.size) return;
    const list = batch.groups.filter(g => sel.has(g.entretien_id));
    const toReplace = list.filter(g => g.already_received);
    if (!(await confirm(`Valider ${list.length} CREP ?\n\nChaque CREP sera rattaché à l’entretien de l’agent et sa lecture par l’IA sera lancée.${toReplace.length ? `\n\nAttention : ${toReplace.length} agent(s) ont déjà un CREP signé enregistré, qui sera remplacé (${toReplace.map(g => g.agent).join(', ')}).` : ''}`, { title: 'Valider les CREP numérisés', confirmLabel: 'Valider' }))) return;
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/returns/batches/${batchId}/confirm`, { entretien_ids: [...sel], replace: toReplace.length > 0 }, { headers });
      setBatch(r.data.batch);
      const ko = (r.data.results as any[]).filter(x => !x.ok);
      setMsg({ ok: ko.length === 0, text: `${(r.data.results as any[]).length - ko.length} CREP enregistré(s)${ko.length ? ` ; ${ko.length} refusé(s) : ${ko.map(k => `${k.agent || k.entretien_id} (${k.message})`).join(' · ')}` : '.'}` });
      setSel(new Set());
      // Tout est validé : la fenêtre se ferme (le message de confirmation reste affiché sur la page). En cas de refus, elle reste ouverte pour les lire.
      onDone(ko.length === 0 ? `${(r.data.results as any[]).length} CREP enregistré(s) : entretien(s) clôturé(s), lecture IA lancée, e-mails de remerciement envoyés.` : undefined);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Validation impossible.' }); } finally { setBusy(false); }
  };

  const personLabel = (r: Row) => `${r.agent_nom} ${r.agent_prenom}`.trim();
  const sortedPeople = useMemo(() => [...people].sort((a, b) => personLabel(a).localeCompare(personLabel(b), 'fr')), [people]);

  const PageControls = ({ p, g }: { p: PageRef; g?: Group }) => {
    const [ent, setEnt] = useState<number>(g?.entretien_id || 0);
    const [pg, setPg] = useState<number>(p.page || 1);
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        <select style={{ ...input, padding: '2px 4px', fontSize: 11, maxWidth: 150 }} value={ent} onChange={e => setEnt(Number(e.target.value))}>
          <option value={0}>— agent —</option>
          {sortedPeople.map(r => <option key={r.id} value={r.id}>{personLabel(r)}</option>)}
        </select>
        <select style={{ ...input, padding: '2px 4px', fontSize: 11, width: 54 }} value={pg} onChange={e => setPg(Number(e.target.value))}>
          {Array.from({ length: batch?.expected_pages || 4 }, (_, i) => <option key={i + 1} value={i + 1}>p.{i + 1}</option>)}
        </select>
        <button style={{ ...btnGhost, padding: '2px 6px', fontSize: 11 }} disabled={!ent} onClick={() => assign(p.idx, { entretien_id: ent, page: pg, rot: p.rot })}>OK</button>
        <button title="Pivoter de 90°" style={{ ...btnGhost, padding: '2px 5px' }} onClick={() => assign(p.idx, { ...(p.manual && g ? { entretien_id: g.entretien_id, page: p.page } : {}), rot: (p.rot + 90) % 360 })}><RotateCw size={12} /></button>
        <button title="Écarter cette page (ne pas l’utiliser)" style={{ ...btnGhost, padding: '2px 5px' }} onClick={() => assign(p.idx, { ignore: true })}><Trash2 size={12} /></button>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div style={{ ...card, width: 'min(1200px, 100%)', maxHeight: '94vh', overflow: 'auto', padding: 18 }}>
        {confirmDialog}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ScanLine size={18} color={COLORS.primary} /><strong style={{ fontSize: 15 }}>Vérification de la numérisation{batch ? ` — ${batch.file_name}` : ''}</strong>
          {batch && <CanalChip canal={batch.channel || 'drh'} />}
          {batch?.channel === 'mail' && batch.source_meta && <span style={{ fontSize: 12, color: COLORS.muted }}>{[batch.source_meta.from, batch.source_meta.subject].filter(Boolean).join(' · ')}</span>}
          <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={onClose}><X size={14} /> Fermer</button>
        </div>
        {!batch && <Loader2 size={20} className="spin" />}
        {batch?.status === 'analyse' && (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted }}>
            <Loader2 size={22} className="spin" /><div style={{ marginTop: 8 }}>Reconnaissance des pages en cours… {batch.progress}/{batch.pages_total || '?'}</div>
          </div>
        )}
        {batch?.status === 'sans_crep' && <div style={{ color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '9px 11px', marginBottom: 10, fontSize: 12.5 }}>Aucun QR code de CREP n’a été reconnu automatiquement dans ce document reçu par mail. Vous pouvez <strong>relancer l’analyse</strong>, classer les pages à la main ci-dessous (agent et numéro de page), ou supprimer le lot. <button style={{ ...btnGhost, marginLeft: 8, padding: '2px 9px', fontSize: 12 }} onClick={async () => { try { await axios.post(`/api/entretiens/returns/batches/${batch.id}/reanalyse`, {}, { headers }); await load(); } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Relance impossible.' }); } }}><RotateCw size={12} /> Relancer l’analyse</button></div>}
        {batch?.status === 'echec' && <div style={{ color: COLORS.danger, padding: 12 }}>Analyse impossible : {batch.error}</div>}
        {batch && (batch.status === 'a_verifier' || batch.status === 'termine' || batch.status === 'sans_crep') && (
          <>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Les pages ont été reconnues grâce au QR code imprimé en haut à gauche de chaque page. Contrôlez chaque CREP reconstitué ({batch.expected_pages} pages attendues) :
              corrigez si besoin une page mal reconnue, puis validez. Le CREP est alors rattaché à l’agent et sa lecture par l’IA est lancée en parallèle.
            </div>
            {msg && <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12.5, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.text}</div>}

            {batch.orphans.length > 0 && (
              <div style={{ ...card, padding: 12, marginBottom: 12, borderColor: '#fcd34d', background: '#fffbeb' }}>
                <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={15} /> {batch.orphans.length} page(s) non reconnue(s) : indiquez l’agent et le numéro de page, ou écartez-les</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {batch.orphans.map(o => (
                    <div key={o.idx} style={{ width: 190 }}>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 3 }}>Page {o.idx} du fichier{o.foreign ? ` · QR lu : « ${o.foreign} »` : ''}</div>
                      <Thumb batchId={batch.id} idx={o.idx} rot={0} headers={headers} width={190} />
                      <PageControls p={{ idx: o.idx, page: 1, rot: 0, manual: false }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {batch.groups.map(g => (
                <div key={g.entretien_id} style={{ ...card, padding: 12, borderColor: g.complete ? '#bbf7d0' : '#fecaca' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input type="checkbox" checked={sel.has(g.entretien_id)} disabled={!g.complete || !!g.confirmed || batch.status === 'termine'}
                      onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(g.entretien_id); else n.delete(g.entretien_id); return n; })} />
                    <strong>{g.agent || `Entretien n° ${g.entretien_id} (inconnu)`}</strong>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>{[g.direction, g.service].filter(Boolean).join(' / ')}{g.evaluateur ? ` · évaluateur : ${g.evaluateur}` : ''}</span>
                    {g.confirmed ? <Chip text="Enregistré" color="#166534" bg="#dcfce7" />
                      : g.complete ? <Chip text={`Complet (${g.pages.length}/${batch.expected_pages})`} color="#166534" bg="#dcfce7" />
                      : <Chip text={`Incomplet (${g.pages.length}/${batch.expected_pages})`} color="#991b1b" bg="#fee2e2" />}
                    {g.missing.length > 0 && !g.confirmed && <Chip text={`Page(s) manquante(s) : ${g.missing.join(', ')}`} color="#991b1b" bg="#fee2e2" />}
                    {g.duplicates.length > 0 && <Chip text={`Page(s) en double : ${g.duplicates.join(', ')}`} color="#92400e" bg="#fef3c7" />}
                    {!g.confirmed && (() => {
                      const sg = g.signatures;
                      if (!sg) return g.pages.some(p => p.page === batch.expected_pages) ? <Chip text="Signatures : vérification en cours…" color="#475569" bg="#f1f5f9" /> : null;
                      if (sg.unknown) return <Chip text="Signatures : non déterminées, à vérifier sur le document" color="#475569" bg="#f1f5f9" />;
                      if (sg.agent && sg.evaluateur) return <Chip text="✔ 2 signatures vues (agent·e et évaluateur)" color="#166534" bg="#dcfce7" />;
                      return <Chip text={`⚠ Signature manquante : ${[!sg.agent && 'agent·e', !sg.evaluateur && 'évaluateur'].filter(Boolean).join(' et ')}`} color="#9a3412" bg="#ffedd5" />;
                    })()}
                    {g.already_received && !g.confirmed && <Chip text="CREP signé déjà reçu (sera remplacé)" color="#92400e" bg="#fef3c7" />}
                    {g.other_campaign && <Chip text="Autre campagne" color="#92400e" bg="#fef3c7" />}
                    {!g.known && <Chip text="Entretien introuvable" color="#991b1b" bg="#fee2e2" />}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {g.pages.map(p => (
                      <div key={p.idx} style={{ width: 150 }}>
                        <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>Page {p.page} · fichier p.{p.idx}{p.manual ? ' (corrigée)' : ''}</div>
                        <Thumb batchId={batch.id} idx={p.idx} rot={p.rot} headers={headers} width={150} />
                        {!g.confirmed && <PageControls p={p} g={g} />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {batch.groups.length === 0 && batch.orphans.length === 0 && <EmptyState icon={<ScanLine size={36} />} title="Aucune page reconnue" text="Aucun QR code de CREP n’a été détecté dans ce fichier." />}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, position: 'sticky', bottom: 0, background: '#fff', padding: '8px 0' }}>
              <button style={btnPrimary} disabled={busy || !sel.size || batch.status === 'termine'} onClick={validate}>
                {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Valider {sel.size} CREP et lancer la lecture
              </button>
              <span style={{ fontSize: 12, color: COLORS.muted }}>Seuls les CREP complets peuvent être validés.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Menu administrateur « Suivi des retours » : avancement des EP et numérisation en lot des CREP signés. */
export default function Retours() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [confirm, confirmDialog] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(0);
  const [data, setData] = useState<Summary | null>(null);
  const [batches, setBatches] = useState<BatchLine[]>([]);
  const [review, setReview] = useState<number | null>(null);
  const [reading, setReading] = useState<Row | null>(null);
  const [digital, setDigital] = useState<Row | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fDir, setFDir] = useState(''); const [fSvc, setFSvc] = useState(''); const [fEval, setFEval] = useState('');
  const [fState, setFState] = useState<'' | 'programme' | 'realise' | 'en_retard' | 'retourne' | 'a_retourner' | 'attente_num'>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    axios.get('/api/entretiens/campaigns', { headers }).then(r => {
      const list: Campaign[] = r.data || [];
      setCampaigns(list);
      setCampaignId((list.find(c => c.statut === 'ouverte') || list[0])?.id || 0);
    }).catch(() => {});
  }, [headers]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [s, b] = await Promise.all([
        axios.get(`/api/entretiens/returns/summary?campaign_id=${campaignId}`, { headers }),
        axios.get(`/api/entretiens/returns/batches?campaign_id=${campaignId}`, { headers }),
      ]);
      setData(s.data); setBatches(b.data || []);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); }
  }, [campaignId, headers]);
  useEffect(() => { setData(null); load(); }, [load]);

  const campaign = campaigns.find(c => c.id === campaignId);

  /** Ouvre le CREP d'un entretien dans un nouvel onglet : le CREP signé s'il existe, sinon la version saisie dans l'outil. */
  /** Supprime le retour de CREP d'un entretien (erreur d'affectation, mauvais document). */
  const deleteReturn = async (r: Row) => {
    if (!(await confirm(`Supprimer le retour de CREP de ${r.agent_nom} ${r.agent_prenom} ?

Le CREP signé numérisé est effacé, la réception par la DRH est retirée${r.statut === 'cloture' ? ' et l’entretien clôturé repasse à « réalisé »' : ''}. Le CREP pourra être revalidé depuis son lot, ou renvoyé.`, { title: 'Supprimer le retour de CREP', confirmLabel: 'Supprimer', danger: true }))) return;
    setMsg(null);
    try { await axios.delete(`/api/entretiens/returns/entretien/${r.id}`, { headers }); setMsg({ ok: true, text: 'Retour de CREP supprimé.' }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Suppression impossible.' }); }
  };

  const openCrep = async (r: Row, numerique = false) => {
    setMsg(null);
    const w = window.open('', '_blank');
    try {
      // numerique : CREP reconstitué par la lecture IA, présenté « en mode formulaire » (champs renseignés)
      const url = numerique ? `/api/entretiens/${r.id}/crep/digital.pdf?form=1` : signedOf(r) ? `/api/entretiens/${r.id}/crep-signe.pdf` : `/api/entretiens/${r.id}/crep.pdf`;
      const res = await axios.get(url, { headers, responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (w) w.location.href = blobUrl; else window.open(blobUrl, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (e: any) {
      if (w) w.close();
      let text = 'Ouverture du CREP impossible.';
      try { const t = e?.response?.data; if (t instanceof Blob) text = JSON.parse(await t.text()).message || text; } catch { /* message par défaut */ }
      setMsg({ ok: false, text });
    }
  };

  const upload = async (file: File) => {
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('campaign_id', String(campaignId));
      const r = await axios.post('/api/entretiens/returns/batches', fd, { headers });
      await load();
      setReview(r.data.id);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Envoi impossible.' }); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const deleteBatch = async (b: BatchLine) => {
    if (!(await confirm(`Supprimer le lot « ${b.file_name} » ? Les CREP déjà enregistrés pour les agents ne sont pas affectés.`, { title: 'Supprimer le lot', confirmLabel: 'Supprimer', danger: true }))) return;
    try { await axios.delete(`/api/entretiens/returns/batches/${b.id}`, { headers }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Suppression impossible.' }); }
  };

  const rows = data?.rows || [];
  const uniq = (k: keyof Row) => [...new Set(rows.map(r => String(r[k] || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const shown = rows.filter(r => {
    if (fDir && r.direction !== fDir) return false;
    if (fSvc && r.service !== fSvc) return false;
    if (fEval && r.evaluator_nom !== fEval) return false;
    if (fState === 'programme' && !r.programme) return false;
    if (fState === 'realise' && !r.realise) return false;
    if (fState === 'en_retard' && !r.en_retard) return false;
    if (fState === 'retourne' && !r.retourne) return false;
    if (fState === 'a_retourner' && (!r.realise || r.retourne)) return false;
    if (fState === 'attente_num' && !(r.transmis_simple && !r.retourne)) return false;
    if (q && !`${r.agent_nom} ${r.agent_prenom}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const k = data?.kpis;
  const pct = (n: number) => { if (!k || !k.total) return ""; const v = (100 * n) / k.total; return `${v > 0 && v < 1 ? v.toFixed(1).replace(".", ",") : Math.round(v)} %`; };

  return (
    <div>
      {confirmDialog}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, fontWeight: 800, color: COLORS.text }}><ClipboardCheck size={18} color={COLORS.primary} /> Suivi des retours</div>
        <select style={{ ...input, width: 'auto' }} value={campaignId} onChange={e => setCampaignId(Number(e.target.value))}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle || `Campagne ${c.annee}`}</option>)}
        </select>
        {campaign?.mode_simple && <Chip text="Mode simple" color="#5b21b6" bg="#ede9fe" />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <button style={btnPrimary} disabled={uploading || !campaignId} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Téléverser des CREP
          </button>
        </div>
      </div>
      {msg && <div style={{ ...card, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.text}</div>}

      {!data ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KpiCard label="Entretiens" value={k!.total} color={COLORS.primary} onClick={() => setFState('')} active={fState === ''} />
            <KpiCard label="Programmés" value={k!.programmes} sub={pct(k!.programmes)} color="#0369a1" onClick={() => setFState('programme')} active={fState === 'programme'} />
            <KpiCard label="Réalisés" value={k!.realises} sub={pct(k!.realises)} color={COLORS.success} onClick={() => setFState('realise')} active={fState === 'realise'} />
            <KpiCard label="En retard (date dépassée)" value={k!.en_retard} color={COLORS.danger} onClick={() => setFState('en_retard')} active={fState === 'en_retard'} />
            <KpiCard label="CREP retournés" value={k!.retournes} sub={pct(k!.retournes)} color="#7c3aed" onClick={() => setFState('retourne')} active={fState === 'retourne'} />
            {campaign?.mode_simple && <KpiCard label="Transmis, à numériser" value={k!.en_attente_numerisation} color="#b45309" onClick={() => setFState('attente_num')} active={fState === 'attente_num'} />}
          </div>

          {batches.length > 0 && (
            <div style={{ ...card, padding: 12, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Lots numérisés et CREP reçus par mail{batches.some(b => b.status === 'a_verifier') ? ` — ${batches.filter(b => b.status === 'a_verifier').length} à vérifier` : ''}</div>
              {batches.map(b => (
                <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', fontSize: 12.5, borderTop: `1px solid ${COLORS.border}` }}>
                  <CanalChip canal={b.channel || 'drh'} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.file_name} <span style={{ color: COLORS.muted }}>· {fmtDate(b.created_at)} · {b.channel === 'mail' ? [b.source_meta?.from, b.source_meta?.subject].filter(Boolean).join(' · ') : b.created_by}</span></span>
                  <Chip text={b.status === 'analyse' ? `Analyse ${b.progress}/${b.pages_total || '?'}` : b.status === 'a_verifier' ? 'À vérifier' : b.status === 'termine' ? 'Terminé' : b.status === 'sans_crep' ? 'Aucun CREP reconnu' : 'Échec'}
                    color={b.status === 'termine' ? '#166534' : b.status === 'echec' ? '#991b1b' : b.status === 'sans_crep' ? '#475569' : '#92400e'} bg={b.status === 'termine' ? '#dcfce7' : b.status === 'echec' ? '#fee2e2' : b.status === 'sans_crep' ? '#f1f5f9' : '#fef3c7'} />
                  <button style={{ ...btnGhost, padding: '3px 9px', fontSize: 12 }} onClick={() => setReview(b.id)}>Ouvrir</button>
                  <button style={{ ...btnGhost, padding: '3px 7px' }} title="Supprimer le lot" onClick={() => deleteBatch(b)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input style={{ ...input, width: 170 }} placeholder="Rechercher un agent…" value={q} onChange={e => setQ(e.target.value)} />
            <select style={{ ...input, width: 'auto' }} value={fDir} onChange={e => setFDir(e.target.value)}><option value="">Toutes les directions</option>{uniq('direction').map(v => <option key={v}>{v}</option>)}</select>
            <select style={{ ...input, width: 'auto' }} value={fSvc} onChange={e => setFSvc(e.target.value)}><option value="">Tous les services</option>{uniq('service').map(v => <option key={v}>{v}</option>)}</select>
            <select style={{ ...input, width: 'auto' }} value={fEval} onChange={e => setFEval(e.target.value)}><option value="">Tous les évaluateurs</option>{uniq('evaluator_nom').map(v => <option key={v}>{v}</option>)}</select>
            <select style={{ ...input, width: 'auto' }} value={fState} onChange={e => setFState(e.target.value as any)}>
              <option value="">Tous les états</option><option value="programme">Programmés</option><option value="realise">Réalisés</option><option value="en_retard">En retard</option>
              <option value="retourne">CREP retournés</option><option value="a_retourner">Réalisés, CREP non retourné</option>{campaign?.mode_simple && <option value="attente_num">Transmis, à numériser</option>}
            </select>
          </div>

          {shown.length === 0 ? <EmptyState icon={<ClipboardCheck size={40} />} title="Aucun entretien" text="Aucun entretien ne correspond aux filtres." /> : (
            <div style={{ ...card, padding: 0, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr>
                  <Th>Agent</Th><Th>Direction / Service</Th><Th>Évaluateur</Th><Th>Date de l’EP</Th><Th>Réalisation</Th>{campaign?.mode_simple && <Th>Transmis DRH</Th>}<Th>CREP retourné</Th><Th>Canal</Th><Th>CREP papier</Th><Th>CREP numérique</Th><Th>Lecture IA</Th>
                </tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <Td><strong>{r.agent_nom}</strong> {r.agent_prenom}</Td>
                      <Td>{[r.direction, r.service].filter(Boolean).join(' / ')}</Td>
                      <Td>{r.evaluator_nom}</Td>
                      <Td>{r.programme ? fmtDate(r.date_entretien) : <span style={{ color: '#94a3b8' }}>Non programmé</span>}</Td>
                      <Td>{r.realise ? <Chip text="Réalisé" color="#166534" bg="#dcfce7" /> : r.en_retard ? <Chip text="En retard" color="#991b1b" bg="#fee2e2" /> : r.programme ? <Chip text="Programmé" color="#075985" bg="#e0f2fe" /> : <Chip text="À planifier" color="#475569" bg="#f1f5f9" />}</Td>
                      {campaign?.mode_simple && <Td>{r.transmis_simple ? <Chip text={fmtDay(r.simple_sent_at) || 'Oui'} color="#92400e" bg="#fef3c7" /> : <span style={{ color: '#94a3b8' }}>—</span>}</Td>}
                      <Td>{r.retourne ? <Chip text={fmtDay(r.crep_signed_at || r.drh_received_at) || 'Reçu'} color="#5b21b6" bg="#ede9fe" /> : <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                      <Td><CanalChip canal={r.crep_canal} detail={r.crep_canal_detail} /></Td>
                      <Td>{signedOf(r)
                        ? <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5, ...(signedOf(r) && r.signatures === 'ok' ? { background: '#dcfce7', color: '#166534', borderColor: '#86efac' } : signedOf(r) && r.signatures === 'manque' ? { background: '#ffedd5', color: '#9a3412', borderColor: '#fdba74' } : {}) }} onClick={() => openCrep(r)}
                            title={r.signatures === 'ok' ? 'Les 2 signatures (agent·e et évaluateur) sont présentes' : r.signatures === 'manque' ? `Signature manquante : ${[!r.signatures_detail?.agent && 'agent·e', !r.signatures_detail?.evaluateur && 'évaluateur'].filter(Boolean).join(' et ')} (détection automatique, à vérifier sur le document)` : 'Signatures non vérifiées (lecture du document en cours ou indisponible)'}><Eye size={12} /> Signé</button>
                        : <span style={{ color: '#94a3b8' }}>—</span>}
                        {r.retourne && <button style={{ ...btnGhost, padding: '2px 6px', marginLeft: 4 }} title="Supprimer le retour de CREP" onClick={() => deleteReturn(r)}><Trash2 size={12} /></button>}</Td>
                      <Td>{r.lecture_statut === 'termine'
                        ? <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} onClick={() => setDigital(r)} title="CREP numérique : formulaire de saisie en lecture seule, renseigné avec la lecture IA du document signé"><FileText size={12} /> Formulaire</button>
                        : r.evaluation_statut === 'soumis'
                          ? <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} onClick={() => openCrep(r)} title="CREP saisi dans l’outil (PDF des 4 pages)"><FileText size={12} /> Saisi</button>
                          : <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                      <Td>{r.lecture_statut ? <button style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} onClick={() => setReading(r)}><FileSearch size={12} /> {r.lecture_statut === 'termine' ? 'Voir' : r.lecture_statut === 'echec' ? 'Échec' : 'En cours'}</button> : <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {review !== null && <BatchReview batchId={review} people={rows} headers={headers} onClose={() => { setReview(null); load(); }} onDone={(m) => { load(); if (m) { setReview(null); setMsg({ ok: true, text: m }); } }} />}
      {digital && <DigitalCrepModal entretienId={digital.id} label={`${digital.agent_nom} ${digital.agent_prenom}`} headers={headers} onClose={() => setDigital(null)} />}
      {reading && <ReadingModal entretienId={reading.id} label={`${reading.agent_nom} ${reading.agent_prenom}`} headers={headers} onClose={() => setReading(null)} />}
    </div>
  );
}
