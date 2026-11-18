// Formatage des dates/heures en fuseau Europe/Paris, indépendamment du fuseau
// du navigateur. Le backend renvoie normalement des instants ISO explicites
// (…Z) ; on tolère aussi les horodatages « naïfs » hérités (colonnes PostgreSQL
// timestamp sans fuseau, convention heure de Paris) en les interprétant comme
// Europe/Paris plutôt que comme l'heure locale du navigateur — sinon un poste
// hors France (ou un navigateur en UTC) décale l'affichage d'une à deux heures.

const TZ = 'Europe/Paris';
const NAIVE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Convertit une valeur (ISO, naïve Paris, Date) en Date fiable. */
export function parseDateValue(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (NAIVE_RE.test(raw)) {
    // Heure de Paris sans fuseau → on force +02:00/+01:00 au lieu de l'heure locale.
    const iso = raw.replace(' ', 'T');
    // Écart Paris/UTC à cet instant précis (1 h en hiver, 2 h en été).
    const asUtc = new Date(`${iso}Z`);
    if (isNaN(asUtc.getTime())) return null;
    const parisWall = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(asUtc).replace(' ', 'T');
    const offsetMs = asUtc.getTime() - new Date(`${parisWall}Z`).getTime();
    return new Date(asUtc.getTime() + offsetMs);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Date + heure (ex: 02/06/2026 10:21:05) */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = parseDateValue(value);
  if (!d) return '';
  return d.toLocaleString('fr-FR', { timeZone: TZ });
}

/** Date seule (ex: 02/06/2026) */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = parseDateValue(value);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR', { timeZone: TZ });
}

/** Heure seule (ex: 10:21) */
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = parseDateValue(value);
  if (!d) return '';
  return d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
