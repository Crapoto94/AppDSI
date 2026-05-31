/**
 * Pure-JavaScript PostgreSQL data dump / restore.
 *
 * Fallback used when the PostgreSQL client tools (pg_dump / psql) are not
 * installed on the host. It moves DATA only (not DDL): the target database is
 * expected to already have the full structure, which `setupPgDb()` recreates
 * at server startup (see backend/shared/pg_db.js).
 *
 * Format: NDJSON (one JSON object per line)
 *   line 1            -> { "_meta": { format, version, generatedAt, tables:[{schema,name}] } }
 *   per table header  -> { "_table": { schema, name, columns:[{name,udt,isArray}] } }
 *   per row           -> { "r": [v1, v2, ...] }   // values in column order
 *
 * Buffers (bytea) are encoded as { "__buf__": "<base64>" } and revived on import.
 */
const fs = require('fs');
const readline = require('readline');
const { execFile } = require('child_process');
const { pool } = require('../../shared/database');

const ROW_BATCH = 500;

/**
 * Schémas applicatifs à sauvegarder. Source de vérité : les `CREATE SCHEMA`
 * de setupPgDb() dans backend/shared/pg_db.js (+ le mapping du wrapper pgDb).
 * Le serveur PostgreSQL est mutualisé : il héberge aussi des schémas étrangers
 * (ex. « ODP ») qu'il ne faut SURTOUT PAS embarquer dans nos sauvegardes.
 * => Si un nouveau schéma applicatif est ajouté dans pg_db.js, l'ajouter ici.
 */
const APP_SCHEMAS = [
  'public',  // tables d'import Oracle (gf_oracle_*, oracle_*) + synchro AD (REF_AGENTS, EXTRA_AD_LINKS, SYNC_AGENT_LOGS…)
  'hub',
  'hub_tickets',
  'hub_consommables',
  'hub_contrats',
  'hub_copieurs',
  'hub_rencontres',
  'hub_calendrier',
  'hub_docs',
  'glpi',
  'oracle',
  'magapp',
  'projets',
  'transcript',
  'finance',
];

/** True if a PostgreSQL client binary (pg_dump/psql) can actually be spawned. */
function pgToolAvailable(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], (err) => resolve(!err));
  });
}

/** JSON replacer: encode Node Buffers (bytea) so they survive the round-trip. */
function jsonReplacer(_key, value) {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return { __buf__: Buffer.from(value.data).toString('base64') };
  }
  return value;
}

/** Lists every base table in the given application schemas (defaults to all). */
async function listTables(schemas = APP_SCHEMAS) {
  const { rows } = await pool.query(`
    SELECT table_schema AS schema, table_name AS name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema = ANY($1)
    ORDER BY table_schema, table_name
  `, [schemas]);
  return rows;
}

