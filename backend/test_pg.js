const { pgDb } = require('./shared/database');

async function test() {
  const cols = await pgDb.all("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'hub_tickets' AND table_name = 'mail_collectors';");
  console.log("Columns:", cols);

  process.exit();
}

test();
