// ─── Pré-remplissage de l'aide contextuelle des pages tickets ─────────────────
// Lit les guides Markdown de docs/ et les enregistre dans hub.page_help, associés
// aux pages correspondantes. Idempotent : relancer écrase le contenu (upsert).
//
//   Usage :  node backend/scripts/seed_page_help.js
//
const fs = require('fs');
const path = require('path');
const { pool } = require('../shared/database');

// page (URL) → fichier guide
const MAP = {
  '/tickets':        'GUIDE-TECHNICIEN-TICKETS.md',
  '/tickets/stats':  'GUIDE-STATISTIQUES-TICKETS.md',
  '/tickets/admin':  'GUIDE-ADMIN-TICKETS.md',
};

(async () => {
  const docsDir = path.join(__dirname, '..', '..', 'docs');
  let mdParse;
  try { mdParse = (await import('marked')).parse; } catch (e) { mdParse = (s) => `<pre>${s}</pre>`; }

  let ok = 0;
  for (const [page, file] of Object.entries(MAP)) {
    const fp = path.join(docsDir, file);
    if (!fs.existsSync(fp)) { console.warn(`[seed-help] introuvable: ${fp} — ignoré`); continue; }
    const content = fs.readFileSync(fp, 'utf8');
    let html;
    try { html = mdParse(content); } catch (e) { html = `<pre>${content}</pre>`; }
    await pool.query(`
      INSERT INTO hub.page_help (page_path, content, content_html, created_by, updated_at)
      VALUES ($1, $2, $3, 'seed', CURRENT_TIMESTAMP)
      ON CONFLICT (page_path) DO UPDATE SET
        content = EXCLUDED.content, content_html = EXCLUDED.content_html, updated_at = CURRENT_TIMESTAMP
    `, [page, content, html]);
    console.log(`[seed-help] ${page}  ←  ${file}`);
    ok++;
  }
  console.log(`[seed-help] Terminé : ${ok} page(s) d'aide enregistrée(s).`);
  await pool.end();
  process.exit(0);
})().catch(e => { console.error('[seed-help] erreur:', e.message); process.exit(1); });
