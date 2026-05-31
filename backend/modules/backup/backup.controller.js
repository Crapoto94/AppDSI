const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const archiver = require('archiver');
const extract = require('extract-zip');
const { pipeline } = require('stream/promises');
const { getSqlite, pool } = require('../../shared/database');
const storage = require('../../shared/storage');
const jsdump = require('./pg_jsdump');

const execFileAsync = promisify(execFile);

// Use a temp directory for backup files
const TEMP_DIR = path.join(__dirname, '../../uploads');

// On-disk path of the SQLite database (the `sqlite` wrapper does not expose
// `.filename`, so we resolve it the same way shared/sqlite_db.js does).
const SQLITE_PATH = path.join(__dirname, '../../data/database.sqlite');

// Sous-dossier (dans le stockage SMB/FS) où sont déposées les sauvegardes
// automatiques. Il est TOUJOURS exclu des exports de fichiers pour éviter
// qu'une sauvegarde n'embarque les sauvegardes précédentes (récursion).
const BACKUP_SUBDIR = '_backups';

// Clé de configuration de la sauvegarde automatique (SQLite app_settings).
const AUTO_CFG_KEY = 'backup.auto_config';

// Clé de la sélection des schémas PostgreSQL à sauvegarder (SQLite app_settings).
const SCHEMAS_CFG_KEY = 'backup.schemas';

// Schémas exclus par défaut de la sauvegarde (données volumineuses/synchronisées
// régénérées par ailleurs). GLPI est un miroir de synchro -> non sauvegardé par défaut.
const DEFAULT_EXCLUDED_SCHEMAS = ['glpi'];

/**
 * Renvoie la liste des schémas PostgreSQL effectivement sauvegardés.
 * Lue depuis SQLite (clé `backup.schemas`) ; par défaut = tous les schémas
 * applicatifs SAUF ceux de DEFAULT_EXCLUDED_SCHEMAS (ex. GLPI). La sélection
 * est toujours restreinte aux schémas applicatifs connus (jsdump.APP_SCHEMAS).
 */
async function getSelectedSchemas() {
  const all = jsdump.APP_SCHEMAS;
  const db = getSqlite();
  if (db) {
    try {
      const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', SCHEMAS_CFG_KEY);
      if (row && row.setting_value) {
        const sel = JSON.parse(row.setting_value);
        if (Array.isArray(sel)) {
          const filtered = all.filter(s => sel.includes(s));
          if (filtered.length) return filtered;
        }
      }
    } catch (e) { /* config absente/invalide -> défaut */ }
  }
  return all.filter(s => !DEFAULT_EXCLUDED_SCHEMAS.includes(s));
}

/** Persiste la sélection des schémas (intersection avec les schémas connus). */
async function saveSelectedSchemas(schemas) {
  const db = getSqlite();
  if (!db) throw new Error('Base SQLite non initialisée.');
  const valid = jsdump.APP_SCHEMAS.filter(s => Array.isArray(schemas) && schemas.includes(s));
  if (!valid.length) throw new Error('Sélectionnez au moins un schéma à sauvegarder.');
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value, description)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`,
    [SCHEMAS_CFG_KEY, JSON.stringify(valid), 'Schémas PostgreSQL à sauvegarder']
  );
  return valid;
}

/** GET /schemas : schémas disponibles + sélection courante (+ tables/tailles). */
async function getSchemasRoute(req, res) {
  try {
    const selected = await getSelectedSchemas();
    // Compte des tables + taille par schéma (pour informer le choix dans l'UI).
    let stats = [];
    try {
      const { rows } = await pool.query(`
        SELECT n.nspname AS schema, COUNT(*)::int AS tables,
               COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = ANY($1)
        GROUP BY n.nspname
      `, [jsdump.APP_SCHEMAS]);
      stats = rows;
    } catch (e) { /* stats facultatives */ }
    const byName = new Map(stats.map(r => [r.schema, r]));
    const available = jsdump.APP_SCHEMAS.map(s => ({
      name: s,
      tables: byName.get(s) ? Number(byName.get(s).tables) : 0,
      bytes: byName.get(s) ? Number(byName.get(s).bytes) : 0,
      size: fmtBytes(byName.get(s) ? Number(byName.get(s).bytes) : 0),
    }));
    res.json({ available, selected, defaultExcluded: DEFAULT_EXCLUDED_SCHEMAS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/** POST /schemas : enregistre la sélection des schémas à sauvegarder. */
async function saveSchemasRoute(req, res) {
  try {
    const selected = await saveSelectedSchemas(req.body && req.body.schemas);
    res.json({ success: true, selected });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// Fonction d'envoi de mail, injectée depuis server.js (setSendMail).
let sendMailFn = null;
function setSendMail(fn) { sendMailFn = fn; }

/** Horodatage compact et sûr pour un nom de fichier : 2026-05-30_02-00-00. */
function tsStamp() {
  return new Date().toISOString().replace('T', '_').replace(/\..+$/, '').replace(/:/g, '-');
}

// PostgreSQL connection config (env-driven, matches shared/pg_db.js defaults)
function getPgConfig() {
  return {
    host: process.env.POSTGRES_HOST || '10.103.130.106',
    port: String(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
    database: process.env.POSTGRES_DB || 'ivry_admin'
  };
}

// Resolve a PostgreSQL client binary (pg_dump / psql). Allows overriding the
// install dir via PG_BIN_DIR when the tools are not on PATH (typical on Windows).
function pgBin(name) {
  const dir = process.env.PG_BIN_DIR;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return dir ? path.join(dir, exe) : exe;
}

// Turn a raw spawn error into an actionable message for the UI.
function pgToolError(error, tool) {
  if (error && error.code === 'ENOENT') {
    return `Outil « ${tool} » introuvable. Installez les outils client PostgreSQL `
      + `(pg_dump/psql) et ajoutez-les au PATH, ou définissez la variable `
      + `d'environnement PG_BIN_DIR vers le dossier bin de PostgreSQL.`;
  }
  return error.message;
}

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ─── Helpers pour les logs de sauvegarde ─────────────────────────────────────

