'use strict';

/**
 * Déduplication de hub_deploiements.fiches — niveau "métier".
 *
 * Deux fiches sont considérées comme un doublon si elles partagent la même
 * clé métier ci-dessous (les champs purement techniques — id, created_at,
 * source, chemins de fichier, site/installateur — sont ignorés pour la
 * comparaison). On conserve la fiche au plus petit id (la plus ancienne)
 * de chaque groupe et on supprime les autres.
 *
 * Lance avec --dry-run pour simuler sans rien supprimer.
 * Usage : node scripts/dedup_deploiements.js [--dry-run]
 */

const { pool } = require('../shared/pg_db');

const KEY_COLS = [
  'date_deploiement', 'beneficiaire', 'direction', 'service',
  'uc_nouveau_num', 'uc_nouveau_serie',
  'ecran1_nouveau_serie', 'ecran2_nouveau_serie', 'autre_designation',
  'materiel_type', 'type_operation',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== MODE DRY-RUN (aucune suppression) ===\n');

  const keyExpr = KEY_COLS.map((c) => `COALESCE(${c}::text, '~')`).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = (await client.query('SELECT COUNT(*)::int n FROM hub_deploiements.fiches')).rows[0].n;

    // ids à supprimer : tous sauf le plus petit id de chaque groupe de doublons
    const toDeleteRes = await client.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY ${keyExpr}
          ORDER BY id ASC
        ) AS rn
        FROM hub_deploiements.fiches
      )
      SELECT id FROM ranked WHERE rn > 1
    `);
    const ids = toDeleteRes.rows.map((r) => r.id);
    console.log(`Fiches totales        : ${before}`);
    console.log(`Doublons à supprimer  : ${ids.length}`);
    console.log(`Fiches après dédup    : ${before - ids.length}`);

    if (ids.length > 0 && !dryRun) {
      const del = await client.query(
        'DELETE FROM hub_deploiements.fiches WHERE id = ANY($1::int[])',
        [ids]
      );
      console.log(`\nSupprimées            : ${del.rowCount}`);
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n=== DRY-RUN — ROLLBACK, rien de modifié ===');
    } else {
      await client.query('COMMIT');
      console.log('\n=== COMMIT effectué ===');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[FATAL]', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
