// Types et constantes partagés par le rendu des formulaires de demande côté
// magapp. Séparés du composant pour que RequestFormFieldRenderer.tsx
// n'exporte que des composants (react-refresh).

export type FormFieldType = 'text' | 'textarea' | 'select' | 'boolean' | 'agent' | 'agent_multi' | 'direction_service' | 'date' | 'description' | 'studio_agent' | 'studio_futurs_agent_picker';

export interface FormFieldDef {
  key: string;
  label: string;
  description: string;
  type: FormFieldType;
  required: boolean;
  // Placement dans la grille du formulaire (voir RequestForm.columns) :
  // column_start = colonne de départ (1-indexée, null = enchaînement auto
  // à la suite du champ précédent), column_span = largeur en colonnes.
  column_start: number | null;
  column_span: number;
  options: string[];
  conditional_on: { field: string; equals: string | boolean } | null;
}

export interface ServiceDef { code: string; label: string; }
export interface ServiceDirectionDef { code: string; label: string; services: ServiceDef[]; }

export function isFieldVisible(field: FormFieldDef, answers: Record<string, unknown>): boolean {
  if (!field.conditional_on) return true;
  return answers[field.conditional_on.field] === field.conditional_on.equals;
}

export interface AgentAnswer { displayName: string; email: string; }
export interface DirectionServiceAnswer { direction_code: string; direction_label: string; service_code: string; service_label: string; }

// Réponse d'un champ "studio_agent" (recherche dans le référentiel RH Studio,
// pas l'AD — id numérique RefAgent requis par Onboarding.agent_id/manager_id
// côté RH Studio, cf. formulaire spécial "Arrivée d'agent").
export interface StudioAgentAnswer { id: number; displayName: string; email: string; matricule?: string; service?: string; }

// Réponse d'un champ "studio_futurs_agent_picker" : soit l'un des futurs
// arrivants déjà connus de RH Studio (mode 'existing'), soit un agent pas
// encore répertorié, saisi manuellement (mode 'manual' — nom_temp/prenom_temp
// côté RH Studio).
export type FutursAgentAnswer =
  | { mode: 'existing'; agent_id: number; nom: string; prenom: string; date_arrivee_prevue: string | null }
  | { mode: 'manual'; nom: string; prenom: string };
