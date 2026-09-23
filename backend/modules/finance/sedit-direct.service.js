/**
 * Résolution d'une rubrique de field-mapping en interrogeant DIRECTEMENT la base
 * Sedit Oracle (schéma FI), au lieu de la copie locale Postgres `oracle.gf_oracle_*`.
 *
 * Reconstruit, pour la table source, exactement la même requête que l'import
 * Oracle (voir oracle-import-executor.js : selectedFields + substitutions +
 * where_clause + éclatement des colonnes `*_EXTRACT` en `_1.._n`), puis projette
 * les variables de la rubrique avec les mêmes règles d'affichage que resolveMapping
 * (dates DD/MM/YYYY, montants numériques, texte brut).
 *
 * Objectif : une page « beta » graphiquement identique à /budget factures, mais
 * alimentée en direct par Sedit.
 */
const oracledb = require('oracledb');
const { pool, getSqlite } = require('../../shared/database');
const financeShare = require('./finance-share.controller');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Même liste que oracle-import-executor.js (mots à NE PAS préfixer par T1."...").
const RESERVED_WHERE = new Set([
    'WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'ORDER', 'BY',
    'DESC', 'ASC', 'DATE', 'TO_DATE', 'TO_CHAR', 'NVL', 'COALESCE', 'TRIM', 'UPPER',
    'LOWER', 'SUBSTR', 'INSTR', 'COUNT', 'SUM', 'ROWNUM',
]);

/** Retrouve la config de synchro (SQLite) correspondant à une table miroir `gf_oracle_*`. */
async function getOracleSyncConfig(pgTable) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const rows = await db.all("SELECT table_name, where_clause, config_json FROM oracle_sync_config WHERE type = 'FINANCES'");
    const target = String(pgTable || '').toLowerCase().replace(/^gf_oracle_/, '');
    const row = rows.find(r => String(r.table_name).toLowerCase() === target);
    if (!row) throw new Error(`Aucune config de synchro Oracle pour '${pgTable}' (table '${target}').`);
    return {
        tableName: row.table_name,
        whereClause: row.where_clause || '',
        config: row.config_json ? JSON.parse(row.config_json) : {},
    };
}

/**
 * Reconstruit la requête interne identique à celle de l'import Oracle.
 * `validColumns` = colonnes réellement présentes dans la table source (l'import
 * ne retient que les selectedFields existants — cf. metaData dans l'executor).
 */
function buildOracleInner({ tableName, config, whereClause }, validColumns) {
    const mainPrefix = tableName.toUpperCase() + '_';
    const selected = (config.selectedFields || []).filter((c) => !validColumns || validColumns.has(c));
    const subs = config.substitutions || {};
    const selectParts = [];
    const joinParts = [];
    let aliasIdx = 1;

    for (const col of selected) {
        if (subs[col]) {
            const { secondaryTable, joinField, labelFields } = subs[col];
            const alias = `S${aliasIdx++}`;
            const secPrefix = secondaryTable.toUpperCase() + '_';
            if (labelFields && labelFields.length) {
                for (const f of labelFields) {
                    selectParts.push(`NVL(CAST(${alias}."${f}" AS VARCHAR2(4000)), 'XXXXX') AS "${secPrefix}${f}"`);
                }
            } else {
                selectParts.push(`T1."${col}" AS "${mainPrefix}${col}"`);
            }
            joinParts.push(`LEFT JOIN "${secondaryTable}" ${alias} ON T1."${col}" = ${alias}."${joinField || 'ROO_IMA_REF'}"`);
        } else {
            selectParts.push(`T1."${col}" AS "${mainPrefix}${col}"`);
        }
    }

    let sql = `SELECT ${selectParts.join(', ')} FROM "${tableName}" T1 ${joinParts.join(' ')}`;
    const raw = String(whereClause || '').trim().replace(/"/g, "'");
    if (raw) {
        let formatted = /^where\s/i.test(raw) ? raw : `WHERE ${raw}`;
        formatted = formatted.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m) => (
            RESERVED_WHERE.has(m.toUpperCase()) ? m : `T1."${m}"`
        ));
        sql += ` ${formatted}`;
    }
    return sql;
}

/**
 * Référence SQL d'une variable sur la sous-requête interne `_o`.
 * Gère l'éclatement des colonnes `*_EXTRACT` (ex. `TIERS_POBJ_EXTRACT_2`).
 */
function columnRef(expr) {
    const e = String(expr || '');
    const m = e.match(/^(.*)_(\d+)$/);
    if (m && /_EXTRACT$/i.test(m[1])) {
        return `REGEXP_SUBSTR("${m[1]}", '[^' || CHR(1) || ']+', 1, ${parseInt(m[2], 10)})`;
    }
    return `"${e}"`;
}

/** Convertit une référence colonne en expression d'affichage (mêmes règles que resolveMapping). */
function columnRefForVariable(v) {
    const ref = v.expression_type === 'field' ? columnRef(v.expression) : String(v.expression || '');
    const dt = v.display_type || 'text';
    if (dt === 'date' || dt === 'text_date') return `TO_CHAR(${ref}, 'DD/MM/YYYY')`;
    if (dt === 'timestamp' || dt === 'text_timestamp') return `TO_CHAR(${ref}, 'DD/MM/YYYY HH24:MI')`;
    return ref;
}

/**
 * Résout une rubrique depuis Sedit. Renvoie la même structure que resolveMapping.
 */
