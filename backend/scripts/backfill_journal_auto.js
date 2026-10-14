// Rattrapage (idempotent) du journal de projet pour l'historique existant :
//  - annotations de revue de projets déjà saisies (date = date de la revue) ;
//  - tâches de projet déjà terminées (date = dernière mise à jour de la tâche).
// Usage : node scripts/backfill_journal_auto.js
const { pool } = require('../shared/database');
const ja = require('../modules/projets/journal-auto');

(async () => {
    const count = async (t) => parseInt((await pool.query('SELECT COUNT(*) FROM projets.projet_journal WHERE type_entree = $1', [t])).rows[0].count, 10);
    const avant = { revue: await count('revue_commentaire'), taches: await count('tache_terminee') };
    const cat = {};
    const catAvant = async (k) => { cat[k] = await count('tache_terminee'); };
    const catApres = async (k) => { cat[k] = (await count('tache_terminee')) - cat[k]; };

    const revues = (await pool.query(`SELECT revue_id, projet_id, commentaire FROM hub_rencontres.revue_projets WHERE commentaire IS NOT NULL AND commentaire != ''`)).rows;
    for (const r of revues) await ja.journaliserCommentaireRevue({ revueId: r.revue_id, projetId: r.projet_id, commentaire: r.commentaire, username: 'revue' });

    // Tâches assignées (hub.user_tasks) rattachées à un projet et terminées : la date d'entrée est celle de la dernière mise à jour.
    const uts = (await pool.query(`SELECT id, context_source, context_id, description, team_group_id, taken_by, updated_at FROM hub.user_tasks
        WHERE context_source IN ('projet','projet_standalone') AND context_id IS NOT NULL AND statut IN ('terminé','terminee')`)).rows;
    await catAvant('Mes tâches (assignées depuis un projet)');
    for (const t of uts) {
        await ja.journaliserTache({
            projetId: parseInt(t.context_id, 10), key: `ut:${t.team_group_id || t.id}`, statut: 'terminé', description: t.description,
            username: t.taken_by, date: t.updated_at, notesRef: { kind: 'task_notes', source: t.context_source, task_id: String(t.id) },
        });
    }
    await catApres('Mes tâches (assignées depuis un projet)');

    // Tâches du projet (standalone), de revue et du planning : pas de date de validation stockée → date de création / fin prévue.
    await catAvant('Tâches standalone du projet');
    for (const t of (await pool.query(`SELECT id, projet_id, tache, responsable, created_at FROM projets.projet_taches_standalone WHERE statut IN ('terminé','terminee','terminée')`)).rows)
        await ja.journaliserTache({ projetId: t.projet_id, key: `st:${t.id}`, statut: 'terminé', description: t.tache, username: 'rattrapage', responsable: t.responsable, date: t.created_at, notesRef: { kind: 'standalone', id: t.id } });
    await catApres('Tâches standalone du projet');
    await catAvant('Tâches issues des revues de projets');
    for (const t of (await pool.query(`SELECT id, projet_id, titre, responsable, created_at FROM hub_rencontres.revue_taches WHERE projet_id IS NOT NULL AND statut IN ('terminé','terminee','terminée')`)).rows)
        await ja.journaliserTache({ projetId: t.projet_id, key: `rv:${t.id}`, statut: 'terminé', description: t.titre, username: 'rattrapage', responsable: t.responsable, date: t.created_at, notesRef: { kind: 'revue', id: t.id } });
    await catApres('Tâches issues des revues de projets');
    await catAvant('Tâches du planning (Gantt)');
    for (const t of (await pool.query(`SELECT id, projet_id, titre, responsable_username, COALESCE(date_fin::timestamp, date_creation) AS d FROM projets.projet_taches WHERE statut IN ('terminé','terminee','terminée')`)).rows)
        await ja.journaliserTache({ projetId: t.projet_id, key: `pt:${t.id}`, statut: 'terminé', description: t.titre, username: 'rattrapage', responsable: t.responsable_username, date: t.d });
    await catApres('Tâches du planning (Gantt)');
    const apres = { revue: await count('revue_commentaire'), taches: await count('tache_terminee') };
    console.log(`Annotations de revue créées : ${apres.revue - avant.revue} (sur ${revues.length} annotations)`);
    console.log(`Tâches terminées créées : ${apres.taches - avant.taches}`);
    for (const [k, v] of Object.entries(cat)) console.log(`  - ${k} : ${v}`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