/** Formate un nombre d'octets en unité lisible (o/Ko/Mo/Go/To). */
function fmtBytes(n) {
  if (n == null || isNaN(n)) return 'N/A';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = Number(n), i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(2)} ${units[i]}`;
}

/** Justifie une chaîne à `n` caractères (tronque proprement si trop long). */
function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

/** Log texte de la sauvegarde PostgreSQL (schémas, tables, lignes ≈, tailles). */
async function buildPostgresLog() {
  const cfg = getPgConfig();
  const schemas = await getSelectedSchemas();
  const hasTools = await jsdump.pgToolAvailable(pgBin('pg_dump'));
  const { rows } = await pool.query(`
    SELECT n.nspname AS schema, c.relname AS table,
           c.reltuples::bigint AS est_rows,
           pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname
  `, [schemas]);
  const { rows: dbrows } = await pool.query(
    `SELECT current_database() AS db, pg_database_size(current_database()) AS bytes`
  );

  const bySchema = new Map();
  let totalRows = 0, totalBytes = 0;
  for (const r of rows) {
    if (!bySchema.has(r.schema)) bySchema.set(r.schema, []);
    bySchema.get(r.schema).push(r);
    totalRows += Number(r.est_rows) || 0;
    totalBytes += Number(r.bytes) || 0;
  }

  const L = [];
  L.push('=== Sauvegarde PostgreSQL ===');
  L.push(`Date          : ${new Date().toISOString()}`);
  L.push(`Base          : ${dbrows[0] ? dbrows[0].db : cfg.database}`);
  L.push(`Hôte          : ${cfg.host}:${cfg.port}`);
  L.push(`Méthode       : ${hasTools ? 'pg_dump (.sql, structure + données)' : 'JS NDJSON (.ndjson, données seules)'}`);
  L.push(`Taille serveur: ${fmtBytes(dbrows[0] && dbrows[0].bytes)} (base entière, schémas étrangers inclus)`);
  L.push(`Schémas sauvegardés : ${schemas.join(', ')}`);
  const excluded = jsdump.APP_SCHEMAS.filter(s => !schemas.includes(s));
  if (excluded.length) L.push(`Schémas EXCLUS      : ${excluded.join(', ')}`);
  L.push('');
  L.push(`Schémas : ${bySchema.size}   Tables : ${rows.length}   Lignes (≈) : ${totalRows.toLocaleString('fr-FR')}   Taille tables sauvegardées : ${fmtBytes(totalBytes)}`);
  L.push('');
  L.push(pad('SCHEMA', 22) + pad('TABLE', 38) + pad('LIGNES≈', 14) + 'TAILLE');
  L.push('-'.repeat(86));
  for (const [schema, tbls] of bySchema) {
    for (const r of tbls) {
      L.push(pad(schema, 22) + pad(r.table, 38) + pad((Number(r.est_rows) || 0).toLocaleString('fr-FR'), 14) + fmtBytes(r.bytes));
    }
  }
  L.push('');
  L.push('Note : le nombre de lignes est une estimation (pg_class.reltuples, dernier ANALYZE).');
  return L.join('\n');
}

/** Log texte de la sauvegarde des fichiers (liste + tailles, via storage FS/SMB). */
async function buildFilesLog() {
  const files = [];
  async function walk(rel) {
    let list;
    try { list = await storage.listDirectory(rel); } catch (e) { return; }
    if (!list || !list.entries) return;
    for (const e of list.entries) {
      if (rel === '' && e.isFolder && e.name === BACKUP_SUBDIR) continue; // exclut le dossier des sauvegardes
      if (e.isFolder) await walk(e.relPath);
      else files.push({ path: e.relPath, size: Number(e.size) || 0 });
    }
  }
  let root = '';
  try { const top = await storage.listDirectory(''); root = top.root || ''; } catch (e) {}
  await walk('');
  files.sort((a, b) => a.path.localeCompare(b.path));
  const total = files.reduce((s, f) => s + f.size, 0);

  const L = [];
  L.push('=== Sauvegarde Fichiers ===');
  L.push(`Date          : ${new Date().toISOString()}`);
  L.push(`Racine        : ${root || '(défaut)'}`);
  L.push(`Fichiers      : ${files.length}`);
  L.push(`Taille totale : ${fmtBytes(total)}`);
  L.push('');
  L.push(pad('TAILLE', 14) + 'CHEMIN');
  L.push('-'.repeat(80));
  for (const f of files) L.push(pad(fmtBytes(f.size), 14) + f.path);
  return L.join('\n');
}

/** Log texte de la sauvegarde SQLite (tables + nombre de lignes). */
async function buildSqliteLog() {
  const db = getSqlite();
  let size = 0;
  try { size = fs.statSync(SQLITE_PATH).size; } catch (e) {}

  const L = [];
  L.push('=== Sauvegarde SQLite ===');
  L.push(`Date          : ${new Date().toISOString()}`);
  L.push(`Fichier       : ${SQLITE_PATH}`);
  L.push(`Taille        : ${fmtBytes(size)}`);
  L.push('');
  if (db) {
    try {
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      L.push(pad('TABLE', 44) + 'LIGNES');
      L.push('-'.repeat(60));
      let totalRows = 0;
      for (const t of tables) {
        let c = 0;
        try { const r = await db.get(`SELECT COUNT(*) AS c FROM "${t.name}"`); c = r ? r.c : 0; } catch (e) {}
        totalRows += c;
        L.push(pad(t.name, 44) + c.toLocaleString('fr-FR'));
      }
      L.push('');
      L.push(`TOTAL : ${tables.length} tables, ${totalRows.toLocaleString('fr-FR')} lignes`);
    } catch (e) {
      L.push(`(Erreur lecture des tables : ${e.message})`);
    }
  } else {
    L.push('(Base SQLite non initialisée)');
  }
  return L.join('\n');
}

/**
 * Renvoie un log texte décrivant le contenu d'une sauvegarde, sans la générer.
 * GET /api/backup/log/:type  (type = sqlite | postgres | files | global)
 */
async function getBackupLog(req, res) {
  try {
    const type = req.params.type;
    let text;
    if (type === 'sqlite') text = await buildSqliteLog();
    else if (type === 'postgres') text = await buildPostgresLog();
    else if (type === 'files') text = await buildFilesLog();
    else if (type === 'global') {
      const [s, p, f] = await Promise.all([buildSqliteLog(), buildPostgresLog(), buildFilesLog()]);
      text = ['=== SAUVEGARDE GLOBALE ===', `Date : ${new Date().toISOString()}`, '', s, '', '', p, '', '', f].join('\n');
    } else {
      return res.status(400).json({ error: `Type de log inconnu : ${type}` });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (error) {
    console.error('Backup log error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Export SQLite database as binary file
 */
async function exportSqlite(req, res) {
  try {
    const db = getSqlite();
    if (!db) {
      return res.status(500).json({ error: 'SQLite not initialized' });
    }

    const filePath = path.join(TEMP_DIR, `backup_sqlite_${Date.now()}.db`);

    // Read the current database
    fs.copyFileSync(SQLITE_PATH, filePath);

    res.download(filePath, `sqlite_backup_${new Date().toISOString().split('T')[0]}.db`, (err) => {
      if (err) console.error('Download error:', err);
      try { fs.unlinkSync(filePath); } catch (e) {}
    });
  } catch (error) {
    console.error('SQLite export error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Export PostgreSQL database via pg_dump
 */
async function exportPostgres(req, res) {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const schemas = await getSelectedSchemas();
    const hasPgDump = await jsdump.pgToolAvailable(pgBin('pg_dump'));

    if (hasPgDump) {
      // Faithful native dump (schemas, constraints, sequences, indexes).
      const pgConfig = getPgConfig();
      const dumpFile = path.join(TEMP_DIR, `backup_postgres_${Date.now()}.sql`);
      const args = [
        `--host=${pgConfig.host}`,
        `--port=${pgConfig.port}`,
        `--username=${pgConfig.user}`,
        '--no-password',
        // Restreint le dump aux schémas sélectionnés (exclut ODP & co. du
        // serveur mutualisé, ainsi que les schémas désélectionnés dans l'UI).
        ...schemas.map(s => `--schema=${s}`),
        `--file=${dumpFile}`,
        pgConfig.database
      ];
      const env = { ...process.env, PGPASSWORD: pgConfig.password };
      await execFileAsync(pgBin('pg_dump'), args, { env, maxBuffer: 64 * 1024 * 1024 });

      return res.download(dumpFile, `postgres_backup_${timestamp}.sql`, (err) => {
        if (err) console.error('Download error:', err);
        try { fs.unlinkSync(dumpFile); } catch (e) {}
      });
    }

    // Fallback: pure-JS data dump (NDJSON), no client tools required.
    const dumpFile = path.join(TEMP_DIR, `backup_postgres_${Date.now()}.ndjson`);
    await jsdump.jsDumpToFile(dumpFile, schemas);
    return res.download(dumpFile, `postgres_backup_${timestamp}.ndjson`, (err) => {
      if (err) console.error('Download error:', err);
      try { fs.unlinkSync(dumpFile); } catch (e) {}
    });
  } catch (error) {
    console.error('PostgreSQL export error:', error);
    res.status(500).json({ error: pgToolError(error, 'pg_dump') });
  }
}

/**
 * Export all files from storage as ZIP
 */
async function exportFiles(req, res) {
  try {
    const archive = archiver('zip', { zlib: { level: 6 } });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="files_backup_${new Date().toISOString().split('T')[0]}.zip"`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    res.on('error', (err) => {
      console.error('Response error:', err);
    });

    archive.pipe(res);
    await addStorageDirToArchive(archive, '');
    await archive.finalize();
  } catch (error) {
    console.error('Files export error:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}

/**
 * Recursively walks the storage tree (filesystem OR SMB, transparently handled
 * by the shared storage module) and appends every file to the given archive.
 */
async function addStorageDirToArchive(archive, relPath, prefix = '') {
  let list;
  try {
    list = await storage.listDirectory(relPath);
  } catch (e) {
    console.error(`Error listing "${relPath}":`, e.message);
    return;
  }
  if (!list || !list.entries) return;

  for (const entry of list.entries) {
    // Ne jamais embarquer le dossier des sauvegardes dans une sauvegarde.
    if (prefix === '' && entry.isFolder && entry.name === BACKUP_SUBDIR) continue;
    const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFolder) {
      await addStorageDirToArchive(archive, entry.relPath, archivePath);
    } else {
      try {
        const served = await storage.getFileForServe(entry.relPath);
        if (!served) continue;
        if (served.buffer) {
          archive.append(served.buffer, { name: archivePath });
        } else if (served.absolutePath) {
          archive.append(fs.createReadStream(served.absolutePath), { name: archivePath });
        }
      } catch (e) {
        console.error(`Error reading file ${entry.relPath}:`, e.message);
      }
    }
  }
}

/**
 * Import SQLite backup
 */
async function importSqlite(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getSqlite();
    if (!db) {
      return res.status(500).json({ error: 'SQLite not initialized' });
    }

    const backupPath = req.file.path; // multer wrote it to disk

    // Verify backup is valid SQLite by checking magic header
    const header = Buffer.alloc(16);
    const fd = fs.openSync(backupPath, 'r');
    fs.readSync(fd, header, 0, 16);
    fs.closeSync(fd);
    const magic = header.toString('utf8', 0, 13);
    if (magic !== 'SQLite format') {
      try { fs.unlinkSync(backupPath); } catch (e) {}
      return res.status(400).json({ error: 'Fichier SQLite invalide.' });
    }

    // Restore: copy over the original (keep a safety copy of the current DB)
    const originalPath = SQLITE_PATH;
    const beforeRestore = originalPath + '.before_restore';

    fs.copyFileSync(originalPath, beforeRestore);
    fs.copyFileSync(backupPath, originalPath);
    try { fs.unlinkSync(backupPath); } catch (e) {}

    res.json({
      success: true,
      message: 'Base SQLite restaurée. Redémarrez le serveur pour recharger la connexion.',
      backupPath: beforeRestore
    });
  } catch (error) {
    console.error('SQLite import error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Import PostgreSQL backup. Auto-detects the format:
 *  - NDJSON dump (.ndjson) produced by the JS fallback  -> restored in pure JS
 *  - SQL dump (.sql) produced by pg_dump                -> restored via psql
 */
async function importPostgres(req, res) {
  const dumpFile = req.file ? req.file.path : null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read just the first bytes to detect the format (avoids loading the whole file).
    const head = Buffer.alloc(256);
    const fd = fs.openSync(dumpFile, 'r');
    const n = fs.readSync(fd, head, 0, 256);
    fs.closeSync(fd);
    const isJs = jsdump.isJsDumpFile(head.slice(0, n));

    // JS NDJSON dump -> pure-JS restore (no client tools needed)
    if (isJs) {
      const stats = await jsdump.jsRestoreFromFile(dumpFile);
      try { fs.unlinkSync(dumpFile); } catch (e) {}
      return res.json({
        success: true,
        message: `Restauration JS terminée : ${stats.rows} lignes sur ${stats.tables} tables.`
      });
    }

    // SQL dump -> requires psql
    const hasPsql = await jsdump.pgToolAvailable(pgBin('psql'));
    if (!hasPsql) {
      try { fs.unlinkSync(dumpFile); } catch (e) {}
      return res.status(400).json({
        error: 'Ce fichier est un dump SQL (pg_dump) mais psql n\'est pas installé. '
          + 'Installez le client PostgreSQL (ou définissez PG_BIN_DIR), ou réimportez '
          + 'un export au format .ndjson généré par cette application.'
      });
    }

    const pgConfig = getPgConfig();
    const args = [
      `--host=${pgConfig.host}`,
      `--port=${pgConfig.port}`,
      `--username=${pgConfig.user}`,
      '--no-password',
      `--dbname=${pgConfig.database}`,
      `--file=${dumpFile}`
    ];
    const env = { ...process.env, PGPASSWORD: pgConfig.password };
    await execFileAsync(pgBin('psql'), args, { env, maxBuffer: 64 * 1024 * 1024 });

    try { fs.unlinkSync(dumpFile); } catch (e) {}
    res.json({ success: true, message: 'PostgreSQL restauré via psql.' });
  } catch (error) {
    console.error('PostgreSQL import error:', error);
    if (dumpFile) { try { fs.unlinkSync(dumpFile); } catch (e) {} }
    res.status(500).json({ error: pgToolError(error, 'psql') });
  }
}

/**
 * Import files from ZIP backup
 */
async function importFiles(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const zipPath = req.file.path; // multer wrote it to disk
    const extractPath = path.join(TEMP_DIR, `restore_files_extract_${Date.now()}`);

    fs.mkdirSync(extractPath, { recursive: true });

    await extract({ file: zipPath, dir: extractPath });

    // Upload extracted files to storage (filesystem OR SMB, handled by the
    // shared storage module so it works on Windows dev and Linux/Docker prod).
    async function uploadDirToStorage(localPath, remotePath = '') {
      const entries = fs.readdirSync(localPath, { withFileTypes: true });

      for (const entry of entries) {
        const localFullPath = path.join(localPath, entry.name);
        const remoteRel = remotePath ? `${remotePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await uploadDirToStorage(localFullPath, remoteRel);
        } else {
          const buffer = fs.readFileSync(localFullPath);
          // saveFileAt writes <remotePath>/<originalname>, creating dirs as needed.
          await storage.saveFileAt(remotePath, { buffer, originalname: entry.name });
        }
      }
    }

    await uploadDirToStorage(extractPath);

    res.json({
      success: true,
      message: 'Files restored successfully'
    });

    // Cleanup
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(extractPath, { recursive: true, force: true });
  } catch (error) {
    console.error('Files import error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get backup status/info
 */
async function getBackupStatus(req, res) {
  try {
    const db = getSqlite();

    // Get PostgreSQL info
    const pgInfo = await pool.query(`
      SELECT
        current_database() as database,
        datname as name,
        pg_size_pretty(pg_database_size(datname)) as size
      FROM pg_database
      WHERE datname = current_database()
    `);

    // Get SQLite info
    let sqliteSize = 0;
    try {
      sqliteSize = fs.statSync(SQLITE_PATH).size;
    } catch (e) { /* file missing -> size 0 */ }

    // Which PostgreSQL backup method will be used?
    const hasTools = await jsdump.pgToolAvailable(pgBin('pg_dump'));

    res.json({
      sqlite: {
        path: SQLITE_PATH,
        size: sqliteSize,
        initialized: !!db
      },
      postgres: {
        database: pgInfo.rows[0]?.database || null,
        size: pgInfo.rows[0]?.size || null,
        connected: true,
        method: hasTools ? 'pg_dump' : 'js',
        format: hasTools ? '.sql' : '.ndjson'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Backup status error:', error);
    res.status(500).json({ error: error.message });
  }
}

/** Zippe un dossier complet vers un fichier .zip (préfixé dans l'archive). */
function zipDirToFile(dir, prefixInZip, outZip, level = 9) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZip);
    const arch = archiver('zip', { zlib: { level } });
    arch.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    arch.pipe(output);
    arch.directory(dir, prefixInZip);
    arch.finalize();
  });
}

/** Zippe tout le stockage (FS ou SMB, hors _backups) vers un fichier .zip. */
function zipStorageToFile(outZip, level = 6) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZip);
    const arch = archiver('zip', { zlib: { level } });
    arch.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    arch.pipe(output);
    addStorageDirToArchive(arch, '').then(() => arch.finalize()).catch(reject);
  });
}

/**
 * Construit le fichier ZIP de sauvegarde globale (SQLite + PostgreSQL + fichiers
 * + manifeste) dans TEMP_DIR. Réutilisé par l'export manuel ET l'automatique.
 * @returns {{ finalZip: string, finalName: string }}
 */
async function createGlobalBackupFile() {
  const stamp = tsStamp();
  const backupDir = path.join(TEMP_DIR, `global_backup_${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  // 1. SQLite
  if (fs.existsSync(SQLITE_PATH)) {
    fs.copyFileSync(SQLITE_PATH, path.join(backupDir, 'database.sqlite'));
  }

  // 2. PostgreSQL (pg_dump si dispo, sinon repli JS NDJSON ; schémas sélectionnés seulement)
  const schemas = await getSelectedSchemas();
  if (await jsdump.pgToolAvailable(pgBin('pg_dump'))) {
    const pgConfig = getPgConfig();
    const dumpFile = path.join(backupDir, 'database.sql');
    const args = [
      `--host=${pgConfig.host}`,
      `--port=${pgConfig.port}`,
      `--username=${pgConfig.user}`,
      '--no-password',
      ...schemas.map(s => `--schema=${s}`),
      `--file=${dumpFile}`,
      pgConfig.database
    ];
    const env = { ...process.env, PGPASSWORD: pgConfig.password };
    await execFileAsync(pgBin('pg_dump'), args, { env, maxBuffer: 64 * 1024 * 1024 });
  } else {
    await jsdump.jsDumpToFile(path.join(backupDir, 'database.ndjson'), schemas);
  }

  // 3. Fichiers (hors dossier des sauvegardes)
  await zipStorageToFile(path.join(backupDir, 'files.zip'));

  // 4. Manifeste / journal embarqué
  try {
    const [s, p, f] = await Promise.all([buildSqliteLog(), buildPostgresLog(), buildFilesLog()]);
    fs.writeFileSync(path.join(backupDir, 'MANIFEST.log.txt'), [s, '', '', p, '', '', f].join('\n'), 'utf8');
  } catch (e) { /* manifeste facultatif */ }

  // ZIP final
  const finalName = `backup_global_${stamp}.zip`;
  const finalZip = path.join(TEMP_DIR, finalName);
  await zipDirToFile(backupDir, `backup_${stamp}`, finalZip);
  try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (e) {}
  return { finalZip, finalName };
}

/**
 * Global backup (all three: SQLite + PostgreSQL + Files) — téléchargement manuel.
 */
async function globalBackup(req, res) {
  try {
    const { finalZip, finalName } = await createGlobalBackupFile();
    res.download(finalZip, finalName, (err) => {
      if (err) console.error('Download error:', err);
      try { fs.unlinkSync(finalZip); } catch (e) {}
    });
  } catch (error) {
    console.error('Global backup error:', error);
    res.status(500).json({ error: pgToolError(error, 'pg_dump') });
  }
}

// ─── Sauvegarde automatique : configuration ──────────────────────────────────

const DEFAULT_AUTO_CONFIG = {
  enabled: false,
  frequency: 'weekly',   // daily | weekly | monthly
  hour: 2,               // heure de déclenchement (0-23)
  weekday: 0,            // jour (0=dimanche) pour la fréquence hebdomadaire
  destPath: '',          // '' => stockage SMB/FS, sous-dossier _backups ; sinon chemin local/UNC
  retention: 7,          // nombre de sauvegardes à conserver
  recipients: [],        // [{ email, displayName }] destinataires des rapports
  lastRun: null,         // { at, ok, message, file, location }
};

/** Lit la configuration de la sauvegarde automatique (SQLite app_settings). */
async function getAutoConfig() {
  const db = getSqlite();
  if (!db) return { ...DEFAULT_AUTO_CONFIG };
  try {
    const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', AUTO_CFG_KEY);
    if (row && row.setting_value) return { ...DEFAULT_AUTO_CONFIG, ...JSON.parse(row.setting_value) };
  } catch (e) { /* table absente ou JSON invalide -> défaut */ }
  return { ...DEFAULT_AUTO_CONFIG };
}

/** Persiste la configuration de la sauvegarde automatique. */
async function saveAutoConfigObj(cfg) {
  const db = getSqlite();
  if (!db) throw new Error('Base SQLite non initialisée.');
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value, description)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`,
    [AUTO_CFG_KEY, JSON.stringify(cfg), 'Configuration de la sauvegarde automatique']
  );
}

/** Racine de stockage (pour affichage), tolérante aux erreurs. */
async function safeStorageRoot() {
  try { const t = await storage.listDirectory(''); return t.root || ''; } catch (e) { return ''; }
}

/** GET /auto-config : config + libellé de destination par défaut. */
async function getAutoConfigRoute(req, res) {
  try {
    const cfg = await getAutoConfig();
    const root = await safeStorageRoot();
    res.json({
      ...cfg,
      storageRoot: root,
      backupSubdir: BACKUP_SUBDIR,
      defaultDestLabel: root ? `${root}${path.sep}${BACKUP_SUBDIR}` : `(stockage)/${BACKUP_SUBDIR}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/** POST /auto-config : valide, enregistre et reprogramme. */
async function saveAutoConfigRoute(req, res) {
  try {
    const b = req.body || {};
    const cur = await getAutoConfig();
    const cfg = {
      ...cur,
      enabled: !!b.enabled,
      frequency: ['daily', 'weekly', 'monthly'].includes(b.frequency) ? b.frequency : cur.frequency,
      hour: Math.min(23, Math.max(0, parseInt(b.hour, 10))) || 0,
      weekday: Math.min(6, Math.max(0, parseInt(b.weekday, 10))) || 0,
      destPath: typeof b.destPath === 'string' ? b.destPath.trim() : cur.destPath,
      retention: Math.min(365, Math.max(1, parseInt(b.retention, 10) || cur.retention || 7)),
      recipients: Array.isArray(b.recipients)
        ? b.recipients.filter(r => r && r.email).map(r => ({ email: String(r.email), displayName: String(r.displayName || r.email) }))
        : cur.recipients,
    };
    await saveAutoConfigObj(cfg);
    try { require('./backup.scheduler').reschedule(cfg); } catch (e) { console.error('[Backup] reschedule:', e.message); }
    res.json({ success: true, config: cfg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/** POST /auto/run-now : déclenche une sauvegarde automatique immédiate. */
async function runAutoNow(req, res) {
  try {
    const summary = await runAutomaticBackup('manuel');
    res.json({ success: true, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── Sauvegarde automatique : exécution, rétention, e-mail ────────────────────

/** Applique la rétention sur un dossier local (garde les N plus récents). */
function applyRetentionFs(dir, keep) {
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return { kept: [], deleted: [] }; }
  const files = names
    .filter(f => /^backup_global_.*\.zip$/i.test(f))
    .sort((a, b) => b.localeCompare(a)); // nom horodaté -> ordre antéchronologique
  const kept = files.slice(0, keep);
  const toDelete = files.slice(keep);
  for (const f of toDelete) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
  return { kept, deleted: toDelete };
}

/** Applique la rétention dans le stockage (_backups), FS ou SMB. */
async function applyRetentionStorage(keep) {
  let list;
  try { list = await storage.listDirectory(BACKUP_SUBDIR); } catch (e) { return { kept: [], deleted: [] }; }
  const files = (list.entries || [])
    .filter(e => !e.isFolder && /^backup_global_.*\.zip$/i.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const kept = files.slice(0, keep).map(x => x.name);
  const toDelete = files.slice(keep);
  for (const x of toDelete) { try { await storage.deletePath(x.relPath); } catch (e) {} }
  return { kept, deleted: toDelete.map(x => x.name) };
}

/** Écrit la sauvegarde à destination puis applique la rétention. */
async function storeBackupFile(cfg, name, buffer) {
  if (cfg.destPath && cfg.destPath.trim()) {
    const dir = cfg.destPath.trim();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
    const r = applyRetentionFs(dir, cfg.retention);
    return { location: path.join(dir, name), ...r };
  }
  // Défaut : stockage SMB/FS, sous-dossier _backups
  await storage.saveFileAt(BACKUP_SUBDIR, { buffer, originalname: name });
  const r = await applyRetentionStorage(cfg.retention);
  const root = await safeStorageRoot();
  return { location: `${root || '(stockage)'}/${BACKUP_SUBDIR}/${name}`, ...r };
}

/** Envoie le rapport (état + log en pièce jointe) aux destinataires configurés. */
async function emailBackupResult(cfg, ok, summary, logText, startedAt) {
  const recips = (cfg.recipients || []).filter(r => r && r.email);
  if (!recips.length) return;
  if (!sendMailFn) { console.warn('[Backup Auto] sendMail non disponible, e-mail ignoré.'); return; }

  const subject = `[DSI Hub] Sauvegarde automatique ${ok ? 'réussie' : 'ÉCHOUÉE'} — ${startedAt.toLocaleDateString('fr-FR')}`;
  const rows = ok ? `
      <tr><td><strong>Fichier</strong></td><td>${summary.file}</td></tr>
      <tr><td><strong>Taille</strong></td><td>${fmtBytes(summary.size)}</td></tr>
      <tr><td><strong>Emplacement</strong></td><td>${summary.location}</td></tr>
      <tr><td><strong>Sauvegardes conservées</strong></td><td>${summary.kept} (rétention : ${cfg.retention})</td></tr>
      <tr><td><strong>Supprimées</strong></td><td>${summary.deleted && summary.deleted.length ? summary.deleted.join('<br>') : 'aucune'}</td></tr>
      <tr><td><strong>Durée</strong></td><td>${Math.round((summary.durationMs || 0) / 1000)} s</td></tr>
    ` : `
      <tr><td><strong>Statut</strong></td><td style="color:#dc2626">ÉCHEC</td></tr>
      <tr><td><strong>Erreur</strong></td><td>${summary.error || ''}</td></tr>
      <tr><td><strong>Durée</strong></td><td>${Math.round((summary.durationMs || 0) / 1000)} s</td></tr>
    `;
  const content = `
    <h2 style="margin:0 0 8px">Sauvegarde automatique DSI Hub</h2>
    <p>État : <strong style="color:${ok ? '#16a34a' : '#dc2626'}">${ok ? 'Réussie' : 'Échouée'}</strong>
       &nbsp;—&nbsp; ${startedAt.toLocaleString('fr-FR')}</p>
    <table cellpadding="6" style="border-collapse:collapse;border:1px solid #e2e8f0">${rows}</table>
    <p style="margin-top:12px;color:#475569">Le journal détaillé (schémas, tables, fichiers et tailles) est joint à ce message.</p>
  `;
  const logName = (summary.file ? summary.file.replace(/\.[^.]+$/, '') : `backup_${tsStamp()}`) + '.log.txt';
  const attachment = { filename: logName, content: Buffer.from(logText || '', 'utf8').toString('base64') };

  for (const r of recips) {
    try { await sendMailFn(r.email, subject, content, [attachment], 'backup-auto'); }
    catch (e) { console.error(`[Backup Auto] échec e-mail ${r.email}:`, e.message); }
  }
}

/**
 * Exécute une sauvegarde globale automatique : construit le ZIP, le dépose à
 * destination, applique la rétention, puis envoie l'état + le log par e-mail.
 * Met à jour cfg.lastRun. Le dossier des sauvegardes est exclu du contenu.
 */
async function runAutomaticBackup(trigger = 'auto') {
  const startedAt = new Date();
  const cfg = await getAutoConfig();
  let finalZip = null;
  console.log(`[Backup Auto] Démarrage (${trigger}) à ${startedAt.toISOString()}`);

  try {
    const built = await createGlobalBackupFile();
    finalZip = built.finalZip;
    const size = fs.statSync(finalZip).size;
    const buffer = fs.readFileSync(finalZip);

    const dest = await storeBackupFile(cfg, built.finalName, buffer);

    // Journal détaillé
    let logText;
    try {
      const [s, p, f] = await Promise.all([buildSqliteLog(), buildPostgresLog(), buildFilesLog()]);
      logText = [
        `=== SAUVEGARDE AUTOMATIQUE (${trigger}) ===`,
        `Date          : ${startedAt.toISOString()}`,
        `Fichier       : ${built.finalName}`,
        `Taille        : ${fmtBytes(size)}`,
        `Emplacement   : ${dest.location}`,
        `Conservées    : ${dest.kept.length} (rétention ${cfg.retention})`,
        `Supprimées    : ${dest.deleted.length ? dest.deleted.join(', ') : 'aucune'}`,
        '', '', s, '', '', p, '', '', f,
      ].join('\n');
    } catch (e) { logText = `Journal indisponible : ${e.message}`; }

    const summary = {
      ok: true, file: built.finalName, size, location: dest.location,
      kept: dest.kept.length, deleted: dest.deleted, durationMs: Date.now() - startedAt.getTime(),
    };

    await emailBackupResult(cfg, true, summary, logText, startedAt);

    cfg.lastRun = {
      at: startedAt.toISOString(), ok: true,
      message: `OK — ${built.finalName} (${fmtBytes(size)})`,
      file: built.finalName, location: dest.location,
    };
    await saveAutoConfigObj(cfg);
    console.log(`[Backup Auto] Terminée : ${built.finalName} (${fmtBytes(size)}) -> ${dest.location}`);
    return summary;
  } catch (err) {
    console.error('[Backup Auto] Échec :', err);
    const summary = { ok: false, error: err.message, durationMs: Date.now() - startedAt.getTime() };
    const logText = `Échec de la sauvegarde automatique (${trigger})\nDate : ${startedAt.toISOString()}\n\n${err.stack || err.message}`;
    try { await emailBackupResult(cfg, false, summary, logText, startedAt); } catch (e) {}
    cfg.lastRun = { at: startedAt.toISOString(), ok: false, message: err.message };
    try { await saveAutoConfigObj(cfg); } catch (e) {}
    throw err;
  } finally {
    if (finalZip) { try { fs.unlinkSync(finalZip); } catch (e) {} }
  }
}

module.exports = {
  exportSqlite,
  exportPostgres,
  exportFiles,
  importSqlite,
  importPostgres,
  importFiles,
  getBackupStatus,
  getBackupLog,
  globalBackup,
  // Sélection des schémas PostgreSQL
  getSelectedSchemas,
  getSchemasRoute,
  saveSchemasRoute,
  // Sauvegarde automatique
  setSendMail,
  getAutoConfig,
  getAutoConfigRoute,
  saveAutoConfigRoute,
  runAutoNow,
  runAutomaticBackup,
};
