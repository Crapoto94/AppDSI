// ─────────────────────────────────────────────────────────────────────────────
//  Données du synoptique réseau de la ville d'Ivry-sur-Seine.
//
//  GÉNÉRÉ à partir de « synoptique-2026.pdf » (23/07/2026 — Synoptique des
//  liaisons existantes du réseau de la ville d'Ivry) : les boîtes, les
//  liaisons, les capacités (nombre de brins / câbles RJ45) et les métrages
//  ont été extraits de la géométrie vectorielle du PDF.
//
//  Les coordonnées x/y/w/h sont celles du PDF (repère 1900 × 1277, origine en
//  haut à gauche) : elles servent de disposition par défaut. L'utilisateur peut
//  déplacer les sites, la disposition personnalisée est stockée côté serveur
//  (hub_reseau.synoptique_layout) via /api/network/synoptique/layout.
// ─────────────────────────────────────────────────────────────────────────────

/** Catégorie d'un site — détermine sa couleur (reprise de la légende du PDF). */
export type SynCat = 'coeur' | 'nord' | 'sud' | 'sudouest' | 'linkt' | 'sfr' | 'moji' | 'operateur' | 'site';

/** Nature physique d'une liaison. */
export type SynMedia = 'fibre' | 'cuivre' | 'operateur';

/** Famille de tracé (reprise des couleurs de trait du PDF). */
export type SynKind = 'fibre' | 'cuivre' | 'iblo' | 'moji' | 'linkt';

export interface SynNode {
  id: string;
  name: string;
  /** Précision affichée sous le nom (module de boucle, autocom, ex-nom…). */
  note: string | null;
  cat: SynCat;
  /** Identifiant du groupe (campus) auquel le site appartient. */
  group: string | null;
  x: number; y: number; w: number; h: number;
}

export interface SynLink {
  id: string;
  a: string;
  b: string;
  kind: SynKind;
  media: SynMedia;
  /** Nombre de brins de la fibre (null pour le cuivre / les liens opérateur). */
  brins: number | null;
  /** Libellé tel qu'il figure sur le synoptique. */
  label: string | null;
  /** Longueur du câble en mètres, quand elle est annotée sur le plan. */
  metres: number | null;
}

export interface SynGroup { id: string; name: string; x: number; y: number; w: number; h: number; }

/** Emprise du plan d'origine (repère PDF). */
export const SYN_VIEWBOX = { w: 1900, h: 1277 };

