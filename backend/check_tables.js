const { pool } = require('./shared/pg_db');
(async () => {
  const r = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'oracle' 
    ORDER BY table_name
  `);
  console.log('Tables in oracle schema:');
  for (const row of r.rows) {
    console.log(' ', row.table_name);
  }
  process.exit(0);
})();