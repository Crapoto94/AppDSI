import { Droplet, FileText, MoreHorizontal, Printer, Tag, Package } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';

// Icône représentative d'un type de consommable (module /consommables),
// choisie par correspondance de mots-clés sur le nom/libellé du type — cf.
// les types réels vus en admin (DIVERS, FAX, TONER, PAPIER…). Repli sur
// Package (icône générique précédemment utilisée pour tous les types) si
// aucun mot-clé ne correspond.
export function getConsumableTypeIcon(name?: string | null): ComponentType<{ size?: number; style?: CSSProperties; color?: string }> {
  const n = (name || '').toUpperCase();
  if (n.includes('FAX')) return Printer;
  if (n.includes('DIVERS')) return MoreHorizontal;
  if (n.includes('TONER') || n.includes('CARTOUCHE') || n.includes('ENCRE')) return Droplet;
  if (n.includes('PAPIER')) return FileText;
  if (n.includes('RUBAN') || n.includes('ETIQUETTE') || n.includes('ÉTIQUETTE')) return Tag;
  return Package;
}
