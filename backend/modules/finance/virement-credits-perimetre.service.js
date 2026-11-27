const api = require('./sedit-api.client');

// Collectivité (Ville / CCAS) des budgets Sedit, pour les virements de crédits.
//
// Sedit porte DEUX budgets nommés « PRINCIPAL » (code 00) : celui de la Ville et celui du CCAS. Le libellé ne suffit donc pas
// à les distinguer. L'API Sedit Finances renvoie désormais `collectivite` (d'après FI.ORGAFI) sur les droits et les lignes ;
// tant qu'elle n'est pas redéployée, repli :
//   - côté droits de l'agent : par l'identifiant technique du budget (budget_roo, stable d'un exercice à l'autre) ;
//   - côté lignes : par le budget annuel (2e partie de l'identifiant de ligne « imputation.budgetAnnuel »), celui du CCAS
//     étant reconnu à ses codes services « J* » (la Ville n'en a aucun).
const CCAS_BUDGET_ROOS = new Set([
    '00001000000000076829021', // CCAS principal
    '31000100000000076971021', // Autonomie à domicile
    '31000200000000077085021', // SSID (clos au 31/12/2025)
    '31000300000000077199021', // Résidences autonomie
]);

const COLLECTIVITES = ['VILLE', 'CCAS'];
const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
const isPrincipal = (label) => norm(label) === 'PRINCIPAL';
const collectiviteOf = (budgetRoo) => (CCAS_BUDGET_ROOS.has(String(budgetRoo || '').trim()) ? 'CCAS' : 'VILLE');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();
async function cached(key, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
    const v = await fn();
    cache.set(key, { t: Date.now(), v });
    return v;
}

// Libellés des budgets ouverts sur l'exercice (un budget clos, ex. SSID depuis 2026, n'y figure plus).
const openBudgetLabels = (year) => cached(`open:${year}`, async () => {
    const r = await api.request('/budgets', { exercice: year });
    return new Set((r && r.data || []).map(b => norm(b.libelle)));
});

// Budget annuel du CCAS principal sur l'exercice (null si introuvable).
const ccasPrincipalBudgetAnnuel = (year) => cached(`ccas:${year}`, async () => {
    const r = await api.request('/lignes-budgetaires', { exercice: year, budget: 'PRINCIPAL', service: 'J*', limit: 1 });
    const id = String(r && r.data && r.data[0] && r.data[0].id || '');
    return id.split('.')[1] || null;
});

// Droits de l'agent enrichis de la collectivité, budgets clos écartés. Si la liste des budgets est indisponible, on ne filtre pas.
async function openRights(services, year = new Date().getFullYear()) {
    let open = null;
    try { open = await openBudgetLabels(year); } catch (e) { console.warn('[VirementCredits] budgets ouverts:', e.message); }
    return (services || [])
        .filter(s => !open || !open.size || open.has(norm(s.budget)))
        .map(s => ({ ...s, collectivite: s.collectivite || collectiviteOf(s.budgetRoo) }));
}

module.exports = { COLLECTIVITES, collectiviteOf, openRights, ccasPrincipalBudgetAnnuel, isPrincipal, norm };
