/**
 * Rattrapage : date_solved des tickets résolus dans l'application.
 *
 * Contexte
 * --------
 * hub_tickets.tickets.date_solved est un `timestamp without time zone` qui doit
 * contenir l'HEURE DE PARIS (convention GLPI / toParisSql). Or `ticketService.setSolution`
 * y écrivait `new Date().toISOString()` — un instant UTC brut. Résultat : la date de
 * résolution était enregistrée 1 h trop tôt l'hiver (2 h l'été) par rapport à
 * l'événement d'historique « solved » (lui en timestamptz, donc exact).
 *
 * Exemple : ticket #45884 résolu le 2026-11-13 à 14:39 (Paris) → historisé à 13:39 UTC,
 * mais date_solved stocké « 12:39:37 » au lieu de « 14:39:37 ».
 *
 * Critère de sélection (sans toucher aux tickets synchronisés depuis GLPI, dont la
 * date_solved est déjà en heure de Paris) :
 *   - il existe un événement d'historique action = 'solved' ;
 *   - date_solved est <= cet événement (une valeur UTC brute est toujours antérieure
 *     à l'instant réel, alors qu'une valeur Paris correcte lui est postérieure de 1 à 2 h) ;
 *   - l'écart est inférieur à 3 h (on exclut les tickets dont l'historique a été
 *     réécrit bien plus tard, ex. #3861).
 *
 * Correction : date_solved = historique.created_at AT TIME ZONE 'Europe/Paris'.
 *
 * Usage :
 *   node scripts/backfill_solved_dates_paris.js            # dry-run
 *   node scripts/backfill_solved_dates_paris.js --execute  # écriture réelle
 */

const { pool } = require('../shared/database');

const isExecute = process.argv.includes('--execute');

const SELECT_SQL = `
    WITH hist AS (
        SELECT ticket_id, MAX(created_at) AS h
        FROM hub_tickets.ticket_history
        WHERE action = 'solved'
        GROUP BY ticket_id
    )
    SELECT t.glpi_id,
           t.status,
           t.date_solved,
           h.h AS solved_history,
           (h.h AT TIME ZONE 'Europe/Paris') AS expected_date_solved,
           EXTRACT(EPOCH FROM ((h.h AT TIME ZONE 'Europe/Paris') - t.date_solved))::int AS delta_s
    FROM hub_tickets.tickets t
    JOIN hist h ON h.ticket_id = t.glpi_id
    WHERE t.date_solved IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM ((h.h AT TIME ZONE 'Europe/Paris') - t.date_solved))) > 2
      AND t.date_solved <= h.h
      AND (h.h - t.date_solved) <= interval '3 hours'
    ORDER BY t.glpi_id
`;

const UPDATE_SQL = `
    WITH hist AS (
        SELECT ticket_id, MAX(created_at) AS h
        FROM hub_tickets.ticket_history
        WHERE action = 'solved'
        GROUP BY ticket_id
    )
    UPDATE hub_tickets.tickets t
       SET date_solved = (h.h AT TIME ZONE 'Europe/Paris')
      FROM hist h
     WHERE h.ticket_id = t.glpi_id
       AND t.date_solved IS NOT NULL
       AND ABS(EXTRACT(EPOCH FROM ((h.h AT TIME ZONE 'Europe/Paris') - t.date_solved))) > 2
       AND t.date_solved <= h.h
       AND (h.h - t.date_solved) <= interval '3 hours'
    RETURNING t.glpi_id, t.date_solved
`;

async function main() {
    console.log(isExecute
        ? '=== MODE EXÉCUTION (écriture réelle) ==='
        : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const { rows } = await pool.query(SELECT_SQL);
    console.log(`Tickets à corriger : ${rows.length}`);

    for (const r of rows.slice(0, 20)) {
        console.log(
            `  #${r.glpi_id} (statut ${r.status}) : ${r.date_solved.toISOString()} → ${r.expected_date_solved.toISOString()} (delta ${r.delta_s} s)`
        );
    }
    if (rows.length > 20) console.log(`  … et ${rows.length - 20} autre(s)`);

    if (!isExecute) {
        console.log('\nAucune écriture effectuée. Relancer avec --execute pour appliquer.');
        await pool.end();
        return;
    }

    if (rows.length === 0) {
        console.log('Rien à corriger.');
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const res = await client.query(UPDATE_SQL);
        await client.query('COMMIT');
        console.log(`\n${res.rowCount} ticket(s) corrigé(s).`);
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    const check = await pool.query(SELECT_SQL);
    console.log(`Contrôle post-correction : ${check.rows.length} ticket(s) restant(s) à corriger.`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('Erreur :', e.message);
    try { await pool.end(); } catch (_) { /* ignore */ }
    process.exit(1);
});
