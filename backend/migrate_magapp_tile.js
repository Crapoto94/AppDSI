const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
  db.run("INSERT INTO tiles (title, icon, description, status, sort_order) VALUES ('Magasin d''Apps', 'Smartphone', 'Administration des versions et nouveautés', 'active', 10)", function(err) {
    if (err) {
      console.error('Error inserting tile:', err);
      process.exit(1);
    }
    const tileId = this.lastID;
    console.log('Tile inserted with ID:', tileId);
    
    db.run("INSERT INTO tile_links (tile_id, label, url, is_internal) VALUES (?, 'Gérer les versions', '/admin/magapp', 1)", [tileId], function(err2) {
      if (err2) {
        console.error('Error inserting link:', err2);
        process.exit(1);
      }
      console.log('Link inserted successfully');
      db.close();
    });
  });
});
