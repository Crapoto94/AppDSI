const axiosOriginal = require('axios');
const https = require('https');
const axios = axiosOriginal.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { getSqlite, pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');
const alfresco = require('../../shared/alfresco');
const documentStorage = require('../../shared/document_storage');
const gedMigration = require('../../shared/ged_migration');

function alfrescoBase(url) {
  return `${url.replace(/\/$/, '')}/alfresco/api/-default-/public/alfresco/versions/1`;
}

function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

/**
 * Returns a user-friendly, detailed error message from an Axios error.
 */
function describeAxiosError(err, context) {
  const prefix = context ? `[GED ${context}]` : '[GED]';
  const url = err.config?.url || '(URL inconnue)';

  if (err.response) {
    const status = err.response.status;
    const body = err.response.data;
    const briefSummary = body?.error?.briefSummary || body?.error?.errorKey || '';
    const statusText = err.response.statusText || '';

    if (status === 401) return `Identifiants incorrects (HTTP 401). Vérifiez le nom d'utilisateur et le mot de passe Alfresco.`;
    if (status === 403) return `Accès refusé (HTTP 403). Le compte n'a pas les droits suffisants sur ce nœud.`;
    if (status === 404) return `Ressource introuvable (HTTP 404) sur ${url}. Vérifiez que l'URL Alfresco est correcte et que l'API REST est activée. ${briefSummary}`.trim();
    if (status === 409) return `Conflit (HTTP 409) : ${briefSummary || 'un élément du même nom existe déjà.'}`;
    if (status >= 500) return `Erreur serveur Alfresco (HTTP ${status}). ${briefSummary || statusText}`.trim();
    return `Erreur HTTP ${status} depuis Alfresco : ${briefSummary || statusText || JSON.stringify(body).substring(0, 200)}`;
  }

  if (err.code === 'ECONNREFUSED') return `Connexion refusée vers ${url}. Le serveur Alfresco est-il démarré ? Vérifiez l'URL et le port.`;
  if (err.code === 'ENOTFOUND') return `Nom d'hôte introuvable pour ${url}. Vérifiez le DNS ou l'URL du serveur Alfresco.`;
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return `Timeout lors de la connexion à ${url}. Le serveur est inaccessible ou trop lent.`;
  if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.message?.includes('self-signed')) {
    return `Certificat SSL non vérifié pour ${url}. Ce problème devrait être géré automatiquement. Contactez l'administrateur.`;
  }
  if (err.code === 'ECONNRESET') return `Connexion réinitialisée par le serveur Alfresco (${url}). Le serveur a fermé la connexion.`;

  return `${prefix} ${err.message} (code: ${err.code || 'N/A'}, URL: ${url})`;
}

/**
 * Safely get the SQLite DB instance, or throw with a clear message.
 */
function getDb() {
  const db = getSqlite();
  if (!db) {
    throw new Error('[GED] Base de données SQLite non initialisée. Le serveur backend est-il complètement démarré ?');
  }
  return db;
}

async function loadAlfrescoConfig() {
  return await alfresco.getConfig();
}

exports.getConfig = async (req, res) => {
  try {
    const { url, username, password, rootPath } = await alfresco.getConfig();
    res.json({
      url,
      username,
      hasPassword: !!password,
      rootPath: rootPath || '',
    });
  } catch (err) {
    console.error('[GED getConfig ERROR]', err.message);
    res.status(500).json({ error: `Impossible de charger la configuration GED : ${err.message}` });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { url, username, password, rootPath } = req.body;
    console.log(`[GED saveConfig] url=${url}, username=${username}, rootPath=${rootPath}, passwordProvided=${!!(password && password !== '••••••••')}`);
    await alfresco.saveConfig({ url, username, password, rootPath });
    res.json({ success: true });
  } catch (err) {
    console.error('[GED saveConfig ERROR]', err.message, err.stack);
    res.status(500).json({ error: `Échec de la sauvegarde GED : ${err.message}` });
  }
};

// ─── Configuration du stockage de documents (filesystem / ged) ───────────────

exports.getStorageConfig = async (req, res) => {
  try {
    const cfg = await storage.getStorageConfig();
    res.json({
      backend: cfg.backend || 'filesystem',
      root_path: cfg.root_path || '',
      login: cfg.login || '',
      domain: cfg.domain || '',
      hasPassword: !!cfg.password,
      smbMode: storage.isSmbConfig(cfg),
    });
  } catch (err) {
    console.error('[STORAGE getConfig ERROR]', err.message);
    res.status(500).json({ error: `Impossible de charger la configuration de stockage : ${err.message}` });
  }
};

