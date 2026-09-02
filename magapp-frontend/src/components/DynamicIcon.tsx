import React from 'react';
import * as Icons from 'lucide-react';
import { FileQuestion } from 'lucide-react';

/**
 * Affiche une icône lucide-react à partir de son nom (texte libre saisi côté
 * admin pour les formulaires de demande, ex. "Smartphone"). Repli sur une
 * icône générique si le nom est vide ou invalide.
 */
export default function DynamicIcon({ name, size = 16, ...rest }: { name?: string | null; size?: number } & Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'name'>) {
  const iconMap = Icons as unknown as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>>;
  const Comp = (name && iconMap[name]) || FileQuestion;
  return <Comp size={size} {...rest} />;
}
