import { cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from 'react';

/**
 * Zones conditionnelles de l'aide. Une condition est une suite de réglages : espace = « et »,
 * « | » = « ou », « ! » = « sans ». Exemple : « offlineForm !simple ».
 */
export type Features = Record<string, boolean | undefined>;

const NOMS: Record<string, string> = {
  prep: 'préparation par l’agent·e', esign: 'signature électronique', simple: 'mode simple', offlineForm: 'PDF hors ligne',
  scanReading: 'lecture des documents', aiDraft: 'rédaction par l’IA', aiReview: 'relecture par l’IA', coherence: 'analyse de cohérence',
};

export const conditionOk = (f: Features, c: string): boolean =>
  c.split(' ').filter(Boolean).every(t => t.split('|').some(x => (x.startsWith('!') ? !f[x.slice(1)] : !!f[x])));

const libelle = (c: string): string =>
  c.split(' ').filter(Boolean).map(t => t.split('|').map(x => (x.startsWith('!') ? `sans ${NOMS[x.slice(1)] || x.slice(1)}` : `avec ${NOMS[x] || x}`)).join(' ou ')).join(' et ');

/** `showAll` : éditeur, toutes les zones sont affichées et étiquetées. */
export const SiContext = createContext<{ features: Features; showAll: boolean }>({ features: {}, showAll: false });

export function Si({ c, children }: { c: string; children?: ReactNode }) {
  const { features, showAll } = useContext(SiContext);
  if (!showAll) return conditionOk(features, c) ? <>{children}</> : null;
  // Sur une balise simple (ligne, cellule, élément de liste), la condition est posée dessus pour ne pas casser la structure
  if (isValidElement(children) && typeof children.type === 'string') {
    const el = children as ReactElement<Record<string, unknown>>;
    const all = [el.props['data-si'], c].filter(Boolean).join(' ');
    return cloneElement(el, { 'data-si': all, 'data-si-label': libelle(all) });
  }
  return <span data-si={c} data-si-label={libelle(c)}>{children}</span>;
}
