const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database_svg.sqlite'));
db.get("SELECT COUNT(*) as count FROM orders WHERE operation_id IS NOT NULL", (err, row) => {
    if (err) console.error(err);
    console.log(row ? row.count : 'No data');
    db.close();
});
