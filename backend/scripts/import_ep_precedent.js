// ─── Reprise des EP de l'année précédente ──────────────────────────────────────
// Importe (missions, objectifs du service, objectifs individuels) dans hub_entretiens.reprise_ep.
// Ces valeurs sont ensuite PROPOSÉES PAR DÉFAUT : objectifs dans la préparation de l'agent, missions et rappel
// des objectifs du service dans le compte rendu de l'évaluateur.
//
// Les données sont nominatives : le fichier source se trouve dans le dossier local EP/ (ignoré par git, jamais poussé).
// Idempotent : relancer met à jour les lignes existantes (clé : nom + prénom + année).
//
//   Usage :  node backend/scripts/import_ep_precedent.js [fichier.json] [annee_source]
//   Défaut : EP/extraction.json, année 2025
//
// Format du fichier : { "agents": [ { nom, prenom, service, fonction, missions,
//                                     objectifs_service: [texte…], objectifs: [{ descriptif, moyens }] } ] }
const fs = require('fs');
const path = require('path');
const { pool } = require('../shared/database');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'EP', 'extraction.json'));
const annee = parseInt(process.argv[3], 10) || 2025;

const tokenKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');

(async () => {
    if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const agents = Array.isArray(data.agents) ? data.agents : [];
    // Même DDL que setupPgDb (shared/pg_db.js) : le script peut tourner avant le démarrage du backend.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS hub_entretiens`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hub_entretiens.reprise_ep (
          id SERIAL PRIMARY KEY,
          nom_key TEXT NOT NULL,
          nom_famille_key TEXT NOT NULL,
          nom TEXT NOT NULL,
          prenom TEXT DEFAULT '',
          annee_source INTEGER NOT NULL DEFAULT 0,
          fonction TEXT DEFAULT '',
          service TEXT DEFAULT '',
          missions TEXT DEFAULT '',
          objectifs_service TEXT DEFAULT '',
          objectifs JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (nom_key, annee_source)
        )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ep_reprise_famille ON hub_entretiens.reprise_ep(nom_famille_key)`);
    let n = 0;
    for (const a of agents) {
        const objectifsService = (a.objectifs_service || []).map(t => `- ${String(t).trim()}`).join('\n');
        const objectifs = (a.objectifs || [])
            .map(o => ({ descriptif: String(o.descriptif || '').trim(), moyens: String(o.moyens || '').trim() }))
            .filter(o => o.descriptif);
        await pool.query(
            `INSERT INTO hub_entretiens.reprise_ep
               (nom_key, nom_famille_key, nom, prenom, annee_source, fonction, service, missions, objectifs_service, objectifs)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
             ON CONFLICT (nom_key, annee_source) DO UPDATE SET
               nom_famille_key = EXCLUDED.nom_famille_key, nom = EXCLUDED.nom, prenom = EXCLUDED.prenom,
               fonction = EXCLUDED.fonction, service = EXCLUDED.service, missions = EXCLUDED.missions,
               objectifs_service = EXCLUDED.objectifs_service, objectifs = EXCLUDED.objectifs, updated_at = NOW()`,
            [tokenKey(`${a.prenom} ${a.nom}`), tokenKey(a.nom), a.nom, a.prenom || '', annee, a.fonction || '', a.service || '',
             a.missions || '', objectifsService, JSON.stringify(objectifs)]
        );
        n++;
    }
    console.log(`${n} EP ${annee} importé(s) dans hub_entretiens.reprise_ep`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
