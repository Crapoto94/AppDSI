// Types et constantes partagés par le form-builder "Formulaires de demande"
// (Admin Tickets) et son rendu de champs. Séparés du composant pour que
// RequestFormFieldRenderer.tsx n'exporte que des composants (react-refresh).

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

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texte court',
  textarea: 'Zone de texte',
  select: 'Liste déroulante',
  boolean: 'Oui / Non',
  agent: 'Recherche agent (AD)',
  agent_multi: 'Agents multiples (AD)',
  direction_service: 'Direction / Service',
  date: 'Date',
  description: 'Texte descriptif (pas de saisie)',
};

export function isFieldVisible(field: FormFieldDef, answers: Record<string, unknown>): boolean {
  if (!field.conditional_on) return true;
  return answers[field.conditional_on.field] === field.conditional_on.equals;
}

export interface AgentAnswer { displayName: string; email: string; }
export interface DirectionServiceAnswer { direction_code: string; direction_label: string; service_code: string; service_label: string; }

// Sélection d'icônes lucide-react courantes proposées dans le sélecteur de
// formulaire — le champ reste un texte libre (n'importe quel nom d'icône
// lucide valide), cette liste n'est qu'un raccourci visuel.
export const REQUEST_FORM_ICON_PRESETS = [
  'Smartphone', 'Phone', 'Mail', 'Laptop', 'Monitor', 'Printer', 'Wifi',
  'UserPlus', 'UserMinus', 'ArrowLeftRight', 'KeyRound', 'Server', 'Building2',
  'Car', 'Package', 'CreditCard', 'Headphones', 'Video', 'Home', 'FileText',
  'ShieldCheck', 'Users', 'Calendar', 'MapPin', 'Wrench', 'HardDrive',
];
