'use strict';

/**
 * Déduplication "intelligente" de hub_deploiements.fiches avec FUSION.
 *
 * Un même déploiement est souvent saisi deux fois : une fiche riche (source
 * deploy_excel : n° UC, type) et une fiche partielle (source fiches :
 * installateur), parfois à quelques jours d'écart et avec une direction /
 * un type d'opération légèrement différents.
 *
 * Stratégie :
 *  1. Regrouper par bénéficiaire NORMALISÉ (casse/accents/ponctuation ignorés)
 *     puis clusteriser par fenêtre temporelle (WINDOW_DAYS).
 *  2. Dans un cluster, sous-grouper par n° UC :
 *       - chaque n° UC distinct = un déploiement réel → conservé séparément ;
 *       - les fiches SANS UC (fragments) ne sont rattachées que s'il y a
 *         exactement UN n° UC dans le cluster, ou AUCUN (toutes fragments) ;
 *       - s'il y a PLUSIEURS n° UC distincts, les fiches sans UC sont laissées
 *         intactes (ambigu, on ne risque pas une fausse fusion).
 *  3. Pour chaque sous-groupe de >1 fiche : on garde la fiche la plus complète
 *     (puis plus petit id), on COMBLE ses champs vides avec ceux des autres,
 *     et on supprime les autres.
 *
 * Usage : node scripts/dedup_deploiements_fuzzy.js [--dry-run]
 */

const { pool } = require('../shared/pg_db');

const WINDOW_DAYS = 5;

// Colonnes de données (tout sauf id / created_at). Remplies par fusion.
const DATA_COLS = [
  'fichier', 'fichier_lie', 'date_deploiement', 'beneficiaire', 'direction',
  'service', 'site', 'installateur', 'type_operation',
  'uc_nouveau_num', 'uc_nouveau_serie', 'uc_nouveau_modele',
  'uc_recupere_num', 'uc_recupere_serie', 'uc_recupere_modele',
  'ecran1_nouveau_num', 'ecran1_nouveau_serie', 'ecran1_nouveau_modele',
  'ecran1_recupere_num', 'ecran1_recupere_serie', 'ecran1_recupere_modele',
  'ecran2_nouveau_serie', 'ecran2_nouveau_modele', 'autre_designation',
  'source', 'quantite', 'materiel_type', 'annee_materiel', 'neuf_reco',
  'type_flux', 'est_ordi', 'materiel_refs', 'glpi_document_id',
];

