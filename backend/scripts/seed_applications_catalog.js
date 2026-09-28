// Seed ponctuel : importe le catalogue d'applications depuis un export JSON
// du fichier Recapitulatif_Applications.xlsx (feuille "Applications").
// Script local (pas une migration versionnee), a lancer une fois.
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

const SOURCE_PATH = process.argv[2] || 'C:\\dev\\VibeCoding\\applications_seed.json';

// Correspondance nom affiche -> username AD reel, pour que le proprietaire
// puisse editer/supprimer sa fiche une fois connecte.
const AGENT_USERNAMES = {
  'Marc Chevalier': 'MaChevalier',
  'POILEVET Pierre': 'ppoilevet',
};

function clean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  const s = String(v).trim();
  return s.length === 0 || s.toLowerCase() === 'nan' ? null : s;
}

async function run() {
  const raw = fs.readFileSync(path.resolve(SOURCE_PATH), 'utf-8');
  const rows = JSON.parse(raw);

  let created = 0, skipped = 0;

  for (const row of rows) {
    const nom = clean(row['Application']);
    if (!nom) { skipped++; continue; }

    const agent = clean(row['Agent']) || clean(row['Owner']) || 'Inconnu';
    const createdBy = AGENT_USERNAMES[agent] || AGENT_USERNAMES[clean(row['Owner'])] || 'MaChevalier';

    const existing = await pool.query(
      `SELECT id FROM hub.applications_catalog WHERE nom = $1 AND agent = $2`,
      [nom, agent]
    );
    if (existing.rows.length > 0) { skipped++; continue; }

    const complexiteRaw = row['Complexite (1-10)'];
    const complexite = (complexiteRaw === null || complexiteRaw === undefined || Number.isNaN(complexiteRaw))
      ? null : parseInt(complexiteRaw, 10);

    await pool.query(`
      INSERT INTO hub.applications_catalog (
        nom, agent, dossier, nature, version, repo_github, ports_docker,
        objectif, modules_fonctions, techno_stack, base_donnees,
        dependances_integrations, ia_embarquee, variables_env, complexite,
        justification_complexite, swagger_doc, etat, lien_prod,
        created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, NOW(), NOW()
      )
    `, [
      nom, agent,
      clean(row['Dossier']), clean(row['Nature']), clean(row['Version']),
      clean(row['Repo GitHub']), clean(row['Ports Docker (host:container)']),
      clean(row["Objectif / ce que fait l'application"]), clean(row['Modules & fonctions cles']),
      clean(row['Techno / stack']), clean(row['Base de donnees']),
      clean(row['Dependances / integrations externes']), clean(row['IA embarquee']),
      clean(row["Variables d'env / cles API (noms)"]), complexite,
      clean(row['Justification complexite']), clean(row['Swagger & documentation (liens)']),
      clean(row['Etat (dev / prod / test)']), clean(row['Lien de prod (URL)']),
      createdBy
    ]);
    created++;
  }

  console.log(`✅ ${created} application(s) créée(s), ${skipped} ignorée(s) (déjà présentes ou sans nom)`);
  process.exit(0);
}

run().catch(error => {
  console.error('❌ Seed failed:', error.message);
  process.exit(1);
});
