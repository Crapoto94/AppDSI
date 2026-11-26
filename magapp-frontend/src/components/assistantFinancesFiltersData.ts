// Types et conservation des filtres permanents de l'assistant finances.

export interface Filtres { exercice?: string; section?: string; chapitre?: string; nature?: string; fonction?: string; budget?: string; direction?: string; service?: string }

export interface FilterOptions {
  exercices: number[];
  budgets: string[];
  directions: { nom: string; sigle: string; services: { code: string; libelle: string }[] }[];
  /** [section, chapitre, nature, fonction] existant dans le périmètre */
  combinaisons: string[][];
  chapitres: Record<string, string>;
  natures: Record<string, string>;
  fonctions: Record<string, string>;
}

// Conservés sur le poste, par agent : fermer la fenêtre ne les perd pas
const key = (): string => {
  try {
    const payload = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return `assistant_finances_filtres_${payload.username || ''}`;
  } catch {
    return 'assistant_finances_filtres';
  }
};

export function loadFiltres(): Filtres {
  try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch { return {}; }
}

export function saveFiltres(f: Filtres): void {
  try {
    if (Object.keys(f).length) localStorage.setItem(key(), JSON.stringify(f));
    else localStorage.removeItem(key());
  } catch { /* stockage indisponible : les filtres durent le temps de la fenêtre */ }
}
