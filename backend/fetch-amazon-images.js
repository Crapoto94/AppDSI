#!/usr/bin/env node

/**
 * Script pour télécharger les images des imprimantes depuis Amazon
 * Usage: node fetch-amazon-images.js
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { pool } = require('./shared/pg_db');

const imagesDir = path.join(__dirname, '../frontend/public/images/designations');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
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
    console.error('[Images] Erreur:', error.message);
    return [];
  }
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filepath);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(filepath, () => {});
        downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlink(filepath, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    });

    req.on('error', (err) => {
      file.close();
      fs.unlink(filepath, () => {});
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      file.close();
      fs.unlink(filepath, () => {});
      reject(new Error('Timeout'));
    });
  });
}

async function searchAmazonImage(designation) {
  try {
    // Extraire le modèle principal
    const modelName = designation.split(',')[0].split('(')[0].trim();

    // Construire une requête Amazon Search
    const searchTerm = encodeURIComponent(`${modelName} printer`);
    const amazonUrl = `https://www.amazon.com/s?k=${searchTerm}&ref=nb_sb_noss`;

    console.log(`  🔍 Recherche: ${modelName}`);

    // Essayer de récupérer via DuckDuckGo Image API (gratuit, pas de blocage)
    const ddgUrl = `https://duckduckgo.com/?q=${searchTerm}+printer+transparent&iax=images&ia=images`;

    // Retourner l'URL de recherche (manuelle)
    return {
      amazonUrl,
      ddgUrl,
      searchTerm: modelName
    };

  } catch (error) {
    return null;
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
  console.log('\n' + '='.repeat(70));
  console.log('📥 TÉLÉCHARGEMENT DES IMAGES D\'IMPRIMANTES DEPUIS AMAZON');
  console.log('='.repeat(70));

  try {
    const designations = await getUniqueDesignations();
    console.log(`\n[Images] ${designations.length} désignations trouvées\n`);

    const results = [];

    for (const designation of designations) {
      const idx = designations.indexOf(designation) + 1;
      process.stdout.write(`[${idx}/${designations.length}] ${designation.substring(0, 50)}`);

      const searchResult = await searchAmazonImage(designation);

      if (searchResult) {
        results.push({
          designation,
          ...searchResult
        });
        console.log(' ✓');
      } else {
        console.log(' ✗');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(70));
    console.log('📋 LIENS AMAZON ET DUCKDUCKGO POUR TÉLÉCHARGEMENT MANUEL');
    console.log('='.repeat(70));
    console.log('\n💡 Ouvrez ces liens et téléchargez les images (format PNG/JPG):\n');

    results.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.designation}`);
      console.log(`   Amazon:     ${item.amazonUrl}`);
      console.log(`   DuckDuckGo: ${item.ddgUrl}`);
      console.log();
    });

    console.log('='.repeat(70));
    console.log('📤 APRÈS TÉLÉCHARGEMENT');
    console.log('='.repeat(70));
    console.log('\n1. Sauvegardez les images en PNG (format: nom_designation.png)');
    console.log('2. Allez à l\'onglet "Images" dans l\'interface admin');
    console.log('3. Sélectionnez la désignation et uploadez l\'image');
    console.log('\n✅ Les images seront automatiquement sauvegardées et affichées\n');
    console.log('='.repeat(70) + '\n');

    // Créer un fichier de liste pour références
    const listFile = path.join(__dirname, 'image-download-list.txt');
    let listContent = 'LISTE DES IMAGES À TÉLÉCHARGER\n';
    listContent += '='.repeat(70) + '\n\n';

    results.forEach((item) => {
      listContent += `${item.designation}\n`;
      listContent += `Amazon: ${item.amazonUrl}\n`;
      listContent += `DuckDuckGo: ${item.ddgUrl}\n`;
      listContent += '\n';
    });

    fs.writeFileSync(listFile, listContent);
    console.log(`✓ Liste sauvegardée dans: image-download-list.txt\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERREUR');
    console.error('='.repeat(70));
    console.error(error.message);
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  } finally {
    pool.end();
  }
}

main();
