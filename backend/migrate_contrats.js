const sqlite3 = require('sqlite3').verbose();
const { pool, setupPgDb } = require('./shared/pg_db');
const path = require('path');

async function migrate() {
  let sqliteDb = null;
  let pgClient = null;

  try {
    // Setup PostgreSQL schema and tables
    console.log('[Migration] Setting up PostgreSQL schema...');
    await setupPgDb();
    console.log('[Migration] PostgreSQL schema setup complete');

    // Open SQLite database
    sqliteDb = new sqlite3.Database(path.join(__dirname, 'data/database.sqlite'));

    // Get PostgreSQL connection
    pgClient = await pool.connect();

    console.log('[Migration] Starting SQLite to PostgreSQL migration for contrats...');

    // Read all contrats from SQLite
    const contrats = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM contrats', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`[Migration] Found ${contrats.length} contrats to migrate`);

    // Insert into PostgreSQL
    for (const contrat of contrats) {
      const values = [
        contrat.svc || '',
        contrat.objet || '',
        contrat.budget || '',
        contrat.raison_sociale || '',
        contrat.type_contrat || '',
        contrat.annee_initiale || null,
        contrat.direction || '',
        contrat.service || '',
        contrat.perimetre || '',
        contrat.nature || '',
        contrat.fonction || '',
        contrat.date_debut || null,
        contrat.duree_annees || null,
        contrat.nb_reconductions || null,
        contrat.date_fin || null,
        contrat.marche_contrat || '',
        contrat.piece || '',
        contrat.date_reconduction || '',
        contrat.reconduction || '',
        contrat.montant_2022 || null,
        contrat.montant_2023 || null,
        contrat.montant_2024 || null,
        contrat.montant_2025 || null,
        contrat.montant_2026 || null,
        contrat.prevision_2026 || null,
        contrat.prevision_2027 || null,
        contrat.prevision_2028 || null,
        contrat.commentaires || '',
        contrat.gti || '',
        contrat.gtr || '',
        contrat.penalite || '',
        contrat.indice_revision || '',
        contrat.numero_facture || '',
        contrat.statut || 'actif',
        contrat.renouvellement_statut || null,
        contrat.renouvellement_commentaire || '',
        contrat.doc_principal_path || '',
        contrat.doc_principal_nom || '',
        contrat.contrat_renouvellement_id || null
      ];

      const sql = `
        INSERT INTO hub_contrats.contrats (
          svc, objet, budget, raison_sociale, type_contrat, annee_initiale,
          direction, service, perimetre, nature, fonction,
          date_debut, duree_annees, nb_reconductions, date_fin,
          marche_contrat, piece, date_reconduction, reconduction,
          montant_2022, montant_2023, montant_2024, montant_2025, montant_2026,
          prevision_2026, prevision_2027, prevision_2028, commentaires,
          gti, gtr, penalite, indice_revision, numero_facture, statut,
          renouvellement_statut, renouvellement_commentaire,
          doc_principal_path, doc_principal_nom, contrat_renouvellement_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)
      `;

      try {
        await pgClient.query(sql, values);
      } catch (e) {
        console.error(`[Migration] Error inserting contrat ${contrat.id}:`, e.message);
      }
    }

    console.log(`[Migration] Successfully migrated ${contrats.length} contrats`);

    // Migrate contrat_documents
    const documents = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM contrat_documents', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`[Migration] Found ${documents.length} documents to migrate`);

    for (const doc of documents) {
      const docSql = `
        INSERT INTO hub_contrats.contrat_documents (contrat_id, file_path, file_name, nature, est_principal)
        VALUES ($1, $2, $3, $4, $5)
      `;

      try {
        await pgClient.query(docSql, [
          doc.contrat_id,
          doc.file_path || '',
          doc.file_name || '',
          doc.nature || '',
          doc.est_principal || 0
        ]);
      } catch (e) {
        console.error(`[Migration] Error inserting document ${doc.id}:`, e.message);
      }
    }

    console.log(`[Migration] Successfully migrated ${documents.length} documents`);
    console.log('[Migration] Migration complete!');

  } catch (error) {
    console.error('[Migration] Error:', error.message);
  } finally {
    if (pgClient) pgClient.release();
    if (sqliteDb) sqliteDb.close();
  }
}

migrate();
