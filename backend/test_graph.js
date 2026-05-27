const MailCollectorService = require('./modules/mail_collector/mail_collector.service');
const { getSqlite, setupDb, pgDb } = require('./shared/database');

async function test() {
  try {
    await setupDb(); // Initialize SQLite
    const collectors = await pgDb.all("SELECT * FROM hub_tickets.mail_collectors WHERE module='tickets'");
    if (collectors.length === 0) {
      console.log("No ticket collector found.");
      process.exit();
    }
    const target = collectors[0];
    console.log("Testing collector ID:", target.id);
    
    const log = await MailCollectorService.performCollection(target.id);
    console.log('Success:', JSON.stringify(log, null, 2));
  } catch (error) {
    console.error('FAILED!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error);
    }
  }
  process.exit();
}

test();
