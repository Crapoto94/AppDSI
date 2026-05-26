const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur connexion BD:', err);
    process.exit(1);
  }

  console.log('\n=== TUILES EXISTANTES ===');
  db.all(`SELECT id, title, icon, status FROM tiles ORDER BY id`, (err, tiles) => {
    if (err) console.error('Erreur tuiles:', err);
    if (tiles) {
      tiles.forEach(t => console.log(`ID: ${t.id}, Title: ${t.title}, Icon: ${t.icon}, Status: ${t.status}`));
    }

    console.log('\n=== LIENS DES TUILES ===');
    db.all(`SELECT tile_id, label, url FROM tile_links ORDER BY tile_id`, (err, links) => {
      if (err) console.error('Erreur links:', err);
      if (links) {
        links.forEach(l => console.log(`Tile ID: ${l.tile_id}, Label: ${l.label}, URL: ${l.url}`));
      }

      console.log('\n=== AUTORISATIONS MACHEVALIER ===');
      db.all(`
        SELECT ut.tile_id, u.username, t.title, tl.url
        FROM user_tiles ut
        JOIN users u ON ut.user_id = u.id
        LEFT JOIN tiles t ON ut.tile_id = t.id
        LEFT JOIN tile_links tl ON t.id = tl.tile_id
        WHERE u.username = 'machevalier' OR u.username = 'MaChevalier'
        ORDER BY ut.tile_id
      `, (err, rows) => {
        if (err) console.error('Erreur autorisations:', err);
        if (rows && rows.length > 0) {
          rows.forEach(r => console.log(`Tile ID: ${r.tile_id}, Title: ${r.title}, URL: ${r.url}`));
        } else {
          console.log('Aucune autorisation trouvée pour machevalier');
        }

        console.log('\n=== RECHERCHE CONSOMMABLES ===');
        db.all(`
          SELECT id, title FROM tiles WHERE title LIKE '%Consommable%' OR title LIKE '%consommable%'
        `, (err, tiles) => {
          if (err) console.error('Erreur:', err);
          if (tiles) {
            tiles.forEach(t => console.log(`ID: ${t.id}, Title: ${t.title}`));
          } else {
            console.log('Aucune tuile trouvée');
          }
          db.close();
        });
      });
    });
  });
});
