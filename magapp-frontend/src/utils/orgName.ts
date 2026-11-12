// Mots-outils laissés en minuscules (sauf en début de nom)
const SMALL_WORDS = new Set([
  'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'à', 'a', 'pour', 'sur', 'sous', 'par', 'un', 'une', 'ou',
]);
// Sigles conservés en majuscules
const ACRONYMS = new Set(['DSI', 'RH', 'DGS', 'DGA', 'SIG', 'CCAS', 'ASVP', 'CTM', 'IT', 'GRH', 'DRH', 'PMI', 'ATSEM']);
// RH Studio fournit les libellés en capitales sans accents : on restaure les mots courants
const ACCENTS: Record<string, string> = {
  systeme: 'système', systemes: 'systèmes', developpement: 'développement', education: 'éducation', evenementiel: 'événementiel',
  evenements: 'événements', securite: 'sécurité', prevention: 'prévention', reglementation: 'réglementation', citoyennete: 'citoyenneté',
  democratie: 'démocratie', ecole: 'école', ecoles: 'écoles', enfance: 'enfance', gestion: 'gestion', batiment: 'bâtiment', batiments: 'bâtiments',
  elus: 'élus', elu: 'élu', mediatheque: 'médiathèque', mediatheques: 'médiathèques', communication: 'communication', proprete: 'propreté',
  tranquillite: 'tranquillité', sante: 'santé', solidarite: 'solidarité', egalite: 'égalité', economique: 'économique', economie: 'économie',
  numerique: 'numérique', etat: 'état', civil: 'civil', metiers: 'métiers', cooperation: 'coopération', periscolaire: 'périscolaire',
  accueil: 'accueil', rehabilitation: 'réhabilitation', renovation: 'rénovation', energie: 'énergie', energies: 'énergies', logistique: 'logistique',
  technique: 'technique', techniques: 'techniques', recette: 'recette', regie: 'régie', regies: 'régies', commande: 'commande', marches: 'marchés',
  marche: 'marché', politique: 'politique', jeunesse: 'jeunesse', creche: 'crèche', creches: 'crèches', pole: 'pôle', departement: 'département',
};

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);
const accent = (lower: string) => ACCENTS[lower] || lower;

/** « DIRECTION DES SYSTEMES D'INFORMATION » → « Direction des Systèmes d'Information » */
export function formatOrgName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name).trim().split(/\s+/)
    .map((raw, idx) => {
      if (ACRONYMS.has(raw.toUpperCase()) && raw === raw.toUpperCase()) return raw;
      const lower = raw.toLowerCase();
      if (idx > 0 && SMALL_WORDS.has(lower)) return lower;
      // Élisions l' d' qu' ... : l'élision reste en minuscule, le mot suivant prend la majuscule
      const m = lower.match(/^(l|d|j|n|s|t|m|c|qu)['’](.+)$/);
      if (m) {
        const rest = m[2].split('-').map((x) => cap(accent(x))).join('-');
        return idx === 0 ? cap(m[1]) + "'" + rest : m[1] + "'" + rest;
      }
      return lower.split('-').map((x) => cap(accent(x))).join('-');
    })
    .join(' ');
}
