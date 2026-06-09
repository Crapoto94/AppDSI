/**
 * Corrige les tickets qui sont affectés (ont une entrée dans ticket_assignments)
 * mais qui sont encore en statut Nouveau (1).
 * Un ticket affecté à un groupe passe en statut 2 (En cours).
 * Un ticket affecté à un technicien passe en statut 3 (En cours).
 */
const { pool, setupPgDb } = require('../shared/database');

setupPgDb().then(async () => {
    // Tickets assignés à un technicien et encore Nouveau → statut 3
    const techRes = await pool.query(`
        UPDATE hub_tickets.tickets t
        SET status = 3
        FROM hub_tickets.ticket_assignments ta
        WHERE ta.ticket_id = t.glpi_id
          AND ta.technician_id IS NOT NULL
          AND t.status = 1
        RETURNING t.glpi_id, t.title
    `);
    console.log(`Technicien → statut 3 : ${techRes.rowCount} ticket(s)`);
    techRes.rows.forEach(r => console.log(`  #${r.glpi_id} ${r.title}`));

    // Tickets assignés à un groupe seulement et encore Nouveau → statut 2
    const grpRes = await pool.query(`
        UPDATE hub_tickets.tickets t
        SET status = 2
        FROM hub_tickets.ticket_assignments ta
        WHERE ta.ticket_id = t.glpi_id
          AND ta.technician_id IS NULL
          AND ta.group_id IS NOT NULL
          AND t.status = 1
        RETURNING t.glpi_id, t.title
    `);
    console.log(`Groupe → statut 2 : ${grpRes.rowCount} ticket(s)`);
    grpRes.rows.forEach(r => console.log(`  #${r.glpi_id} ${r.title}`));

    await pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });
