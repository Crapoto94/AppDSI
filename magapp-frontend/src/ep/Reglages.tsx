import { useCallback, useEffect, useMemo, useState } from 'react';
import SimulationPanel from './SimulationPanel';
import IaPrompts from './IaPrompts';
import MailTemplates from './MailTemplates';
import ScanReadingPanel from './ScanReadingPanel';
import OfflineFormPanel from './OfflineFormPanel';
import DisplayPanel from './DisplayPanel';
import axios from 'axios';
import {
  Settings, CalendarRange, UserCog, Trash2, Save, Loader2, Search,
  Mail, CheckCircle2, AlertCircle, Info, CalendarPlus, Sparkles, Power, UserCheck, UserPlus, FileText, Download, RotateCcw, Lock, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from './useAuth';
import type { Campaign } from './types';
import { formatDateFr } from './types';
import { COLORS, Field, btnDanger, btnGhost, btnPrimary, card, input } from './ui';
import BaseAgents from './BaseAgents';
import MiniRichEditor from './MiniRichEditor';
import MarkdownEditor from './MarkdownEditor';

interface AgentOption { username: string; displayName: string; email: string; service?: string }

interface AdminRow {
  id: number;
  username: string;
  email?: string | null;
  display_name?: string | null;
}

interface AiEvaluatorRef {
  username: string;
  email: string;
  display_name: string;
}

type AiFeatureKey = 'draft' | 'review';

interface AiFeatureUi {
  enabled: boolean;
  all: boolean;
  evaluators: AiEvaluatorRef[];
  query: string;
  msg: { ok: boolean; text: string } | null;
  saving: 'all' | 'selection' | 'disable' | null;
}

const emptyAiFeature = (): AiFeatureUi => ({ enabled: false, all: false, evaluators: [], query: '', msg: null, saving: null });

function AccessCard({
  title, description, entriesLabel, entryOne, entryMany,
  enabled, all, entries, candidates, query, msg, saving, onQuery, onToggle, onSave,
}: {
  title: string;
  description: string;
  entriesLabel: string;
  entryOne: string;
  entryMany: string;
  enabled: boolean;
  all: boolean;
  entries: AiEvaluatorRef[];
  candidates: AiEvaluatorRef[];
  query: string;
  msg: { ok: boolean; text: string } | null;
  saving: 'all' | 'selection' | 'disable' | null;
  onQuery: (v: string) => void;
  onToggle: (e: AiEvaluatorRef) => void;
  onSave: (mode: 'all' | 'selection' | 'disable') => void;
}) {
  // Liste des bénéficiaires potentiels repliée par défaut (on ne l'affiche que si l'administrateur la demande)
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const visible = q
    ? candidates.filter(c => `${c.display_name || ''} ${c.username || ''} ${c.email || ''}`.toLowerCase().includes(q))
    : candidates;
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          <Sparkles size={17} color={COLORS.primary} /> {title}
          <span style={{
            fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px',
            background: enabled ? '#dcfce7' : '#f1f5f9', color: enabled ? '#166534' : '#64748b',
          }}>
            {!enabled ? 'Désactivée' : all ? `Activée pour tous les ${entryMany}` : `Activée · ${entries.length} ${entries.length > 1 ? entryMany : entryOne}`}
          </span>
        </div>
        <button
          style={enabled ? btnDanger : btnPrimary}
          disabled={saving !== null}
          onClick={() => onSave(enabled ? 'disable' : 'all')}
        >
          {saving === 'disable' || saving === 'all' ? <Loader2 size={14} /> : <Power size={14} />} {enabled ? 'Désactiver pour tous' : 'Réactiver pour tous'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>{description}</p>

      {msg && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>
          {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: open ? 8 : 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <UserCheck size={15} color={COLORS.primary} /> {entriesLabel}
          <span style={{ fontWeight: 600, color: '#94a3b8' }}>· {entries.length} {entries.length > 1 ? entryMany : entryOne} sélectionné{entries.length > 1 ? 's' : ''} — {open ? 'masquer' : 'choisir'}</span>
        </button>

        {open && <>
        <div style={{ position: 'relative', maxWidth: 420, marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ ...input, paddingLeft: 31 }} placeholder="Rechercher un nom, un identifiant ou un e-mail…"
            value={query} onChange={e => onQuery(e.target.value)} />
        </div>

        {entries.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {entries.map(e => (
              <span key={`${e.username || e.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eef2ff', color: COLORS.primary, borderRadius: 999, padding: '3px 5px 3px 10px', fontSize: 11.5, fontWeight: 700 }}>
                {e.display_name || e.username || e.email}
                <button type="button" onClick={() => onToggle(e)} title="Retirer"
                  style={{ border: 'none', background: 'none', color: COLORS.primary, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>×</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 4 }}>
          {visible.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12.5, color: '#94a3b8' }}>
              {candidates.length === 0 ? 'Aucune personne disponible pour l’instant.' : 'Aucun résultat.'}
            </div>
          ) : visible.map(c => {
            const checked = entries.some(x => `${x.username || x.email}`.toLowerCase() === `${c.username || c.email}`.toLowerCase());
            return (
              <label key={`${c.username || c.email}`} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 9px', borderRadius: 7, cursor: 'pointer', background: checked ? '#eef2ff' : 'transparent' }}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(c)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{c.display_name || c.username || c.email}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{[c.username, c.email].filter(Boolean).join(' · ')}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button style={btnPrimary} disabled={saving !== null || entries.length === 0} onClick={() => onSave('selection')}>
            {saving === 'selection' ? <Loader2 size={15} /> : <Sparkles size={15} />}
            {enabled && !all ? 'Enregistrer la sélection' : 'Activer pour la sélection'}
          </button>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{entries.length} {entries.length > 1 ? entryMany : entryOne} sélectionné{entries.length > 1 ? 's' : ''}</span>
        </div>
        </>}
      </div>
    </div>
  );
}

const AI_CARDS: Array<{ key: AiFeatureKey; title: string; description: string; noun: string }> = [
  {
    key: 'draft',
    title: 'Rédaction assistée de l’entretien',
    description: 'Boutons « Rédiger avec l’IA » dans la saisie du compte rendu (observations, appréciation générale).',
    noun: 'la rédaction assistée',
  },
  {
    key: 'review',
    title: 'Relecture IA de l’évaluation des compétences',
    description: 'Analyse du compte rendu lors de la vérification globale : points à vérifier signalés par l’IA sur l’évaluation des compétences.',
    noun: 'l’évaluation des compétences par l’IA',
  },
];

const emptyCampaign = {
  id: 0,
  annee: new Date().getFullYear() + 1,
  libelle: '',
  date_ouverture: '',
  date_cloture: '',
  date_limite_ep: '',
  statut: 'ouverte',
  instructions: '',
};

type CampaignForm = typeof emptyCampaign;

function toForm(c: Campaign): CampaignForm {
  return {
    id: c.id,
    annee: c.annee,
    libelle: c.libelle || '',
    date_ouverture: c.date_ouverture || '',
    date_cloture: c.date_cloture || '',
    date_limite_ep: c.date_limite_ep || '',
    statut: c.statut || 'ouverte',
    instructions: c.instructions || '',
  };
}

export default function Reglages({ onChanged }: { onChanged?: () => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<number | 'new'>('new');
  const [campForm, setCampForm] = useState<CampaignForm>(emptyCampaign);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campMsg, setCampMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminKey, setAdminKey] = useState(0);
  const [adminMsg, setAdminMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Rôle « pilotage » : voit l'onglet Pilotage (lecture seule, sans accès aux CREP)
  const [pilots, setPilots] = useState<AdminRow[]>([]);
  const [pilotKey, setPilotKey] = useState(0);
  const [pilotMsg, setPilotMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [organizer, setOrganizer] = useState('');
  const [organizerMsg, setOrganizerMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingOrganizer, setSavingOrganizer] = useState(false);

  // Fonctions IA (rédaction / relecture des compétences) : désactivées par défaut,
  // activées pour des évaluateurs choisis.
  const [ai, setAi] = useState<Record<AiFeatureKey, AiFeatureUi>>({ draft: emptyAiFeature(), review: emptyAiFeature() });
  const [aiCandidates, setAiCandidates] = useState<AiEvaluatorRef[]>([]);

  // Accès des agents à leur espace « Mon entretien » : fermé par défaut.
  const [self, setSelf] = useState<AiFeatureUi>(emptyAiFeature());
  const [selfCandidates, setSelfCandidates] = useState<AiEvaluatorRef[]>([]);

  // Signature électronique du CREP : fermée par défaut, ouverte à des agents choisis.
  const [esign, setEsign] = useState<AiFeatureUi>(emptyAiFeature());
  const [esignCandidates, setEsignCandidates] = useState<AiEvaluatorRef[]>([]);

  // Note à l'attention de la Direction générale : éditable par les administrateurs du module.
  const [sub, setSub] = useState<'general' | 'agents' | 'admins' | 'options' | 'mails' | 'ia'>('general');
  const [dgNote, setDgNote] = useState('');
  const [dgNoteDefault, setDgNoteDefault] = useState('');
  const [showDgNote, setShowDgNote] = useState(false);
  const [dgNoteDraft, setDgNoteDraft] = useState('');
  const [dgNoteSaving, setDgNoteSaving] = useState(false);
  const [dgNoteMsg, setDgNoteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/campaigns', { headers });
      const list: Campaign[] = Array.isArray(r.data) ? r.data : [];
      setCampaigns(list);
      setSelectedId(prev => (prev === 'new' ? (list[0]?.id ?? 'new') : prev));
    } catch { /* ignore */ }
  }, [token]);

  const loadAdmins = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/admins', { headers });
      setAdmins(Array.isArray(r.data) ? r.data : []);
    } catch { /* ignore */ }
  }, [token]);

  const loadPilots = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/pilotage-users', { headers });
      setPilots(Array.isArray(r.data) ? r.data : []);
    } catch { /* ignore */ }
  }, [token]);

  const loadSettings = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/settings', { headers });
      setOrganizer(r.data.calendar_organizer_email || '');
      setDgNote(r.data.dg_note || '');
      setDgNoteDefault(r.data.dg_note_default || '');
      const remote = r.data.ai || {};
      const toUi = (feature: AiFeatureKey, prev: AiFeatureUi): AiFeatureUi => ({
        ...prev,
        enabled: !!remote[feature]?.enabled,
        all: !!remote[feature]?.all,
        evaluators: Array.isArray(remote[feature]?.evaluators) ? remote[feature].evaluators : [],
      });
      setAi(prev => ({ draft: toUi('draft', prev.draft), review: toUi('review', prev.review) }));
      setAiCandidates(Array.isArray(remote.candidates) ? remote.candidates : []);
      const remoteSelf = r.data.self || {};
      setSelf(prev => ({
        ...prev,
        enabled: !!remoteSelf.enabled,
        all: !!remoteSelf.all,
        evaluators: Array.isArray(remoteSelf.agents) ? remoteSelf.agents : [],
      }));
      setSelfCandidates(Array.isArray(remoteSelf.candidates) ? remoteSelf.candidates : []);
      const remoteEsign = r.data.esign || {};
      setEsign(prev => ({
        ...prev,
        enabled: !!remoteEsign.enabled,
        all: !!remoteEsign.all,
        evaluators: Array.isArray(remoteEsign.agents) ? remoteEsign.agents : [],
      }));
      setEsignCandidates(Array.isArray(remoteEsign.candidates) ? remoteEsign.candidates : []);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadCampaigns(); loadAdmins(); loadPilots(); loadSettings(); }, [loadCampaigns, loadAdmins, loadPilots, loadSettings]);

  useEffect(() => {
    if (selectedId === 'new') { setCampForm(emptyCampaign); return; }
    const c = campaigns.find(x => x.id === selectedId);
    if (c) setCampForm(toForm(c));
  }, [selectedId, campaigns]);

  // CLORE LA CAMPAGNE : les documents ne sont plus consultables par les valideurs ; les CREP se consultent dans le dossier de l'agent
  const closeCampaign = async () => {
    if (!campForm.id) return;
    if (!window.confirm(`Clore la campagne « ${campForm.libelle || campForm.annee} » ?

Les évaluateur·rice·s ne pourront plus consulter les documents des entretiens dans ce module : les CREP clôturés seront consultables dans le dossier de l’agent·e. Les administrateurs gardent l’accès.

Cette action est définitive.`)) return;
    setSavingCampaign(true); setCampMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/campaigns/${campForm.id}/close`, {}, { headers });
      const n = Number(r.data?.entretiens_non_clotures || 0);
      setCampMsg({ ok: true, text: `Campagne close.${n ? ` Attention : ${n} entretien(s) n’étaient pas clôturés.` : ''}` });
      await loadCampaigns();
    } catch (e: any) { setCampMsg({ ok: false, text: e?.response?.data?.message || 'Clôture de la campagne impossible.' }); } finally { setSavingCampaign(false); }
  };

  const saveCampaign = async () => {
    setCampMsg(null);
    setSavingCampaign(true);
    try {
      const payload = {
        annee: Number(campForm.annee),
        libelle: campForm.libelle,
        date_ouverture: campForm.date_ouverture || null,
        date_cloture: campForm.date_cloture || null,
        date_limite_ep: campForm.date_limite_ep || null,
        statut: campForm.statut,
        instructions: campForm.instructions,
      };
      const r = campForm.id
        ? await axios.put(`/api/entretiens/campaigns/${campForm.id}`, payload, { headers })
        : await axios.post('/api/entretiens/campaigns', payload, { headers });
      setCampMsg({ ok: true, text: campForm.id ? 'Campagne mise à jour.' : 'Campagne créée.' });
      await loadCampaigns();
      setSelectedId(r.data.id);
      onChanged?.();
    } catch (e: any) {
      setCampMsg({ ok: false, text: e.response?.data?.message || 'Enregistrement impossible' });
    } finally { setSavingCampaign(false); }
  };

  const addAdmin = async (hit: AgentOption) => {
    const payload = { username: hit.username, email: hit.email, display_name: hit.displayName };
    if (!payload.username) return;
    setAdminMsg(null);
    try {
      await axios.post('/api/entretiens/admins', payload, { headers });
      setAdminKey(k => k + 1);
      setAdminMsg({ ok: true, text: 'Administrateur du module ajouté.' });
      loadAdmins();
    } catch (e: any) {
      setAdminMsg({ ok: false, text: e.response?.data?.message || 'Ajout impossible' });
    }
  };

  const addPilot = async (hit: AgentOption) => {
    const payload = { username: hit.username, email: hit.email, display_name: hit.displayName };
    if (!payload.username) return;
    setPilotMsg(null);
    try {
      await axios.post('/api/entretiens/pilotage-users', payload, { headers });
      setPilotKey(k => k + 1);
      setPilotMsg({ ok: true, text: 'Rôle pilotage ajouté.' });
      loadPilots();
    } catch (e: any) {
      setPilotMsg({ ok: false, text: e.response?.data?.message || 'Ajout impossible' });
    }
  };

  const removePilot = async (a: AdminRow) => {
    if (!window.confirm(`Retirer le rôle pilotage à ${a.display_name || a.username} ?`)) return;
    try {
      await axios.delete(`/api/entretiens/pilotage-users/${a.id}`, { headers });
      loadPilots();
    } catch (e: any) {
      setPilotMsg({ ok: false, text: e.response?.data?.message || 'Suppression impossible' });
    }
  };

  const removeAdmin = async (a: AdminRow) => {
    if (!window.confirm(`Retirer les droits d’administration du module à ${a.display_name || a.username} ?`)) return;
    try {
      await axios.delete(`/api/entretiens/admins/${a.id}`, { headers });
      loadAdmins();
    } catch (e: any) {
      setAdminMsg({ ok: false, text: e.response?.data?.message || 'Suppression impossible' });
    }
  };

  const saveOrganizer = async () => {
    setOrganizerMsg(null); setSavingOrganizer(true);
    try {
      await axios.put('/api/entretiens/settings', { calendar_organizer_email: organizer.trim() }, { headers });
      setOrganizerMsg({ ok: true, text: 'Paramètre enregistré.' });
    } catch (e: any) {
      setOrganizerMsg({ ok: false, text: e.response?.data?.message || 'Enregistrement impossible' });
    } finally { setSavingOrganizer(false); }
  };

  const aiKey = (e: AiEvaluatorRef) => (e.username || e.email || '').toLowerCase();
  const patchAi = (feature: AiFeatureKey, patch: Partial<AiFeatureUi>) => {
    setAi(prev => ({ ...prev, [feature]: { ...prev[feature], ...patch } }));
  };
  const toggleAiEvaluator = (feature: AiFeatureKey, e: AiEvaluatorRef) => {
    const current = ai[feature].evaluators;
    const isSelected = current.some(x => aiKey(x) === aiKey(e));
    patchAi(feature, {
      msg: null,
      evaluators: isSelected ? current.filter(x => aiKey(x) !== aiKey(e)) : [...current, e],
    });
  };

  const saveAi = async (feature: AiFeatureKey, mode: 'all' | 'selection' | 'disable') => {
    const meta = AI_CARDS.find(c => c.key === feature)!;
    const current = ai[feature];
    if (mode === 'disable' && !window.confirm(`Désactiver ${meta.noun} pour tous les évaluateurs ?`)) return;
    if (mode === 'selection' && current.evaluators.length === 0) {
      patchAi(feature, { msg: { ok: false, text: 'Sélectionnez au moins un évaluateur avant d’activer l’IA.' } });
      return;
    }
    patchAi(feature, { msg: null, saving: mode });
    try {
      const payload = mode === 'disable'
        ? { [`ai_${feature}_enabled`]: false }
        : mode === 'all'
          ? { [`ai_${feature}_enabled`]: true, [`ai_${feature}_all`]: true }
          : { [`ai_${feature}_enabled`]: true, [`ai_${feature}_all`]: false, [`ai_${feature}_evaluators`]: current.evaluators };
      const r = await axios.put('/api/entretiens/settings', payload, { headers });
      const next = r.data.ai?.[feature];
      patchAi(feature, {
        enabled: !!next?.enabled,
        all: !!next?.all,
        evaluators: Array.isArray(next?.evaluators) ? next.evaluators : [],
        saving: null,
        msg: {
          ok: true,
          text: mode === 'disable'
            ? `${meta.title} désactivée pour tous les évaluateurs.`
            : mode === 'all'
              ? `${meta.title} activée pour tous les évaluateurs.`
              : `${meta.title} activée pour ${(next?.evaluators || []).length} évaluateur(s).`,
        },
      });
      setAiCandidates(Array.isArray(r.data.ai?.candidates) ? r.data.ai.candidates : aiCandidates);
    } catch (e: any) {
      patchAi(feature, { saving: null, msg: { ok: false, text: e.response?.data?.message || 'Enregistrement impossible' } });
    }
  };

  const patchSelf = (patch: Partial<AiFeatureUi>) => setSelf(prev => ({ ...prev, ...patch }));
  const toggleSelfAgent = (e: AiEvaluatorRef) => {
    const isSelected = self.evaluators.some(x => aiKey(x) === aiKey(e));
    patchSelf({
      msg: null,
      evaluators: isSelected ? self.evaluators.filter(x => aiKey(x) !== aiKey(e)) : [...self.evaluators, e],
    });
  };
  const saveSelf = async (mode: 'all' | 'selection' | 'disable') => {
    if (mode === 'disable' && !window.confirm('Fermer « Mon entretien » pour tous les agent·e·s ?')) return;
    if (mode === 'selection' && self.evaluators.length === 0) {
      patchSelf({ msg: { ok: false, text: 'Sélectionnez au moins un·e agent·e avant d’ouvrir « Mon entretien ».' } });
      return;
    }
    patchSelf({ msg: null, saving: mode });
    try {
      const payload = mode === 'disable'
        ? { self_enabled: false }
        : mode === 'all'
          ? { self_enabled: true, self_all: true }
          : { self_enabled: true, self_all: false, self_agents: self.evaluators };
      const r = await axios.put('/api/entretiens/settings', payload, { headers });
      const next = r.data.self || {};
      patchSelf({
        enabled: !!next.enabled,
        all: !!next.all,
        evaluators: Array.isArray(next.agents) ? next.agents : [],
        saving: null,
        msg: {
          ok: true,
          text: mode === 'disable'
            ? '« Mon entretien » est fermé pour tous les agent·e·s.'
            : mode === 'all'
              ? '« Mon entretien » est ouvert à tous les agent·e·s.'
              : `« Mon entretien » est ouvert à ${(next.agents || []).length} agent·e(s).`,
        },
      });
      setSelfCandidates(Array.isArray(next.candidates) ? next.candidates : selfCandidates);
    } catch (e: any) {
      patchSelf({ saving: null, msg: { ok: false, text: e.response?.data?.message || 'Enregistrement impossible' } });
    }
  };

  const patchEsign = (patch: Partial<AiFeatureUi>) => setEsign(prev => ({ ...prev, ...patch }));
  const toggleEsignAgent = (e: AiEvaluatorRef) => {
    const isSelected = esign.evaluators.some(x => aiKey(x) === aiKey(e));
    patchEsign({
      msg: null,
      evaluators: isSelected ? esign.evaluators.filter(x => aiKey(x) !== aiKey(e)) : [...esign.evaluators, e],
    });
  };
  const saveEsign = async (mode: 'all' | 'selection' | 'disable') => {
    if (mode === 'disable' && !window.confirm('Fermer la signature électronique du compte rendu pour tous les agent·e·s ?')) return;
    if (mode === 'selection' && esign.evaluators.length === 0) {
      patchEsign({ msg: { ok: false, text: 'Sélectionnez au moins un·e agent·e avant d’ouvrir la signature électronique.' } });
      return;
    }
    patchEsign({ msg: null, saving: mode });
    try {
      const payload = mode === 'disable'
        ? { esign_enabled: false }
        : mode === 'all'
          ? { esign_enabled: true, esign_all: true }
          : { esign_enabled: true, esign_all: false, esign_agents: esign.evaluators };
      const r = await axios.put('/api/entretiens/settings', payload, { headers });
      const next = r.data.esign || {};
      patchEsign({
        enabled: !!next.enabled,
        all: !!next.all,
        evaluators: Array.isArray(next.agents) ? next.agents : [],
        saving: null,
        msg: {
          ok: true,
          text: mode === 'disable'
            ? 'Signature électronique fermée pour tous les agent·e·s.'
            : mode === 'all'
              ? 'Signature électronique ouverte à tous les agent·e·s.'
              : `Signature électronique ouverte à ${(next.agents || []).length} agent·e(s).`,
        },
      });
      setEsignCandidates(Array.isArray(next.candidates) ? next.candidates : esignCandidates);
    } catch (e: any) {
      patchEsign({ saving: null, msg: { ok: false, text: e.response?.data?.message || 'Enregistrement impossible' } });
    }
  };

  const openDgNote = () => {
    setDgNoteDraft(dgNote);
    setDgNoteMsg(null);
    setShowDgNote(true);
  };

  const saveDgNote = async () => {
    setDgNoteSaving(true); setDgNoteMsg(null);
    try {
      const r = await axios.put('/api/entretiens/settings', { dg_note: dgNoteDraft }, { headers });
      setDgNote(r.data.dg_note || dgNoteDraft);
      setDgNoteMsg({ ok: true, text: 'Note enregistrée.' });
      onChanged?.();
    } catch (e) {
      setDgNoteMsg({ ok: false, text: axios.isAxiosError(e) ? (e.response?.data?.message || 'Enregistrement impossible.') : 'Enregistrement impossible.' });
    } finally { setDgNoteSaving(false); }
  };

  const downloadDgNote = () => {
    const blob = new Blob([dgNoteDraft || dgNote], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NOTE-DG-ENTRETIENS-PROFESSIONNELS.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 16 }}>
        <Settings size={17} color={COLORS.primary} /> Paramétrage du module
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
        {([['general', 'Général'], ['agents', 'Agent·e·s à évaluer'], ['admins', 'Administrateurs'], ['options', 'Options'], ['mails', 'Modèles d’e-mails'], ['ia', 'IA (prompts)']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13.5, fontWeight: 700, color: sub === k ? COLORS.primary : '#64748b', borderBottom: `2px solid ${sub === k ? COLORS.primary : 'transparent'}`, marginBottom: -1 }}>{l}</button>
        ))}
      </div>
      {sub === 'ia' && <IaPrompts />}
      {sub === 'mails' && <MailTemplates />}
      <div style={{ display: sub === 'ia' || sub === 'mails' ? 'none' : 'block' }}>

      {sub === 'general' && (<>
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
            <FileText size={17} color={COLORS.primary} /> Note à l'attention de la Direction générale
          </div>
          <button style={btnGhost} onClick={openDgNote}>
            <FileText size={14} /> Ouvrir / modifier la note
          </button>
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
          Note de cadrage sur le fonctionnement des entretiens professionnels, les évaluateur·rice·s, le papier et le dématérialisé, les bénéfices et la DPD.
          Le texte est éditable et conservé pour les prochains administrateurs.
        </div>
      </div>

      {/* Rôle pilotage */}
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>
          <UserCog size={17} color={COLORS.primary} /> Rôle pilotage
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
          Ces agent·e·s voient le menu <strong>Pilotage</strong> (avancement par direction, liste des entretiens) <strong>en lecture seule</strong> :
          ils n’ont accès ni aux CREP, ni aux actions sur les agent·e·s (impression, ouverture, remise à zéro…), réservées aux administrateurs.
        </p>
        <div style={{ marginBottom: 10, maxWidth: 520 }}>
          <AdminAgentSearch key={pilotKey} onSelect={addPilot} />
        </div>
        {pilotMsg && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: pilotMsg.ok ? COLORS.success : COLORS.danger }}>
            {pilotMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {pilotMsg.text}
          </div>
        )}
        {pilots.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucun agent·e avec le rôle pilotage pour l’instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {pilots.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: '8px 11px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{a.display_name || a.username}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.username}{a.email ? ` · ${a.email}` : ''}</div>
                </div>
                <button style={btnDanger} onClick={() => removePilot(a)}><Trash2 size={13} /> Retirer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      </>)}

      {sub === 'options' && (<>
      <DisplayPanel />

      <ScanReadingPanel />

      <OfflineFormPanel />

      <SimulationPanel />

      </>)}

      {sub === 'agents' && (<>
      {/* Base des agents à évaluer (classeur « Outil CREP DSI ») */}
      <BaseAgents />

      </>)}

      {sub === 'general' && (<>
      {/* Campagnes */}
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text }}>
            <CalendarRange size={17} color={COLORS.primary} /> Campagnes d’entretiens
          </div>
          <button style={btnGhost} onClick={() => setSelectedId('new')}>
            <CalendarPlus size={14} /> Nouvelle campagne
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {campaigns.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${selectedId === c.id ? COLORS.primary : COLORS.border}`,
                background: selectedId === c.id ? '#eef2ff' : '#fff',
                color: selectedId === c.id ? COLORS.primary : '#64748b',
              }}>
              {c.libelle || `Campagne ${c.annee}`}
              <span style={{ marginLeft: 6, fontSize: 10, opacity: .75 }}>· {c.statut}</span>
            </button>
          ))}
          <button onClick={() => setSelectedId('new')}
            style={{
              padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px dashed ${selectedId === 'new' ? COLORS.primary : COLORS.border}`,
              background: selectedId === 'new' ? '#eef2ff' : '#fff',
              color: selectedId === 'new' ? COLORS.primary : '#94a3b8',
            }}>
            + Nouvelle
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
          <Field label="Année" required>
            <input style={input} type="number" min={2000} max={2100} value={campForm.annee}
              onChange={e => setCampForm(f => ({ ...f, annee: Number(e.target.value) }))} />
          </Field>
          <Field label="Libellé">
            <input style={input} value={campForm.libelle} placeholder={`Campagne ${campForm.annee}`}
              onChange={e => setCampForm(f => ({ ...f, libelle: e.target.value }))} />
          </Field>
          <Field label="Statut">
            <select style={input} value={campForm.statut} onChange={e => setCampForm(f => ({ ...f, statut: e.target.value }))}>
              <option value="preparation">En préparation</option>
              <option value="ouverte">Ouverte</option>
              <option value="close">Close</option>
            </select>
          </Field>
          <Field label="Ouverture">
            <input style={input} type="date" value={campForm.date_ouverture}
              onChange={e => setCampForm(f => ({ ...f, date_ouverture: e.target.value }))} />
          </Field>
          <Field label="Date limite des entretiens">
            <input style={input} type="date" value={campForm.date_limite_ep}
              onChange={e => setCampForm(f => ({ ...f, date_limite_ep: e.target.value }))} />
          </Field>
          <Field label="Clôture administrative">
            <input style={input} type="date" value={campForm.date_cloture}
              onChange={e => setCampForm(f => ({ ...f, date_cloture: e.target.value }))} />
          </Field>
        </div>
        <div style={{ marginTop: 11 }}>
          <Field label="Consignes affichées aux agent·e·s" hint="Visible par tous les agent·e·s sur leur page de préparation.">
            <MiniRichEditor value={campForm.instructions} placeholder="Consignes pour la préparation de l’entretien…"
              onChange={html => setCampForm(f => ({ ...f, instructions: html }))} />
          </Field>
        </div>

        {campMsg && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: campMsg.ok ? COLORS.success : COLORS.danger }}>
            {campMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {campMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
          <button style={btnPrimary} disabled={savingCampaign} onClick={saveCampaign}>
            {savingCampaign ? <Loader2 size={15} /> : <Save size={15} />} {campForm.id ? 'Enregistrer la campagne' : 'Créer la campagne'}
          </button>
          {campForm.id && campForm.statut !== 'close' && (
            <button style={btnDanger} disabled={savingCampaign} onClick={closeCampaign} title="Clore la campagne : les CREP passent dans le dossier de l’agent·e">
              <Lock size={15} /> Clore la campagne
            </button>
          )}
        </div>
      </div>

      </>)}

      {sub === 'admins' && (<>
      {/* Administrateurs */}
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>
          <UserCog size={17} color={COLORS.primary} /> Administrateurs
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
          En plus des administrateurs généraux de l’application, ces utilisateurs peuvent programmer et gérer les
          entretiens de tous les agent·e·s. Ils peuvent être n’importe quel agent·e de l’annuaire, pas seulement ceux du
          calendrier DSI. Les encadrants, eux, n’ont pas besoin d’être déclarés ici : il suffit qu’ils soient désignés
          comme évaluateurs sur au moins un entretien.
        </p>

        <div style={{ marginBottom: 10, maxWidth: 520 }}>
          <AdminAgentSearch key={adminKey} onSelect={addAdmin} />
        </div>

        {adminMsg && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: adminMsg.ok ? COLORS.success : COLORS.danger }}>
            {adminMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {adminMsg.text}
          </div>
        )}

        {admins.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucun administrateur délégué pour l’instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {admins.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: '8px 11px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{a.display_name || a.username}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.username}{a.email ? ` · ${a.email}` : ''}</div>
                </div>
                <button style={btnDanger} onClick={() => removeAdmin(a)}><Trash2 size={13} /> Retirer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      </>)}

      {sub === 'options' && (<>
      {/* Fonctions IA : rédaction et relecture des compétences */}
      {AI_CARDS.map(meta => {
        const st = ai[meta.key];
        return (
          <AccessCard key={meta.key}
            title={meta.title}
            description={`${meta.description} Désactivée par défaut : sélectionnez les évaluateurs autorisés, eux seuls la verront dans le compte rendu.`}
            entriesLabel="Activer pour des évaluateurs"
            entryOne="évaluateur" entryMany="évaluateurs"
            enabled={st.enabled}
            all={st.all}
            entries={st.evaluators}
            candidates={aiCandidates}
            query={st.query}
            msg={st.msg}
            saving={st.saving}
            onQuery={v => patchAi(meta.key, { query: v })}
            onToggle={e => toggleAiEvaluator(meta.key, e)}
            onSave={mode => saveAi(meta.key, mode)}
          />
        );
      })}

      {/* Accès à « Mon entretien » */}
      <AccessCard
        title="Accès à « Mon entretien »"
        description="Par défaut, les agent·e·s ne voient pas leur espace « Mon entretien » (préparation, compte rendu, validation). Sélectionnez les agent·e·s pour qui cet espace est ouvert. Les évaluateurs et administrateurs du module conservent leurs accès."
        entriesLabel="Ouvrir pour des agent·e·s"
        entryOne="agent" entryMany="agents"
        enabled={self.enabled}
        all={self.all}
        entries={self.evaluators}
        candidates={selfCandidates}
        query={self.query}
        msg={self.msg}
        saving={self.saving}
        onQuery={v => patchSelf({ query: v })}
        onToggle={toggleSelfAgent}
        onSave={saveSelf}
      />

      {/* Signature électronique du CREP */}
      <AccessCard
        title="Signature électronique du compte rendu"
        description="Par défaut, le compte rendu ne peut pas être signé électroniquement : l’évaluateur l’imprime, le fait signer, puis téléverse le PDF signé. Sélectionnez les agent·e·s pour lesquels la signature électronique (parapheur) est ouverte."
        entriesLabel="Ouvrir pour des agent·e·s"
        entryOne="agent" entryMany="agents"
        enabled={esign.enabled}
        all={esign.all}
        entries={esign.evaluators}
        candidates={esignCandidates}
        query={esign.query}
        msg={esign.msg}
        saving={esign.saving}
        onQuery={v => patchEsign({ query: v })}
        onToggle={toggleEsignAgent}
        onSave={saveEsign}
      />

      {/* Organisateur Outlook */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>
          <Mail size={17} color={COLORS.primary} /> Invitations Outlook
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
          Les invitations sont créées dans la boîte du compte qui programme l’entretien. Si ce compte n’a pas d’adresse
          Microsoft 365, l’adresse ci-dessous est utilisée comme organisateur de secours (elle doit disposer des droits
          d’envoi via l’application Graph).
        </p>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: 620 }}>
          <div style={{ flex: '1 1 280px' }}>
            <Field label="Adresse de l’organisateur de secours">
              <input style={input} type="email" placeholder="dsi-calendrier@ivry94.fr" value={organizer}
                onChange={e => setOrganizer(e.target.value)} />
            </Field>
          </div>
          <button style={btnPrimary} disabled={savingOrganizer} onClick={saveOrganizer}>
            {savingOrganizer ? <Loader2 size={15} /> : <Save size={15} />} Enregistrer
          </button>
        </div>
        {organizerMsg && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: organizerMsg.ok ? COLORS.success : COLORS.danger }}>
            {organizerMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {organizerMsg.text}
          </div>
        )}
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 12, background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Un échec d’envoi Outlook n’empêche jamais l’enregistrement de l’entretien : l’erreur est conservée sur la
            fiche et peut être relancée depuis le tableau de pilotage (bouton « Renvoyer l’invitation »).
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 14 }}>
        Campagnes existantes : {campaigns.map(c => `${c.libelle || c.annee} (${formatDateFr(c.date_limite_ep)})`).join(' · ') || 'aucune'}
      </div>

      </>)}

      </div>

      {showDgNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px', overflowY: 'auto' }}>
          <div style={{ ...card, width: '100%', maxWidth: 1000, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, color: COLORS.text }}>
                <FileText size={18} color={COLORS.primary} /> Note à l'attention de la Direction générale
              </div>
              <button style={btnGhost} onClick={() => setShowDgNote(false)}>Fermer</button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
              Écrivez directement dans le texte, comme dans un traitement de texte : la barre d'outils permet les titres, le gras, les listes et les liens.
              Le texte est enregistré dans l'outil (format Markdown, exportable).
            </div>
            <MarkdownEditor value={dgNoteDraft} onChange={setDgNoteDraft} />
            {dgNoteMsg && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: dgNoteMsg.ok ? COLORS.success : COLORS.danger }}>
                {dgNoteMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {dgNoteMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
              {dgNoteDefault && (
                <button style={btnGhost} onClick={() => { if (window.confirm('Remplacer le texte en cours par le modèle proposé (non enregistré tant que vous ne cliquez pas sur Enregistrer) ?')) setDgNoteDraft(dgNoteDefault); }}>
                  <RotateCcw size={14} /> Revenir au modèle proposé
                </button>
              )}
              <button style={btnGhost} onClick={downloadDgNote}><Download size={14} /> Télécharger .md</button>
              <button style={btnGhost} onClick={() => setShowDgNote(false)}>Annuler</button>
              <button style={btnPrimary} disabled={dgNoteSaving} onClick={saveDgNote}>
                {dgNoteSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Recherche d’un agent dans l’annuaire AD pour l’ajouter comme administrateur du module. */
function AdminAgentSearch({ onSelect }: { onSelect: (a: AgentOption) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const r = await axios.get('/api/ad/search', { params: { q: query }, headers: { Authorization: `Bearer ${token}` } });
        if (alive) setResults(Array.isArray(r.data) ? r.data : []);
      } catch { if (alive) setResults([]); }
      finally { if (alive) setLoading(false); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 11px', background: '#fff' }}>
        <Search size={14} color="#94a3b8" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher n’importe quel agent·e (nom, login ou e-mail)…"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent' }} />
        {loading && <Loader2 size={14} className="spin" color="#94a3b8" />}
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8, marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
          {results.map(u => (
            <div key={u.username} onClick={() => { onSelect(u); setQ(''); setResults([]); }}
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 11px', cursor: 'pointer', borderBottom: `1px solid ${COLORS.border}` }}>
              <UserPlus size={14} color={COLORS.primary} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.displayName}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{[u.username, u.email].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}