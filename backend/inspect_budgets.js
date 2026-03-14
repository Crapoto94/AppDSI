const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("PRAGMA table_info(budgets)", (err, cols) => {
    console.log('Columns:', cols.map(c => c.name));
    db.all("SELECT * FROM budgets", (err, rows) => {
        console.log('Budgets data:', JSON.stringify(rows, null, 2));
        db.close();
    });
});
