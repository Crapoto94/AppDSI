/**
 * Exécution d'une demande structurée sur Sedit Finances (lecture seule : uniquement des SELECT).
 *
 * Le périmètre de l'agent est ajouté ICI, à chaque requête, à partir de ses droits Sedit : rien de ce que
 * l'IA ou le navigateur envoie ne peut l'élargir (les services demandés ne font que le restreindre).
 */
const oracledb = require('oracledb');
const financeShare = require('../finance/finance-share.controller');
const { SOURCES } = require('./datasets');
const { libelle } = require('./referentiel');
const { ETATS } = require('./contexte');
const { nomTiers } = require('./tiers');

const PAGE_SIZE = 50;
const MAX_GROUPS = 500;
const MAX_EXPORT = 50000;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const clean = (v) => String(v ?? '').trim();
const up = (v) => clean(v).toUpperCase();
const round2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);

// ───────── périmètre ─────────
/** Couples (budget, service) ouverts par les sources d'accès : droits propres seuls, sauf pour les factures (partages compris). */
function pairsFor(sources, def) {
    const used = def.scope.shared ? sources : sources.filter(s => s.key === 'me');
    const map = new Map();
    for (const src of used) for (const sv of src.services) {
        if (!sv.budgetRoo || !sv.serviceRoo || !sv.service) continue;
        map.set(`${sv.budgetRoo}|${sv.serviceRoo}`, sv);
    }
    return [...map.values()];
}

/** « BF* » = tous les codes qui commencent par BF. */
const matchService = (code, pattern) => (pattern.endsWith('*') ? up(code).startsWith(pattern.slice(0, -1)) : up(code) === pattern);

function restrictPairs(pairs, query) {
    let out = pairs;
    if (query.services.length) out = out.filter(p => query.services.some(s => matchService(p.service, s)));
    if (query.budgets.length) out = out.filter(p => query.budgets.includes(up(p.budget)));
    // « hors X » : retiré après coup ; le périmètre ne peut que se réduire
    if (query.services_exclus?.length) out = out.filter(p => !query.services_exclus.some(s => matchService(p.service, s)));
    return out;
}

/** Clause SQL du périmètre. Sans aucun couple, la clause est fausse (aucune ligne). */
function scopeClause(def, pairs, bind) {
    if (!pairs.length) return '1 = 0';
    const byBudget = new Map();
    for (const p of pairs) {
        if (!byBudget.has(p.budgetRoo)) byBudget.set(p.budgetRoo, new Set());
        byBudget.get(p.budgetRoo).add(def.scope.mode === 'imputation' ? p.service : p.serviceRoo);
    }
    const blocks = [];
    for (const [roo, set] of byBudget) {
        const b = bind(roo);
        const values = [...set];
        const parts = [];
        for (let i = 0; i < values.length; i += 900) {
            const marks = values.slice(i, i + 900).map(v => (def.scope.mode === 'imputation' ? bind(v) : `RPAD(${bind(v)}, 31)`));
            parts.push(def.scope.mode === 'imputation' ? `TRIM(i.CODESERG) IN (${marks.join(',')})` : `${def.scope.service} IN (${marks.join(',')})`);
        }
        blocks.push(`(${def.scope.budget} = RPAD(${b}, 31) AND (${parts.join(' OR ')}))`);
    }
    return `(${blocks.join(' OR ')})`;
}

// ───────── construction ─────────
const byMonth = (def, query) => query.mode === 'synthese' && query.regrouper.includes('mois') && !!def.dateCol;

function binder() {
    const binds = {};
    let n = 0;
    return { binds, bind: (value) => { const name = `p${n++}`; binds[name] = value; return `:${name}`; } };
}

