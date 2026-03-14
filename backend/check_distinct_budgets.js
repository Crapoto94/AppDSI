const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT DISTINCT Budget FROM invoices", (err, rows) => {
    console.log('Distinct Budgets in invoices:', rows);
    db.all("SELECT DISTINCT Budget FROM budget_lines", (err, rows2) => {
        console.log('Distinct Budgets in budget_lines:', rows2);
        db.close();
    });
});
