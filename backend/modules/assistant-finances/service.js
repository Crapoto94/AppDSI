// Assistant finances (MagApp) : questions en français → tableaux issus de Sedit, dans le périmètre de l'agent.
// Droits : exactement ceux de « Mes factures » (droits SEDIT en consultation ou modification ; un partage de
// factures ne porte que sur les factures et leurs pièces jointes).
const mesFactures = require('../finance/mes-factures.service');
const financeShare = require('../finance/finance-share.controller');
const { interpret, sanitizeQuery } = require('./interpreter');
const { TYPES } = require('./export');
const regles = require('./regles');
const general = require('./general');
const { sanitizeFiltres, imposer, resume, options } = require('./filtres');
const { execute, assertPieceVisible } = require('./query');

const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };
const PJ_API = '/api/assistant-finances/pj';

async function sourcesOf(user) {
    const sources = (await mesFactures.getSources(user)).filter(s => s.services.length);
    if (!sources.length) throw fail(403, 'Aucun droit Sedit Finances sur votre compte (ni accès partagé).');
    return sources;
}

/** Services et budgets du périmètre, pour que l'IA sache nommer les directions. */
function scopeSummary(sources) {
    const services = new Map();
    const budgets = new Set();
    for (const src of sources) for (const sv of src.services) {
        if (sv.service) services.set(sv.service, sv.libelle || sv.service);
        if (sv.budget) budgets.add(sv.budget);
    }
    return {
        services: [...services].map(([code, libelle]) => ({ code, libelle })).sort((a, b) => a.code.localeCompare(b.code)),
        budgets: [...budgets].sort(),
    };
}

async function getAccess(user) {
    const sources = (await mesFactures.getSources(user)).filter(s => s.services.length);
    const scope = scopeSummary(sources);
    return {
        allowed: sources.length > 0,
        // Sans droits propres, seuls les partages de factures sont interrogeables
        own: sources.some(s => s.key === 'me'),
        nb_services: scope.services.length,
        budgets: scope.budgets,
        shared_by: sources.filter(s => s.key !== 'me').map(s => s.owner),
    };
}

/** Valeurs des listes déroulantes, dans le périmètre de l'agent. */
async function getFilterOptions(user) {
    return options(await sourcesOf(user));
}

async function ask(user, { question, previous, filtres, historique } = {}) {
    const q = String(question || '').trim();
    if (q.length < 3) throw fail(400, 'Posez une question sur les finances.');
    if (q.length > 600) throw fail(400, 'Question trop longue (600 caractères maximum).');
    const sources = await sourcesOf(user);
    const started = Date.now();
    const consignes = await regles.pourPrompt(user);
    // Question générale (« pourquoi… », « c'est quoi… ») : réponse de l'IA locale, sans recherche
    const parler = async () => {
        const r = await general.repondre({ question: q, historique, regles: consignes });
        console.log(`[AssistantFinances] ${user.username} : « ${q.slice(0, 200)} » → réponse générale (${Date.now() - started} ms)`);
        return { message: r.message, general: true, tableaux: [], requetes: [], model: r.model };
    };
    if (general.estGenerale(q)) return parler();
    const { requetes, avis, model, illisible, message } = await interpret({ question: q, ...scopeSummary(sources), previous, regles: consignes });
    // Rien à chercher (question hors des données) : on répond quand même
    if (!requetes.length && !message && !illisible) return parler();
    const tableaux = [];
    // Filtres permanents : imposés à l'exécution seulement, le contexte garde la demande telle que posée
    const actifs = sanitizeFiltres(filtres);
    const ignored = new Set();
    const executed = !actifs ? requetes : [...new Map(requetes.map(q => {
        const r = imposer(q, actifs);
        r.ignored.forEach(x => ignored.add(x));
        const final = sanitizeQuery(r.query);
        return [JSON.stringify(final), final];
    })).values()];
    for (const query of executed) tableaux.push(await execute(sources, query));
    if (tableaux.length && actifs) {
        tableaux[0].notes.unshift(`Filtres permanents : ${resume(actifs)}. Ils priment sur la question jusqu’à « Réinitialiser ».`);
        if (ignored.size) tableaux[0].notes.unshift(`Filtre ${[...ignored].join(', ')} non applicable à ces données : non appliqué.`);
    }
    if (tableaux.length && avis.length) tableaux[0].notes.unshift(...avis);
    console.log(`[AssistantFinances] ${user.username} : « ${q.slice(0, 200)} » → ${requetes.map(r => r.source).join(', ') || 'aucune requête'} (${Date.now() - started} ms)`);
    return {
        message: tableaux.length ? null
            : message ? message
            : illisible ? 'Je n’ai pas réussi à comprendre la demande. Reformulez-la plus simplement.'
                : 'Je ne sais répondre qu’aux questions sur les finances Sedit : budget, engagements, commandes, factures, mandats et titres.',
        tableaux,
        requetes,
        model,
    };
}

// ───────── autre page, export complet ─────────
/** La demande renvoyée par le navigateur est revalidée, et le périmètre de l'agent s'y applique de nouveau. */
async function rerun(user, requete, options) {
    const sources = await sourcesOf(user);
    const query = requete && sanitizeQuery({ ...requete, regrouper_par: requete.regrouper });
    if (!query) throw fail(400, 'Demande non reconnue.');
    return execute(sources, query, options);
}

const getPage = (user, { requete, page } = {}) => rerun(user, requete, { page: parseInt(page, 10) || 0 });

async function exportTable(user, { requete, format } = {}) {
    const type = TYPES[format];
    if (!type) throw fail(400, 'Format non pris en charge.');
    const table = await rerun(user, requete, { all: true });
    console.log(`[AssistantFinances] ${user.username} : export ${format} de ${table.lignes.length} ligne(s) — ${table.titre}`);
    return { buffer: await type.build(table), mime: type.mime, nom: `finances-${new Date().toISOString().slice(0, 10)}.${type.ext}` };
}

// ───────── pièces jointes ─────────
async function listDocuments(user, type, id) {
    const piece = await assertPieceVisible(await sourcesOf(user), type, id);
    const documents = await financeShare.buildPieceDocumentsList(piece.roo, piece.objectTypes, `${PJ_API}/${type}/${encodeURIComponent(piece.roo)}`);
    return { documents };
}

async function streamDocument(user, type, id, docId, res) {
    const piece = await assertPieceVisible(await sourcesOf(user), type, id);
    return financeShare.streamPieceDocumentFile(piece.roo, piece.objectTypes, String(docId || '').trim(), res);
}

module.exports = { regles, getPage, exportTable, getFilterOptions, getAccess, ask, listDocuments, streamDocument, scopeSummary };
