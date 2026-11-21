export interface Campaign {
  id: number;
  annee: number;
  libelle?: string | null;
  date_ouverture?: string | null;
  date_cloture?: string | null;
  date_limite_ep?: string | null;
  statut: string;
  instructions?: string | null;
}

export interface Access {
  isAdmin: boolean;
  isAgent: boolean;
  isEvaluator: boolean;
  canEditPreparation: boolean;
  canEditEvaluation: boolean;
  /** Valideur situé au-dessus de l'évaluateur (ou directeur de la direction) : lecture seule. */
  isSuperieur?: boolean;
}

export interface AiAccess {
  enabled: boolean;
  allowed: boolean;
  reason?: 'disabled' | 'no_evaluators' | 'not_selected' | 'ok' | string;
}

export interface AiAccessMap {
  draft: AiAccess;
  review: AiAccess;
}

export interface SelfAccess {
  enabled: boolean;
  allowed: boolean;
  reason?: 'disabled' | 'no_agents' | 'not_selected' | 'ok' | string;
}

export interface EsignAccess {
  enabled: boolean;
  allowed: boolean;
  reason?: 'disabled' | 'no_agents' | 'not_selected' | 'ok' | string;
}

export interface Objectif {
  id: number;
  entretien_id?: number;
  ordre: number;
  libelle: string;
  niveau?: string | null;
  resultats?: string | null;
  difficultes?: string | null;
  contexte?: string | null;
  niveau_evaluateur?: string | null;
  commentaire_evaluateur?: string | null;
}

export interface Formation {
  id: number;
  entretien_id?: number;
  competence?: string | null;
  formation?: string | null;
  benefices?: string | null;
  reference_cnfpt?: string | null;
  statut: string;
  avis_evaluateur?: string | null;
}

/** EP de l'année précédente de l'agent (missions, rappel des objectifs du service, objectifs fixés) : valeurs proposées par défaut. */
export interface Reprise {
  annee: number;
  fonction: string;
  service: string;
  missions: string;
  objectifs_service: string;
  objectifs: Array<{ descriptif: string; moyens: string }>;
}

export interface Entretien {
  id: number;
  /** Modèle de compte rendu (nom de l'onglet du classeur RH) et grille correspondante. */
  modele?: string;
  /** Chemin de publication de l'agent : direction \ service \ secteur (base des agents à évaluer). */
  chemin?: string;
  /** Catégorie statutaire de l'agent (A, B ou C). */
  categorie?: string;
  crep_definition?: { name?: string; criteria_groups: Array<{ key: string; title: string | null; items: Array<{ key: string; label: string; lead?: string }> }>; flags?: { objectifs_service?: boolean } } | null;
  campaign_id: number;
  annee?: number;
  agent_username?: string | null;
  agent_email?: string | null;
  agent_nom: string;
  agent_prenom?: string | null;
  agent_matricule?: string | null;
  agent_grade?: string | null;
  direction?: string | null;
  service?: string | null;
  poste?: string | null;
  evaluator_username?: string | null;
  evaluator_email?: string | null;
  evaluator_nom?: string | null;
  date_entretien?: string | null;
  date_entretien_label?: string | null;
  duree_minutes?: number | null;
  lieu?: string | null;
  statut: string;
  realisations?: string | null;
  difficultes?: string | null;
  pistes_amelioration?: string | null;
  competences_a_developper?: string | null;
  perspectives_missions?: string | null;
  perspectives_responsabilite?: string | null;
  perspectives_expertise?: string | null;
  perspectives_projet?: string | null;
  perspectives_concours?: string | null;
  commentaire_agent?: string | null;
  preparation_statut: string;
  agent_submitted_at?: string | null;
  synthese?: string | null;
  appreciation_generale?: string | null;
  objectifs_suivants?: string | null;
  avis_agent?: string | null;
  evaluation_statut: string;
  evaluator_submitted_at?: string | null;
  outlook_event_id?: string | null;
  outlook_web_link?: string | null;
  outlook_status?: string | null;
  outlook_error?: string | null;
  notes_admin?: string | null;
  created_at?: string | null;
  reprise?: Reprise | null;
  crep?: { valeur?: Record<string, string> } | null;
  crep_statut?: 'non_envoye' | 'envoye_agent' | 'en_signature' | string;
  crep_sent_at?: string | null;
  crep_agent_validated_at?: string | null;
  crep_parapheur_id?: number | null;
  crep_parapheur_ref?: string | null;
  crep_parapheur_status?: string | null;
  crep_signed_at?: string | null;
  crep_signed_name?: string | null;
  /** Scans originaux (papier signé) conservés : lecture IA appliquée. */
  crep_scans?: Array<{ kind: 'complet' | 'agent'; name: string; at: string; by?: string; signatures_ok?: boolean }>;
  /** Mode de saisie du CREP choisi par l'évaluateur : « manuscrit » (papier, scan signé) ou « outil » (saisie informatisée). */
  crep_mode?: 'manuscrit' | 'outil' | null;
  /** CREP signé reçu par la DRH (déclaré par un administrateur au Pilotage). */
  drh_received_at?: string | null;
  drh_received_by?: string | null;
  /** « Lecture des entretiens numérisés » activée ? (sinon le valideur consulte et valide le document sans lecture visible). */
  scan_reading?: boolean;
  /** Version numérique lue en arrière-plan (visible des seuls administrateurs). */
  digital_silent?: boolean;
  lecture_arriere_plan?: boolean;
  /** Dernière demande de réouverture (entretien clôturé). */
  reopen_request?: { id: number; status: 'en_attente' | 'acceptee' | 'refusee'; reason: string; created_at: string; decided_at?: string | null; decision_note?: string } | null;
  /** La campagne de cet entretien est close : les documents ne sont plus consultables ici (dossier de l'agent). */
  campaign_closed?: boolean;
  objectifs?: Objectif[];
  formations?: Formation[];
  objectifs_total?: number;
  objectifs_renseignes?: number;
  formations_total?: number;
  access?: Access;
  ai_access?: AiAccessMap;
  esign_access?: EsignAccess;
}

