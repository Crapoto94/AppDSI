#!/usr/bin/env node

/**
 * Script pour générer des images illustratives des désignations d'imprimantes
 * Usage: node download-designation-images.js
 */

const path = require('path');
const fs = require('fs');
const { pool } = require('./shared/pg_db');

const imagesDir = path.join(__dirname, '../frontend/public/images/designations');

// Créer le dossier s'il n'existe pas
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log(`[Images] Dossier créé: ${imagesDir}`);
}

async function getUniqueDesignations() {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT DISTINCT designation FROM hub_consommables.consumable_catalog
      WHERE designation IS NOT NULL AND designation != ''
      ORDER BY designation
    `);
    client.release();
    return result.rows.map(row => row.designation);
  } catch (error) {
    console.error('[Images] Erreur lors de la récupération des désignations:', error.message);
    return [];
  }
}

function getBrandColor(brand) {
  const colors = {
    'brother': '#003a6f',
    'hp': '#01a982',
    'canon': '#d72d2d',
    'xerox': '#ee7d00',
    'samsung': '#1428a0',
    'lexmark': '#e41828'
  };
  return colors[brand.toLowerCase()] || '#666666';
}

function createBrandSVG(designation, brand) {
  const color = getBrandColor(brand);
  const shortBrand = brand.substring(0, 3).toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="white"/>
  <circle cx="100" cy="100" r="95" fill="${color}" opacity="0.1" stroke="${color}" stroke-width="2"/>
  <text x="100" y="70" font-size="32" font-weight="bold" text-anchor="middle" fill="${color}" font-family="Arial, sans-serif">
    ${shortBrand}
  </text>
  <text x="100" y="130" font-size="14" text-anchor="middle" fill="#666" font-family="Arial, sans-serif" dominant-baseline="middle">
    ${brand}
  </text>
</svg>`;
}

async function createDesignationImage(designation) {
  try {
    const safeFilename = designation
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50) + '.svg';

    const filepath = path.join(imagesDir, safeFilename);

    // Vérifier si l'image existe déjà
    if (fs.existsSync(filepath)) {
      console.log(`  ✓ Image existante: ${safeFilename}`);
      return { success: true, filename: safeFilename, cached: true };
    }

    console.log(`  → Création d'image pour: "${designation}"`);

    // Extraire la marque
    const brands = ['Brother', 'HP', 'Canon', 'Xerox', 'Samsung', 'Lexmark'];
    const brand = brands.find(b => designation.toUpperCase().includes(b.toUpperCase())) || 'Printer';

    // Générer l'image SVG
    const svg = createBrandSVG(designation, brand);
    fs.writeFileSync(filepath, svg);

    console.log(`  ✓ Image créée: ${safeFilename}`);
    return { success: true, filename: safeFilename };

  } catch (error) {
    console.error(`  ✗ Erreur: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

async function saveToDatabase(designation, filename) {
  try {
    const client = await pool.connect();
    const imagePath = `/images/designations/${filename}`;

    await client.query(`
      INSERT INTO hub_consommables.designation_images (designation, image_path)
      VALUES ($1, $2)
      ON CONFLICT (designation) DO UPDATE SET
        image_path = $2,
        updated_at = CURRENT_TIMESTAMP
    `, [designation, imagePath]);

    client.release();
    return true;
  } catch (error) {
    console.error(`  ✗ Erreur BD: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📥 TÉLÉCHARGEMENT DES IMAGES DE DÉSIGNATIONS');
  console.log('='.repeat(60));

  try {
    const designations = await getUniqueDesignations();
    console.log(`\n[Images] ${designations.length} désignations trouvées\n`);

    if (designations.length === 0) {
      console.log('❌ Aucune désignation trouvée');
      process.exit(0);
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const designation of designations) {
      const idx = designations.indexOf(designation) + 1;
      console.log(`[${idx}/${designations.length}] ${designation}`);

      const result = await createDesignationImage(designation);

      if (result.cached) {
        skippedCount++;
      } else if (result.success) {
        successCount++;
        await saveToDatabase(designation, result.filename);
      } else {
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ TRAITEMENT TERMINÉ');
    console.log('='.repeat(60));
    console.log(`  Créées: ${successCount}`);
    console.log(`  Existantes: ${skippedCount}`);
    console.log(`  Erreurs: ${failedCount}`);
    console.log(`  Total: ${designations.length}`);
    console.log('\n💡 Images SVG créées et enregistrées dans:');
    console.log(`   ${imagesDir}`);
    console.log('   Accessible via: /images/designations/[designation].svg');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERREUR');
    console.error('='.repeat(60));
    console.error(error.message);
    console.error('='.repeat(60) + '\n');
    process.exit(1);
  } finally {
    pool.end();
  }
}

main();