// Fournisseur : « =NOM » = nom Sedit exact ; sinon des mots ENTIERS, à la suite, dans le nom du tiers
function tiersClause(alias, value, bind) {
    const name = `UPPER(TRIM(REGEXP_SUBSTR(${alias}, '[^' || CHR(1) || ']+', 1, 2)))`;
    if (value.startsWith('=')) return `${name} = UPPER(${bind(value.slice(1))})`;
    const words = up(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').split(/[^A-Z0-9]+/).filter(Boolean);
    if (!words.length) return '1 = 0';
    return `REGEXP_LIKE(CONVERT(${name}, 'US7ASCII'), ${bind(`(^|[^A-Z0-9])${words.join('[^A-Z0-9]+')}([^A-Z0-9]|$)`)})`;
}

const likeValue = (v) => `%${up(v).replace(/[%_\\]/g, '\\$&')}%`;
const like = (expr, mark) => `UPPER(${expr}) LIKE ${mark} ESCAPE '\\'`;

function buildWhere(def, pairs, query, bind) {
    const where = [...def.where, scopeClause(def, pairs, bind)];
    // Par mois : années calendaires, d'après la date de la pièce (et non l'exercice budgétaire)
    const byDate = byMonth(def, query) ? def.dateCol : def.exerciceDate;
    if (def.exercice && !byDate) where.push(`${def.exercice} IN (${query.exercices.map(y => bind(y)).join(',')})`);
    else where.push(`(${query.exercices.map(y => `(${byDate} >= TO_DATE(${bind(`${y}-01-01`)}, 'YYYY-MM-DD') AND ${byDate} < TO_DATE(${bind(`${y + 1}-01-01`)}, 'YYYY-MM-DD'))`).join(' OR ')})`);

    const f = query.filtres;
    const sensExpr = def.filters.sens || def.sensExpr;
    if (sensExpr && f.sens) where.push(`${sensExpr} = ${bind(f.sens)}`);
    const columnOf = (key) => def.filters[key] || (def.lineFilters && def.lineFilters[key]);
    const wrap = (key, cond) => (def.filters[key] ? cond : def.lineFilter(cond));
    if (f.section && columnOf('section')) where.push(wrap('section', `${columnOf('section')} = ${bind(f.section)}`));
    for (const key of ['chapitre', 'nature', 'fonction']) {
        // préfixe : « 61 » prend 611, 6156…
        if (f[key].length && columnOf(key)) where.push(wrap(key, `(${f[key].map(v => `${columnOf(key)} LIKE ${bind(`${v}%`)}`).join(' OR ')})`));
    }
    if (f.tiers.length && def.filters.tiers) where.push(`(${f.tiers.map(v => tiersClause(def.filters.tiers, v, bind)).join(' OR ')})`);
    if (f.tiers_exclus?.length && def.filters.tiers) where.push(`(${def.filters.tiers} IS NULL OR NOT (${f.tiers_exclus.map(v => tiersClause(def.filters.tiers, v, bind)).join(' OR ')}))`);
    if (f.texte.length && def.filters.texte) where.push(`(${f.texte.flatMap(v => def.filters.texte.map(col => like(col, bind(likeValue(v))))).join(' OR ')})`);
    if (f.numero && def.filters.numero) where.push(like(def.filters.numero, bind(likeValue(f.numero))));
    if (f.montant_min != null && def.filters.montant) where.push(`${def.filters.montant} >= ${bind(f.montant_min)}`);
    if (f.montant_max != null && def.filters.montant) where.push(`${def.filters.montant} <= ${bind(f.montant_max)}`);
    for (const flag of f.etats) if (def.flags && def.flags[flag]) where.push(def.flags[flag]);
    return where.join(' AND ');
}

const run = (conn, sql, binds) => conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: MAX_EXPORT + 1 }).then(r => r.rows || []);

// ───────── description lisible (rédigée par le serveur, jamais par l'IA) ─────────
const serviceNames = (pairs) => new Map(pairs.filter(p => p.libelle && p.libelle !== p.service).map(p => [p.service, p.libelle]));

function yearsLabel(years) {
    if (years.length === 1) return String(years[0]);
    const contiguous = years.every((y, i) => !i || y === years[i - 1] + 1);
    return contiguous ? `${years[0]} à ${years[years.length - 1]}` : years.join(', ');
}

