const { pool } = require('../shared/database');

async function run() {
  const r = await pool.query(`
    SELECT COUNT(*)
    FROM glpi.ticket_tasks tt
    JOIN glpi.tickets ht ON ht.glpi_id = tt.ticket_id
    WHERE tt.state = 1
      AND ht.status NOT IN (5, 6)
  `);
  console.log('Tâches ouvertes (state=1) sur tickets ouverts (hors Résolu/Clos):', r.rows[0].count);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