export const SYN_NODES: SynNode[] = [
  { id: "gs-g-peri", name: "GS G. Péri", note: null, cat: "site", group: null, x: 805.2, y: 434.8, w: 76.6, h: 36.9 },
  { id: "ca-casanova", name: "CA Casanova", note: "Boucle Nord M4-M5", cat: "nord", group: null, x: 947.0, y: 548.2, w: 111.7, h: 49.9 },
  { id: "ct-ledru-rollin", name: "CT Ledru Rollin", note: "Boucle Nord M3", cat: "nord", group: null, x: 1043.2, y: 320.4, w: 151.1, h: 54.1 },
  { id: "mediatheque", name: "Médiathèque", note: null, cat: "site", group: null, x: 773.3, y: 500.9, w: 76.5, h: 36.9 },
  { id: "hotel-de-ville", name: "Hôtel de ville", note: null, cat: "coeur", group: null, x: 921.4, y: 653.4, w: 76.6, h: 49.3 },
  { id: "cms", name: "CMS", note: null, cat: "site", group: null, x: 1134.0, y: 582.2, w: 76.6, h: 36.9 },
  { id: "cat-st-just", name: "CAT St Just", note: "Boucle Sud", cat: "sud", group: null, x: 663.3, y: 862.9, w: 143.3, h: 36.8 },
  { id: "bureau-detude", name: "Bureau d’étude", note: "Téléphonie sur CAT", cat: "site", group: null, x: 820.8, y: 862.9, w: 58.5, h: 36.8 },
  { id: "salle-quincey", name: "Salle Quincey", note: null, cat: "site", group: null, x: 687.6, y: 756.6, w: 76.5, h: 36.8 },
  { id: "ca-pablo-neruda", name: "CA Pablo Neruda", note: "Boucle Sud M1", cat: "sud", group: null, x: 1085.7, y: 765.1, w: 104.9, h: 41.4 },
  { id: "ca-coutant", name: "CA Coutant", note: "Boucle Nord M1", cat: "nord", group: null, x: 1057.3, y: 698.4, w: 104.9, h: 48.6 },
  { id: "le-luxy", name: "Le Luxy", note: null, cat: "site", group: null, x: 1165.2, y: 698.4, w: 76.6, h: 36.9 },
  { id: "ca-cachin", name: "CA Cachin", note: "Boucle Nord M2 - Autocom", cat: "nord", group: null, x: 1264.4, y: 722.5, w: 76.6, h: 36.9 },
  { id: "maternelle-robespierre", name: "Maternelle Robespierre", note: null, cat: "site", group: null, x: 561.0, y: 727.1, w: 76.5, h: 39.7 },
  { id: "gs-j-curie", name: "GS-J. Curie", note: "Boucle Sud M2", cat: "sud", group: null, x: 997.3, y: 958.7, w: 98.3, h: 47.6 },
  { id: "gs-barbusse", name: "GS Barbusse", note: null, cat: "linkt", group: null, x: 510.2, y: 398.2, w: 75.2, h: 41.1 },
  { id: "mdq-monmousseau", name: "MDQ Monmousseau", note: "Boucle Sud-Ouest M3", cat: "sudouest", group: null, x: 130.4, y: 989.8, w: 119.0, h: 39.7 },
  { id: "maternelle-e-cotton", name: "Maternelle E. Cotton", note: null, cat: "site", group: null, x: 259.7, y: 1082.4, w: 76.6, h: 39.7 },
  { id: "gymnase-lenine", name: "Gymnase Lénine", note: "Téléphonie sur Chevaleret", cat: "site", group: null, x: 1362.0, y: 793.4, w: 76.5, h: 39.6 },
  { id: "maison-de-quartier-jean-jacques-rousseau", name: "Maison de quartier Jean-Jacques Rousseau", note: null, cat: "site", group: null, x: 1426.9, y: 505.6, w: 75.1, h: 46.5 },
  { id: "maison-de-la-citoyennete", name: "Maison de la citoyenneté", note: null, cat: "site", group: null, x: 1555.7, y: 429.2, w: 75.4, h: 44.5 },
  { id: "maison-des-associations", name: "Maison des Associations", note: "JB Clément", cat: "site", group: null, x: 794.8, y: 741.6, w: 75.1, h: 41.1 },
  { id: "esp-g-philipe", name: "Esp. G.Philipe", note: null, cat: "site", group: "hachette", x: 587.0, y: 577.4, w: 77.1, h: 34.9 },
  { id: "hangar-cafe-musique", name: "Hangar café-musique", note: null, cat: "site", group: null, x: 924.5, y: 729.8, w: 75.1, h: 41.1 },
  { id: "galerie-f-leger", name: "Galerie F. Leger", note: null, cat: "site", group: "hachette", x: 642.9, y: 518.8, w: 94.1, h: 24.1 },
  { id: "ddac", name: "DDAC", note: null, cat: "site", group: "hachette", x: 567.4, y: 530.8, w: 61.3, h: 24.8 },
  { id: "service-municipal-de-la-jeunesse", name: "Service municipal de la Jeunesse", note: null, cat: "site", group: null, x: 925.0, y: 799.2, w: 75.2, h: 41.1 },
  { id: "conservatoire", name: "Conservatoire", note: null, cat: "site", group: null, x: 924.1, y: 850.4, w: 75.1, h: 41.1 },
  { id: "syndicat-cgt", name: "Syndicat CGT", note: "Ex-CMPP", cat: "site", group: null, x: 1161.1, y: 845.6, w: 68.0, h: 30.9 },
  { id: "spinoza-atelier-dart", name: "Spinoza - atelier d’art", note: null, cat: "site", group: null, x: 1297.2, y: 844.8, w: 56.7, h: 30.5 },
  { id: "foyer-chevaleret", name: "Foyer Chevaleret", note: null, cat: "site", group: null, x: 1451.8, y: 871.2, w: 76.5, h: 38.3 },
  { id: "gs-makarenko", name: "GS Makarenko", note: "Téléphonie sur P&M Curie", cat: "linkt", group: null, x: 610.9, y: 399.0, w: 75.2, h: 41.1 },
  { id: "centre-p-m-curie", name: "Centre P&M Curie", note: null, cat: "linkt", group: null, x: 638.5, y: 311.8, w: 75.2, h: 41.1 },
  { id: "ex-smac", name: "Ex-SMAC", note: null, cat: "site", group: "hachette", x: 714.0, y: 632.9, w: 49.5, h: 24.8 },
  { id: "piscine-robespierre", name: "Piscine Robespierre", note: null, cat: "site", group: null, x: 395.4, y: 727.1, w: 75.1, h: 41.1 },
  { id: "centre-technique-rigaud", name: "Centre technique Rigaud", note: null, cat: "site", group: null, x: 1406.0, y: 993.3, w: 76.5, h: 38.3 },
  { id: "c-t-lamant", name: "C.T. Lamant", note: "Boucle Sud-Ouest M2 - Autocom", cat: "sudouest", group: null, x: 317.5, y: 988.4, w: 128.3, h: 41.1 },
  { id: "le-robespierre", name: "Le Robespierre", note: null, cat: "coeur", group: null, x: 384.3, y: 614.3, w: 75.4, h: 41.9 },
  { id: "cmpp", name: "CMPP", note: "Ex-Casanova", cat: "site", group: null, x: 1182.6, y: 525.9, w: 75.1, h: 33.0 },
  { id: "gs-guy-moquet", name: "GS Guy Môquet", note: null, cat: "site", group: null, x: 873.1, y: 244.7, w: 96.3, h: 28.9 },
  { id: "gs-orme-au-chat", name: "GS Orme au Chat", note: null, cat: "site", group: null, x: 1616.4, y: 778.7, w: 76.6, h: 38.3 },
  { id: "formation", name: "Formation", note: null, cat: "site", group: "hachette", x: 484.6, y: 593.4, w: 53.2, h: 24.8 },
  { id: "syndicat-fsu", name: "Syndicat FSU", note: null, cat: "site", group: null, x: 1098.4, y: 851.1, w: 51.1, h: 30.5 },
  { id: "mdq-gagarine", name: "MDQ Gagarine", note: null, cat: "site", group: null, x: 1201.5, y: 927.3, w: 75.1, h: 41.1 },
  { id: "gs-einstein", name: "GS-Einstein", note: null, cat: "site", group: null, x: 1021.5, y: 428.4, w: 75.2, h: 33.0 },
  { id: "ct-westermeyer", name: "CT Westermeyer", note: null, cat: "site", group: null, x: 1343.6, y: 388.7, w: 66.6, h: 36.2 },
  { id: "manufacture-des-illets", name: "Manufacture des œillets", note: null, cat: "site", group: null, x: 943.4, y: 1082.9, w: 75.1, h: 41.1 },
  { id: "garage-municipal", name: "Garage municipal", note: null, cat: "site", group: null, x: 806.9, y: 942.5, w: 58.5, h: 36.9 },
  { id: "cat-service-info", name: "CAT - service Info", note: null, cat: "site", group: null, x: 706.3, y: 986.5, w: 58.5, h: 36.8 },
  { id: "gs-langevin", name: "GS Langevin", note: "Boucle Sud-Ouest M1", cat: "sudouest", group: null, x: 538.6, y: 989.0, w: 92.6, h: 41.1 },
  { id: "stade-clerville", name: "Stade Clerville", note: null, cat: "site", group: null, x: 260.3, y: 807.1, w: 52.1, h: 41.8 },
  { id: "cimetiere-nouveau", name: "Cimetière nouveau", note: "Conservation", cat: "site", group: null, x: 236.7, y: 885.9, w: 88.7, h: 34.0 },
  { id: "ct-guillou", name: "CT GUILLOU", note: null, cat: "site", group: null, x: 1665.1, y: 555.6, w: 76.5, h: 38.3 },
  { id: "ex-plci", name: "Ex-PLCI", note: null, cat: "site", group: "hachette", x: 705.0, y: 554.9, w: 61.3, h: 24.8 },
  { id: "halle-des-sports-gosnat", name: "Halle des sports Gosnat", note: null, cat: "site", group: null, x: 638.6, y: 1139.6, w: 75.2, h: 41.1 },
  { id: "gymnase-delaune", name: "Gymnase Delaune", note: null, cat: "site", group: null, x: 516.2, y: 807.8, w: 51.0, h: 35.8 },
  { id: "gymnase-des-epinettes", name: "Gymnase des Épinettes", note: null, cat: "site", group: null, x: 1347.9, y: 569.8, w: 66.0, h: 41.1 },
  { id: "multi-accueil-maria-merian", name: "Multi-accueil Maria Merian", note: null, cat: "site", group: null, x: 522.1, y: 1088.5, w: 109.9, h: 41.1 },
  { id: "creche-ada-lovelace", name: "Crèche Ada Lovelace", note: null, cat: "site", group: null, x: 1406.1, y: 1123.1, w: 76.6, h: 38.3 },
  { id: "fafa-solderie", name: "FAFA solderie", note: null, cat: "site", group: null, x: 707.9, y: 432.8, w: 71.5, h: 32.6 },
  { id: "la-biennale-des-poetes", name: "La biennale des poètes", note: null, cat: "site", group: "hachette", x: 487.8, y: 630.0, w: 71.5, h: 32.6 },
  { id: "parking-des-communaux", name: "Parking des Communaux", note: null, cat: "site", group: null, x: 1023.7, y: 626.2, w: 63.8, h: 27.2 },
  { id: "gs-ducie-september", name: "GS Ducie September", note: null, cat: "site", group: null, x: 1557.9, y: 323.7, w: 75.4, h: 44.5 },
  { id: "creche-r-bonheur", name: "Crèche R. Bonheur", note: null, cat: "linkt", group: null, x: 511.0, y: 328.1, w: 75.1, h: 41.1 },
  { id: "creche-niki-de-saint-phalle", name: "Crèche Niki de Saint Phalle", note: null, cat: "linkt", group: null, x: 751.8, y: 330.0, w: 75.1, h: 41.1 },
  { id: "plci-3e-et", name: "PLCI 3e ét.", note: null, cat: "site", group: "hachette", x: 488.7, y: 534.5, w: 61.3, h: 24.8 },
  { id: "gipc-lognes", name: "GIPC Lognes", note: "Datacenter", cat: "operateur", group: null, x: 1700.8, y: 129.0, w: 144.6, h: 127.6 },
  { id: "gs-anne-sylvestre", name: "GS Anne Sylvestre", note: null, cat: "moji", group: null, x: 1330.8, y: 1194.2, w: 118.2, h: 41.1 },
  { id: "gs-thorez", name: "GS Thorez", note: null, cat: "linkt", group: null, x: 639.3, y: 258.0, w: 75.1, h: 41.1 },
  { id: "gymnase-a-millat", name: "Gymnase A. Millat", note: null, cat: "linkt", group: null, x: 752.7, y: 256.5, w: 75.1, h: 41.1 },
  { id: "parking-marat", name: "Parking Marat", note: null, cat: "site", group: null, x: 188.0, y: 528.1, w: 99.2, h: 41.8 },
  { id: "ram-hartmann-data", name: "RAM Hartmann - DATA", note: null, cat: "sfr", group: null, x: 376.4, y: 1140.7, w: 109.9, h: 25.8 },
  { id: "creche-m-bres", name: "Crèche M. Bres", note: null, cat: "sfr", group: null, x: 1560.2, y: 1018.2, w: 109.9, h: 41.1 },
  { id: "gs-r-franklin", name: "GS R. Franklin", note: null, cat: "linkt", group: null, x: 1647.5, y: 908.2, w: 75.1, h: 41.2 },
  { id: "gs-solomon", name: "GS Solomon", note: null, cat: "linkt", group: null, x: 97.5, y: 887.8, w: 75.1, h: 41.1 },
  { id: "gs-r-parks", name: "GS R. Parks", note: null, cat: "linkt", group: null, x: 510.2, y: 257.2, w: 75.2, h: 41.1 },
  { id: "foyer-croizat", name: "Foyer Croizat", note: null, cat: "sfr", group: null, x: 752.7, y: 164.7, w: 109.9, h: 41.1 },
  { id: "salle-carnot-verrolot", name: "Salle Carnot - Verrolot", note: null, cat: "sfr", group: null, x: 899.2, y: 164.4, w: 109.8, h: 41.1 },
  { id: "stade-des-lilas", name: "Stade des Lilas", note: null, cat: "sfr", group: null, x: 100.9, y: 750.6, w: 109.9, h: 41.1 },
  { id: "stade-gournay", name: "Stade Gournay", note: null, cat: "sfr", group: null, x: 99.8, y: 663.3, w: 109.9, h: 41.1 },
  { id: "ex-syndicat-cgt", name: "Ex-Syndicat CGT", note: null, cat: "site", group: null, x: 897.0, y: 932.9, w: 68.7, h: 30.5 },
  { id: "plci-1er-et", name: "PLCI 1er ét.", note: null, cat: "site", group: "hachette", x: 568.3, y: 484.1, w: 61.3, h: 24.8 },
  { id: "sous-sol-egp", name: "Sous-sol EGP", note: null, cat: "site", group: "hachette", x: 616.3, y: 635.0, w: 53.2, h: 24.8 },
  { id: "ex-usi", name: "Ex-USI", note: null, cat: "site", group: null, x: 986.2, y: 917.4, w: 68.6, h: 30.5 },
  { id: "ram-hartmann-tel", name: "RAM Hartmann - TEL", note: null, cat: "linkt", group: null, x: 375.8, y: 1171.0, w: 109.9, h: 23.3 },
  { id: "ram-parmentier", name: "RAM Parmentier", note: null, cat: "linkt", group: null, x: 1023.7, y: 1034.3, w: 109.9, h: 23.3 },
  { id: "moji-cloud", name: "MOJI", note: "Opérateur - collecte", cat: "moji", group: null, x: 395, y: 118, w: 82, h: 50 },
  { id: "linkt-cloud", name: "LINKT", note: "Opérateur", cat: "operateur", group: null, x: 1478, y: 92, w: 82, h: 50 },
  { id: "sfr-cloud", name: "SFR", note: "Opérateur", cat: "sfr", group: null, x: 1585, y: 1143, w: 82, h: 50 },
];

