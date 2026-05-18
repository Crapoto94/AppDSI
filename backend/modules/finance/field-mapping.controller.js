const { pool } = require('../../shared/database');

const DISPLAY_TYPE_CASTS = {
  number: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN NULL ELSE (${expr})::numeric END`,
  integer: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN NULL ELSE (${expr})::integer END`,
  currency: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN NULL ELSE (${expr})::numeric END`,
  date: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN '' ELSE TO_CHAR(CASE WHEN ${expr}::text ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(${expr}::text, 10)::date ELSE (${expr})::date END, 'DD/MM/YYYY') END`,
  timestamp: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN '' ELSE TO_CHAR(CASE WHEN ${expr}::text ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(${expr}::text, 19)::timestamp ELSE (${expr})::timestamp END, 'DD/MM/YYYY HH24:MI') END`,
  boolean: (expr) => `CASE WHEN ${expr} IS NULL THEN NULL WHEN ${expr}::text IN ('t','true','1','yes','TRUE','T') THEN 'Oui' WHEN ${expr}::text IN ('f','false','0','no','FALSE','F') THEN 'Non' ELSE 'Non' END`,
  text_date: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN '' ELSE TO_CHAR(LEFT(${expr}::text, 10)::date, 'DD/MM/YYYY') END`,
  text_timestamp: (expr) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}::text) = '' THEN '' ELSE TO_CHAR(LEFT(${expr}::text, 19)::timestamp, 'DD/MM/YYYY HH24:MI') END`,
};

const SQL_FUNCTIONS = new Set([
  'COALESCE', 'NULLIF', 'CAST', 'EXTRACT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'AND', 'OR', 'NOT', 'IS', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'AS', 'ON', 'WHERE',
  'SELECT', 'FROM', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET',
  'ASC', 'DESC', 'TRUE', 'FALSE', 'NULL', 'DISTINCT', 'ALL', 'ANY', 'SOME',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'EXISTS',
  'ABS', 'CEIL', 'FLOOR', 'ROUND', 'TRUNC', 'LEAST', 'GREATEST',
  'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP',
  'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM', 'SUBSTRING', 'POSITION',
  'CONCAT', 'LENGTH', 'LEFT', 'RIGHT', 'REPLACE', 'SPLIT_PART',
  'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'CURRENT_TIME',
  'DATE', 'INTEGER', 'NUMERIC', 'TEXT', 'VARCHAR', 'BOOLEAN', 'TIMESTAMP',
  'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
  'ROW', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT',
]);

function quoteIdentifiers(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "'") {
      let j = i + 1;
      while (j < expr.length && expr[j] !== "'") j++;
      j++;
      tokens.push({ type: 'string', value: expr.substring(i, j) });
      i = j;
    } else if (expr[i] === '"') {
      let j = i + 1;
      while (j < expr.length && expr[j] !== '"') j++;
      j++;
      tokens.push({ type: 'quoted', value: expr.substring(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      const word = expr.substring(i, j);
      if (SQL_FUNCTIONS.has(word.toUpperCase()) || expr[j] === '(') {
        tokens.push({ type: 'func', value: word });
      } else if (/^\d+$/.test(word)) {
        tokens.push({ type: 'num', value: word });
      } else {
        tokens.push({ type: 'id', value: word });
      }
      i = j;
    } else if (/\d/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      tokens.push({ type: 'num', value: expr.substring(i, j) });
      i = j;
    } else {
      tokens.push({ type: 'other', value: expr[i] });
      i++;
    }
  }
  return tokens.map(t => {
    if (t.type === 'id') return `"${t.value}"`;
    return t.value;
  }).join('');
}

function quoteAndCastIdentifiers(expr, numericCast) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "'") {
      let j = i + 1;
      while (j < expr.length && expr[j] !== "'") j++;
      j++;
      tokens.push({ type: 'string', value: expr.substring(i, j) });
      i = j;
    } else if (expr[i] === '"') {
      let j = i + 1;
      while (j < expr.length && expr[j] !== '"') j++;
      j++;
      const ident = expr.substring(i + 1, j - 1);
      tokens.push({ type: 'quoted', value: numericCast ? `(${expr.substring(i, j)})::numeric` : expr.substring(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      const word = expr.substring(i, j);
      if (SQL_FUNCTIONS.has(word.toUpperCase()) || expr[j] === '(') {
        tokens.push({ type: 'func', value: word });
      } else if (/^\d+$/.test(word)) {
        tokens.push({ type: 'num', value: word });
      } else {
        tokens.push({ type: 'id', value: numericCast ? `("${word}")::numeric` : `"${word}"` });
      }
      i = j;
    } else if (/\d/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      tokens.push({ type: 'num', value: expr.substring(i, j) });
      i = j;
    } else {
      tokens.push({ type: 'other', value: expr[i] });
      i++;
    }
  }
  return tokens.map(t => t.value).join('');
}

function formatSelectPart(v, alias) {
  const dt = v.display_type || 'text';

  if (dt === 'jointure') {
    const ref = alias ? `"${alias}"."${v.expression}"` : `"${v.expression}"`;
    const s = `(SELECT "${v.join_display_field}" FROM "${v.join_schema}"."${v.join_table}" WHERE "${v.join_on_field}" = `;
    if (v.expression_type === 'field') {
      return `${s}${ref} LIMIT 1) AS "${v.variable_name}"`;
    }
    return `${s}${quoteAndCastIdentifiers(v.expression, false)} LIMIT 1) AS "${v.variable_name}"`;
  }

  const needsNumericCast = ['number', 'currency', 'integer'].includes(dt) && v.expression_type === 'expression';

  let rawExpr;
  if (v.expression_type === 'field') {
    rawExpr = `"${v.expression}"`;
  } else {
    rawExpr = quoteAndCastIdentifiers(v.expression, needsNumericCast);
  }

  if (needsNumericCast) {
    return `(${rawExpr}) AS "${v.variable_name}"`;
  }

  const caster = DISPLAY_TYPE_CASTS[dt];
  if (!caster) {
    return `${rawExpr} AS "${v.variable_name}"`;
  }

  return `${caster(rawExpr)} AS "${v.variable_name}"`;
}

async function getColumnPgType(schema, table, column) {
  try {
    const result = await pool.query(
      'SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
      [schema, table, column]
    );
    return result.rows.length > 0 ? result.rows[0].data_type : null;
  } catch (e) {
    return null;
  }
}

async function getFirstDateColumn(schema, table) {
  try {
    // First try to find columns by data type (date, timestamp)
    const typeResult = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone') ORDER BY ordinal_position LIMIT 1",
      [schema, table]
    );
    if (typeResult.rows.length > 0) return typeResult.rows[0];

    // If no date type found, look for columns by name pattern (contains 'DAT' or 'DATE')
    const nameResult = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND UPPER(column_name) LIKE '%DAT%' ORDER BY ordinal_position LIMIT 1",
      [schema, table]
    );
    return nameResult.rows.length > 0 ? nameResult.rows[0] : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getRubriques: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, json_agg(v.* ORDER BY v.display_order, v.id) FILTER (WHERE v.id IS NOT NULL) as variables,
          (SELECT json_build_object('id', cr.id, 'name', cr.name, 'pg_schema', cr.pg_schema, 'pg_table', cr.pg_table, 'parent_link_column', cr.parent_link_column, 'child_junction_table', cr.child_junction_table, 'child_junction_parent_column', cr.child_junction_parent_column, 'child_junction_child_column', cr.child_junction_child_column, 'child_junction_filter', cr.child_junction_filter) FROM finance.field_mapping_rubriques cr WHERE cr.id = r.child_rubrique_id) as child_rubrique
          FROM finance.field_mapping_rubriques r
          LEFT JOIN finance.field_mapping_variables v ON v.rubrique_id = r.id
          GROUP BY r.id ORDER BY r.id`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[FieldMapping] getRubriques error:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des rubriques', error: error.message });
    }
  },

  createRubrique: async (req, res) => {
    const { name, pg_schema, pg_table, fiscal_year_column, link_target, link_id_column, sedit_id_column, child_rubrique_id, child_link_column, parent_link_column, child_junction_table, child_junction_parent_column, child_junction_child_column, child_junction_filter } = req.body;
    try {
      const result = await pool.query(
        'INSERT INTO finance.field_mapping_rubriques (name, pg_schema, pg_table, fiscal_year_column, link_target, link_id_column, sedit_id_column, child_rubrique_id, child_link_column, parent_link_column, child_junction_table, child_junction_parent_column, child_junction_child_column, child_junction_filter) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
        [name, pg_schema || 'public', pg_table, fiscal_year_column || null, link_target || null, link_id_column || null, sedit_id_column || null, child_rubrique_id || null, child_link_column || null, parent_link_column || null, child_junction_table || null, child_junction_parent_column || null, child_junction_child_column || null, child_junction_filter || null]
      );
      res.json({ ...result.rows[0], variables: [] });
    } catch (error) {
      console.error('[FieldMapping] createRubrique error:', error);
      res.status(500).json({ message: 'Erreur lors de la création de la rubrique', error: error.message });
    }
  },

  updateRubrique: async (req, res) => {
    const { id } = req.params;
    const { name, pg_schema, pg_table, fiscal_year_column, link_target, link_id_column, sedit_id_column, child_rubrique_id, child_link_column, parent_link_column, child_junction_table, child_junction_parent_column, child_junction_child_column, child_junction_filter } = req.body;
    try {
      const result = await pool.query(
        'UPDATE finance.field_mapping_rubriques SET name = $1, pg_schema = $2, pg_table = $3, fiscal_year_column = $4, link_target = $5, link_id_column = $6, sedit_id_column = $7, child_rubrique_id = $8, child_link_column = $9, parent_link_column = $10, child_junction_table = $11, child_junction_parent_column = $12, child_junction_child_column = $13, child_junction_filter = $14 WHERE id = $15 RETURNING *',
        [name, pg_schema || 'public', pg_table, fiscal_year_column || null, link_target || null, link_id_column || null, sedit_id_column || null, child_rubrique_id || null, child_link_column || null, parent_link_column || null, child_junction_table || null, child_junction_parent_column || null, child_junction_child_column || null, child_junction_filter || null, id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: 'Rubrique non trouvée' });
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[FieldMapping] updateRubrique error:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
  },

  deleteRubrique: async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM finance.field_mapping_rubriques WHERE id = $1', [id]);
      res.json({ message: 'Rubrique supprimée' });
    } catch (error) {
      console.error('[FieldMapping] deleteRubrique error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  },

  createVariable: async (req, res) => {
    const { id: rubriqueId } = req.params;
    const { variable_name, expression_type, expression, display_type, display_order, join_schema, join_table, join_on_field, join_display_field } = req.body;
    try {
      const result = await pool.query(
        'INSERT INTO finance.field_mapping_variables (rubrique_id, variable_name, expression_type, expression, display_type, display_order, join_schema, join_table, join_on_field, join_display_field) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [rubriqueId, variable_name, expression_type || 'field', expression || '', display_type || 'text', display_order || 0, join_schema || null, join_table || null, join_on_field || null, join_display_field || null]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[FieldMapping] createVariable error:', error);
      res.status(500).json({ message: 'Erreur lors de la création de la variable', error: error.message });
    }
  },

  updateVariable: async (req, res) => {
    const { id } = req.params;
    const { variable_name, expression_type, expression, display_type, display_order, join_schema, join_table, join_on_field, join_display_field } = req.body;
    try {
      const result = await pool.query(
        'UPDATE finance.field_mapping_variables SET variable_name = $1, expression_type = $2, expression = $3, display_type = $4, display_order = $5, join_schema = $6, join_table = $7, join_on_field = $8, join_display_field = $9 WHERE id = $10 RETURNING *',
        [variable_name, expression_type, expression, display_type || 'text', display_order, join_schema || null, join_table || null, join_on_field || null, join_display_field || null, id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: 'Variable non trouvée' });
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[FieldMapping] updateVariable error:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
  },

  deleteVariable: async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM finance.field_mapping_variables WHERE id = $1', [id]);
      res.json({ message: 'Variable supprimée' });
    } catch (error) {
      console.error('[FieldMapping] deleteVariable error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  },

  getPgSchemas: async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name"
      );
      res.json(result.rows.map(r => r.schema_name));
    } catch (error) {
      console.error('[FieldMapping] getPgSchemas error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getPgTables: async (req, res) => {
    const { schema } = req.query;
    try {
      const schemaFilter = schema || 'public';
      const result = await pool.query(
        "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
        [schemaFilter]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[FieldMapping] getPgTables error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getPgColumns: async (req, res) => {
    const { schema, table } = req.params;
    try {
      const result = await pool.query(
        'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
        [schema, table]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[FieldMapping] getPgColumns error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

previewMapping: async (req, res) => {
    const { id } = req.params;
    const { limit } = req.query;
    try {
      const rubriqueResult = await pool.query(
        'SELECT * FROM finance.field_mapping_rubriques WHERE id = $1', [id]
      );
      if (rubriqueResult.rowCount === 0) return res.status(404).json({ message: 'Rubrique non trouvée' });
      const rubrique = rubriqueResult.rows[0];

      const variablesResult = await pool.query(
        'SELECT * FROM finance.field_mapping_variables WHERE rubrique_id = $1 ORDER BY display_order, id',
        [id]
      );
      const variables = variablesResult.rows;
      if (variables.length === 0) return res.json({ columns: [], rows: [], rubrique: rubrique.name, table: `${rubrique.pg_schema}.${rubrique.pg_table}` });

      const selectParts = variables.map(v => formatSelectPart(v, '_t'));

      const qualifiedTable = `"${rubrique.pg_schema}"."${rubrique.pg_table}" AS "_t"`;
      const query = `SELECT ${selectParts.join(', ')} FROM ${qualifiedTable} LIMIT ${parseInt(String(limit)) || 20}`;
      const dataResult = await pool.query(query);

      res.json({
        rubrique: rubrique.name,
        table: `${rubrique.pg_schema}.${rubrique.pg_table}`,
        child_rubrique_id: rubrique.child_rubrique_id,
        child_link_column: rubrique.child_link_column,
        child_junction_table: rubrique.child_junction_table,
        child_junction_parent_column: rubrique.child_junction_parent_column,
        child_junction_child_column: rubrique.child_junction_child_column,
        child_junction_filter: rubrique.child_junction_filter,
        columns: variables.map(v => ({
          name: v.variable_name,
          display_type: v.display_type || 'text'
        })),
        rows: dataResult.rows,
        totalRows: dataResult.rows.length
      });
    } catch (error) {
      console.error('[FieldMapping] previewMapping error:', error);
      res.status(500).json({ message: 'Erreur lors de la prévisualisation', error: error.message });
    }
  },

resolveMapping: async (req, res) => {
    const { name } = req.params;
    const { limit, offset, search, fiscal_year, sort_by, sort_dir, etat_filter, section_filter } = req.query;
    try {
      const rubriqueResult = await pool.query(
        "SELECT * FROM finance.field_mapping_rubriques WHERE name = $1", [name]
      );
      if (rubriqueResult.rowCount === 0) return res.status(404).json({ message: `Rubrique '${name}' non trouvée` });
      const rubrique = rubriqueResult.rows[0];

      const variablesResult = await pool.query(
        'SELECT * FROM finance.field_mapping_variables WHERE rubrique_id = $1 ORDER BY display_order, id',
        [rubrique.id]
      );
      const variables = variablesResult.rows;
      if (variables.length === 0) return res.json({ columns: [], rows: [], total: 0, fiscal_year_column: rubrique.fiscal_year_column });

      // For Commandes rubrique using the view, add section to variables if not already present
      if (rubrique.name === 'Commandes' && !variables.find(v => v.variable_name === 'section')) {
        variables.push({
          variable_name: 'section',
          display_type: 'text',
          expression: 'section',
          expression_type: 'field'
        });
      }

      const selectParts = variables.map(v => formatSelectPart(v, '_t'));
      let tableRef = rubrique.pg_table;
      let schemaRef = rubrique.pg_schema;
      if (rubrique.name === 'Commandes' && rubrique.pg_table === 'gf_oracle_commande') {
        tableRef = 'commandes_with_section';
        schemaRef = 'oracle';
      }
      const qualifiedTable = `"${schemaRef}"."${tableRef}" AS "_t"`;

      const whereParts = [];
      const params = [];
      let paramIdx = 1;

      if (fiscal_year) {
        let dateCol = null;
        if (rubrique.fiscal_year_column) {
          dateCol = { column_name: rubrique.fiscal_year_column };
          console.log(`[resolveMapping] ${name}: using configured fiscal_year_column=${rubrique.fiscal_year_column}`);
        } else if (rubrique.name !== 'Tiers') {
          dateCol = await getFirstDateColumn(rubrique.pg_schema, rubrique.pg_table);
          console.log(`[resolveMapping] ${name}: auto-detected dateCol=${dateCol?.column_name || 'null'} (schema=${rubrique.pg_schema}, table=${rubrique.pg_table})`);
        } else {
          console.log(`[resolveMapping] ${name}: skipped (Tiers)`);
        }
        if (dateCol) {
          whereParts.push(`EXTRACT(YEAR FROM "${dateCol.column_name}"::date) = $${paramIdx}`);
          params.push(String(fiscal_year));
          paramIdx++;
        }
      }

      if (search && typeof search === 'string') {
        const searchParts = variables
          .filter(v => v.display_type === 'text' || !v.display_type)
          .map(v => {
            const expr = v.expression_type === 'field' ? `"${v.expression}"` : v.expression;
            return `(${expr})::text ILIKE '%' || $${paramIdx} || '%'`;
          });
        if (searchParts.length > 0) {
          whereParts.push('(' + searchParts.join(' OR ') + ')');
          params.push(String(search));
          paramIdx++;
        }
      }

      // Handle etat_filter for invoices
      if (etat_filter && name === 'Factures') {
        const etatVar = variables.find(v => v.variable_name === 'Etat' || v.expression === 'FACETAT_LIBELLE');
        if (etatVar) {
          const expr = etatVar.expression_type === 'field' ? `"${etatVar.expression}"` : etatVar.expression;
          whereParts.push(`(${expr})::text = $${paramIdx}`);
          params.push(String(etat_filter));
          paramIdx++;
        }
      }

      // Handle section_filter
      if (section_filter && section_filter !== 'all') {
        const sectionVar = variables.find(v => v.variable_name === 'Section');
        if (sectionVar) {
          const expr = sectionVar.expression_type === 'field' ? `"${sectionVar.expression}"` : sectionVar.expression;
          const sectionValue = section_filter === 'F' ? 'F' : 'I';
          whereParts.push(`((${expr})::text = $${paramIdx} OR (${expr})::text = $${paramIdx + 1})`);
          params.push(sectionValue);
          params.push(section_filter === 'F' ? 'Fonctionnement' : 'Investissement');
          paramIdx += 2;
        }
      }

      const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

      const countResult = await pool.query(`SELECT COUNT(*) as total FROM ${qualifiedTable} ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].total);

      const limitVal = parseInt(String(limit)) || 100;
      const offsetVal = parseInt(String(offset)) || 0;

      let orderBy;
      if (sort_by) {
        const sortVar = variables.find(v => v.variable_name === sort_by);
        if (sortVar) {
          const dt = sortVar.display_type || 'text';
          if (dt === 'jointure') {
            orderBy = `"${sortVar.variable_name}" ${sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
          } else if (sortVar.expression_type === 'field') {
            const colExpr = `"${sortVar.expression}"`;
            if (['date', 'timestamp', 'text_date', 'text_timestamp'].includes(dt)) {
              orderBy = `"${sortVar.expression}" ${sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
            } else if (['number', 'currency', 'integer'].includes(dt)) {
              orderBy = `(${colExpr})::numeric ${sort_dir === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST'}`;
            } else {
              orderBy = `${colExpr}::text ${sort_dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
            }
          } else {
            orderBy = selectParts[0].split(' AS ')[0] + ' ASC';
          }
        } else {
          orderBy = selectParts[0].split(' AS ')[0] + ' ASC';
        }
      } else {
        orderBy = variables.find(v => v.expression_type === 'field')
          ? `"${variables.find(v => v.expression_type === 'field').expression}"`
          : selectParts[0].split(' AS ')[0];
      }

      let rows;

      const query = `SELECT ${selectParts.join(', ')} FROM ${qualifiedTable} ${whereClause} ORDER BY ${orderBy} LIMIT ${limitVal} OFFSET ${offsetVal}`;
      const dataResult = await pool.query(query, params);
      rows = dataResult.rows;

      // Enrich rows with operation link data if link_target and link_id_column are configured
      const linkIdVar = rubrique.link_id_column ? variables.find(v => v.expression === rubrique.link_id_column) : null;
      const linkRowKey = linkIdVar ? linkIdVar.variable_name : null;
      if (rubrique.link_target && linkRowKey) {
        const linkIds = rows.map(r => String(r[linkRowKey] || '').trim()).filter(Boolean);
        if (linkIds.length > 0) {
          const linksResult = await pool.query(
            `SELECT ol.target_id, ol.operation_id, o."LIBELLE" as operation_label, o."Service" as operation_service
             FROM oracle.oracle_links ol
             LEFT JOIN oracle.operations o ON o.id = ol.operation_id
             WHERE ol.target_table = $1 AND ol.target_id = ANY($2)`,
            [rubrique.link_target, linkIds]
          );
          const linkMap = new Map(linksResult.rows.map(r => [r.target_id, r]));
          rows = rows.map(row => {
            const linkId = String(row[linkRowKey] || '').trim();
            const link = linkMap.get(linkId);
            return {
              ...row,
              _operation_id: link?.operation_id || null,
              _operation_label: link?.operation_label || null,
              _operation_service: link?.operation_service || null,
            };
          });
        } else {
          rows = rows.map(row => ({ ...row, _operation_id: null, _operation_label: null, _operation_service: null }));
        }
      }

      res.json({
        rubrique: rubrique.name,
        table: `${rubrique.pg_schema}.${rubrique.pg_table}`,
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
          expression_type: v.expression_type
        })),
        rows,
        total
      });
    } catch (error) {
      console.error('[FieldMapping] resolveMapping error:', error);
      res.status(500).json({ message: 'Erreur lors de la résolution du mapping', error: error.message });
    }
  },

  assignOperation: async (req, res) => {
    const { rubrique_name, link_id, operation_id } = req.body;
    try {
      const rubriqueResult = await pool.query(
        "SELECT * FROM finance.field_mapping_rubriques WHERE name = $1", [rubrique_name]
      );
      if (rubriqueResult.rowCount === 0) return res.status(404).json({ message: `Rubrique '${rubrique_name}' non trouvée` });
      const rubrique = rubriqueResult.rows[0];
      if (!rubrique.link_target || !rubrique.link_id_column) {
        return res.status(400).json({ message: ' Cette rubrique ne supporte pas les liens vers les opérations' });
      }
      const targetId = String(link_id).trim();

      // Find the amount variable for this rubrique
      const amountVar = await pool.query(
        `SELECT expression, expression_type FROM finance.field_mapping_variables WHERE rubrique_id = $1 AND display_type = 'currency' ORDER BY display_order, id LIMIT 1`,
        [rubrique.id]
      );

      // Helper to get the command amount from the table
      const getAmount = async () => {
        if (amountVar.rows.length === 0) return 0;
        const v = amountVar.rows[0];
        const amountExpr = v.expression_type === 'field' ? `"${v.expression}"` : v.expression;
        const idExpr = rubrique.link_id_column ? `"${rubrique.link_id_column}"` : null;
        if (!idExpr || !rubrique.link_id_column) return 0;
        const result = await pool.query(
          `SELECT (${amountExpr})::numeric AS amount FROM "${rubrique.pg_schema}"."${rubrique.pg_table}" WHERE ${idExpr} = $1`,
          [targetId]
        );
        if (result.rows.length === 0) return 0;
        const val = parseFloat(result.rows[0].amount);
        return isNaN(val) ? 0 : val;
      };

      if (operation_id) {
        // Check if there was a previous operation (re-assign)
        const prevLink = await pool.query(
          'SELECT operation_id FROM oracle.oracle_links WHERE target_table = $1 AND target_id = $2',
          [rubrique.link_target, targetId]
        );
        const prevOpId = prevLink.rows.length > 0 ? prevLink.rows[0].operation_id : null;

        const amount = await getAmount();

        // Remove amount from previous operation if different
        if (prevOpId && prevOpId !== operation_id) {
          await pool.query(
            `UPDATE oracle.operations SET used_amount = GREATEST(COALESCE(used_amount, 0) - $1, 0) WHERE id = $2`,
            [amount, prevOpId]
          );
        }

        // Add amount to new operation (only if new assignment or re-assignment)
        if (!prevOpId || prevOpId !== operation_id) {
          await pool.query(
            `UPDATE oracle.operations SET used_amount = COALESCE(used_amount, 0) + $1 WHERE id = $2`,
            [amount, operation_id]
          );
        }

        await pool.query(
          `INSERT INTO oracle.oracle_links (target_table, target_id, operation_id) VALUES ($1, $2, $3) ON CONFLICT (target_table, target_id) DO UPDATE SET operation_id = EXCLUDED.operation_id`,
          [rubrique.link_target, targetId, operation_id]
        );
      } else {
        // Disassociate: get the old operation and subtract amount
        const prevLink = await pool.query(
          'SELECT operation_id FROM oracle.oracle_links WHERE target_table = $1 AND target_id = $2',
          [rubrique.link_target, targetId]
        );
        if (prevLink.rows.length > 0 && prevLink.rows[0].operation_id) {
          const amount = await getAmount();
          await pool.query(
            `UPDATE oracle.operations SET used_amount = GREATEST(COALESCE(used_amount, 0) - $1, 0) WHERE id = $2`,
            [amount, prevLink.rows[0].operation_id]
          );
        }
        await pool.query(
          `UPDATE oracle.oracle_links SET operation_id = NULL WHERE target_table = $1 AND target_id = $2`,
          [rubrique.link_target, targetId]
        );
      }
      res.json({ message: 'Affectation réussie' });
    } catch (error) {
      console.error('[FieldMapping] assignOperation error:', error);
      res.status(500).json({ message: "Erreur lors de l'affectation", error: error.message });
    }
  },

  getOperations: async (req, res) => {
    try {
      const result = await pool.query('SELECT id, "LIBELLE", "Service", "Section" FROM oracle.operations ORDER BY id');
      res.json(result.rows);
    } catch (error) {
      console.error('[FieldMapping] getOperations error:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des opérations', error: error.message });
    }
  },

  getAvailableYears: async (req, res) => {
    const { name } = req.params;
    try {
      const rubriqueResult = await pool.query(
        "SELECT * FROM finance.field_mapping_rubriques WHERE name = $1", [name]
      );
      if (rubriqueResult.rowCount === 0) return res.status(404).json({ message: `Rubrique '${name}' non trouvée` });
      const rubrique = rubriqueResult.rows[0];

      let dateCol = null;
      if (rubrique.fiscal_year_column) {
        dateCol = { column_name: rubrique.fiscal_year_column };
      } else {
        dateCol = await getFirstDateColumn(rubrique.pg_schema, rubrique.pg_table);
      }
      console.log(`[getAvailableYears] Rubrique: ${name}, Schema: ${rubrique.pg_schema}, Table: ${rubrique.pg_table}, DateCol: ${dateCol?.column_name || 'NOT FOUND'}`);

      if (!dateCol) return res.json([]);

      const result = await pool.query(
        `SELECT DISTINCT EXTRACT(YEAR FROM "${dateCol.column_name}"::date) AS year FROM "${rubrique.pg_schema}"."${rubrique.pg_table}" WHERE "${dateCol.column_name}" IS NOT NULL ORDER BY year DESC`
      );
      const years = result.rows.map(r => parseInt(r.year));
      console.log(`[getAvailableYears] Found years: ${years}`);
      res.json(years);
    } catch (error) {
      console.error('[FieldMapping] getAvailableYears error:', error);
      res.status(500).json({ message: "Erreur lors de la récupération des années", error: error.message });
    }
  },

  getChildren: async (req, res) => {
    const { name, parentValue } = req.params;
    try {
      const parentResult = await pool.query(
        'SELECT * FROM finance.field_mapping_rubriques WHERE name = $1', [name]
      );
      if (parentResult.rowCount === 0) return res.status(404).json({ message: `Rubrique '${name}' non trouvée` });
      const parent = parentResult.rows[0];
      if (!parent.child_rubrique_id) return res.status(400).json({ message: `La rubrique '${name}' n'a pas de rubrique enfant configurée` });

      const childResult = await pool.query(
        'SELECT * FROM finance.field_mapping_rubriques WHERE id = $1', [parent.child_rubrique_id]
      );
      if (childResult.rowCount === 0) return res.status(404).json({ message: 'Rubrique enfant non trouvée' });
      const child = childResult.rows[0];

      const variablesResult = await pool.query(
        'SELECT * FROM finance.field_mapping_variables WHERE rubrique_id = $1 ORDER BY display_order, id',
        [child.id]
      );
      const variables = variablesResult.rows;
      if (variables.length === 0) return res.json({ columns: [], rows: [] });

      const selectParts = variables.map(v => formatSelectPart(v, '_c'));
      const qualifiedTable = `"${child.pg_schema}"."${child.pg_table}" AS "_c"`;

      let query;
      const childParams = [];

      if (parent.child_junction_table && parent.child_junction_parent_column && parent.child_junction_child_column) {
        // Junction table mode: child is linked to parent via a junction table
        const jt = parent.child_junction_table;
        const jp = parent.child_junction_parent_column;
        const jc = parent.child_junction_child_column;
        const filter = parent.child_junction_filter ? ` AND ${parent.child_junction_filter}` : '';
        const idx = 1;
        const junctionWhere = `"_c"."${child.parent_link_column || child.link_id_column || 'id'}" IN (SELECT "${jc}" FROM ${jt} WHERE "${jp}" = $${idx}${filter})`;
        query = `SELECT ${selectParts.join(', ')} FROM ${qualifiedTable} WHERE ${junctionWhere} LIMIT 200`;
        childParams.push(String(parentValue).trim());
      } else if (child.parent_link_column) {
        // Direct column match mode (existing)
        query = `SELECT ${selectParts.join(', ')} FROM ${qualifiedTable} WHERE TRIM("_c"."${child.parent_link_column}") = TRIM($1) LIMIT 200`;
        childParams.push(String(parentValue).trim());
      } else {
        return res.json({ columns: [], rows: [] });
      }

      const dataResult = await pool.query(query, childParams);

      res.json({
        columns: variables.map(v => ({
          name: v.variable_name,
          display_type: v.display_type || 'text',
          expression: v.expression,
          expression_type: v.expression_type
        })),
        rows: dataResult.rows
      });
    } catch (error) {
      console.error('[FieldMapping] getChildren error:', error);
      res.status(500).json({ message: "Erreur lors de la récupération des lignes", error: error.message });
    }
  }
};