function describe(def, query, pairs) {
    const f = query.filtres;
    const parts = [def.label];
    // Direction ou service demandé, nommé en clair
    if (query.services.length) parts.push(libelle(query.services));
    if (query.services_exclus?.length) parts.push(`hors ${libelle(query.services_exclus)}`);
    if (f.section && (def.filters.section || def.lineFilters?.section)) parts.push(f.section === 'F' ? 'fonctionnement' : 'investissement');
    if (f.sens && (def.filters.sens || def.sensExpr)) parts.push(f.sens === 'D' ? 'dépenses' : 'recettes');
    parts.push(yearsLabel(query.exercices));
    if (f.chapitre.length) parts.push(`chapitre ${f.chapitre.join(', ')}`);
    if (f.nature.length) parts.push(`nature ${f.nature.join(', ')}`);
    if (f.fonction.length) parts.push(`fonction ${f.fonction.join(', ')}`);
    if (f.tiers.length) parts.push(`tiers « ${f.tiers.map(nomTiers).join(' », « ')} »`);
    if (f.texte.length) parts.push(`libellé contenant « ${f.texte.join(' » ou « ')} »`);
    if (f.tiers_exclus?.length) parts.push(`hors tiers « ${f.tiers_exclus.map(nomTiers).join(' », « ')} »`);
    if (f.numero) parts.push(`n° ${f.numero}`);
    if (f.montant_min != null) parts.push(`≥ ${f.montant_min} €`);
    if (f.montant_max != null) parts.push(`≤ ${f.montant_max} €`);
    if (f.etats.length) parts.push(f.etats.map(e => ETATS[e] || e).join(', '));
    const services = [...new Set(pairs.map(p => p.service))].sort();
    const budgets = [...new Set(pairs.map(p => p.budget))].sort();
    const short = (list) => (list.length > 8 ? `${list.slice(0, 8).join(', ')}… (${list.length})` : list.join(', '));
    // Plusieurs services additionnés : le montrer, tous, pour que le total soit vérifiable
    const total = services.length > 1 && !query.regrouper.includes('service') && query.mode === 'synthese';
    const names = serviceNames(pairs);
    const named = services.map(c => (names.has(c) ? `${names.get(c)} (${c})` : c));
    // Peu de services : tous nommés ; sinon leur nombre (le détail se demande « par service » ou « par direction »)
    const list = services.length > 12 ? `${services.length} services` : named.join(total ? ' + ' : ', ');
    const detail = total ? `Total : ${list}` : (services.length > 12 ? list : `Service${services.length > 1 ? 's' : ''} : ${list}`);
    return { titre: parts.join(' · '), perimetre: `${detail} — budget(s) ${short(budgets)}` };
}