/** Column metadata for a table (name, udt_name, whether it is an array type). */
async function tableColumns(schema, name) {
  const { rows } = await pool.query(`
    SELECT column_name AS name, udt_name AS udt, data_type AS data_type
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, name]);
  return rows.map(c => ({
    name: c.name,
    udt: c.udt,
    isArray: c.data_type === 'ARRAY',
    isJson: c.udt === 'json' || c.udt === 'jsonb',
  }));
}

/** Dumps the whole database (data only) to an NDJSON file. */
async function jsDumpToFile(filePath, schemas = APP_SCHEMAS) {
  const tables = await listTables(schemas);
  const out = fs.createWriteStream(filePath, { encoding: 'utf8' });

  // Single persistent error handler (avoids leaking a listener per write()).
  let streamError = null;
  out.on('error', (e) => { streamError = e; });

  // Write a chunk, honoring backpressure (await 'drain' only when buffer is full).
  const write = (str) => {
    if (streamError) return Promise.reject(streamError);
    if (!out.write(str)) {
      return new Promise((resolve) => out.once('drain', resolve));
    }
    return Promise.resolve();
  };

  await write(JSON.stringify({ _meta: { format: 'dsi-pg-jsdump', version: 1, generatedAt: new Date().toISOString(), tables } }, jsonReplacer) + '\n');

  for (const t of tables) {
    const columns = await tableColumns(t.schema, t.name);
    if (!columns.length) continue;
    await write(JSON.stringify({ _table: { schema: t.schema, name: t.name, columns } }, jsonReplacer) + '\n');

    const colList = columns.map(c => `"${c.name}"`).join(', ');
    const { rows } = await pool.query(`SELECT ${colList} FROM "${t.schema}"."${t.name}"`);

    // Serialize rows in chunks to keep one write() per ~ROW_BATCH rows.
    let buf = '';
    let count = 0;
    for (const row of rows) {
      const arr = columns.map(c => row[c.name] === undefined ? null : row[c.name]);
      buf += JSON.stringify({ r: arr }, jsonReplacer) + '\n';
      if (++count >= ROW_BATCH) {
        await write(buf);
        buf = '';
        count = 0;
      }
    }
    if (buf) await write(buf);
  }

  await new Promise((resolve, reject) => {
    out.end((err) => err ? reject(err) : resolve());
  });
  return filePath;
}

/** Revives a stored value (decode base64 buffers) for re-insertion. */
function reviveValue(v) {
  if (v && typeof v === 'object' && typeof v.__buf__ === 'string') {
    return Buffer.from(v.__buf__, 'base64');
  }
  return v;
}

/** Builds a multi-row parameterized INSERT for a batch of rows. */
function buildInsert(schema, name, columns, batch) {
  const colList = columns.map(c => `"${c.name}"`).join(', ');
  const params = [];
  const tuples = batch.map(row => {
    const placeholders = row.map((val, ci) => {
      const col = columns[ci];
      let v = reviveValue(val);
      if (col.isJson && v !== null && typeof v === 'object') {
        v = JSON.stringify(v);
      }
      params.push(v);
      return col.isJson ? `$${params.length}::${col.udt}` : `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const sql = `INSERT INTO "${schema}"."${name}" (${colList}) VALUES ${tuples.join(', ')}`;
  return { sql, params };
}

/**
 * Restores data from an NDJSON dump produced by jsDumpToFile.
 * Runs in a single transaction with FK/triggers disabled
 * (session_replication_role = replica), so table order does not matter.
 */
async function jsRestoreFromFile(filePath) {
  // First pass: parse the file into per-table buffers (kept on disk-light memory).
  // We stream and group rows by table to insert them right after seeing the data.
  const client = await pool.connect();
  let started = false;
  const stats = { tables: 0, rows: 0 };
  try {
    await client.query('BEGIN');
    await client.query("SET session_replication_role = 'replica'");
    started = true;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let current = null;     // { schema, name, columns }
    let batch = [];
    const cleared = new Set();

    const flush = async () => {
      if (!current || !batch.length) return;
      const { sql, params } = buildInsert(current.schema, current.name, current.columns, batch);
      await client.query(sql, params);
      stats.rows += batch.length;
      batch = [];
    };

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed);

      if (obj._meta) continue;

      if (obj._table) {
        await flush();
        current = obj._table;
        stats.tables += 1;
        const key = `${current.schema}.${current.name}`;
        if (!cleared.has(key)) {
          await client.query(`DELETE FROM "${current.schema}"."${current.name}"`);
          cleared.add(key);
        }
        continue;
      }

      if (obj.r && current) {
        batch.push(obj.r);
        if (batch.length >= ROW_BATCH) await flush();
      }
    }
    await flush();

    // Reset sequences to MAX(id)+ for every serial/identity column.
    await resetSequences(client);

    await client.query("SET session_replication_role = 'origin'");
    await client.query('COMMIT');
    return stats;
  } catch (err) {
    if (started) { try { await client.query('ROLLBACK'); } catch (e) {} }
    throw err;
  } finally {
    client.release();
  }
}

/** Resets all owned sequences so future inserts don't collide with restored ids. */
async function resetSequences(client) {
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, t.relname AS table, a.attname AS column,
           pg_get_serial_sequence(format('%I.%I', n.nspname, t.relname), a.attname) AS seq
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE t.relkind = 'r'
      AND n.nspname = ANY($1)
  `, [APP_SCHEMAS]);
  for (const r of rows) {
    if (!r.seq) continue;
    try {
      await client.query(
        `SELECT setval($1, COALESCE((SELECT MAX("${r.column}") FROM "${r.schema}"."${r.table}"), 1))`,
        [r.seq]
      );
    } catch (e) {
      // non-numeric column or other edge case: skip
    }
  }
}

/** Quick check: does the file look like our JS NDJSON dump (vs a pg_dump .sql)? */
function isJsDumpFile(buffer) {
  const head = buffer.slice(0, 200).toString('utf8').trimStart();
  if (!head.startsWith('{')) return false;
  return head.includes('"_meta"') && head.includes('dsi-pg-jsdump');
}

module.exports = {
  APP_SCHEMAS,
  pgToolAvailable,
  jsDumpToFile,
  jsRestoreFromFile,
  isJsDumpFile,
};
