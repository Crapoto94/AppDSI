const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function run() {
  const db = await open({
    filename: path.join(__dirname, 'oracle_rh.sqlite'),
    driver: sqlite3.Database
  });

  const row = await db.get("SELECT * FROM agents_latest WHERE nom LIKE '%BADOUD%' LIMIT 1");
  console.log(JSON.stringify(row, null, 2));

  // Get columns from AD db just to be sure
  const dbAD = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  const adCols = await dbAD.all("PRAGMA table_info('ad_users')");
  console.log("\nAD Columns:");
  console.log(adCols.map(c => c.name).join(', '));
}

run();
