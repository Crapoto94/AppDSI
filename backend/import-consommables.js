#!/usr/bin/env node

/**
 * Script d'import des données consommables depuis BONDECOMMANDE.xlsx
 * Usage: node import-consommables.js
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { pool } = require('./shared/pg_db');

const filePath = path.join(__dirname, '../BONDECOMMANDE.xlsx');

async function importConsommables() {
  let client;

  try {
    console.log('[Import] Démarrage de l\'import...');
    console.log('[Import] Fichier:', filePath);
    console.log('[Import] Existe:', fs.existsSync(filePath) ? 'Oui ✅' : 'Non ❌');

    if (!fs.existsSync(filePath)) {
      throw new Error('Fichier BONDECOMMANDE.xlsx introuvable');
    }

    // Lire le fichier Excel
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames.filter(name => name !== 'INFORMATIONS');

    console.log('[Import] Onglets trouvés:', sheetNames);

    // Connecter à PostgreSQL
    client = await pool.connect();
    console.log('[Import] Connecté à PostgreSQL ✅');

    let totalTypes = 0;
    let totalArticles = 0;

    // Pour chaque type
    for (const sheetName of sheetNames) {
      console.log(`\n[Import] Traitement: ${sheetName}`);

      // Vérifier/créer le type
      const existingType = await client.query(
        'SELECT id FROM hub_consommables.consumable_types WHERE name = $1',
        [sheetName]
      );

      let typeId;
      if (existingType.rows.length > 0) {
        typeId = existingType.rows[0].id;
        console.log(`  ├─ Type existe (ID: ${typeId})`);

        // Supprimer les request_articles qui référencent les articles de ce type
        await client.query(`
          DELETE FROM hub_consommables.request_articles
          WHERE catalog_id IN (
            SELECT id FROM hub_consommables.consumable_catalog WHERE type_id = $1
          )
        `, [typeId]);

        // Supprimer les articles existants
        await client.query(
          'DELETE FROM hub_consommables.consumable_catalog WHERE type_id = $1',
          [typeId]
        );
        console.log('  ├─ Articles supprimés');
      } else {
        const result = await client.query(
          'INSERT INTO hub_consommables.consumable_types (name, display_name) VALUES ($1, $2) RETURNING id',
          [sheetName, sheetName]
        );
        typeId = result.rows[0].id;
        totalTypes++;
        console.log(`  ├─ Type créé (ID: ${typeId})`);
      }

      // Lire les articles
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      let articlesCount = 0;

      // Log première ligne de données pour debug
      if (data.length > 1) {
        console.log(`  ├─ En-têtes (ligne 1): [${data[0].map((v, i) => `${i}:"${v}"`).join(', ')}]`);
        console.log(`  ├─ Exemple données (ligne 2): [${data[1].map((v, i) => `${i}:"${v}"`).join(', ')}]`);
      }

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // Ignorer les en-têtes (première colonne contient le nom du type ou "Code"/"Réf"/"Toner"/"Cartouche")
        const firstCol = String(row[0] || '').toLowerCase();
        const secondCol = String(row[1] || '').toLowerCase();

        if (firstCol === sheetName.toLowerCase() ||
            secondCol.includes('code') ||
            secondCol.includes('réf') ||
            secondCol.includes('toner') ||
            secondCol.includes('cartouche') ||
            secondCol.includes('nombre')) {
          continue;
        }

        const designation = row[0] ? String(row[0]).trim() : '';
        const article = row[1] ? String(row[1]).trim() : '';
        const codeFabricant = row[2] ? String(row[2]).trim() : '';
        const refCommande = row[3] ? String(row[3]).trim() : '';

        if (designation || article) {
          await client.query(
            'INSERT INTO hub_consommables.consumable_catalog (type_id, designation, article, code_fabricant, ref_commande) VALUES ($1, $2, $3, $4, $5)',
            [typeId, designation, article, codeFabricant, refCommande]
          );
          articlesCount++;
          totalArticles++;
        }
      }

      console.log(`  └─ ${articlesCount} articles importés`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ IMPORT RÉUSSI');
    console.log('='.repeat(50));
    console.log(`  Types: ${totalTypes} créés`);
    console.log(`  Articles: ${totalArticles} importés`);
    console.log(`  Total: ${totalTypes + totalArticles} éléments`);
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERREUR D\'IMPORT');
    console.error('='.repeat(50));
    console.error(error.message);
    console.error('='.repeat(50));
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    pool.end();
  }
}

// Lancer l'import
importConsommables();
