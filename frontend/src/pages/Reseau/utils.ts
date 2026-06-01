import type { NetworkLink } from './types';

// Couleur/style d'un lien réseau selon son type et son opérateur.
export function linkStyle(link: NetworkLink): { color: string; weight: number; dashArray?: string } {
  if (link.type === 'OPERATEUR') {
    const c: Record<string, string> = { LINKT: '#f97316', RED: '#ef4444', MOJI: '#8b5cf6' };
    return { color: c[link.operator || ''] || '#64748b', weight: 3, dashArray: '6 6' };
  }
  if (link.type === 'WAN')   return { color: '#3b82f6', weight: 3, dashArray: '8 6' };
  if (link.type === 'LASER') return { color: '#f59e0b', weight: 2, dashArray: '4 3' };
  // FIBRE : ligne pleine verte, épaisseur selon capacité
  const cap = link.capacity || '';
  const weight = cap.includes('40') ? 7 : cap.includes('10') ? 4 : cap.includes('1G') ? 3 : 2;
  return { color: '#16a34a', weight };
}