// ───────── synthèse (regroupements + pivot par exercice) ─────────
async function runSummary(conn, def, query, where, binds, { all = false } = {}) {
    const maxGroups = all ? MAX_EXPORT : MAX_GROUPS;
    const monthly = byMonth(def, query);
    // Plusieurs années par mois : janvier face à janvier (le mois seul), une colonne par année
    const across = monthly && query.exercices.length > 1;
    const dims = monthly ? ['mois', ...query.regrouper.filter(d => d !== 'mois')] : query.regrouper;
    const selectOf = (d) => {
        if (monthly && d === 'mois') return `TO_CHAR(${def.dateCol}, '${across ? 'MM' : 'YYYY-MM'}')`;
        if (monthly && d === 'exercice') return `TO_CHAR(${def.dateCol}, 'YYYY')`;
        return def.dims[d].select;
    };
    const measures = query.mesures;
    const select = [
        ...dims.map((d, i) => `${selectOf(d)} AS D${i}`),
        ...measures.map((m, i) => `${def.measures[m].expr} AS M${i}`),
    ];
    const group = dims.length ? `GROUP BY ${dims.map(selectOf).join(', ')}` : '';
    // Classement demandé (« les 10 plus gros tiers ») : par la première mesure ; sinon par les regroupements
    const exIdx = dims.indexOf('exercice');
    // Tableau croisé : une colonne par exercice, quand on compare plusieurs années selon un autre axe
    const pivot = exIdx >= 0 && dims.length > 1 && measures.length === 1 && query.exercices.length > 1;
    // Un classement ne s'applique ni à une série d'années, ni avant le croisement (il est alors fait après)
    const ranked = query.tri === 'montant' && !pivot && !(dims.length === 1 && exIdx === 0);
    const order = ranked ? 'ORDER BY M0 DESC NULLS LAST' : dims.length ? `ORDER BY ${dims.map((_, i) => `D${i}`).join(', ')}` : '';
    const limit = pivot ? MAX_EXPORT : ranked && query.limite ? Math.min(query.limite, maxGroups) : maxGroups + 1;
    let rows = await run(conn, `SELECT * FROM (SELECT ${select.join(', ')} ${def.from} WHERE ${where} ${group} ${order}) WHERE ROWNUM <= ${limit}`, binds);
    const notes = [];
    if (monthly) notes.push('Mois calendaires, d’après la date de la pièce (et non l’exercice budgétaire).');
    if (!pivot && rows.length > maxGroups) { rows = rows.slice(0, maxGroups); notes.push(`Limité aux ${maxGroups} premières lignes : l’export contient la suite.`); }
    if (!dims.length) rows = rows.filter(r => measures.some((_, i) => r[`M${i}`] != null && Number(r[`M${i}`]) !== 0));
    if (ranked && query.limite && rows.length === limit) notes.push(`Les ${limit} montants les plus élevés ; le total ne porte que sur les lignes affichées.`);

    const cell = (r, i) => (def.measures[measures[i]].count ? Number(r[`M${i}`]) || 0 : round2(r[`M${i}`]) ?? 0);
    const typeOf = (m) => (def.measures[m].count ? 'int' : 'money');
    const pct = (last, first) => (first ? Math.round(((last - first) / Math.abs(first)) * 1000) / 10 : null);
    const sum = (values) => values.reduce((a, b) => a + (Number(b) || 0), 0);

    if (pivot) {
        const others = dims.map((_, i) => i).filter(i => i !== exIdx);
        const years = [...new Set(rows.map(r => String(r[`D${exIdx}`])))].sort();
        const map = new Map();
        for (const r of rows) {
            const key = JSON.stringify(others.map(i => r[`D${i}`]));
            if (!map.has(key)) map.set(key, { labels: others.map(i => r[`D${i}`] ?? '—'), values: {} });
            map.get(key).values[String(r[`D${exIdx}`])] = cell(r, 0);
        }
        let groups = [...map.values()];
        if (query.tri === 'montant') groups.sort((a, b) => (b.values[years[years.length - 1]] ?? 0) - (a.values[years[years.length - 1]] ?? 0));
        const keep = Math.min((query.tri === 'montant' && query.limite) || maxGroups, maxGroups);
        if (groups.length > keep) {
            notes.push(`${keep} lignes affichées sur ${groups.length} ; le total ne porte que sur les lignes affichées.`);
            groups = groups.slice(0, keep);
        }
        const gap = query.comparaison && years.length === 2;
        const first = years[0], last = years[years.length - 1];
        const lignes = groups.map(g => {
            const values = years.map(y => g.values[y] ?? 0);
            // Rien la dernière année (mois à venir…) : pas de « -100 % »
            const known = g.values[last] !== undefined;
            return [...g.labels, ...values,
                ...(gap ? [known ? round2(values[values.length - 1] - values[0]) : null] : []),
                ...(years.length > 1 ? [known ? pct(values[values.length - 1], values[0]) : null] : [])];
        });
        const colonnes = [
            ...others.map(i => ({ label: def.dims[dims[i]].label, type: 'text' })),
            ...years.map(y => ({ label: `${def.measures[measures[0]].label} ${y}`, type: typeOf(measures[0]) })),
            ...(gap ? [{ label: `Écart ${last} − ${first}`, type: 'money' }] : []),
            ...(years.length > 1 ? [{ label: `Évolution ${first} → ${last}`, type: 'pct' }] : []),
        ];
        let total = null;
        if (lignes.length > 1 && !def.measures[measures[0]].count) {
            const sums = years.map((_, i) => round2(sum(lignes.map(l => l[others.length + i]))));
            total = ['Total', ...others.slice(1).map(() => ''), ...sums, ...(gap ? [round2(sums[sums.length - 1] - sums[0])] : []), ...(years.length > 1 ? [pct(sums[sums.length - 1], sums[0])] : [])];
        }
        return { colonnes, lignes, total, notes };
    }

    const lignes = rows.map(r => [...dims.map((_, i) => String(r[`D${i}`] ?? '—')), ...measures.map((_, i) => cell(r, i))]);
    const colonnes = [
        ...dims.map(d => ({ label: def.dims[d].label, type: 'text' })),
        ...measures.map(m => ({ label: def.measures[m].label, type: typeOf(m) })),
    ];
    // Évolution d'une année sur l'autre (première mesure)
    const yearly = dims.length === 1 && exIdx === 0 && lignes.length > 1;
    if (yearly) {
        lignes.forEach((l, i) => l.push(i ? pct(l[1], lignes[i - 1][1]) : null));
        colonnes.push({ label: `Évolution (${def.measures[measures[0]].label.toLowerCase()})`, type: 'pct' });
    }
    let total = null;
    // Pas de total entre exercices (on n'additionne pas des budgets annuels) ni sur les comptages distincts
    if (lignes.length > 1 && exIdx < 0 && dims.length) {
        total = ['Total', ...dims.slice(1).map(() => ''), ...measures.map((m, i) => (def.measures[m].count ? null : round2(sum(lignes.map(l => l[dims.length + i])))))];
    }
    return { colonnes, lignes, total, notes };
}

