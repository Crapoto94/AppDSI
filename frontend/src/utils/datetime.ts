// Formatage des dates/heures en fuseau Europe/Paris, indépendamment du fuseau
// du navigateur. Le backend renvoie des instants (ISO/Date) ; on les affiche
// systématiquement à l'heure de Paris pour cohérence avec les données métier.

const TZ = 'Europe/Paris';

/** Date + heure (ex: 02/06/2026 10:21:05) */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { timeZone: TZ });
}

/** Date seule (ex: 02/06/2026) */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { timeZone: TZ });
}

/** Heure seule (ex: 10:21) */
export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
