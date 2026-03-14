const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});

db.all("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
  if (err) {
    throw err;
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