exports.saveStorageConfig = async (req, res) => {
  try {
    const { backend, root_path, login, password, domain } = req.body;
    if (backend && !['filesystem', 'ged'].includes(backend)) {
      return res.status(400).json({ error: 'Backend invalide (filesystem | ged).' });
    }
    await storage.saveStorageConfig({ backend, root_path, login, password, domain });
    res.json({ success: true });
  } catch (err) {
    console.error('[STORAGE saveConfig ERROR]', err.message);
    res.status(500).json({ error: `Échec de la sauvegarde du stockage : ${err.message}` });
  }
};

exports.testStorage = async (req, res) => {
  try {
    const cfg = await storage.getStorageConfig();
    if (cfg.backend && cfg.backend !== 'filesystem') {
      return res.json({ success: false, error: `Test non disponible pour le backend "${cfg.backend}" (filesystem uniquement pour le moment).` });
    }
    const r = await storage.testAccess();
    res.json({ success: true, root: r.root, mode: r.mode });
  } catch (err) {
    res.json({ success: false, error: `Accès au chemin de stockage impossible : ${err.message}` });
  }
};

// ─── Configuration du stockage par module (filesystem / alfresco / both) ─────

exports.listModuleStorage = async (req, res) => {
  try {
    const rows = await pgDb.all(
      'SELECT module, backend, ged_root_path, updated_by, updated_at FROM hub_docs.module_storage_config ORDER BY module'
    );
    let usedModules = [];
    try {
      const distinct = await pgDb.all(
        'SELECT DISTINCT module FROM hub_docs.documents WHERE deleted_at IS NULL ORDER BY module'
      );
      usedModules = distinct.map((r) => r.module);
    } catch { usedModules = []; }

    const byModule = new Map(rows.map((r) => [r.module, r]));
    const modules = Array.from(new Set([...usedModules, ...rows.map((r) => r.module)]));
    res.json({
      modules: modules.map((m) => {
        const c = byModule.get(m);
        return {
          module: m,
          backend: c?.backend || 'filesystem',
          ged_root_path: c?.ged_root_path || '',
          updated_by: c?.updated_by || null,
          updated_at: c?.updated_at || null,
        };
      }),
    });
  } catch (err) {
    console.error('[GED listModuleStorage ERROR]', err.message);
    res.status(500).json({ error: `Impossible de charger le stockage par module : ${err.message}` });
  }
};

