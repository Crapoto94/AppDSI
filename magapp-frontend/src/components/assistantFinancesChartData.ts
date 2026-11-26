// Données des graphiques de l'assistant finances (palette, mise en forme des lignes du tableau).

export type ChartKind = 'courbe' | 'histogramme' | 'camembert';
type ColType = 'text' | 'date' | 'money' | 'int' | 'pct';
export interface Data { titre: string; colonnes: { label: string; type: ColType }[]; lignes: (string | number | null)[][]; pj?: unknown[] }

// Palette catégorielle, dans un ordre fixe (distinguable par les daltoniens) ; une série = une seule teinte
export const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER = '#9ca3af';
export const MAX_POINTS = 36;
export const MAX_SLICES = 6;

export interface Model { points: Record<string, string | number>[]; series: { key: string; label: string }[]; money: boolean; cut: number }

/** Données traçables d'un tableau de synthèse (null pour une liste de pièces ou un tableau d'une seule ligne). */
export function chartModel(t: Data, overTime = false): Model | null {
  if (t.pj || t.lignes.length < 2) return null;
  const first = t.colonnes.findIndex(c => c.type === 'money' || c.type === 'int');
  if (first < 0) return null;
  // Un seul axe : on ne mélange pas des montants et des nombres
  const type = t.colonnes[first].type;
  const numeric = t.colonnes.map((c, i) => ({ c, i })).filter(x => x.c.type === type && !x.c.label.startsWith('Écart')).slice(0, COLORS.length);
  const labels = t.colonnes.map((c, i) => ({ c, i })).filter(x => x.c.type === 'text').map(x => x.i);
  // Tableau croisé (une colonne par année) avec peu de lignes : les années en abscisse, une série par ligne
  const years = numeric.map(n => n.c.label.match(/\b20\d\d$/)?.[0]);
  if (overTime && numeric.length > 1 && years.every(Boolean) && t.lignes.length <= COLORS.length && !t.colonnes[0].label.startsWith('Mois')) {
    return {
      points: numeric.map((n, k) => {
        const point: Record<string, string | number> = { x: years[k]! };
        t.lignes.forEach((l, r) => { point[`s${r}`] = Number(l[n.i]) || 0; });
        return point;
      }),
      series: t.lignes.map((l, r) => ({ key: `s${r}`, label: labels.map(i => l[i]).join(' · ') || '—' })),
      money: type === 'money', cut: 0,
    };
  }
  const points = t.lignes.slice(0, MAX_POINTS).map(l => {
    const point: Record<string, string | number> = { x: labels.map(i => l[i]).join(' · ') || '—' };
    numeric.forEach((n, k) => { point[`s${k}`] = Number(l[n.i]) || 0; });
    return point;
  });
  return { points, series: numeric.map((n, k) => ({ key: `s${k}`, label: n.c.label })), money: type === 'money', cut: t.lignes.length - points.length };
}

/** Graphique demandé dans la question (le tracé reprend les chiffres du tableau, l'IA n'intervient pas). */
export function chartAsked(question: string): ChartKind | 'auto' | null {
  const q = question.toLowerCase();
  if (/camembert|secteurs|donut|anneau/.test(q)) return 'camembert';
  if (/\bcourbes?\b/.test(q)) return 'courbe';
  if (/histogramme|en barres|b[âa]tons/.test(q)) return 'histogramme';
  if (/graphique|graphe\b|diagramme/.test(q)) return 'auto';
  return null;
}

// Une couleur par barre (demandée) : la couleur n'est ici que décorative, chaque barre reste nommée sur l'axe
export const BAR_COLORS = [...COLORS, '#0e7490', '#92400e', '#64748b', '#65a30d'];

export function multicolorAsked(question: string): boolean {
  return /multicolore|couleurs? (?:diff[ée]rentes?|par|pour chaque)|(?:diff[ée]rentes?|plusieurs) couleurs|une couleur/.test(question.toLowerCase());
}
