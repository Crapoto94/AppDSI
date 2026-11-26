import type { Entretien } from './types';

/**
 * Compte-rendu d'entretien professionnel (CREP) — catégories A et B.
 * Reprend la structure du document papier de la DRH (miroir de backend/modules/entretiens/crep.definition.js).
 */

export type Niveau = '' | 'A' | 'PA' | 'NA';
export type Appreciation = '' | 'S' | 'AS' | 'I';

export interface Crep {
  grade: string;
  date_convocation: string;
  date_entretien: string;
  date_notification: string;
  evaluateur_nom: string;
  missions: string;
  objectifs_ecoules: Array<{ objectif: string; observations: string; niveau: Niveau }>;
  observations_complementaires: string;
  valeur: Record<string, Appreciation>;
  appreciation_generale: string;
  objectifs_service: string;
  objectifs_futurs: Array<{ descriptif: string; moyens: string }>;
  formations: { obligatoires: string; metiers: string; parcours: string };
  evolution: string;
  mobilite: string;
  obs_agent_conditions: string;
  obs_agent_entretien: string;
  visa_autorite: string;
  /** « manuscrit » : repris d'un document papier lu par l'IA (non contractuel : l'original signé fait foi). */
  origine?: '' | 'manuscrit';
}

export const NB_OBJECTIFS = 4;

export const LEVELS: Array<{ key: Exclude<Appreciation, ''>; label: string }> = [
  { key: 'S', label: 'Satisfaisant / conforme' },
  { key: 'AS', label: 'Assez satisfaisant / partiellement conforme' },
  { key: 'I', label: 'Insuffisant / non conforme' },
];

export const NIVEAUX_REALISATION: Array<{ key: Exclude<Niveau, ''>; label: string }> = [
  { key: 'A', label: 'Atteint' },
  { key: 'PA', label: 'Partiellement atteint' },
  { key: 'NA', label: 'Non atteint' },
];

export const CRITERIA_GROUPS: Array<{ key: string; title: string | null; items: Array<{ key: string; label: string }> }> = [
  { key: 'service_public', title: null, items: [{ key: 'service_public', label: 'Sens du service public (continuité, adaptabilité, neutralité, sens de l’intérêt général)' }] },
  {
    key: 'competences', title: 'Compétences professionnelles et techniques',
    items: [
      { key: 'responsabilites', label: 'Sens des responsabilités' },
      { key: 'propositions', label: 'Capacité à être force de propositions et prise d’initiatives' },
      { key: 'redaction', label: 'Qualités rédactionnelles et de synthèse' },
      { key: 'communication_orale', label: 'Qualité de la communication orale' },
      { key: 'conduite_projets', label: 'Aptitude à la conduite de projets (conception, pilotage, animation, mise en œuvre)' },
      { key: 'organisation', label: 'Savoir s’organiser et gérer les priorités' },
      { key: 'anticipation', label: 'Capacité d’anticipation et d’adaptation' },
      { key: 'actualisation', label: 'Actualisation et développement des compétences' },
      { key: 'processus', label: 'Respect des processus de travail et des procédures' },
      { key: 'organisation_collective', label: 'Implication dans l’organisation collective et le travail transversal' },
    ],
  },
  {
    key: 'relationnelles', title: 'Qualités relationnelles',
    items: [
      { key: 'partage_information', label: 'Capacité à partager l’information (ascendante et descendante)' },
      { key: 'travail_equipe', label: 'Capacité à travailler en équipe' },
      { key: 'dialogue', label: 'Sens du dialogue et de l’écoute' },
    ],
  },
  {
    key: 'encadrement', title: 'Capacité d’encadrement',
    items: [
      { key: 'decisions', label: 'Capacité à la prise de décisions' },
      { key: 'animation', label: 'Capacité à animer et mobiliser des équipes' },
      { key: 'conflits', label: 'Aptitude à prévenir, arbitrer et gérer les conflits' },
      { key: 'delegation', label: 'Capacité à déléguer, contrôler et évaluer l’activité' },
    ],
  },
];

