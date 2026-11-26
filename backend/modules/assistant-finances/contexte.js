/**
 * Contexte de la conversation : ce qui a été dit reste valable tant que l'agent n'a pas dit autre chose.
 *
 * « budget de la DSI en 2025 » puis « les factures » : toujours la DSI et 2025. Service ou direction, budget,
 * années, section, dépenses ou recettes et filtres sont repris de la réponse précédente, sauf si la question en
 * donne d'autres ou les lève (« tous les services », « toutes les factures », « sans filtre »). Tout est revalidé
 * ensuite, et le périmètre de l'agent s'applique toujours.
 */
const { SOURCES } = require('./datasets');
const { libelle } = require('./referentiel');

const ETATS = { sans_service_fait: 'sans service fait', rejetees: 'rejetées', non_rejetees: 'non rejetées', en_cours: 'en cours' };

/** Section commune à la réponse précédente (aucune si elle comportait un tableau par section). */
const previousSection = (requetes) => (requetes.every(r => r.filtres.section === requetes[0].filtres.section) ? requetes[0].filtres.section : null);

/**
 * Complète une demande (issue du modèle) avec le contexte.
 * @param {object} query    demande validée
 * @param {object[]} before demandes de la réponse précédente
 * @param {object} c        constats de l'analyse de la question (analyse.js)
 * @param {string[]} repris libellés de ce qui est repris (complété ici)
 */
function heriter(query, before, c, repris) {
    if (!before.length) return c.parleEtat ? query : { ...query, filtres: { ...query.filtres, etats: [] } };
    const prev = before[0];
    const reset = c.reset || {};
    const sameSource = prev.source === query.source;
    const def = SOURCES[query.source];
    const out = { ...query, filtres: { ...query.filtres } };
    const f = out.filtres;

    if (!c.services && !reset.services && prev.services.length) {
        out.services = prev.services;
        repris.push(libelle(prev.services));
    }
    if (reset.services) out.services = [];
    if (!c.entites && !reset.services && prev.services_exclus?.length) {
        out.services_exclus = prev.services_exclus;
        repris.push(`hors ${libelle(prev.services_exclus)}`);
    }
    if (!out.budgets.length && !reset.services) out.budgets = prev.budgets;
    // La période reste valable tant qu'aucune autre date n'est donnée
    if (!c.periode && !c.exercices && !reset.exercices && prev.filtres.date_de && SOURCES[query.source].dateCol) {
        Object.assign(f, { date_de: prev.filtres.date_de, date_a: prev.filtres.date_a, date_paiement: prev.filtres.date_paiement });
        out.exercices = prev.exercices;
        repris.push(`période du ${prev.filtres.date_de} au ${prev.filtres.date_a}`);
    }
    if (!c.exercices && !c.periode && !reset.exercices && prev.annees_fixees) {
        out.exercices = prev.exercices;
        out.annees_fixees = true;
        repris.push(prev.exercices.join(', '));
    }
    const section = previousSection(before);
    if (!c.section && !c.sections && section) {
        f.section = section;
        repris.push(section === 'F' ? 'fonctionnement' : 'investissement');
    }
    if (!c.sens && prev.filtres.sens && (def.filters.sens || def.sensExpr)) f.sens = prev.filtres.sens;

    // Une nouvelle date ouvre une nouvelle recherche (« factures reçues hier ») : on ne garde que le service,
    // la section et les droits ; pas le fournisseur, le libellé, les montants ni les états de la question d'avant
    if (c.periode) {
        f.tiers = c.tiers || [];
        f.texte = [];
        if (!c.parleEtat) f.etats = [];
        f.montant_min = c.montant_min ?? null;
        f.montant_max = c.montant_max ?? null;
        return out;
    }
    // États (service fait, rejet, en cours) : le modèle en invente parfois ; seuls ceux demandés ou déjà posés valent
    if (reset.filtres) {
        Object.assign(f, { date_de: null, date_a: null, tiers: [], tiers_exclus: [], texte: [], chapitre: [], nature: [], fonction: [], numero: null, etats: [], montant_min: c.montant_min ?? null, montant_max: c.montant_max ?? null });
        return out;
    }
    if (!c.parleEtat) {
        f.etats = sameSource ? prev.filtres.etats : [];
        if (f.etats.length) repris.push(f.etats.map(e => ETATS[e] || e).join(', '));
    }
    for (const key of ['chapitre', 'nature', 'fonction']) {
        if (sameSource && !f[key].length && prev.filtres[key]?.length) {
            f[key] = prev.filtres[key];
            repris.push(`${key} ${f[key].join(', ')}`);
        }
    }
    if (!c.tiers && !c.tiersExclus && prev.filtres.tiers_exclus?.length && def.filters.tiers) f.tiers_exclus = prev.filtres.tiers_exclus;
    if (!f.tiers.length && prev.filtres.tiers.length && def.filters.tiers) {
        f.tiers = prev.filtres.tiers;
        repris.push(`tiers ${f.tiers.map(t => t.replace(/^=/, '')).join(', ')}`);
    }
    if (sameSource && !f.texte.length) {
        f.texte = prev.filtres.texte;
        if (f.texte.length) repris.push(`libellé « ${f.texte.join(' ou ')} »`);
    }
    for (const [key, label] of [['montant_min', '≥'], ['montant_max', '≤']]) {
        if (c[key] == null && f[key] == null && prev.filtres[key] != null && sameSource) {
            f[key] = prev.filtres[key];
            repris.push(`${label} ${f[key]} €`);
        }
    }
    return out;
}

/** Retouche appliquée directement à la réponse précédente : seules les levées de filtres sont à traiter. */
function lever(query, c) {
    const reset = c.reset || {};
    const out = { ...query, filtres: { ...query.filtres } };
    if (reset.services) out.services = [];
    if (reset.filtres) Object.assign(out.filtres, { date_de: null, date_a: null, tiers: [], tiers_exclus: [], texte: [], chapitre: [], nature: [], fonction: [], numero: null, etats: [], montant_min: c.montant_min ?? null, montant_max: c.montant_max ?? null });
    return out;
}

module.exports = { heriter, lever, ETATS };
