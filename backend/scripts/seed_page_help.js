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
  '/tickets':                'GUIDE-TECHNICIEN-TICKETS.md',
  '/tickets/stats':          'GUIDE-STATISTIQUES-TICKETS.md',
  '/tickets/admin':          'GUIDE-ADMIN-TICKETS.md',
  '/transcriptmanager':      'GUIDE-TRANSCRIPT-MANAGER.md',
  '/stocks':                 'GUIDE-STOCKS.md',
  '/prets':                  'GUIDE-STOCKS.md',
  '/consommables':           'GUIDE-CONSOMMABLES.md',
  '/contrats':               'GUIDE-CONTRATS.md',
  '/copieurs':               'GUIDE-COPIEURS.md',
  '/documents':              'GUIDE-DOCUMENTS.md',
  '/telecom':                'GUIDE-TELECOM.md',
  '/rencontres-budgetaires': 'GUIDE-RENCONTRES-BUDGETAIRES.md',
  '/portefeuille-projets':   'GUIDE-PORTEFEUILLE-PROJETS.md',
  '/revue-de-projets':       'GUIDE-PORTEFEUILLE-PROJETS.md',
  '/planning-general':       'GUIDE-PORTEFEUILLE-PROJETS.md',
  '/projets-log':            'GUIDE-PORTEFEUILLE-PROJETS.md',
  '/certif':                 'GUIDE-CERTIFICATS.md',
  '/calendrier-dsi':         'GUIDE-CALENDRIER-DSI.md',
  '/budget':                 'GUIDE-BUDGET.md',
  '/tiers':                  'GUIDE-BUDGET.md',
  '/doctrines':              'GUIDE-DOCTRINES.md',
  '/reseau':                 'GUIDE-RESEAU.md',
  '/mes-reunions':           'GUIDE-REUNIONS.md',
  '/admin/magapp':           'GUIDE-MAGAPP.md',
  '/mes-taches':             'GUIDE-TACHES.md',
  '/parc':                   'GUIDE-PARC.md',
  '/rh':                     'GUIDE-RH.md',
  '/vols':                   'GUIDE-VOLS.md',
  '/admin/param-ville':      'GUIDE-PARAM-VILLE.md',
  '/boites-partagees':       'GUIDE-BOITES-PARTAGEES.md',
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
