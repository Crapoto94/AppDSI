// Rattrapage (idempotent) : tâches de ticket existantes dont le ticket est associé à un logiciel
// → classe système « Logiciel » + logiciel du ticket, pour chaque destinataire.
// Ne touche pas aux tâches déjà classées. Usage : node scripts/backfill_class_logiciel.js
const { pool } = require('../shared/database');

(async () => {
    const cls = (await pool.query("SELECT id FROM hub.user_task_classes WHERE scope = 'software' LIMIT 1")).rows[0];
    if (!cls) { console.error('Classe système « Logiciel » absente : démarrez le backend une fois (migration).'); process.exit(1); }
    const { rowCount } = await pool.query(
        `INSERT INTO hub.user_task_class_links (username, source, task_id, class_id, software_id)
         SELECT LOWER(ut.username), 'ticket', ut.id::text, $1, t.software_id
           FROM hub.user_tasks ut
           JOIN hub_tickets.tickets t ON t.glpi_id = ut.context_id
           JOIN magapp.apps a ON a.id = t.software_id
          WHERE ut.context_source = 'ticket' AND t.software_id IS NOT NULL AND ut.username IS NOT NULL
         ON CONFLICT (username, source, task_id) DO NOTHING`,
        [cls.id]
    );
    const tot = (await pool.query(`SELECT COUNT(*) FROM hub.user_tasks WHERE context_source = 'ticket'`)).rows[0].count;
    console.log(`Tâches de ticket : ${tot} — rattachées à la classe Logiciel : ${rowCount}`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
