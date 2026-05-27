const { pgDb } = require('./shared/database');

async function fix() {
  try {
    console.log("Fixing mail_collectors schema...");
    await pgDb.run('CREATE SEQUENCE IF NOT EXISTS hub_tickets.mail_collectors_id_seq;');
    
    // Assign an ID to any row where id is null
    await pgDb.run("UPDATE hub_tickets.mail_collectors SET id = nextval('hub_tickets.mail_collectors_id_seq') WHERE id IS NULL;");

    // Set the default value
    await pgDb.run("ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN id SET DEFAULT nextval('hub_tickets.mail_collectors_id_seq');");
    
    // Ensure id is NOT NULL
    await pgDb.run("ALTER TABLE hub_tickets.mail_collectors ALTER COLUMN id SET NOT NULL;");

    // Attempt to set PRIMARY KEY if not exists (might fail if already exists)
    try {
      await pgDb.run("ALTER TABLE hub_tickets.mail_collectors ADD PRIMARY KEY (id);");
    } catch (e) {
      console.log("PK might already exist:", e.message);
    }

    // Sync sequence
    await pgDb.run("SELECT setval('hub_tickets.mail_collectors_id_seq', COALESCE((SELECT MAX(id) FROM hub_tickets.mail_collectors), 1));");

    console.log("Done.");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit();
}

fix();