export function emptyCrep(): Crep {
  return {
    grade: '', evaluateur_nom: '', missions: '',
    objectifs_ecoules: Array.from({ length: NB_OBJECTIFS }, () => ({ objectif: '', observations: '', niveau: '' as Niveau })),
    date_convocation: '', date_entretien: '', date_notification: '', observations_complementaires: '', valeur: {}, appreciation_generale: '', objectifs_service: '',
    objectifs_futurs: Array.from({ length: NB_OBJECTIFS }, () => ({ descriptif: '', moyens: '' })),
    formations: { obligatoires: '', metiers: '', parcours: '' },
    evolution: '', mobilite: '', obs_agent_conditions: '', obs_agent_entretien: '', visa_autorite: '', origine: '',
  };
}

/** Contenu proposé à partir de la saisie de l'agent (préparation) et de l'ancien compte rendu éventuel. */
function proposalFromAgent(e: Entretien): Crep {
  const base = emptyCrep();
  // Par défaut, le CREP reprend ce que l'agent a saisi dans sa préparation : à l'évaluateur de relire, corriger et rédiger son évaluation.
  const join = (...parts: Array<string | null | undefined | false>) => parts.filter(p => p && String(p).trim()).join('\n');
  const lab = (label: string, v?: string | null) => (v && v.trim() ? `${label} : ${v.trim()}` : '');
  base.evaluateur_nom = e.evaluator_nom || '';
  base.grade = e.agent_grade || '';
  // Reprise de l'EP de l'année précédente : missions de l'agent et rappel des objectifs du service proposés par défaut.
  base.missions = e.reprise?.missions || '';
  base.objectifs_service = e.reprise?.objectifs_service || '';
  // Objectifs fixés l'an dernier = objectifs à bilanter cette année (remplacés par la saisie de l'agent dès qu'il a renseigné ses propres objectifs).
  if (!(e.objectifs || []).length) (e.reprise?.objectifs || []).slice(0, NB_OBJECTIFS).forEach((o, i) => {
    base.objectifs_ecoules[i] = { objectif: o.descriptif, observations: '', niveau: '' as Niveau };
  });
  (e.objectifs || []).slice(0, NB_OBJECTIFS).forEach((o, i) => {
    base.objectifs_ecoules[i] = {
      objectif: o.libelle || '',
      observations: o.commentaire_evaluateur || join(o.resultats, lab('Difficultés', o.difficultes), lab('Contexte', o.contexte)),
      niveau: ((o.niveau_evaluateur || o.niveau || '') as Niveau),
    };
  });
  // Les réalisations marquantes de l'agent sont proposées dans « Observations complémentaires ».
  base.observations_complementaires = e.synthese || join(e.realisations, lab('Difficultés rencontrées', e.difficultes), lab('Pistes d’amélioration', e.pistes_amelioration));
  base.appreciation_generale = e.appreciation_generale || '';
  base.formations.metiers = (e.formations || [])
    .map(f => [f.formation, f.competence && `(compétence : ${f.competence})`, f.benefices && `— ${f.benefices}`].filter(Boolean).join(' '))
    .filter(Boolean).join('\n');
  base.formations.parcours = e.competences_a_developper || '';
  base.evolution = join(lab('Missions', e.perspectives_missions), lab('Niveau de responsabilité', e.perspectives_responsabilite), lab('Développement de l’expertise', e.perspectives_expertise));
  base.mobilite = join(lab('Projet professionnel', e.perspectives_projet), lab('Concours / examens / certifications', e.perspectives_concours));
  return base;
}

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/**
 * Contenu initial du formulaire : la proposition issue de la saisie de l'agent, complétée/écrasée par ce que
 * l'évaluateur a déjà saisi (une rubrique laissée vide dans un brouillon est donc de nouveau proposée).
 */
