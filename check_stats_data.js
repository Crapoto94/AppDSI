const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('backend/database.sqlite');
db.all("SELECT date('now', 'localtime') as today, clicked_at FROM magapp_clicks ORDER BY clicked_at DESC LIMIT 5", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});