async function resolveRubriqueFromSedit(name, query = {}) {
    const { limit, offset, search, fiscal_year, sort_by, sort_dir, etat_filter, section_filter } = query;

    const rubriqueResult = await pool.query('SELECT * FROM finance.field_mapping_rubriques WHERE name = $1', [name]);
    if (rubriqueResult.rowCount === 0) { const e = new Error(`Rubrique '${name}' non trouvée`); e.status = 404; throw e; }
    const rubrique = rubriqueResult.rows[0];

    const variablesResult = await pool.query(
        'SELECT * FROM finance.field_mapping_variables WHERE rubrique_id = $1 ORDER BY display_order, id', [rubrique.id]
    );
    const variables = variablesResult.rows;
    if (variables.length === 0) {
        return { columns: [], rows: [], total: 0, source: 'sedit', fiscal_year_column: rubrique.fiscal_year_column };
    }

    const sync = await getOracleSyncConfig(rubrique.pg_table);

    const whereParts = [];
    const binds = {};

    // Filtre exercice (année de la colonne configurée, présente dans la sous-requête).
    if (fiscal_year && rubrique.fiscal_year_column) {
        binds.fy = Number(fiscal_year);
        whereParts.push(`EXTRACT(YEAR FROM "_o"."${rubrique.fiscal_year_column}") = :fy`);
    }

    // Recherche plein texte sur les variables de type texte.
    if (search && typeof search === 'string') {
        const textVars = variables.filter(v => (v.display_type === 'text' || !v.display_type));
        const parts = textVars.map(v => `CAST(${columnRefForVariable(v)} AS VARCHAR2(4000)) LIKE '%' || :search || '%'`);
        if (parts.length) { whereParts.push('(' + parts.join(' OR ') + ')'); binds.search = String(search); }
    }

    // Filtre état de facture.
    if (etat_filter && name === 'Factures') {
        const etatVar = variables.find(v => v.variable_name === 'Etat' || v.expression === 'FACETAT_LIBELLE');
        if (etatVar) { whereParts.push(`CAST(${columnRefForVariable(etatVar)} AS VARCHAR2(4000)) = :etat`); binds.etat = String(etat_filter); }
    }

    // Filtre F/I (fonctionnement/investissement) — seulement si une variable Section existe.
    if (section_filter && section_filter !== 'all') {
        const sectionVar = variables.find(v => v.variable_name === 'Section');
        if (sectionVar) {
            const ref = `CAST(${columnRefForVariable(sectionVar)} AS VARCHAR2(4000))`;
            whereParts.push(`(${ref} = :sec1 OR ${ref} = :sec2)`);
            binds.sec1 = section_filter === 'F' ? 'F' : 'I';
            binds.sec2 = section_filter === 'F' ? 'Fonctionnement' : 'Investissement';
        }
    }

    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

    const projections = variables.map(v => `${columnRefForVariable(v)} AS "${v.variable_name}"`);

    // Tri : IMPORTANT, trier sur la colonne BRUTE (pas sur l'expression formatée
    // TO_CHAR(...'DD/MM/YYYY') qui donnerait un ordre lexicographique erroné).
    let orderBy;
    if (sort_by) {
        const sv = variables.find(v => v.variable_name === sort_by);
        if (sv) {
            const ref = sv.expression_type === 'field' ? columnRef(sv.expression) : String(sv.expression);
            orderBy = `${ref} ${sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
        } else {
            orderBy = '1';
        }
    } else {
        const firstField = variables.find(v => v.expression_type === 'field');
        orderBy = firstField ? `"_o"."${firstField.expression}"` : '1';
    }

    const limitVal = Math.max(1, Math.min(parseInt(String(limit)) || 100, 5000));
    const offsetVal = Math.max(0, parseInt(String(offset)) || 0);

    return financeShare.withFinanceOracle(async (conn) => {
        // Colonnes réellement présentes dans la table source (comme l'import Oracle).
        const metaRes = await conn.execute(`SELECT * FROM "${sync.tableName}" WHERE 1 = 0`);
        const validColumns = new Set((metaRes.metaData || []).map((m) => m.name));
        const inner = buildOracleInner(sync, validColumns);

        const countRes = await conn.execute(`SELECT COUNT(*) AS TOTAL FROM (${inner}) "_o" ${whereClause}`, binds);
        const total = Number(countRes.rows[0].TOTAL) || 0;

        const rowsSql = `SELECT ${projections.join(', ')} FROM (${inner}) "_o" ${whereClause} ORDER BY ${orderBy} OFFSET ${offsetVal} ROWS FETCH NEXT ${limitVal} ROWS ONLY`;
        const dataRes = await conn.execute(rowsSql, binds);

        return {
            rubrique: rubrique.name,
            table: `${rubrique.pg_schema}.${rubrique.pg_table}`,
            source: 'sedit',
            sedit_id_column: rubrique.sedit_id_column,
            sedit_url_page: rubrique.sedit_url_page,
            sedit_url_param: rubrique.sedit_url_param,
            link_id_column: rubrique.link_id_column,
            child_rubrique_id: rubrique.child_rubrique_id,
            child_link_column: rubrique.child_link_column,
            child_junction_table: rubrique.child_junction_table,
            child_junction_parent_column: rubrique.child_junction_parent_column,
            child_junction_child_column: rubrique.child_junction_child_column,
            child_junction_filter: rubrique.child_junction_filter,
            columns: variables.map(v => ({
                name: v.variable_name,
                display_type: v.display_type || 'text',
                expression: v.expression,
                expression_type: v.expression_type,
            })),
            rows: dataRes.rows,
            total,
        };
    });
}

module.exports = { resolveRubriqueFromSedit };
