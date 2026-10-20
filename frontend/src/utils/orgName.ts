import { useEffect, useState } from 'react';

// Mots-outils laissés en minuscules (sauf en début de nom)
const SMALL_WORDS = new Set([
  'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'à', 'a', 'pour', 'sur', 'sous', 'par', 'un', 'une', 'ou',
]);
// Sigles conservés en majuscules
const ACRONYMS = new Set(['DSI', 'RH', 'DGS', 'DGA', 'SIG', 'CCAS', 'ASVP', 'CTM', 'IT', 'GRH', 'DRH']);

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);

/** « DIRECTION DES SYSTEMES D'INFORMATIONS » → « Direction des Systemes d'Informations » */
export function formatOrgName(name: string | null | undefined): string {
  if (!name) return '';
  const words = String(name).trim().split(/\s+/);
  return words
    .map((raw, idx) => {
      if (ACRONYMS.has(raw.toUpperCase()) && raw === raw.toUpperCase()) return raw;
      const lower = raw.toLowerCase();
      if (idx > 0 && SMALL_WORDS.has(lower)) return lower;
      // Élisions l' d' qu' ... : l'élision reste en minuscule, le mot suivant prend la majuscule
      const m = lower.match(/^(l|d|j|n|s|t|m|c|qu)['’](.+)$/);
      if (m) {
        const rest = m[2].split('-').map(cap).join('-');
        return idx === 0 ? cap(m[1]) + "'" + rest : m[1] + "'" + rest;
      }
      return lower.split('-').map(cap).join('-');
    })
    .join(' ');
}

/** Clé de comparaison insensible à la casse et aux accents. */
export function orgKey(name: string | null | undefined): string {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ── Couleurs par direction/service (calendrier DSI), cache module ──
let colorCache: Record<string, string> | null = null;
const listeners = new Set<() => void>();

export function getCustomServiceColor(service: string): string | undefined {
  return colorCache?.[orgKey(service)];
}

export async function loadServiceColors(token: string | null | undefined, force = false) {
  if (colorCache && !force) return;
  try {
    const res = await fetch('/api/calendrier-dsi/service-colors', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const rows = await res.json();
    colorCache = {};
    for (const r of rows) colorCache[r.service_key] = r.couleur;
    listeners.forEach(l => l());
  } catch { /* ignore */ }
}

export async function saveServiceColor(token: string | null | undefined, service: string, couleur: string | null) {
  const res = await fetch('/api/calendrier-dsi/service-colors', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, couleur }),
  });
  if (!res.ok) throw new Error('Erreur enregistrement couleur');
  colorCache = colorCache || {};
  if (couleur) colorCache[orgKey(service)] = couleur;
  else delete colorCache[orgKey(service)];
  listeners.forEach(l => l());
}

/** Force un re-render quand les couleurs sont chargées/modifiées. */
export function useServiceColors(token: string | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    loadServiceColors(token);
    return () => { listeners.delete(l); };
  }, [token]);
}
