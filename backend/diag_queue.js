// Diagnostic: shows notification_queue state in PostgreSQL
const { pgDb } = require('./shared/database');

(async () => {
    const all = await pgDb.all('SELECT id, ticket_id, recipient_email, subject, status, created_at, sent_at FROM hub_tickets.notification_queue ORDER BY id');
    console.log('=== NOTIFICATION QUEUE ===');
    console.log(`Total rows: ${all.length}`);
    console.log('');
    console.log('ID  | TICKET | RECIPIENT | STATUS | CREATED | SENT');
    console.log('----+--------+-----------+--------+---------+-----');
    for (const r of all) {
        console.log(`${String(r.id).padEnd(4)}| ${String(r.ticket_id).padEnd(6)}| ${String(r.recipient_email).padEnd(18)}| ${String(r.status).padEnd(6)}| ${r.created_at?.toISOString?.()?.slice(0,19) ?? r.created_at} | ${r.sent_at?.toISOString?.()?.slice(0,19) ?? r.sent_at}`);
    }
    console.log('');

    const statusCounts = await pgDb.all("SELECT status, COUNT(*) as cnt FROM hub_tickets.notification_queue GROUP BY status");
    console.log('=== PAR STATUT ===');
    for (const r of statusCounts) {
        console.log(`  ${r.status}: ${r.cnt}`);
    }

    const repeated = await pgDb.all(`
        SELECT ticket_id, recipient_email, subject, COUNT(*) as cnt
        FROM hub_tickets.notification_queue
        GROUP BY ticket_id, recipient_email, subject
        HAVING COUNT(*) > 1
    `);
    if (repeated.length > 0) {
        console.log('\n=== DOUBLONS (même ticket+dest+subject) ===');
        for (const r of repeated) {
            console.log(`  #${r.ticket_id} → ${r.recipient_email}: ${r.subject} (${r.cnt}x)`);
        }
    }

    const logs = await pgDb.all('SELECT id, ticket_id, event, recipient_email, status, created_at FROM hub_tickets.notification_logs ORDER BY id DESC LIMIT 10');
    console.log('\n=== 10 DERNIERS LOGS ===');
    for (const r of logs) {
        console.log(`  #${r.id} | #${r.ticket_id} | ${r.event} | ${r.recipient_email} | ${r.status} | ${r.created_at?.toISOString?.()?.slice(0,19) ?? r.created_at}`);
    }

    process.exit(0);
})().catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
