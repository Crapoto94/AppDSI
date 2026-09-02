// Types et constantes partagés par le rendu des formulaires de demande côté
// magapp. Séparés du composant pour que RequestFormFieldRenderer.tsx
// n'exporte que des composants (react-refresh).

export type FormFieldType = 'text' | 'textarea' | 'select' | 'boolean' | 'agent' | 'agent_multi' | 'direction_service' | 'date' | 'description';

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
