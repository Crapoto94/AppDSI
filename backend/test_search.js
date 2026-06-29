const { pool } = require('./shared/database');
(async () => {
  // Search across all hub tables for "BANNIER"
  const r = await pool.query(`
    SELECT table_schema, table_name FROM information_schema.columns 
    WHERE (table_schema = 'hub' OR table_schema LIKE 'hub_%') AND data_type NOT IN ('integer','bigint','boolean','numeric','timestamp','date','time')
    GROUP BY table_schema, table_name ORDER BY table_schema, table_name
  `);
  for (const t of r.rows) {
    try {
      const q = await pool.query(`SELECT * FROM ${t.table_schema}.${t.table_name}::text ILIKE '%BANNIER%'`);
      if (q.rows.length) console.log(t.table_schema + '.' + t.table_name, JSON.stringify(q.rows));
    } catch {}
  }
  console.log('done');
})();
