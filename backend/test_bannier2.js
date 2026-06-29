const { pool } = require('./shared/database');
(async () => {
  // Search for BANNIER anywhere
  const tables = ['hub.encadrants', 'hub.users', 'hub_calendrier.agents_dsi'];
  for (const t of tables) {
    const r = await pool.query(`SELECT * FROM ${t} WHERE LOWER(COALESCE(ad_username,'') || COALESCE(matricule,'') || COALESCE(nom,'') || COALESCE(displayname,'') || COALESCE(telephone,'') || COALESCE(telephone_perso,'')) LIKE '%bannier%'`);
    if (r.rows.length) {
      console.log(`Found in ${t}:`, JSON.stringify(r.rows, null, 2));
    }
  }
  console.log('Search done');
})();
