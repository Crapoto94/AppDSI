// ─────────────────────────────────────────────────────────────────────────────
//  Algorithmes de graphe du synoptique réseau.
//  Volontairement isolés du rendu : pas de dépendance React ici.
// ─────────────────────────────────────────────────────────────────────────────
import type { SynLink, SynNode } from './synoptiqueData';

/** Les deux sites qui constituent le cœur de réseau (jaune sur le plan). */
export const COEUR_IDS = ['hotel-de-ville', 'le-robespierre'];

export interface Adjacency {
  /** voisins directs : id → [{ voisin, lien }] */
  voisins: Map<string, { id: string; link: SynLink }[]>;
  /** degré (nombre de liaisons) par site */
  degre: Map<string, number>;
}

export function buildAdjacency(nodes: SynNode[], links: SynLink[]): Adjacency {
  const voisins = new Map<string, { id: string; link: SynLink }[]>();
  const degre = new Map<string, number>();
  nodes.forEach(n => { voisins.set(n.id, []); degre.set(n.id, 0); });
  links.forEach(l => {
    if (!voisins.has(l.a) || !voisins.has(l.b)) return;
    voisins.get(l.a)!.push({ id: l.b, link: l });
    voisins.get(l.b)!.push({ id: l.a, link: l });
    degre.set(l.a, (degre.get(l.a) || 0) + 1);
    degre.set(l.b, (degre.get(l.b) || 0) + 1);
  });
  return { voisins, degre };
}

/** Ensemble des sites atteignables depuis `sources`, en ignorant certaines liaisons. */
export function reachable(adj: Adjacency, sources: string[], skipLinkIds?: Set<string>, skipNodeIds?: Set<string>): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  sources.forEach(s => {
    if (!adj.voisins.has(s) || skipNodeIds?.has(s)) return;
    seen.add(s); queue.push(s);
  });
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { id, link } of adj.voisins.get(cur) || []) {
      if (skipLinkIds?.has(link.id)) continue;
      if (skipNodeIds?.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id); queue.push(id);
    }
  }
  return seen;
}

/**
 * Sites qui perdent l'accès au cœur de réseau si `linkId` est coupée.
 * On ne compte que ceux qui y avaient accès avant la coupure.
 */
export function impactLien(adj: Adjacency, linkId: string): string[] {
  const avant = reachable(adj, COEUR_IDS);
  const apres = reachable(adj, COEUR_IDS, new Set([linkId]));
  return [...avant].filter(id => !apres.has(id) && !COEUR_IDS.includes(id));
}

/** Sites qui perdent l'accès au cœur si le site `nodeId` tombe. */
export function impactSite(adj: Adjacency, nodeId: string): string[] {
  if (COEUR_IDS.includes(nodeId)) return [];
  const avant = reachable(adj, COEUR_IDS);
  const apres = reachable(adj, COEUR_IDS, undefined, new Set([nodeId]));
  return [...avant].filter(id => id !== nodeId && !apres.has(id));
}

/**
 * Points d'articulation (SPOF) et ponts (liaisons critiques) — algorithme de
 * Tarjan sur graphe non orienté, itératif pour éviter tout dépassement de pile.
 */
export function pointsCritiques(adj: Adjacency): { articulations: Set<string>; ponts: Set<string> } {
  const articulations = new Set<string>();
  const ponts = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parentLink = new Map<string, string | null>();
  let timer = 0;

  for (const racine of adj.voisins.keys()) {
    if (disc.has(racine)) continue;
    let enfantsRacine = 0;
    // pile de frames : [sommet, index du prochain voisin à explorer]
    const pile: { id: string; i: number }[] = [{ id: racine, i: 0 }];
    disc.set(racine, timer); low.set(racine, timer); timer++;
    parentLink.set(racine, null);

    while (pile.length) {
      const frame = pile[pile.length - 1];
      const liste = adj.voisins.get(frame.id) || [];
      if (frame.i < liste.length) {
        const { id: v, link } = liste[frame.i++];
        if (link.id === parentLink.get(frame.id)) continue;      // on ne remonte pas par l'arête d'arrivée
        if (disc.has(v)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, disc.get(v)!));
        } else {
          parentLink.set(v, link.id);
          disc.set(v, timer); low.set(v, timer); timer++;
          if (frame.id === racine) enfantsRacine++;
          pile.push({ id: v, i: 0 });
        }
      } else {
        pile.pop();
        const parent = pile.length ? pile[pile.length - 1] : null;
        if (parent) {
          low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!));
          if (low.get(frame.id)! > disc.get(parent.id)!) ponts.add(parentLink.get(frame.id)!);
          if (parent.id !== racine && low.get(frame.id)! >= disc.get(parent.id)!) articulations.add(parent.id);
        }
      }
    }
    if (enfantsRacine > 1) articulations.add(racine);
  }
  return { articulations, ponts };
}

/** Plus court chemin (en nombre de sauts) entre deux sites. */
export function plusCourtChemin(adj: Adjacency, from: string, to: string): { nodes: string[]; links: string[] } | null {
  if (from === to) return { nodes: [from], links: [] };
  const prev = new Map<string, { id: string; link: SynLink }>();
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { id, link } of adj.voisins.get(cur) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      prev.set(id, { id: cur, link });
      if (id === to) {
        const nodes: string[] = [to];
        const links: string[] = [];
        let c = to;
        while (c !== from) {
          const p = prev.get(c)!;
          links.push(p.link.id); nodes.push(p.id); c = p.id;
        }
        return { nodes: nodes.reverse(), links: links.reverse() };
      }
      queue.push(id);
    }
  }
  return null;
}

/** Nombre de sauts jusqu'au cœur de réseau (null si non raccordé). */
export function sautsVersCoeur(adj: Adjacency, id: string): number | null {
  if (COEUR_IDS.includes(id)) return 0;
  const dist = new Map<string, number>();
  COEUR_IDS.forEach(c => { if (adj.voisins.has(c)) dist.set(c, 0); });
  const queue = [...dist.keys()];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { id: v } of adj.voisins.get(cur) || []) {
      if (dist.has(v)) continue;
      dist.set(v, dist.get(cur)! + 1);
      if (v === id) return dist.get(v)!;
      queue.push(v);
    }
  }
  return null;
}