exports.getModuleStorage = async (req, res) => {
  try {
    const row = await pgDb.get(
      'SELECT module, backend, ged_root_path, updated_by, updated_at FROM hub_docs.module_storage_config WHERE module = ?',
      [req.params.module]
    );
    res.json(row || { module: req.params.module, backend: 'filesystem', ged_root_path: '' });
  } catch (err) {
    console.error('[GED getModuleStorage ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.saveModuleStorage = async (req, res) => {
  try {
    const module = String(req.params.module || '').trim();
    if (!module) return res.status(400).json({ error: 'Module requis.' });
    const backend = documentStorage.normalizeBackend(req.body.backend || 'filesystem');
    if (!backend) return res.status(400).json({ error: 'Backend invalide (filesystem | alfresco | both).' });
    const rootPath = (req.body.ged_root_path || '').trim() || null;
    const username = req.user?.username || null;

    await pgDb.run(
      `INSERT INTO hub_docs.module_storage_config (module, backend, ged_root_path, updated_by, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON CONFLICT (module) DO UPDATE
         SET backend = EXCLUDED.backend,
             ged_root_path = EXCLUDED.ged_root_path,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [module, backend, rootPath, username]
    );
    documentStorage.clearCache();
    storage.clearModuleBackendCache();
    res.json({ success: true, module, backend, ged_root_path: rootPath });
  } catch (err) {
    console.error('[GED saveModuleStorage ERROR]', err.message);
    res.status(500).json({ error: `Échec de la sauvegarde du stockage du module : ${err.message}` });
  }
};

// ─── Bascule de stockage FS ↔ GED (avec vérification) ────────────────────────

exports.runMigration = async (req, res) => {
  try {
    const module = String(req.body.module || '').trim();
    if (!module) return res.status(400).json({ error: 'Module requis.' });
    const direction = req.body.direction === 'ged2fs' ? 'ged2fs' : 'fs2ged';
    const dryRun = !!req.body.dryRun;
    const report = await gedMigration.runMigration({
      module,
      direction,
      dryRun,
      includeStorage: req.body.includeStorage !== false,
      includeLegacy: req.body.includeLegacy !== false,
      createdBy: req.user?.username || null,
    });
    res.json(report);
  } catch (err) {
    console.error('[GED runMigration ERROR]', err.message);
    res.status(500).json({ error: `Échec de la bascule : ${err.message}` });
  }
};

exports.migrationStatus = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const rows = await gedMigration.history({ module: req.query.module, limit });
    res.json({ history: rows });
  } catch (err) {
    console.error('[GED migrationStatus ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── Explorateur filesystem (admin) ──────────────────────────────────────────

exports.browseStorage = async (req, res) => {
  try {
    const result = await storage.listDirectory(req.query.path || '');
    res.json(result);
  } catch (err) {
    console.error('[STORAGE browse ERROR]', err.message);
    res.status(500).json({ error: `Impossible de lister le dossier : ${err.message}` });
  }
};

exports.downloadStorage = async (req, res) => {
  try {
    const f = await storage.getFileForServe(req.query.path || '');
    if (!f) return res.status(404).json({ error: 'Fichier introuvable.' });
    if (f.absolutePath) return res.download(f.absolutePath, f.filename);
    // Mode SMB : on renvoie le buffer en pièce jointe.
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.filename)}"`);
    res.type(path.extname(f.filename || '') || 'application/octet-stream');
    return res.send(f.buffer);
  } catch (err) {
    console.error('[STORAGE download ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.createStorageFolder = async (req, res) => {
  try {
    const { path: relPath, name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom du dossier requis.' });
    const r = await storage.createDirectory(relPath || '', name.trim());
    res.json(r);
  } catch (err) {
    console.error('[STORAGE createFolder ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.uploadStorage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    req.file.originalname = storage.fixUploadName(req.file.originalname);
    const r = await storage.saveFileAt(req.query.path || '', req.file);
    res.json(r);
  } catch (err) {
    console.error('[STORAGE upload ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStorageNode = async (req, res) => {
  try {
    await storage.deletePath(req.query.path || '');
    res.json({ success: true });
  } catch (err) {
    console.error('[STORAGE delete ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── Migration des fichiers existants vers le stockage configuré ──────────────

/** Dossier racine du backend (où vivent les fichiers legacy comme file_certif/). */
const BACKEND_DIR = path.join(__dirname, '..', '..');

/**
 * Migre les PJ d'un module depuis l'emplacement legacy vers le stockage actuel.
 * @param {object} opts { module, table, idCol, pathCol, legacyModule, dryRun, deleteLegacy }
 */
async function migrateModuleFiles({ module, table, idCol, pathCol, dryRun, deleteLegacy }) {
  const rows = await pgDb.all(
    `SELECT ${idCol} AS id, ${pathCol} AS file_path FROM ${table} WHERE ${pathCol} IS NOT NULL AND ${pathCol} <> '' ORDER BY ${idCol}`
  );
  const report = { total: rows.length, alreadyMigrated: 0, migrated: 0, missing: 0, errors: [], items: [] };

  for (const r of rows) {
    if (storage.isStoragePath(r.file_path)) { report.alreadyMigrated++; continue; }
    const legacyAbs = path.resolve(BACKEND_DIR, r.file_path);
    if (!fs.existsSync(legacyAbs)) {
      report.missing++;
      report.items.push({ id: r.id, status: 'missing', from: r.file_path });
      continue;
    }
    // Récupère un nom lisible : retire le préfixe legacy "<timestamp>-<rand>-"
    const originalname = path.basename(legacyAbs).replace(/^\d+-\d+-/, '');
    if (dryRun) {
      report.migrated++;
      report.items.push({ id: r.id, status: 'would-migrate', from: r.file_path, name: originalname });
      continue;
    }
    try {
      const buffer = fs.readFileSync(legacyAbs);
      const saved = await storage.saveFile(module, r.id, { buffer, originalname });
      await pgDb.run(`UPDATE ${table} SET ${pathCol} = ? WHERE ${idCol} = ?`, [saved.dbPath, r.id]);
      if (deleteLegacy) { try { fs.unlinkSync(legacyAbs); } catch (e) { /* ignore */ } }
      report.migrated++;
      report.items.push({ id: r.id, status: 'migrated', from: r.file_path, to: saved.dbPath });
    } catch (e) {
      report.errors.push({ id: r.id, error: e.message });
    }
  }
  return report;
}

// Modules migrables (le pilote : certificats)
const MIGRATORS = {
  certificats: { module: 'certificats', table: 'hub.certificates', idCol: 'id', pathCol: 'file_path' },
};

exports.migrateStorage = async (req, res) => {
  try {
    const cfg = await storage.getStorageConfig();
    if (cfg.backend && cfg.backend !== 'filesystem') {
      return res.status(400).json({ error: 'Migration disponible uniquement en mode filesystem.' });
    }
    const moduleKey = req.body.module || 'certificats';
    const def = MIGRATORS[moduleKey];
    if (!def) return res.status(400).json({ error: `Module non supporté : ${moduleKey}` });

    const dryRun = !!req.body.dryRun;
    const deleteLegacy = !!req.body.deleteLegacy;
    const report = await migrateModuleFiles({ ...def, dryRun, deleteLegacy });
    res.json({ module: moduleKey, dryRun, deleteLegacy, root: storage.resolveRoot(cfg), ...report });
  } catch (err) {
    console.error('[STORAGE migrate ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Récupère les fichiers écrits par erreur dans un dossier dont le nom contient
// des antislashs (chemin Windows interprété littéralement sur Linux) et les
// déplace vers la racine de stockage POSIX correcte (point de montage Samba).
exports.recoverStorage = async (req, res) => {
  try {
    const cfg = await storage.getStorageConfig();
    if (cfg.backend && cfg.backend !== 'filesystem') {
      return res.status(400).json({ error: 'Récupération disponible uniquement en mode filesystem.' });
    }
    const dryRun = !!req.body.dryRun;
    const report = await storage.recoverMisplaced({ dryRun });
    res.json({ dryRun, ...report });
  } catch (err) {
    console.error('[STORAGE recover ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.testConnection = async (req, res) => {
  try {
    const cfg = await loadAlfrescoConfig();
    console.log(`[GED testConnection] url=${cfg.url}, username=${cfg.username}, hasPassword=${!!cfg.password}, rootPath=${cfg.rootPath}`);
    const result = await alfresco.testConnexion(cfg);
    if (result.ok) {
      res.json({ success: true, rootName: result.details?.racine?.nom || 'Company Home', details: result.details });
    } else {
      res.json({ success: false, error: result.message, details: result.details });
    }
  } catch (err) {
    console.error('[GED testConnection ERROR]', err.message);
    res.json({ success: false, error: err.message });
  }
};

// Renvoie la racine GED configurée (utilisée par l'explorateur Alfresco).
exports.getRoot = async (req, res) => {
  try {
    const cfg = await alfresco.getConfig();
    const root = await alfresco.getRoot(cfg);
    res.json({ success: true, root });
  } catch (err) {
    console.error('[GED getRoot ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Dépose un document (généré ou fourni) dans la racine GED, pour vérification dans Alfresco.
exports.testUpload = async (req, res) => {
  try {
    const cfg = await alfresco.getConfig();
    alfresco.assertConfigured(cfg);

    let name, buffer, mime;
    if (req.file && req.file.buffer) {
      name = req.file.originalname || 'document';
      buffer = req.file.buffer;
      mime = req.file.mimetype || 'application/octet-stream';
    } else {
      const stamp = new Date().toISOString();
      name = `test-dsihub-${stamp.replace(/[:.]/g, '-')}.txt`;
      buffer = Buffer.from(
        `Document de test déposé depuis /admin/ged\nDate : ${stamp}\nRacine configurée : ${cfg.rootPath}\n`,
        'utf8'
      );
      mime = 'text/plain';
    }

    const r = await alfresco.depositToRoot(cfg, { name, buffer, mime, description: 'Document de test déposé depuis /admin/ged' });
    console.log(`[GED testUpload] "${name}" → node ${r.nodeId} (racine ${r.root?.name || r.root?.id})`);
    res.json({ success: true, name, nodeId: r.nodeId, versionLabel: r.versionLabel, root: r.root });
  } catch (err) {
    console.error('[GED testUpload ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getNode = async (req, res) => {
  try {
    const { url, username, password } = await loadAlfrescoConfig();
    const { nodeId } = req.params;
    const r = await axios.get(`${alfrescoBase(url)}/nodes/${nodeId}?include=path`, {
      headers: { Authorization: basicAuth(username, password) }
    });
    res.json(r.data);
  } catch (err) {
    const error = describeAxiosError(err, 'getNode');
    console.error('[GED getNode ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};

exports.listSites = async (req, res) => {
  try {
    const cfg = await loadAlfrescoConfig();
    const { sites, attempts } = await alfresco.listSitesDiagnostic(cfg);
    res.json({ sites, attempts });
  } catch (err) {
    const error = describeAxiosError(err, 'listSites');
    console.error('[GED listSites ERROR]', error);
    res.status(500).json({ error });
  }
};

exports.listChildren = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const cfg = await loadAlfrescoConfig();

    // Conteneur virtuel « Sites » : liste les sites Alfresco.
    if (nodeId === 'site-container') {
      const sites = await alfresco.listSites(cfg);
      const entries = sites.map(s => ({ entry: { id: `site:${s.id}`, name: s.title || s.id, isFolder: true, nodeType: 'st:site' } }));
      return res.json({ list: { entries, pagination: { count: entries.length, hasMoreItems: false } } });
    }

    // Site virtuel « site:<id> » : renvoie son documentLibrary comme dossier unique.
    if (nodeId.startsWith('site:')) {
      const siteId = nodeId.slice('site:'.length);
      const libId = await alfresco.getSiteDocumentLibrary(cfg, siteId);
      if (!libId) return res.status(404).json({ error: `Site « ${siteId} » ou documentLibrary introuvable.` });
      const entries = [{ entry: { id: libId, name: 'documentLibrary', isFolder: true, nodeType: 'cm:folder' } }];
      return res.json({ list: { entries, pagination: { count: 1, hasMoreItems: false } } });
    }

    const { url, username, password } = cfg;
    const { maxItems = 200, skipCount = 0 } = req.query;
    const r = await axios.get(
      `${alfrescoBase(url)}/nodes/${nodeId}/children?include=properties,path&orderBy=isFolder DESC,name ASC&maxItems=${maxItems}&skipCount=${skipCount}`,
      { headers: { Authorization: basicAuth(username, password) } }
    );
    res.json(r.data);
  } catch (err) {
    const error = describeAxiosError(err, 'listChildren');
    console.error('[GED listChildren ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};

exports.downloadContent = async (req, res) => {
  try {
    const { url, username, password } = await loadAlfrescoConfig();
    const { nodeId } = req.params;
    const infoR = await axios.get(`${alfrescoBase(url)}/nodes/${nodeId}`, {
      headers: { Authorization: basicAuth(username, password) }
    });
    const fileName = infoR.data?.entry?.name || 'document';
    const contentR = await axios.get(`${alfrescoBase(url)}/nodes/${nodeId}/content`, {
      headers: { Authorization: basicAuth(username, password) },
      responseType: 'stream'
    });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', contentR.headers['content-type'] || 'application/octet-stream');
    if (contentR.headers['content-length']) {
      res.setHeader('Content-Length', contentR.headers['content-length']);
    }
    contentR.data.pipe(res);
  } catch (err) {
    const error = describeAxiosError(err, 'downloadContent');
    console.error('[GED downloadContent ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const { url, username, password } = await loadAlfrescoConfig();
    const { nodeId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom du dossier requis' });
    const r = await axios.post(
      `${alfrescoBase(url)}/nodes/${nodeId}/children`,
      { name: name.trim(), nodeType: 'cm:folder' },
      { headers: { Authorization: basicAuth(username, password), 'Content-Type': 'application/json' } }
    );
    res.json(r.data);
  } catch (err) {
    const error = describeAxiosError(err, 'createFolder');
    console.error('[GED createFolder ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    const { url, username, password } = await loadAlfrescoConfig();
    const { nodeId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const form = new FormData();
    form.append('filedata', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    form.append('name', req.file.originalname);
    form.append('nodeType', 'cm:content');
    const r = await axios.post(
      `${alfrescoBase(url)}/nodes/${nodeId}/children`,
      form,
      { headers: { Authorization: basicAuth(username, password), ...form.getHeaders() } }
    );
    res.json(r.data);
  } catch (err) {
    const error = describeAxiosError(err, 'uploadFile');
    console.error('[GED uploadFile ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};

exports.deleteNode = async (req, res) => {
  try {
    const { url, username, password } = await loadAlfrescoConfig();
    const { nodeId } = req.params;
    await axios.delete(`${alfrescoBase(url)}/nodes/${nodeId}`, {
      headers: { Authorization: basicAuth(username, password) }
    });
    res.json({ success: true });
  } catch (err) {
    const error = describeAxiosError(err, 'deleteNode');
    console.error('[GED deleteNode ERROR]', error);
    res.status(err.response?.status || 500).json({ error });
  }
};
