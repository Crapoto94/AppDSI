const { pgDb } = require('./shared/database');
const slaService = require('./modules/tickets/services/sla.service');

async function main() {
  // Fix existing NULL sla_status
  await pgDb.run("UPDATE hub_tickets.ticket_sla SET sla_status = 'ok' WHERE sla_status IS NULL");
  console.log('Fixed NULL sla_status rows');

  // Run full check
  await slaService.checkSLAs();

  // Show remaining breaches
  const breaches = await pgDb.all(
    "SELECT ts.ticket_id, ts.sla_status, ts.created_at, ts.resolution_target, " +
    "sd.name as def_name, t.title, t.type as ticket_type " +
    "FROM hub_tickets.ticket_sla ts " +
    "JOIN hub_tickets.sla_definitions sd ON ts.sla_definition_id = sd.id " +
    "JOIN hub_tickets.tickets t ON ts.ticket_id = t.glpi_id " +
    "WHERE ts.sla_status IN ('warning','breached')"
  );
  console.log('=== BREACHES ===');
  console.log(JSON.stringify(breaches, null, 2));

  const ok = await pgDb.all("SELECT sla_status, count(*) as cnt FROM hub_tickets.ticket_sla GROUP BY sla_status");
  console.log('=== COUNTS ===');
  console.log(JSON.stringify(ok, null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