export interface MeData {
  role: 'admin' | 'evaluator' | 'agent';
  isAdmin: boolean;
  isEvaluator: boolean;
  actor: { username: string; email: string; displayName: string };
  campaign: Campaign | null;
  entretien: Entretien | null;
  evaluatorCount: number;
  selfAccess?: SelfAccess;
  esignAccess?: EsignAccess;
  /** « Lecture des entretiens numérisés » activée. */
  scan_reading?: boolean;
  aiAccess?: AiAccessMap;
  now: string;
}

export interface Stats {
  total: number;
  planifies: number;
  a_planifier: number;
  realises: number;
  preparations_recues: number;
  evaluations_recues: number;
  a_venir_7j: number;
  sans_evaluateur: number;
  outlook_erreurs: number;
  en_retard: number;
  taux_realisation: number;
}

export interface StatutMeta { label: string; color: string; bg: string; }

export const STATUTS: Record<string, StatutMeta> = {
  a_planifier:       { label: 'À planifier',        color: '#64748b', bg: '#f1f5f9' },
  planifie:          { label: 'Planifié',           color: '#2563eb', bg: '#dbeafe' },
  preparation_recue: { label: 'Préparation reçue',  color: '#0891b2', bg: '#cffafe' },
  realise:           { label: 'Réalisé',            color: '#16a34a', bg: '#dcfce7' },
  cloture:           { label: 'Clôturé',            color: '#475569', bg: '#e2e8f0' },
};

export const PREP_STATUTS: Record<string, StatutMeta> = {
  non_commencee: { label: 'Non commencée', color: '#64748b', bg: '#f1f5f9' },
  brouillon:     { label: 'Brouillon',     color: '#b45309', bg: '#fef3c7' },
  soumis:        { label: 'Transmise',     color: '#16a34a', bg: '#dcfce7' },
};

export const EVAL_STATUTS: Record<string, StatutMeta> = {
  non_commencee: { label: 'Non commencé', color: '#64748b', bg: '#f1f5f9' },
  brouillon:     { label: 'Brouillon',    color: '#b45309', bg: '#fef3c7' },
  soumis:        { label: 'Validé',       color: '#16a34a', bg: '#dcfce7' },
};

export const FORMATION_STATUTS: Record<string, { label: string; color: string; bg: string }> = {
  soumise:   { label: 'Souhaitée',   color: '#2563eb', bg: '#dbeafe' },
  a_etudier: { label: 'À étudier',   color: '#b45309', bg: '#fef3c7' },
  validee:   { label: 'Validée',     color: '#16a34a', bg: '#dcfce7' },
  refusee:   { label: 'Refusée',     color: '#b91c1c', bg: '#fee2e2' },
};

export const NIVEAUX: Record<string, { label: string; short: string; color: string; bg: string }> = {
  A:  { label: 'Atteint',              short: 'A',  color: '#16a34a', bg: '#dcfce7' },
  PA: { label: 'Partiellement atteint', short: 'PA', color: '#b45309', bg: '#fef3c7' },
  NA: { label: 'Non atteint',          short: 'NA', color: '#b91c1c', bg: '#fee2e2' },
};

