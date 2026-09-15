/**
 * Fenêtres de durée partagées par les widgets Analyse-mail (cartes et liste des
 * connexions en échec). Source unique des valeurs acceptées par l'API amont
 * (`?minutes=`), avec leur libellé français.
 */
export const WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1 min' },
  { value: 10, label: '10 min' },
  { value: 60, label: '1 heure' },
  { value: 240, label: '4 heures' },
  { value: 480, label: '8 heures' },
  { value: 1440, label: '24 heures' },
  { value: 2880, label: '2 jours' },
  { value: 10080, label: '1 semaine' },
];

export const DEFAULT_WINDOW_MINUTES = 1440;

export function windowLabel(minutes: number): string {
  return WINDOW_OPTIONS.find(o => o.value === minutes)?.label || `${minutes} min`;
}
