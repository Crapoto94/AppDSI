/**
 * Filtres permanents (listes déroulantes) : ils s'imposent à toutes les demandes jusqu'à leur réinitialisation.
 *
 * Ils ne font que RESTREINDRE : le périmètre Sedit de l'agent s'applique ensuite comme toujours. Les listes
 * proposées sont elles-mêmes tirées de ce périmètre. Le contexte de la conversation garde la demande SANS ces
 * filtres : après réinitialisation, ils ne laissent rien derrière eux.
 */
const oracledb = require('oracledb');
const financeShare = require('../finance/finance-share.controller');
const { SOURCES } = require('./datasets');
const { DIRECTIONS, libelle } = require('./referentiel');
const { pairsFor, scopeClause } = require('./query');

const clean = (v) => String(v ?? '').trim();
const code = (v) => (/^[A-Za-z0-9_]{1,12}$/.test(clean(v)) ? clean(v).toUpperCase() : null);
const matches = (service, pattern) => (pattern.endsWith('*') ? service.toUpperCase().startsWith(pattern.slice(0, -1)) : service.toUpperCase() === pattern);

function sanitizeFiltres(raw) {
    const f = raw || {};
    const year = parseInt(f.exercice, 10);
    const direction = DIRECTIONS.find(d => d.nom === clean(f.direction));
    const out = {
        exercice: year >= 2000 && year <= new Date().getFullYear() + 1 ? year : null,
        section: ['F', 'I'].includes(f.section) ? f.section : null,
        chapitre: code(f.chapitre),
        nature: code(f.nature),
        fonction: code(f.fonction),
        budget: clean(f.budget).toUpperCase().slice(0, 60) || null,
        direction: direction ? direction.nom : null,
        service: code(f.service),
    };
    return Object.values(out).some(v => v !== null) ? out : null;
}

/** Demande brute (à revalider) à laquelle les filtres permanents sont imposés, avec les remarques utiles. */
function imposer(query, filtres) {
    const def = SOURCES[query.source];
    const out = { ...query, regrouper_par: query.regrouper, filtres: { ...query.filtres } };
    const ignored = [];
    if (filtres.exercice) { out.exercices = [filtres.exercice]; out.annees_fixees = true; }
    if (filtres.budget) out.budgets = [filtres.budget];
    const direction = DIRECTIONS.find(d => d.nom === filtres.direction);
    if (filtres.service) out.services = [filtres.service];
    else if (direction) out.services = direction.codes;
    if (filtres.section) {
        if (def.filters.section || def.lineFilters?.section) {
            out.filtres.section = filtres.section;
            out.regrouper_par = out.regrouper_par.filter(d => d !== 'section');
        } else ignored.push('section');
    }
    for (const key of ['chapitre', 'nature', 'fonction']) {
        if (!filtres[key]) continue;
        if (def.filters[key] || def.lineFilters?.[key]) out.filtres[key] = [filtres[key]];
        else ignored.push(key);
    }
    return { query: out, ignored };
}

/** Résumé lisible des filtres actifs. */
function resume(filtres) {
    return [
        filtres.exercice, filtres.section && (filtres.section === 'F' ? 'fonctionnement' : 'investissement'), filtres.budget && `budget ${filtres.budget}`,
        filtres.service ? libelle([filtres.service]) : filtres.direction,
        filtres.chapitre && `chapitre ${filtres.chapitre}`, filtres.nature && `nature ${filtres.nature}`, filtres.fonction && `fonction ${filtres.fonction}`,
    ].filter(Boolean).join(' · ');
}

// ───────── contenu des listes déroulantes ─────────
const cache = new Map();

/** Valeurs proposées, tirées du périmètre de l'agent (cinq derniers exercices). */
async function options(sources) {
    const def = SOURCES.budget;
    const pairs = pairsFor(sources, def);
    const year = new Date().getFullYear();
    const exercices = Array.from({ length: 7 }, (_, i) => year - i);
    const empty = { exercices, budgets: [], directions: [], combinaisons: [], chapitres: {}, natures: {}, fonctions: {} };
    // Sans droits propres (factures partagées seulement) : les services des partages restent filtrables
    const all = pairs.length ? pairs : pairsFor(sources, SOURCES.factures);
    if (!all.length) return empty;

    const key = all.map(p => `${p.budgetRoo}|${p.service}`).sort().join(',');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;

    const services = new Map(all.map(p => [p.service, p.libelle || p.service]));
    const directions = DIRECTIONS.map(d => ({
        nom: d.nom,
        sigle: d.sigles[0],
        services: [...services].filter(([c]) => d.codes.some(p => matches(c, p))).map(([c, l]) => ({ code: c, libelle: l })).sort((a, b) => a.code.localeCompare(b.code)),
    })).filter(d => d.services.length);
    const known = new Set(directions.flatMap(d => d.services.map(s => s.code)));
    const others = [...services].filter(([c]) => !known.has(c)).map(([c, l]) => ({ code: c, libelle: l })).sort((a, b) => a.code.localeCompare(b.code));
    if (others.length) directions.push({ nom: '', sigle: '', services: others });
    const result = { ...empty, budgets: [...new Set(all.map(p => p.budget).filter(Boolean))].sort(), directions };

    if (pairs.length) {
        const binds = {};
        let n = 0;
        const bind = (value) => { const name = `p${n++}`; binds[name] = value; return `:${name}`; };
        const scope = scopeClause(def, pairs, bind);
        const years = exercices.slice(0, 5).map(y => bind(y)).join(',');
        const rows = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(
            `SELECT DISTINCT TRIM(i.TYPE_SECTION) AS S, TRIM(i.CODECHAP) AS C, TRIM(ch.LIBELLE) AS CL, TRIM(i.CODECOMP) AS N, TRIM(co.LIBELLE) AS NL,
                    TRIM(i.CODEFONC) AS F, TRIM(fo.LIBELLE) AS FL
             ${def.from}
             LEFT JOIN FI.CHAPITRE ch ON ch.ROO_IMA_REF = i.CHAPITRE
             LEFT JOIN FI.COMPTE co ON co.ROO_IMA_REF = i.COMPTE
             LEFT JOIN FI.FONCTION fo ON fo.ROO_IMA_REF = i.FONCTION
             WHERE ${def.where.join(' AND ')} AND ${scope} AND ba.EXERCICE IN (${years})`,
            binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 20000 })).rows || []);
        const combos = new Map();
        for (const r of rows) {
            if (r.C) result.chapitres[r.C] = r.CL || '';
            if (r.N) result.natures[r.N] = r.NL || '';
            if (r.F) result.fonctions[r.F] = r.FL || '';
            const combo = [r.S || '', r.C || '', r.N || '', r.F || ''];
            combos.set(combo.join('|'), combo);
        }
        // Les combinaisons réelles permettent aux listes de se restreindre entre elles
        result.combinaisons = [...combos.values()];
    }
    cache.set(key, { t: Date.now(), v: result });
    return result;
}

module.exports = { sanitizeFiltres, imposer, resume, options };