function normBenef(v) {
  if (!v) return '';
  return String(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmpty(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') { const s = val.trim(); return s === '' || s === '—'; }
  return false;
}

// Nb de champs non vides → mesure de "complétude"
function completeness(row) {
  let n = 0;
  for (const c of DATA_COLS) if (!isEmpty(row[c])) n++;
  return n;
}

// Construit les sous-groupes fusionnables d'un cluster (cf. règle ci-dessus).
// Retourne un tableau de groupes (chaque groupe = tableau de rows).
function buildMergeGroups(cluster) {
  const byUc = new Map();        // uc_nouveau_num -> [rows]
  const noUc = [];               // rows sans uc_nouveau_num
  for (const r of cluster) {
    const uc = isEmpty(r.uc_nouveau_num) ? null : r.uc_nouveau_num.trim();
    if (uc) {
      if (!byUc.has(uc)) byUc.set(uc, []);
      byUc.get(uc).push(r);
    } else {
      noUc.push(r);
    }
  }

  const groups = [];
  if (byUc.size === 1) {
    // un seul UC : les fragments sans UC s'y rattachent
    const only = [...byUc.values()][0];
    groups.push([...only, ...noUc]);
  } else if (byUc.size === 0) {
    // aucun UC : toutes les fiches sont fragments du même événement
    if (noUc.length) groups.push(noUc);
  } else {
    // plusieurs UC distincts : chaque UC = un déploiement (fusion des exacts
    // doublons du même UC) ; les fiches sans UC restent intactes (ambigu).
    for (const rows of byUc.values()) groups.push(rows);
  }
  return groups.filter((g) => g.length > 1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== MODE DRY-RUN (aucune modification) ===\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rows = (await client.query(`
      SELECT * FROM hub_deploiements.fiches
      WHERE beneficiaire IS NOT NULL AND date_deploiement IS NOT NULL
      ORDER BY beneficiaire, date_deploiement
    `)).rows;

    // Grouper par bénéficiaire normalisé
    const byBenef = new Map();
    for (const r of rows) {
      const k = normBenef(r.beneficiaire);
      if (!k) continue;
      if (!byBenef.has(k)) byBenef.set(k, []);
      byBenef.get(k).push(r);
    }

    const mergePlans = []; // { survivor, victims, mergedUpdates }
    for (const [, list] of byBenef) {
      list.sort((a, b) => new Date(a.date_deploiement) - new Date(b.date_deploiement));
      // clusteriser par fenêtre temporelle
      let i = 0;
      while (i < list.length) {
        const cluster = [list[i]];
        let j = i + 1;
        while (j < list.length) {
          const dPrev = new Date(cluster[cluster.length - 1].date_deploiement);
          const dCur = new Date(list[j].date_deploiement);
          if (Math.abs(dCur - dPrev) / 86400000 <= WINDOW_DAYS) { cluster.push(list[j]); j++; }
          else break;
        }
        if (cluster.length > 1) {
          for (const grp of buildMergeGroups(cluster)) {
            // survivant = plus complet, puis plus petit id
            grp.sort((a, b) => completeness(b) - completeness(a) || a.id - b.id);
            const survivor = grp[0];
            const victims = grp.slice(1);
            // combler les champs vides du survivant
            const updates = {};
            for (const c of DATA_COLS) {
              if (!isEmpty(survivor[c])) continue;
              for (const v of victims) {
                if (!isEmpty(v[c])) { updates[c] = v[c]; break; }
              }
            }
            mergePlans.push({ survivor, victims, updates });
          }
        }
        i = j;
      }
    }

    const totalVictims = mergePlans.reduce((a, p) => a + p.victims.length, 0);
    const totalFilled = mergePlans.reduce((a, p) => a + Object.keys(p.updates).length, 0);
    const before = rows.length;
    console.log(`Fenêtre temporelle            : ${WINDOW_DAYS} jours`);
    console.log(`Groupes de fusion             : ${mergePlans.length}`);
    console.log(`Fiches supprimées (fusionnées): ${totalVictims}`);
    console.log(`Champs comblés sur survivants : ${totalFilled}`);
    console.log(`Fiches (avec date+bénéf) avant: ${before} → après: ${before - totalVictims}`);

    // Échantillons
    console.log('\n===== ÉCHANTILLONS DE FUSION =====');
    for (const p of mergePlans.slice(0, 20)) {
      const d = new Date(p.survivor.date_deploiement).toISOString().slice(0, 10);
      console.log(`\n• ${p.survivor.beneficiaire} (${d})  survivant id=${p.survivor.id}`);
      console.log(`    victimes: ${p.victims.map((v) => v.id).join(', ')}`);
      if (Object.keys(p.updates).length)
        console.log(`    comblé: ${Object.entries(p.updates).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
    }

    if (!dryRun) {
      for (const p of mergePlans) {
        if (Object.keys(p.updates).length) {
          const cols = Object.keys(p.updates);
          const set = cols.map((c, k) => `${c} = $${k + 1}`).join(', ');
          await client.query(
            `UPDATE hub_deploiements.fiches SET ${set} WHERE id = $${cols.length + 1}`,
            [...cols.map((c) => p.updates[c]), p.survivor.id]
          );
        }
        const ids = p.victims.map((v) => v.id);
        if (ids.length) await client.query('DELETE FROM hub_deploiements.fiches WHERE id = ANY($1::int[])', [ids]);
      }
      await client.query('COMMIT');
      console.log('\n=== COMMIT effectué ===');
    } else {
      await client.query('ROLLBACK');
      console.log('\n=== DRY-RUN — ROLLBACK, rien de modifié ===');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[FATAL]', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
