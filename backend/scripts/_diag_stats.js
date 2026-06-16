// Script one-shot : synchronise service_code/service_complement de SQLite -> magapp.users
const { pool, setupDb, getSqlite } = require('../shared/database');

(async () => {
  await setupDb();
  const db = getSqlite();
  if (!db) { console.error('SQLite non disponible'); process.exit(1); }

  const users = await db.all('SELECT username, service_code, service_complement FROM users');
  console.log(`${users.length} utilisateurs SQLite`);

  let updated = 0;
  for (const u of users) {
    if (!u.service_code && !u.service_complement) continue;
    try {
      const r = await pool.query(
        'UPDATE magapp.users SET service_code = $1, service_complement = $2 WHERE LOWER(username) = LOWER($3)',
        [u.service_code || null, u.service_complement || null, u.username]
      );
      if (r.rowCount > 0) {
        console.log(`  ✓ ${u.username} → service_code="${u.service_code}" / complement="${u.service_complement}"`);
        updated++;
      }
    } catch (e) { console.error('  ✗', u.username, e.message); }
  }
  console.log(`\n${updated} utilisateur(s) mis à jour dans magapp.users`);

  // Vérification
  const check = await pool.query(
    "SELECT service_code, service_complement, COUNT(*) FROM magapp.users WHERE service_code IS NOT NULL AND service_code <> '' GROUP BY service_code, service_complement ORDER BY count DESC LIMIT 10"
  );
  console.log('\nRépartition après sync :');
  if (check.rows.length === 0) console.log('  (aucun service_code trouvé dans SQLite non plus)');
  check.rows.forEach(r => console.log(`  "${r.service_code}" / "${r.service_complement}" : ${r.count} utilisateur(s)`));

  // Vérifier ce qu'il y a dans SQLite
  const sqliteCheck = await db.all("SELECT username, service_code, service_complement FROM users WHERE service_code IS NOT NULL AND service_code != '' LIMIT 10");
  console.log('\nUtilisateurs SQLite avec service_code renseigné :');
  if (sqliteCheck.length === 0) console.log('  Aucun ! Les service_code ne sont pas renseignés dans SQLite non plus.');
  sqliteCheck.forEach(u => console.log(`  ${u.username}: "${u.service_code}" / "${u.service_complement}"`));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
