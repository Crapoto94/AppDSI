const { pgDb } = require('./shared/database');

async function main() {
  // Tous les ticket_sla avec leurs infos
  const all = await pgDb.all(
    "SELECT ts.id, ts.ticket_id, ts.sla_definition_id, ts.sla_status, ts.created_at, " +
    "ts.first_response_target, ts.resolution_target, ts.first_response_at, ts.resolved_at, " +
    "sd.name as def_name, sd.type as def_type, t.type as ticket_type, " +
    "t.priority, t.impact, t.date_creation, t.title, t.status " +
    "FROM hub_tickets.ticket_sla ts " +
    "JOIN hub_tickets.sla_definitions sd ON ts.sla_definition_id = sd.id " +
    "JOIN hub_tickets.tickets t ON ts.ticket_id = t.glpi_id " +
    "WHERE ts.ticket_id IN (43977,43978,43979) " +
    "ORDER BY ts.ticket_id"
  );
  console.log('=== TICKET_SLA DETAILS ===');
  console.log(JSON.stringify(all, null, 2));

  // Tous les dépassements actuels
  const breaches = await pgDb.all(
    "SELECT ts.id, ts.ticket_id, ts.sla_status, ts.created_at, " +
    "ts.resolution_target, sd.name " +
    "FROM hub_tickets.ticket_sla ts " +
    "JOIN hub_tickets.sla_definitions sd ON ts.sla_definition_id = sd.id " +
    "WHERE ts.sla_status IN ('warning','breached')"
  );
  console.log('=== ALL BREACHES ===');
  console.log(JSON.stringify(breaches, null, 2));

  // Tous les ticket_sla existants
  const count = await pgDb.all(
    "SELECT ts.sla_status, count(*) as cnt FROM hub_tickets.ticket_sla ts GROUP BY ts.sla_status"
  );
  console.log('=== SLA STATUS COUNTS ===');
  console.log(JSON.stringify(count, null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