/** Corrige les accents mal décodés (UTF-8 lu comme Latin-1) dans les données anciennes. */
export function repairText(v?: string | null): string {
  return String(v || '')
    .replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ãª/g, 'ê').replace(/Ã«/g, 'ë')
    .replace(/Ã /g, 'à').replace(/Ã¢/g, 'â').replace(/Ã§/g, 'ç')
    .replace(/Ã®/g, 'î').replace(/Ã¯/g, 'ï')
    .replace(/Ã´/g, 'ô').replace(/Ã¶/g, 'ö')
    .replace(/Ã¹/g, 'ù').replace(/Ã»/g, 'û').replace(/Ã¼/g, 'ü')
    .replace(/Å“/g, 'œ').replace(/Å’/g, 'Œ')
    .replace(/â€™/g, '’').replace(/â€“/g, '–').replace(/â€”/g, '—')
    .replace(/â€œ/g, '“').replace(/â€�/g, '”');
}

/** Nom d'une personne au format « Prénom NOM » : « PARISI CHRISTOPHE » (tout en majuscules, ordre RH) devient « Christophe PARISI ». */
export function personneNom(v?: string | null): string {
  const t = repairText(v).trim();
  if (!t || t.includes('@')) return t;
  const w = t.split(/\s+/);
  if (w.length >= 2 && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t)) {
    const prenom = w[w.length - 1];
    const cap = prenom.charAt(0) + prenom.slice(1).toLowerCase().replace(/(^|[-'’])([a-zà-ÿ])/g, (_m, a, b) => a + b.toUpperCase());
    return `${cap} ${w.slice(0, -1).join(' ')}`;
  }
  return t;
}

export function nomComplet(e: Entretien): string {
  return repairText([e.agent_prenom, e.agent_nom].filter(Boolean).join(' ').trim() || e.agent_nom || e.agent_email || 'Agent·e');
}

export function formatDateHeure(value?: string | null): string {
  if (!value) return 'Date à définir';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return String(value);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' à ' + `${m[4]}h${m[5]}`;
}

export function formatDateCourte(value?: string | null): string {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export function formatDateFr(value?: string | null): string {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Avancement de la préparation (0-100). */
export function preparationProgress(e: Entretien): number {
  let score = 0;
  const total = Number(e.objectifs_total ?? e.objectifs?.length ?? 0);
  const faits = Number(e.objectifs_renseignes ?? (e.objectifs || []).filter(o => o.niveau).length);
  score += total > 0 ? Math.round((faits / total) * 35) : 0;
  if ((e.realisations || '').trim()) score += 15;
  if ((e.difficultes || '').trim() || (e.pistes_amelioration || '').trim()) score += 10;
  if (Number(e.formations_total ?? e.formations?.length ?? 0) > 0) score += 15;
  if ([e.perspectives_missions, e.perspectives_responsabilite, e.perspectives_expertise, e.perspectives_projet, e.perspectives_concours]
      .some(v => (v || '').trim())) score += 25;
  return Math.max(0, Math.min(100, score));
}

export function initiales(nom: string): string {
  const parts = String(nom || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Étape du compte rendu (CREP) d'un entretien, avec l'état de signature du parapheur le cas échéant. */
export function crepMeta(e: { statut?: string; crep_statut?: string | null; crep_parapheur_status?: string | null }): StatutMeta | null {
  const st = e.crep_statut || 'non_envoye';
  if (st === 'en_signature') {
    if (e.crep_parapheur_status === 'termine') return { label: 'Signé', color: '#16a34a', bg: '#dcfce7' };
    if (e.crep_parapheur_status === 'refuse') return { label: 'Signature refusée', color: '#b91c1c', bg: '#fee2e2' };
    if (e.crep_parapheur_status === 'annule') return { label: 'Parapheur annulé', color: '#64748b', bg: '#f1f5f9' };
    return { label: 'En signature', color: '#2563eb', bg: '#dbeafe' };
  }
  if (st === 'signe_papier') return { label: 'Signé (papier)', color: '#16a34a', bg: '#dcfce7' };
  if (st === 'envoye_agent') return { label: 'Envoyé à l’agent·e', color: '#b45309', bg: '#fef3c7' };
  return e.statut === 'realise' ? { label: 'À envoyer', color: '#64748b', bg: '#f1f5f9' } : null;
}