// ───────── liste de pièces ─────────
/** Une page de la liste (50 lignes), ou toutes les lignes pour l'export. « les 10 dernières » borne le résultat. */
/** Adresse de Sedit (réglage « url_sedit_fi », comme « Mes factures »). */
async function seditUrl() {
    try {
        const db = require('../../shared/database').getSqlite();
        const row = db && await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'url_sedit_fi'");
        if (row && row.setting_value) return String(row.setting_value).replace(/\/+$/, '');
    } catch { /* adresse par défaut */ }
    return 'https://seditgfprod.ivry.local/SeditGfSMProd';
}

async function runList(conn, def, query, where, binds, { page = 0, all = false } = {}) {
    const list = def.list;
    const orderCol = list.order[query.tri] || list.order.defaut;
    const stats = (await run(conn, `SELECT COUNT(*) AS N, SUM(${list.total}) AS T ${def.from} WHERE ${where}`, binds))[0] || {};
    const n = Number(stats.N) || 0;
    const shown = query.limite ? Math.min(n, query.limite) : n;
    const lastPage = Math.max(0, Math.ceil(shown / PAGE_SIZE) - 1);
    const current = all ? 0 : Math.min(Math.max(0, page), lastPage);
    const offset = current * PAGE_SIZE;
    const size = Math.max(0, Math.min(all ? MAX_EXPORT : PAGE_SIZE, shown - offset));
    // L'identifiant de ligne départage les ex æquo : sans lui, une ligne pourrait changer de page d'un appel à l'autre
    const rows = size ? await run(conn,
        `SELECT ${list.select} ${def.from} WHERE ${where}
          ORDER BY ${orderCol} ${query.ordre === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, ${list.tie}
         OFFSET ${Number(offset)} ROWS FETCH NEXT ${Number(size)} ROWS ONLY`, binds) : [];

    // Quelles pièces ont des pièces jointes ?
    const withPj = new Set();
    if (!all && def.pj && rows.length) {
        const { binds: b, bind } = binder();
        const ids = [...new Set(rows.map(r => r.PJ_ID))].map(id => `RPAD(${bind(id)}, 31)`);
        const types = def.pj.objectTypes.map(t => bind(t));
        (await run(conn, `SELECT DISTINCT TRIM(OBJECT_ROO) AS ID FROM FI.FIPES_OBJ_PJ WHERE OBJECT_ROO IN (${ids.join(',')}) AND OBJECT_TYPE IN (${types.join(',')})`, b))
            .forEach(r => withPj.add(r.ID));
    }

    const colonnes = list.columns.map(c => ({ label: c.label, type: c.type }));
    const lignes = rows.map(r => list.columns.map(c => (c.type === 'money' ? round2(r[c.key]) : r[c.key] ?? '')));
    const notes = [];
    // Total des lignes retenues : toutes, ou seulement les « N » demandées
    let sum = stats.T;
    if (shown < n) {
        sum = ((await run(conn, `SELECT SUM(V) AS T FROM (SELECT ${list.total} AS V ${def.from} WHERE ${where}
             ORDER BY ${orderCol} ${query.ordre === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, ${list.tie} FETCH FIRST ${Number(shown)} ROWS ONLY)`, binds))[0] || {}).T;
        notes.push(`${shown} lignes demandées sur ${n} qui correspondent ; le total porte sur ces ${shown}.`);
    }
    if (all && shown > MAX_EXPORT) notes.push(`Export limité à ${MAX_EXPORT} lignes sur ${shown}.`);
    const total = shown > 1 ? list.columns.map((c, i) => (i === 0 ? `Total (${shown} lignes)` : c.type === 'money' ? round2(sum) ?? 0 : '')) : null;
    const pj = rows.map(r => (withPj.has(r.PJ_ID) ? { type: def.pj.type, id: r.PJ_ID, nom: `${r.NUM}` } : null));
    // Lien vers la fiche Sedit de chaque pièce (les droits sont alors ceux de Sedit)
    const base = def.fiche && !all ? await seditUrl() : null;
    const sedit = base ? rows.map(r => (def.ficheSi && !def.ficheSi(r) ? null : `${base}/${def.fiche}${encodeURIComponent(r.PJ_ID)}`)) : [];
    return { colonnes, lignes, total, notes, pj, sedit, pagination: { page: current, taille: PAGE_SIZE, lignes: shown } };
}

