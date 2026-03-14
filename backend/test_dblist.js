const db = require('./db.js');
async function test() {
    const connection = await db();
    const rows = await connection.all("PRAGMA database_list");
    console.log(JSON.stringify(rows, null, 2));
}
test().catch(console.error);
