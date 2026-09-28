// Seed ponctuel : insère methode-vibecoding.md comme premier document de la
// rubrique VibeCoding. Script local (pas une migration versionnée) car il lit
// un fichier hors du repo — a vocation a etre lance une fois, manuellement.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

const SOURCE_PATH = process.argv[2] || 'C:\\dev\\VibeCoding\\methode-vibecoding.md';
const TITLE = 'Méthode Vibecoding — Bonnes pratiques réutilisables';
const CREATED_BY = 'Marc Chevalier';

async function run() {
  try {
    const content = fs.readFileSync(path.resolve(SOURCE_PATH), 'utf-8');

    const existing = await pool.query(
      `SELECT id FROM hub.vibecoding_docs WHERE title = $1`,
      [TITLE]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE hub.vibecoding_docs SET content = $1, updated_at = NOW() WHERE id = $2`,
        [content, existing.rows[0].id]
      );
      console.log(`✅ Document mis à jour (id ${existing.rows[0].id})`);
    } else {
      const result = await pool.query(`
        INSERT INTO hub.vibecoding_docs (title, content, sort_order, created_by, created_at, updated_at)
        VALUES ($1, $2, 1, $3, NOW(), NOW())
        RETURNING id
      `, [TITLE, content, CREATED_BY]);
      console.log(`✅ Document créé (id ${result.rows[0].id})`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

run();
