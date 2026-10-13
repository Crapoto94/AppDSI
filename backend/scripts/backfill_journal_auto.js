// Rattrapage (idempotent) du journal de projet pour l'historique existant :
//  - annotations de revue de projets déjà saisies (date = date de la revue) ;
//  - tâches de projet déjà terminées (date = dernière mise à jour de la tâche).
// Usage : node scripts/backfill_journal_auto.js
const { pool } = require('../shared/database');
const ja = require('../modules/projets/journal-auto');

(async () => {
    let nRevue = 0, nTaches = 0;

    const revues = (await pool.query(`SELECT revue_id, projet_id, commentaire FROM hub_rencontres.revue_projets WHERE commentaire IS NOT NULL AND commentaire != ''`)).rows;
    for (const r of revues) { await ja.journaliserCommentaireRevue({ revueId: r.revue_id, projetId: r.projet_id, commentaire: r.commentaire, username: 'revue' }); nRevue++; }

    // Tâches assignées (hub.user_tasks) rattachées à un projet et terminées : la date d'entrée est celle de la dernière mise à jour.
    const uts = (await pool.query(`SELECT id, context_source, context_id, description, team_group_id, taken_by, updated_at FROM hub.user_tasks
        WHERE context_source IN ('projet','projet_standalone') AND context_id IS NOT NULL AND statut IN ('terminé','terminee')`)).rows;
    for (const t of uts) {
        await ja.journaliserTache({
            projetId: parseInt(t.context_id, 10), key: `ut:${t.team_group_id || t.id}`, statut: 'terminé', description: t.description,
            username: t.taken_by, date: t.updated_at, notesRef: { kind: 'task_notes', source: t.context_source, task_id: String(t.id) },
        });
        nTaches++;
    }
    console.log(`Annotations de revue : ${nRevue} — tâches terminées : ${nTaches}`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
