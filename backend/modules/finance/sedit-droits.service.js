const seditApi = require('./sedit-api.client');

// Droits budgétaires d'un agent, résolus exclusivement par l'API Sedit Finances.
//
// Modèle SEDIT :
//   SM.SMUTILISAT   compte SEDIT (UTILISAT = code, MAIL, ACTIF 'O'/'N')
//   FI.UTILISATFI   profil « finances » d'un compte SEDIT, une ligne par budget
//   FI.DROITSER     droits par service gestionnaire : ACCES = 'M' (modification), 'I' (interrogation), 'N' (aucun)
//   FI.SERVICEFI    CLEACCES = code service (BF1, BF6…) = FI.IMPUTATION.CODESERG
// L'API applique ce rapprochement et renvoie le compte + les couples budget × service autorisés.

const CACHE_MS = 5 * 60 * 1000;
const apiCache = new Map();
const apiServicesByRoo = new Map();

const apiKey = (user) => `${String(user?.username || '').toLowerCase()}|${String(user?.email || '').toLowerCase()}`;

async function apiRights(user) {
    const key = apiKey(user);
    const hit = apiCache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
    const data = await seditApi.droits({ email: user?.email, username: user?.username }, { actor: user, clientApp: 'DSIHUB' });
    const v = {
        sedit: data?.user ? { roo: data.user.roo, code: data.user.code, nom: data.user.nom, mail: data.user.email } : null,
        services: Array.isArray(data?.services) ? data.services.map(s => ({
            budgetRoo: s.budget_roo, budget: s.budget, budgetCode: s.budget_code,
            serviceRoo: s.service_roo, service: s.service, libelle: s.service_libelle, access: s.access,
        })) : [],
    };
    apiCache.set(key, { t: Date.now(), v });
    if (v.sedit) apiServicesByRoo.set(v.sedit.roo, v.services);
    return v;
}

// Compte SEDIT actif correspondant à l'agent AppDSI (null = pas de compte SEDIT).
async function resolveSeditUser(user) {
    if (!user || !user.username) return null;
    return (await apiRights(user)).sedit;
}

// Couples (budget, service gestionnaire) sur lesquels le compte a l'un des accès demandés.
async function loadServices(seditUser, levels) {
    if (!seditUser) return [];
    const services = apiServicesByRoo.get(seditUser.roo) || [];
    return services.filter(s => levels.includes(s.access)).map(({ access, ...s }) => s);
}

const getModifiableServices = (seditUser) => loadServices(seditUser, ['M']);
// Factures visibles dans SEDIT : accès interrogation OU modification
const getVisibleServices = (seditUser) => loadServices(seditUser, ['I', 'M']);

// Accès complet d'un agent : compte SEDIT + services modifiables (null = pas de compte SEDIT).
async function getAccess(user) {
    const sedit = await resolveSeditUser(user);
    if (!sedit) return null;
    const services = await getModifiableServices(sedit);
    return { sedit, services };
}

module.exports = { resolveSeditUser, getModifiableServices, getVisibleServices, getAccess };
