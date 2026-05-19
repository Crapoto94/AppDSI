// Réexporte la logique du endpoint /api/oracle/import-tables pour utilisation directe
// Permet à testSync et executeSyncTask d'appeler la synchro sans HTTP interne

const oracledb = require('oracledb');

function oracleDbTypeToPg(dbType) {
  if (dbType === 1) return 'VARCHAR(4000)';
  if (dbType === 2) return 'NUMERIC';
  if (dbType === 12) return 'TIMESTAMP';
  if (dbType === 96) return 'TEXT';
  if (dbType === 112) return 'BYTEA';
  return 'TEXT';
}

function parseOracleDate(val) {
  if (!val) return null;
  if (typeof val === 'object' && val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'string') return val.split(' ')[0];
  return val;
}

function parseOracleTimestamp(val) {
  if (!val) return null;
  if (typeof val === 'object' && val instanceof Date) return val.toISOString();
  return String(val);
}

async function executeOracleImport(type, db, pool, getOracleConnection) {
  let connection;
  const report = [];

  try {
    // Récupérer la config depuis SQLite
    const savedConfig = await db.all('SELECT table_name, where_clause, config_json FROM oracle_sync_config WHERE type = ?', [type]);

    if (savedConfig.length === 0) {
      return { success: false, message: `Aucune configuration trouvée pour ${type}` };
    }

    const tablesToSync = savedConfig.map(c => ({
      table_name: c.table_name,
      where_clause: c.where_clause,
      config_json: c.config_json ? JSON.parse(c.config_json) : null
    }));

    // Récupérer les settings Oracle
    const settings = await db.get('SELECT * FROM oracle_settings WHERE type = ?', [type]);
    if (!settings) {
      return { success: false, message: `Pas de connexion Oracle configurée pour ${type}` };
    }

    connection = await getOracleConnection(settings);

    // Traiter chaque table
    for (const config of tablesToSync) {
      const tableName = config.table_name;
      const mainPrefix = type.toUpperCase() === 'RH' ? '' : tableName.toUpperCase() + "_";

      try {
        const tableSettings = config.config_json || {};
        const selectedCols = tableSettings.selectedFields || [];
        const pkField = tableSettings.primaryKey || null;
        const tableSubst = tableSettings.substitutions || {};
        const tableDateFields = tableSettings.dateFields || [];

        // Récupérer les colonnes de la table Oracle
        const metaRes = await connection.execute(`SELECT * FROM ${tableName} WHERE 1=0`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const allTableColumns = metaRes.metaData.map(m => m.name);
        const columnsToImport = (selectedCols && selectedCols.length > 0) ? allTableColumns.filter(c => selectedCols.includes(c)) : allTableColumns;

        let selectParts = [];
        let joinParts = [];
        let aliasIdx = 1;
        const colSourceMap = {};

        // Construire la requête SELECT
        for (const col of columnsToImport) {
          if (tableSubst[col]) {
            const { secondaryTable, joinField, labelFields } = tableSubst[col];
            const alias = `S${aliasIdx++}`;
            const secPrefix = secondaryTable.toUpperCase() + "_";

            if (labelFields && labelFields.length > 0) {
              labelFields.forEach(f => {
                const localJoinCol = `${secPrefix}${f}`;
                selectParts.push(`NVL(CAST(${alias}."${f}" AS VARCHAR2(4000)), 'XXXXX') AS "${localJoinCol}"`);
              });
            } else {
              let localColName = `${mainPrefix}${col}`;
              if (type.toUpperCase() === 'RH') {
                if (localColName.toUpperCase().startsWith('V_EXTRACT_DSI_')) {
                  localColName = localColName.substring(14);
                } else if (localColName.toUpperCase().startsWith(tableName.toUpperCase() + '_')) {
                  localColName = localColName.substring(tableName.length + 1);
                }
              }
              selectParts.push(`T1."${col}" AS "${localColName}"`);
              colSourceMap[localColName] = col;
            }
            joinParts.push(`LEFT JOIN ${secondaryTable} ${alias} ON T1."${col}" = ${alias}."${joinField}"`);
          } else {
            let localColName = `${mainPrefix}${col}`;
            if (type.toUpperCase() === 'RH') {
              if (localColName.toUpperCase().startsWith('V_EXTRACT_DSI_')) {
                localColName = localColName.substring(14);
              } else if (localColName.toUpperCase().startsWith(tableName.toUpperCase() + '_')) {
                localColName = localColName.substring(tableName.length + 1);
              }
            }
            selectParts.push(`T1."${col}" AS "${localColName}"`);
            colSourceMap[localColName] = col;
          }
        }

        let query = `SELECT ${selectParts.join(', ')} FROM ${tableName} T1 ${joinParts.join(' ')}`;

        // Ajouter la clause WHERE
        const rawWhere = config.where_clause ? config.where_clause.trim() : "";
        const whereClause = rawWhere.replace(/"/g, "'");

        if (whereClause) {
          const hasWhere = /^where\s/i.test(whereClause);
          let formattedWhere = hasWhere ? whereClause : `WHERE ${whereClause}`;
          const reserved = ['WHERE', 'AND', 'OR', 'LIKE', 'IN', 'NULL', 'IS', 'NOT', 'BETWEEN', 'ORDER', 'BY', 'DESC', 'ASC', 'DATE', 'TO_DATE', 'TO_CHAR', 'NVL', 'COALESCE', 'TRIM', 'UPPER', 'LOWER', 'SUBSTR', 'INSTR', 'COUNT', 'SUM', 'ROWNUM'];

          formattedWhere = formattedWhere.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
            if (reserved.includes(match.toUpperCase())) return match;
            return `T1."${match}"`;
          });
          query += ` ${formattedWhere}`;
        }

        // Exécuter la requête Oracle
        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const localTableName = type.toUpperCase() === 'RH' ? tableName : `oracle_${tableName.toLowerCase()}`;
        const finalColumns = result.metaData.map(m => m.name);

        // Créer la table PostgreSQL
        const columnPgTypes = {};
        for (const m of result.metaData) {
          columnPgTypes[m.name] = oracleDbTypeToPg(m.dbType);
        }

        // Gérer les colonnes EXTRACT
        const extractCols = finalColumns.filter(c => c.endsWith('_EXTRACT'));
        const maxSubCols = {};
        extractCols.forEach(c => maxSubCols[c] = 0);

        if (extractCols.length > 0) {
          for (const rowObj of result.rows) {
            for (const col of extractCols) {
              const val = rowObj[col];
              if (val && typeof val === 'string') {
                const components = val.split('\x01');
                if (components.length > maxSubCols[col]) maxSubCols[col] = components.length;
              }
            }
          }
        }

        const columnsForSchema = [...finalColumns];
        for (const col of extractCols) {
          for (let i = 1; i <= maxSubCols[col]; i++) {
            columnsForSchema.push(`${col}_${i}`);
          }
        }

        // Créer la table dans le schéma oracle
        await pool.query('CREATE SCHEMA IF NOT EXISTS oracle');
        const prefixMap = { 'FINANCES': 'gf', 'RH': 'rh' };
        const prefix = prefixMap[type.toUpperCase()];
        const fullLocalTableName = `oracle.${prefix}_${localTableName}`;

        // Check if table exists
        const tableExistsResult = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'oracle' AND LOWER(table_name) = LOWER($1)
          )
        `, [prefix + '_' + localTableName]);

        const tableExists = tableExistsResult.rows[0].exists;

        if (tableExists) {
          // Table exists: truncate it to clear data
          await pool.query(`TRUNCATE TABLE ${fullLocalTableName}`);
        } else {
          // Table doesn't exist: create it
          const pkLocalField = pkField ? `${mainPrefix}${pkField}` : null;

          const createCols = columnsForSchema.map(col => {
            const colBase = col.replace(/_\d+$/, '');
            const pgType = columnPgTypes[col] || columnPgTypes[colBase] || 'TEXT';
            const isExtractSuffix = /_\d+$/.test(col);
            const finalType = isExtractSuffix ? 'TEXT' : pgType;
            return `"${col}" ${finalType}${col === pkLocalField ? ' PRIMARY KEY' : ''}`;
          }).join(', ');

          await pool.query(`CREATE TABLE ${fullLocalTableName} (${createCols})`);
        }

        // Insérer les données par batch
        if (result.rows.length > 0) {
          const BATCH_SIZE = 500;
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            let insertedCount = 0;

            // Préparer toutes les valeurs
            const allValues = [];
            for (const rowObj of result.rows) {
              const fullValues = [];

              for (const col of finalColumns) {
                let val = rowObj[col];
                const originalFieldName = colSourceMap[col];
                const isDateField = originalFieldName && (tableDateFields.includes(originalFieldName) || originalFieldName.toUpperCase().includes('DATE'));
                const pgType = columnPgTypes[col] || 'TEXT';

                if (isDateField) {
                  if (pgType === 'TIMESTAMP') {
                    val = parseOracleTimestamp(val);
                  } else {
                    val = parseOracleDate(val);
                  }
                }

                if (val !== null && val !== undefined) {
                  if (pgType === 'NUMERIC' || pgType === 'DOUBLE PRECISION') {
                    const num = parseFloat(String(val));
                    val = isNaN(num) ? String(val) : num;
                  } else if (pgType === 'INTEGER') {
                    const num = parseInt(String(val), 10);
                    val = isNaN(num) ? String(val) : num;
                  } else {
                    val = String(val);
                  }
                } else {
                  val = null;
                }
                fullValues.push(val);
              }

              for (const col of extractCols) {
                const rawVal = rowObj[col];
                const components = (rawVal && typeof rawVal === 'string') ? rawVal.split('\x01') : [];
                for (let i = 0; i < maxSubCols[col]; i++) {
                  const subVal = components[i];
                  fullValues.push(subVal !== undefined && subVal !== null ? String(subVal).trim() : null);
                }
              }

              allValues.push(fullValues);
            }

            // Insérer par batch
            for (let i = 0; i < allValues.length; i += BATCH_SIZE) {
              const batch = allValues.slice(i, i + BATCH_SIZE);
              const placeholders = batch.map((_, rowIdx) => {
                const colPlaceholders = columnsForSchema.map((_, colIdx) => `$${rowIdx * columnsForSchema.length + colIdx + 1}`).join(',');
                return `(${colPlaceholders})`;
              }).join(',');

              const batchValues = batch.flat();
              const batchSql = `INSERT INTO ${fullLocalTableName} (${columnsForSchema.map(c => `"${c}"`).join(',')}) VALUES ${placeholders}`;

              await client.query(batchSql, batchValues);
              insertedCount += batch.length;
            }

            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          } finally {
            client.release();
          }
        }

        // Fix column types for specific tables (non-blocking optimization)
        if (type.toUpperCase() === 'FINANCES' && tableName === 'gf_oracle_facture') {
          try {
            console.log(`[Oracle Import Executor] Optimizing FACTURE_DATENTREE column for ${fullLocalTableName}`);
            // Create a temporary column and convert data more efficiently
            await pool.query(`
              ALTER TABLE ${fullLocalTableName}
              ADD COLUMN "FACTURE_DATENTREE_temp" DATE;
            `);

            await pool.query(`
              UPDATE ${fullLocalTableName}
              SET "FACTURE_DATENTREE_temp" =
                CASE
                  WHEN "FACTURE_DATENTREE" ~ '^\d{4}-\d{2}-\d{2}' THEN "FACTURE_DATENTREE"::date
                  WHEN "FACTURE_DATENTREE" ~ '^\d{8}$' THEN TO_DATE("FACTURE_DATENTREE", 'YYYYMMDD')::date
                  ELSE NULL
                END
              WHERE "FACTURE_DATENTREE" IS NOT NULL;
            `);

            await pool.query(`
              ALTER TABLE ${fullLocalTableName}
              DROP COLUMN "FACTURE_DATENTREE",
              RENAME COLUMN "FACTURE_DATENTREE_temp" TO "FACTURE_DATENTREE";
            `);
            console.log(`[Oracle Import Executor] FACTURE_DATENTREE column optimized successfully`);
          } catch (convErr) {
            console.error(`[Oracle Import Executor] Warning: Failed to optimize FACTURE_DATENTREE:`, convErr.message);
            // Non-blocking: continue even if this fails
          }
        }

        report.push({ table: tableName, status: 'SUCCESS', count: result.rows.length });

      } catch (err) {
        report.push({ table: tableName, status: 'FAILED', message: err.message });
      }
    }

    if (connection) {
      await connection.close();
    }

    // Log final summary
    const successTables = report.filter(r => r.status === 'SUCCESS');
    const failedTables = report.filter(r => r.status === 'FAILED');
    const totalRecords = successTables.reduce((sum, r) => sum + r.count, 0);

    let logMessage = `[Oracle Sync] ${type} synchronization completed\n`;
    logMessage += `Tables synced: ${successTables.length}/${report.length}\n`;
    successTables.forEach(r => {
      logMessage += `  • ${r.table}: ${r.count} records\n`;
    });
    if (failedTables.length > 0) {
      logMessage += `Failed tables:\n`;
      failedTables.forEach(r => {
        logMessage += `  • ${r.table}: ${r.message}\n`;
      });
    }
    logMessage += `Total records synced: ${totalRecords}`;

    console.log(logMessage);

    return { success: true, message: `Synchronisation réussie`, report };

  } catch (error) {
    if (connection) {
      try { await connection.close(); } catch (e) { }
    }
    console.error(`[Oracle Import Executor] Fatal error:`, error.message);
    return { success: false, message: error.message };
  }
}

module.exports = { executeOracleImport };