export const SYN_LINKS: SynLink[] = [
  { id: "l0", a: "gs-g-peri", b: "ca-casanova", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l1", a: "mediatheque", b: "ca-casanova", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l2", a: "mediatheque", b: "hotel-de-ville", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l3", a: "ca-casanova", b: "hotel-de-ville", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l4", a: "hotel-de-ville", b: "cms", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l5", a: "salle-quincey", b: "cat-st-just", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l6", a: "hotel-de-ville", b: "ca-pablo-neruda", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l7", a: "hotel-de-ville", b: "ca-coutant", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l8", a: "ca-coutant", b: "le-luxy", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l9", a: "le-luxy", b: "ca-cachin", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: 503 },
  { id: "l10", a: "ca-pablo-neruda", b: "gs-j-curie", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l11", a: "ct-ledru-rollin", b: "ca-cachin", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l12", a: "maison-de-quartier-jean-jacques-rousseau", b: "maison-de-la-citoyennete", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l13", a: "syndicat-cgt", b: "spinoza-atelier-dart", kind: "fibre", media: "fibre", brins: 6, label: "FO 6 brins", metres: null },
  { id: "l14", a: "piscine-robespierre", b: "maternelle-robespierre", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l15", a: "gs-g-peri", b: "gs-guy-moquet", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l16", a: "gs-orme-au-chat", b: "foyer-chevaleret", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l17", a: "le-robespierre", b: "gs-langevin", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: 1050 },
  { id: "l18", a: "ct-guillou", b: "gs-orme-au-chat", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: 692 },
  { id: "l19", a: "c-t-lamant", b: "mdq-monmousseau", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l20", a: "c-t-lamant", b: "gs-langevin", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: 830 },
  { id: "l21", a: "gs-langevin", b: "halle-des-sports-gosnat", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l22", a: "gymnase-delaune", b: "stade-clerville", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: 128 },
  { id: "l23", a: "le-robespierre", b: "mdq-monmousseau", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: 309 },
  { id: "l24", a: "maison-de-la-citoyennete", b: "gs-ducie-september", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l25", a: "gs-j-curie", b: "manufacture-des-illets", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l26", a: "gs-j-curie", b: "mdq-gagarine", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l27", a: "parking-marat", b: "le-robespierre", kind: "fibre", media: "fibre", brins: 6, label: "FO 6 brins", metres: null },
  { id: "l28", a: "sous-sol-egp", b: "maison-des-associations", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l29", a: "ex-smac", b: "esp-g-philipe", kind: "cuivre", media: "cuivre", brins: null, label: "5 câbles RJ45", metres: null },
  { id: "l30", a: "hotel-de-ville", b: "le-robespierre", kind: "iblo", media: "fibre", brins: 48, label: "FO 48 brins (IBLO)", metres: 757 },
  { id: "l31", a: "parking-des-communaux", b: "ca-coutant", kind: "fibre", media: "fibre", brins: null, label: null, metres: null },
  { id: "l32", a: "cms", b: "gymnase-des-epinettes", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: null },
  { id: "l33", a: "esp-g-philipe", b: "ex-plci", kind: "cuivre", media: "cuivre", brins: null, label: "5 câbles RJ45", metres: 60 },
  { id: "l34", a: "ca-casanova", b: "gs-einstein", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l35", a: "ca-casanova", b: "cmpp", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: 953 },
  { id: "l36", a: "ex-syndicat-cgt", b: "conservatoire", kind: "cuivre", media: "cuivre", brins: null, label: "5 câbles RJ45", metres: null },
  { id: "l37", a: "ca-pablo-neruda", b: "conservatoire", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: 65 },
  { id: "l38", a: "fafa-solderie", b: "galerie-f-leger", kind: "cuivre", media: "cuivre", brins: null, label: "6 câbles RJ45", metres: null },
  { id: "l39", a: "plci-3e-et", b: "plci-1er-et", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l40", a: "la-biennale-des-poetes", b: "esp-g-philipe", kind: "cuivre", media: "cuivre", brins: null, label: "9 câbles RJ45", metres: null },
  { id: "l41", a: "esp-g-philipe", b: "galerie-f-leger", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: 68 },
  { id: "l42", a: "ddac", b: "esp-g-philipe", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l43", a: "cat-st-just", b: "cat-service-info", kind: "fibre", media: "fibre", brins: 6, label: "FO 6 brins", metres: null },
  { id: "l44", a: "cat-st-just", b: "garage-municipal", kind: "fibre", media: "fibre", brins: 6, label: "FO 6 brins", metres: null },
  { id: "l45", a: "cat-st-just", b: "bureau-detude", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l46", a: "cat-st-just", b: "gs-j-curie", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l47", a: "hangar-cafe-musique", b: "service-municipal-de-la-jeunesse", kind: "cuivre", media: "cuivre", brins: null, label: "4 câbles RJ45", metres: null },
  { id: "l48", a: "hotel-de-ville", b: "service-municipal-de-la-jeunesse", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l49", a: "ca-pablo-neruda", b: "syndicat-cgt", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: 105 },
  { id: "l50", a: "conservatoire", b: "syndicat-fsu", kind: "cuivre", media: "cuivre", brins: null, label: "4 câbles RJ45", metres: null },
  { id: "l51", a: "conservatoire", b: "ex-usi", kind: "cuivre", media: "cuivre", brins: null, label: "5 câbles RJ45", metres: null },
  { id: "l52", a: "ct-ledru-rollin", b: "gs-g-peri", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l53", a: "c-t-lamant", b: "maternelle-e-cotton", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l54", a: "gymnase-lenine", b: "gs-orme-au-chat", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l55", a: "piscine-robespierre", b: "le-robespierre", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: 587 },
  { id: "l56", a: "foyer-chevaleret", b: "centre-technique-rigaud", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l57", a: "formation", b: "esp-g-philipe", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l58", a: "salle-quincey", b: "maternelle-robespierre", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l59", a: "hotel-de-ville", b: "maison-des-associations", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l60", a: "gs-j-curie", b: "gymnase-lenine", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l61", a: "c-t-lamant", b: "multi-accueil-maria-merian", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l62", a: "cat-st-just", b: "hotel-de-ville", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l63", a: "le-robespierre", b: "stade-clerville", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l64", a: "maison-de-quartier-jean-jacques-rousseau", b: "gs-orme-au-chat", kind: "fibre", media: "fibre", brins: 48, label: "FO 48 brins", metres: 710 },
  { id: "l65", a: "gs-makarenko", b: "centre-p-m-curie", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l66", a: "centre-technique-rigaud", b: "creche-ada-lovelace", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l67", a: "cimetiere-nouveau", b: "c-t-lamant", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: 582 },
  { id: "l68", a: "formation", b: "plci-3e-et", kind: "fibre", media: "fibre", brins: 24, label: "FO 24 brins", metres: null },
  { id: "l69", a: "sous-sol-egp", b: "esp-g-philipe", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: 30 },
  { id: "l70", a: "maison-de-quartier-jean-jacques-rousseau", b: "ct-westermeyer", kind: "fibre", media: "fibre", brins: 12, label: "FO 12 brins", metres: null },
  { id: "l71", a: "le-robespierre", b: "moji-cloud", kind: "moji", media: "operateur", brins: null, label: "Connexion 9 Go", metres: null },
  { id: "l72", a: "moji-cloud", b: "gipc-lognes", kind: "moji", media: "operateur", brins: null, label: "Connexion 10 Go", metres: null },
  { id: "l73", a: "linkt-cloud", b: "hotel-de-ville", kind: "linkt", media: "operateur", brins: null, label: "Connexion 100 Mb", metres: null },
  { id: "l74", a: "gs-anne-sylvestre", b: "moji-cloud", kind: "moji", media: "operateur", brins: null, label: "FO — 1 Mb", metres: null },
];

export const SYN_GROUPS: SynGroup[] = [
  { id: "hachette", name: "Centre J. Hachette", x: 477.6, y: 474.8, w: 291.2, h: 198.5 },
];