/**
 * @param {Array} sources  sources d'accès de l'agent (cf. mes-factures.service#getSources)
 * @param {Object} query   demande validée (cf. interpreter.js#sanitizeQuery)
 */
async function execute(sources, query, options = {}) {
    const def = SOURCES[query.source];
    const allowed = pairsFor(sources, def);
    const pairs = restrictPairs(allowed, query);
    if (!pairs.length) {
        return {
            titre: def.label, perimetre: '', colonnes: [], lignes: [], total: null,
            notes: [allowed.length
                ? `${libelle(query.services) || 'Le budget demandé'} : hors de vos droits Sedit.`
                : `Vos droits Sedit ne donnent accès à aucune donnée de type « ${def.label.toLowerCase()} »${def.scope.shared ? '' : ' (un accès partagé ne porte que sur les factures)'}.`],
        };
    }
    const { binds, bind } = binder();
    const where = buildWhere(def, pairs, query, bind);
    const result = await financeShare.withFinanceOracle(async (conn) => (query.mode === 'liste' && def.list
        ? runList(conn, def, query, where, binds, options)
        : runSummary(conn, def, query, where, binds, options)));

    // Demande portant sur des services précis, dont certains échappent à l'agent : le dire
    // (une direction regroupe plusieurs codes : seuls les services demandés un par un sont signalés)
    // Liste d'un fournisseur sans service demandé : dire d'emblée quels services sont concernés (la page n'en montre qu'une partie)
    if (query.mode === 'liste' && query.filtres.tiers.length && !query.services.length && (result.pagination?.lignes ?? 0) > PAGE_SIZE && def.dims.service) {
        const per = binder();
        const clause = buildWhere(def, pairs, query, per.bind);
        const rows = await financeShare.withFinanceOracle(async (conn) => run(conn,
            `SELECT ${def.dims.service.select} AS S, COUNT(*) AS N ${def.from} WHERE ${clause} GROUP BY ${def.dims.service.select} ORDER BY N DESC`, per.binds));
        const labels = serviceNames(pairs);
        const head = rows.slice(0, 15).map(r => `${labels.get(r.S) || r.S} ${Number(r.N).toLocaleString('fr-FR')}`);
        result.notes.unshift(`${rows.length} service(s) concerné(s), en lignes : ${head.join(' · ')}${rows.length > head.length ? ' · …' : ''}.`);
    }
    // Mois écrits en clair ; signaler ceux qui tombent hors des années demandées (rattachement à l'exercice)
    let outside = false;
    result.colonnes.forEach((col, i) => {
        if (!col.label.startsWith('Mois')) return;
        result.lignes = result.lignes.map(l => l.map((v, k) => {
            if (k === i && /^\d{2}$/.test(String(v))) return MOIS[Number(v) - 1];
            const m = k === i && /^(\d{4})-(\d{2})$/.exec(String(v));
            if (!m) return v;
            if (!query.exercices.includes(Number(m[1]))) outside = true;
            return `${MOIS[Number(m[2]) - 1]} ${m[1]}`;
        }));
    });
    if (outside) result.notes.push(`Des pièces de l’exercice ${yearsLabel(query.exercices)} sont datées d’une autre année : elles sont comprises, à leur mois.`);
    // Deux éléments comparés : dire l'écart
    if (query.comparaison && result.lignes.length === 2) {
        const i = result.colonnes.findIndex(c => c.type === 'money');
        if (i > 0) {
            const [a, b] = result.lignes;
            const diff = Math.round((a[i] - b[i]) * 100) / 100;
            result.notes.unshift(`Écart (${result.colonnes[i].label}) : ${a[0]} − ${b[0]} = ${diff.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}${b[i] ? ` (${((diff / Math.abs(b[i])) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)` : ''}.`);
        }
    }
    // Un code de service ne parle à personne : le nom Sedit l'accompagne
    const names = serviceNames(pairs);
    result.colonnes.forEach((col, i) => {
        if (col.label !== 'Service') return;
        result.lignes = result.lignes.map(l => l.map((v, k) => (k === i && names.has(v) ? `${names.get(v)} (${v})` : v)));
    });
    // Moins de pièces que demandé : dire pourquoi, et comment élargir
    const found = result.pagination?.lignes ?? 0;
    if (query.mode === 'liste' && query.limite && found < query.limite && found > 0) {
        const f = query.filtres;
        const criteres = [yearsLabel(query.exercices), query.services.length && libelle(query.services), ...f.etats.map(e => ETATS[e] || e),
            f.tiers.length && `tiers ${f.tiers.map(nomTiers).join(', ')}`, f.texte.length && `libellé « ${f.texte.join(' ou ')} »`, f.montant_min != null && `≥ ${f.montant_min} €`].filter(Boolean);
        result.notes.unshift(`Vous en demandiez ${query.limite} : seules ${found} correspondent à ces critères (${criteres.join(', ')}).${f.etats.length ? ' Dites « toutes les factures » ou « sans filtre » pour les retirer.' : ''}`);
    }
    if (query.filtres.section && !def.filters.section && !def.lineFilters?.section) {
        result.notes.push(`Les ${def.label.toLowerCase()} ne portent pas de section : les deux sections sont comprises.`);
    }
    const missing = query.services.length <= 2 ? query.services.filter(s => !s.endsWith('*') && !pairs.some(p => matchService(p.service, s))) : [];
    if (missing.length) result.notes.push(`Hors de votre périmètre (non compris) : ${missing.join(', ')}.`);
    if (def.note) result.notes.push(def.note);
    const now = new Date();
    if (query.exercices.includes(now.getFullYear())) result.notes.push(`${now.getFullYear()} est en cours : situation au ${now.toLocaleDateString('fr-FR')}.`);
    if (!result.lignes.length && query.source === 'factures' && query.filtres.tiers.length) {
        result.notes.unshift('Certaines dépenses (paie, cotisations, impôts, subventions…) sont payées sans facture : demandez « les mandats » de ce fournisseur.');
    }
    if (!result.lignes.length) {
        // Rien pour le service demandé : dire s'il y a quelque chose sur les autres services de l'agent
        if (query.services.length) {
            const wide = restrictPairs(allowed, { ...query, services: [] });
            const other = binder();
            const clause = buildWhere(def, wide, query, other.bind);
            const n = await financeShare.withFinanceOracle(async (conn) => Number((await run(conn, `SELECT COUNT(*) AS N ${def.from} WHERE ${clause}`, other.binds))[0].N) || 0);
            result.notes.unshift(n > 0
                ? `Il en existe sur d’autres services de votre périmètre (${n.toLocaleString('fr-FR')} ligne(s)) : dites « tous les services ».`
                : 'Il n’y en a pas non plus sur vos autres services avec ces critères.');
        }
        result.notes.unshift(query.services.length ? `Aucune donnée dans Sedit pour : ${libelle(query.services)}, avec ces critères.` : 'Aucune donnée ne correspond à cette demande.');
    }
    // « requete » permet de relire une autre page ou tout exporter : elle est revalidée à chaque fois
    return { ...describe(def, query, pairs), ...result, requete: query };
}

// ───────── pièces jointes ─────────
/** La pièce est-elle dans le périmètre de l'agent ? (403 sinon) */
async function assertPieceVisible(sources, type, id) {
    const forbid = () => { const e = new Error('Pièce hors de votre périmètre'); e.status = 403; return e; };
    const key = Object.keys(SOURCES).find(k => SOURCES[k].pj && SOURCES[k].pj.type === type);
    const roo = clean(id);
    if (!key || !/^[A-Za-z0-9]{1,31}$/.test(roo)) throw forbid();
    const def = SOURCES[key];
    const pairs = pairsFor(sources, def);
    if (!pairs.length) throw forbid();
    const idExpr = { facture: 'f.ROO_IMA_REF', commande: 'c.ROO_IMA_REF', engagement: 'm.ROO_IMA_REF', mandat: 'md.ROO_IMA_REF' }[type];
    const { binds, bind } = binder();
    const mark = `RPAD(${bind(roo)}, 31)`;
    const scope = scopeClause(def, pairs, bind);
    // Un engagement ou un mandat peut porter sur plusieurs services : ses pièces ne sont ouvertes que si
    // TOUTES ses lignes sont dans le périmètre.
    const strict = type === 'engagement' || type === 'mandat';
    const r = await financeShare.withFinanceOracle(async (conn) => (await run(conn,
        `SELECT COUNT(*) AS N, SUM(CASE WHEN ${scope} THEN 1 ELSE 0 END) AS OK ${def.from} WHERE ${idExpr} = ${mark}`, binds))[0]);
    const total = Number(r && r.N) || 0;
    const ok = Number(r && r.OK) || 0;
    if (!ok || (strict && ok !== total)) throw forbid();
    if (strict) {
        // Les jointures de la source écartent les lignes incomplètes : on vérifie qu'il n'en manque aucune
        const countSql = type === 'engagement'
            ? 'SELECT COUNT(*) AS N FROM FI.MVTLIGNE WHERE MOUVEMENT = RPAD(:id, 31)'
            : 'SELECT COUNT(*) AS N FROM FI.MANDLIGNE WHERE MANDAT = RPAD(:id, 31)';
        const all = await financeShare.withFinanceOracle(async (conn) => (await run(conn, countSql, { id: roo }))[0]);
        if (Number(all.N) !== total) throw forbid();
    }
    return { roo, objectTypes: def.pj.objectTypes };
}

module.exports = { execute, assertPieceVisible, pairsFor, scopeClause, PAGE_SIZE };