export function initialCrep(e: Entretien): Crep {
  const base = proposalFromAgent(e);
  const saved = (e as any).crep as Partial<Crep> | null | undefined;
  if (!saved || typeof saved !== 'object') return base;
  const pick = (mine: string | undefined, proposed: string) => (filled(mine) ? (mine as string) : proposed);
  return {
    ...base,
    grade: saved.grade || e.agent_grade || '',
    date_convocation: saved.date_convocation || '',
    date_entretien: saved.date_entretien || '',
    date_notification: saved.date_notification || '',
    evaluateur_nom: pick(saved.evaluateur_nom, base.evaluateur_nom),
    missions: pick(saved.missions, base.missions),
    objectifs_ecoules: base.objectifs_ecoules.map((o, i) => {
      const m = saved.objectifs_ecoules?.[i];
      return { objectif: pick(m?.objectif, o.objectif), observations: pick(m?.observations, o.observations), niveau: ((m?.niveau || o.niveau || '') as Niveau) };
    }),
    observations_complementaires: pick(saved.observations_complementaires, base.observations_complementaires),
    valeur: { ...(saved.valeur || {}) },
    appreciation_generale: pick(saved.appreciation_generale, base.appreciation_generale),
    objectifs_service: pick(saved.objectifs_service, base.objectifs_service),
    objectifs_futurs: base.objectifs_futurs.map((o, i) => ({ ...o, ...(saved.objectifs_futurs?.[i] || {}) })),
    formations: {
      obligatoires: saved.formations?.obligatoires || '',
      metiers: pick(saved.formations?.metiers, base.formations.metiers),
      parcours: pick(saved.formations?.parcours, base.formations.parcours),
    },
    evolution: pick(saved.evolution, base.evolution),
    mobilite: pick(saved.mobilite, base.mobilite),
    obs_agent_conditions: saved.obs_agent_conditions || '',
    obs_agent_entretien: saved.obs_agent_entretien || '',
    visa_autorite: saved.visa_autorite || '',
    origine: saved.origine === 'manuscrit' ? 'manuscrit' : '',
  };
}

/** Rubriques obligatoires non renseignées (miroir de backend/modules/entretiens/crep.definition.js). */
export interface CrepDefinition {
  name?: string;
  criteria_groups: Array<{ key: string; title: string | null; items: Array<{ key: string; label: string; lead?: string }> }>;
  flags?: { objectifs_service?: boolean };
}

/** Avertissement (non bloquant) : critères de la grille sans réponse — la validation reste possible. */
export function gridWarning(c: Crep, def?: CrepDefinition | null): string {
  const n = (def?.criteria_groups || CRITERIA_GROUPS).flatMap(g => g.items).filter(it => !c.valeur[it.key]).length;
  return n ? `Grille d’appréciation de la valeur professionnelle : ${n} critère(s) sans réponse` : '';
}

export function missingFields(c: Crep, def?: CrepDefinition | null): string[] {
  const empty = (v?: string | null) => !String(v || '').trim();
  const out: string[] = [];
  if (empty(c.grade)) out.push('Grade actuel');
  if (empty(c.evaluateur_nom)) out.push('Nom de l’évaluateur');
  if (empty(c.missions)) out.push('Rappel des missions de l’agent·e');
  // Un objectif au minimum ; seule sa description est obligatoire (observations et niveau facultatifs).
  if (!c.objectifs_ecoules.some(o => !empty(o.objectif))) out.push('Au moins un objectif de l’année écoulée (description)');
  c.objectifs_ecoules.forEach((o, i) => { if (empty(o.objectif) && (!empty(o.observations) || o.niveau)) out.push(`Objectif ${i + 1} de l’année écoulée : description à renseigner`); });
  if (empty(c.observations_complementaires)) out.push('Observations complémentaires (contexte, faits marquants, acquis professionnels)');
  if (empty(c.appreciation_generale)) out.push('Appréciation générale sur l’exercice des missions');
  if (def?.flags?.objectifs_service !== false && empty(c.objectifs_service)) out.push('Rappel des objectifs du service / de la direction');
  if (!c.objectifs_futurs.some(o => !empty(o.descriptif))) out.push('Au moins un objectif de l’année à venir (descriptif)');
  c.objectifs_futurs.forEach((o, i) => { if (empty(o.descriptif) && !empty(o.moyens)) out.push(`Objectif ${i + 1} de l’année à venir : descriptif à renseigner`); });
  if (empty(c.formations.obligatoires)) out.push('Formations obligatoires (indiquer « Néant » si aucune)');
  if (empty(c.formations.metiers)) out.push('Autres formations métiers (indiquer « Néant » si aucune)');
  if (empty(c.formations.parcours)) out.push('Formations liées à l’accompagnement des parcours (indiquer « Néant » si aucune)');
  return out;
}
