'use strict';

/**
 * Script d'import : complète hub_deploiements.fiches à partir de hub_parc.items
 *
 * Logique :
 *  - Récupère tous les équipements avec use_date >= 2025.
 *  - Apparie écrans/périphériques aux ordinateurs par contact + contact_num
 *    (vérifie aussi les inversions).
 *  - Crée une fiche unique par groupe (ordinateur + écrans + périphériques).
 *  - Les ordinateurs sans écran/périphérique créent leur propre fiche.
 *  - Les écrans/périphériques sans ordinateur créent leur propre fiche.
 *
 * Usage : node scripts/import_deploiements_from_hub.js
 */

const { pool } = require('../shared/pg_db');

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return (s === '' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'null') ? null : s;
}

function norm(v) {
  const s = clean(v);
  return s ? s.toLowerCase().replace(/\s+/g, ' ') : '';
}

function modelKey(t) {
  const m = { Computer: 'computermodels_id', Monitor: 'monitormodels_id', Peripheral: 'peripheralmodels_id' };
  return m[t] || t.toLowerCase() + 'models_id';
}

function getModel(t, raw) { return raw ? clean(raw[modelKey(t)]) || null : null; }
function getMfr(raw) { return raw ? clean(raw.manufacturers_id) || null : null; }

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== MODE DRY-RUN ===\n');

  const client = await pool.connect();
  let inserted = 0, skipped = 0;

  try {
    await client.query('BEGIN'); // Toujours BEGIN, on ROLLBACK ou COMMIT à la fin

    // ── 1. Charger les ordinateurs déjà dans les fiches ──
    const existingInFiches = new Set();
    const exRes = await client.query(
      'SELECT uc_nouveau_num FROM hub_deploiements.fiches WHERE uc_nouveau_num IS NOT NULL'
    );
    for (const r of exRes.rows) {
      if (r.uc_nouveau_num) existingInFiches.add(r.uc_nouveau_num);
    }
    console.log(`Ordinateurs déjà dans fiches : ${existingInFiches.size}`);

    // ── 2. Charger les équipements hub_parc.items avec use_date >= 2025 ──
    const eqRes = await client.query(`
      SELECT i.name, i.serial, i.raw, i.itemtype, i.infocom, i.documents, i.glpi_id
      FROM hub_parc.items i
      WHERE i.is_deleted = false
        AND i.infocom->>'use_date' >= '2025-01-01'
        AND i.itemtype IN ('Computer', 'Monitor', 'Peripheral')
      ORDER BY i.itemtype, i.name
    `);
    console.log(`Équipements use_date>=2025 chargés : ${eqRes.rows.length}`);

    // Séparer par type
    const computers = [];
    const monitors = [];
    const peripherals = [];
    const contactToComputers = new Map(); // key: contact|contact_num → [{name, serial, ...}]

    for (const r of eqRes.rows) {
      const name = r.name;
      if (!name && r.itemtype === 'Computer') continue; // ordinateur sans nom → ignore

      const entry = {
        name: clean(name),
        serial: clean(r.serial),
        raw: r.raw,
        infocom: r.infocom || {},
        documents: r.documents,
        glpi_id: r.glpi_id,
        contact: norm(r.raw?.contact),
        contactNum: norm(r.raw?.contact_num),
        useDate: (r.infocom || {}).use_date || null,
        model: getModel(r.itemtype, r.raw),
        mfr: getMfr(r.raw),
        itemtype: r.itemtype,
      };

      if (r.itemtype === 'Computer') {
        if (!name || existingInFiches.has(name)) continue;
        computers.push(entry);
        // Indexer par contact
        if (entry.contact || entry.contactNum) {
          const key = `${entry.contact}|${entry.contactNum}`;
          if (!contactToComputers.has(key)) contactToComputers.set(key, []);
          contactToComputers.get(key).push(entry);
          // Index inversé aussi
          if (entry.contact && entry.contactNum && entry.contact !== entry.contactNum) {
            const invKey = `${entry.contactNum}|${entry.contact}`;
            if (!contactToComputers.has(invKey)) contactToComputers.set(invKey, []);
            contactToComputers.get(invKey).push(entry);
          }
        }
      } else if (r.itemtype === 'Monitor') {
        monitors.push(entry);
      } else if (r.itemtype === 'Peripheral') {
        peripherals.push(entry);
      }
    }

    console.log(`Ordinateurs à traiter : ${computers.length}`);
    console.log(`Moniteurs à traiter   : ${monitors.length}`);
    console.log(`Périphériques à traiter: ${peripherals.length}`);

    // ── 3. Grouper les écrans/périphériques par ordinateur ──
    // Associe chaque écran/périphérique à un ordinateur via le contact+contact_num
    const matchedMonitors = new Map(); // computerName -> [{name, serial, model}]
    const matchedPeripherals = new Map(); // computerName -> [{name, serial}]
    const unmatchedMonitors = [];
    const unmatchedPeripherals = [];

    function findComputer(entry) {
      const key = `${entry.contact}|${entry.contactNum}`;
      if (contactToComputers.has(key)) {
        const comps = contactToComputers.get(key);
        return comps[0]; // Prend le premier ordinateur correspondant
      }
      // Inversion : si l'un des deux champs est inversé
      if (entry.contact && entry.contactNum && entry.contact !== entry.contactNum) {
        const invKey = `${entry.contactNum}|${entry.contact}`;
        if (contactToComputers.has(invKey)) {
          const comps = contactToComputers.get(invKey);
          console.log(`  ↻ Inversion détectée: ${entry.name} contact='${entry.contact}' contact_num='${entry.contactNum}' → ordi ${comps[0].name}`);
          return comps[0];
        }
      }
      return null;
    }

    for (const m of monitors) {
      const comp = findComputer(m);
      if (comp) {
        if (!matchedMonitors.has(comp.name)) matchedMonitors.set(comp.name, []);
        matchedMonitors.get(comp.name).push(m);
      } else {
        unmatchedMonitors.push(m);
      }
    }

    for (const p of peripherals) {
      const comp = findComputer(p);
      if (comp) {
        if (!matchedPeripherals.has(comp.name)) matchedPeripherals.set(comp.name, []);
        matchedPeripherals.get(comp.name).push(p);
      } else {
        unmatchedPeripherals.push(p);
      }
    }

    console.log(`Écrans appariés : ${[...matchedMonitors.values()].reduce((a, b) => a + b.length, 0)}`);
    console.log(`Périphériques appariés : ${[...matchedPeripherals.values()].reduce((a, b) => a + b.length, 0)}`);
    console.log(`Écrans non appariés : ${unmatchedMonitors.length}`);
    console.log(`Périphériques non appariés : ${unmatchedPeripherals.length}`);

    // ── 4. Insérer les fiches ──
    console.log('\n--- Insertion ---');

    // 4a. Ordinateurs (avec leurs écrans/périphériques appariés)
    for (const comp of computers) {
      const name = comp.name;
      const contact = clean(comp.raw?.contact);
      const useDate = comp.useDate;
      const year = useDate ? useDate.substring(0, 4) : '2025';
      const serial = comp.serial;
      const model = comp.model;

      // Chemin fichier à partir du 1er document GLPI
      let fichier = null;
      if (comp.documents && Array.isArray(comp.documents) && comp.documents.length > 0) {
        const doc = comp.documents[0];
        if (doc.filename) {
          fichier = `${year}\\${doc.filename}`;
        }
      }

      // Écrans appariés
      const ecrans = matchedMonitors.get(name) || [];
      const ecran1 = ecrans[0] || null;
      const ecran2 = ecrans[1] || null;
      const ecranExtra = ecrans.slice(2);

      // Périphériques appariés
      const periphs = matchedPeripherals.get(name) || [];

      // Construire autre_designation
      const extras = [];
      for (const e of ecranExtra) {
        extras.push(`Écran: ${e.name} (${e.serial || '?'})`);
      }
      for (const p of periphs) {
        extras.push(`Périph: ${p.name} (${p.serial || '?'})`);
      }
      const autreDesignation = extras.length > 0 ? extras.join(' ; ') : null;

      try {
        await client.query(`
          INSERT INTO hub_deploiements.fiches
            (source, date_deploiement, beneficiaire,
             uc_nouveau_num, uc_nouveau_serie, uc_nouveau_modele,
             ecran1_nouveau_num, ecran1_nouveau_serie, ecran1_nouveau_modele,
             ecran2_nouveau_serie, ecran2_nouveau_modele,
             autre_designation,
             fichier, type_operation, est_ordi)
          VALUES
            ('hub_auto', $1, $2,
             $3, $4, $5,
             $6, $7, $8,
             $9, $10,
             $11,
             $12, 'Installation nouveau matériel', true)
        `, [
          useDate,
          contact || name,
          name, serial, model,
          ecran1 ? ecran1.name : null,
          ecran1 ? ecran1.serial : null,
          ecran1 ? (ecran1.model || ecran1.mfr) : null,
          ecran2 ? ecran2.serial : null,
          ecran2 ? (ecran2.model || ecran2.mfr) : null,
          autreDesignation,
          fichier,
        ]);
        inserted++;
      } catch (e) {
        console.warn(`  ⚠ Erreur insertion ${name}: ${e.message}`);
        skipped++;
      }
    }

    // 4b. Écrans non appariés → fiches autonomes
    for (const m of unmatchedMonitors) {
      const useDate = m.useDate;
      const serial = m.serial;
      const model = m.model || m.mfr;
      const contact = clean(m.raw?.contact);

      try {
        await client.query(`
          INSERT INTO hub_deploiements.fiches
            (source, date_deploiement, beneficiaire,
             ecran1_nouveau_num, ecran1_nouveau_serie, ecran1_nouveau_modele,
             type_operation, est_ordi, materiel_type, quantite)
          VALUES
            ('hub_auto', $1, $2,
             $3, $4, $5,
             'Installation nouveau matériel', false, 'ECRAN', 1)
        `, [
          useDate,
          contact || serial || m.name,
          m.name,
          serial,
          model,
        ]);
        inserted++;
      } catch (e) {
        console.warn(`  ⚠ Erreur insertion écran ${m.name || serial}: ${e.message}`);
        skipped++;
      }
    }

    // 4c. Périphériques non appariés → fiches autonomes
    for (const p of unmatchedPeripherals) {
      const useDate = p.useDate;
      const serial = p.serial;
      const contact = clean(p.raw?.contact);

      try {
        await client.query(`
          INSERT INTO hub_deploiements.fiches
            (source, date_deploiement, beneficiaire,
             autre_designation,
             type_operation, est_ordi, materiel_type, quantite)
          VALUES
            ('hub_auto', $1, $2,
             $3,
             'Installation nouveau matériel', false, 'PERIPH', 1)
        `, [
          useDate,
          contact || serial || p.name,
          `Périph: ${p.name} (${serial || '?'})`,
        ]);
        inserted++;
      } catch (e) {
        console.warn(`  ⚠ Erreur insertion périph ${p.name || serial}: ${e.message}`);
        skipped++;
      }
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n=== DRY-RUN — ROLLBACK effectué, aucune modification ===');
    } else {
      await client.query('COMMIT');
    }
    console.log('\n=== RÉSULTATS ===');
    console.log(`  Fiches insérées : ${inserted}`);
    console.log(`  Ignorées/erreurs: ${skipped}`);
    console.log(`  Total traité    : ${inserted + skipped}`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[FATAL]', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    client.release();
  }

  // Récapitulatif final
  const c2 = await pool.connect();
  try {
    const r = await c2.query("SELECT COUNT(*)::int AS n FROM hub_deploiements.fiches WHERE source = 'hub_auto'");
    console.log(`\nTotal fiches 'hub_auto' en base : ${r.rows[0].n}`);
    const r2 = await c2.query("SELECT source, COUNT(*)::int AS n FROM hub_deploiements.fiches GROUP BY source ORDER BY source");
    console.log('Répartition par source:');
    r2.rows.forEach(r => console.log(`  ${r.source}: ${r.n}`));
  } finally {
    c2.release();
    await pool.end();
  }
}

main();
