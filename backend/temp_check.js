const { pool } = require('./pg_db');

(async () => {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'glpi' AND table_name = 'tickets' ORDER BY ordinal_position");
  console.log(r.rows.map(x => x.column_name).join(', '));
  
  // Check ticket 43530
  const t = await pool.query("SELECT * FROM glpi.tickets WHERE glpi_id = 43530");
  console.log('\nTicket 43530:');
  console.log(JSON.stringify(t.rows[0], null, 2));
  
  process.exit(0);
})();
