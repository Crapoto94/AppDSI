const { pool, setupPgDb } = require('../shared/database');
setupPgDb().then(async () => {
  const res = await pool.query(
    "UPDATE hub_tickets.mail_collectors SET last_run = '2026-06-08T11:00:00.000Z' WHERE module = 'tickets' RETURNING id, name, last_run"
  );
  res.rows.forEach(r => console.log('Reset #' + r.id, r.name, '->', r.last_run));
  if (res.rows.length === 0) console.log('Aucun collecteur tickets trouvé.');
  await pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });
