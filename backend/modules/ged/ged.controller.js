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

async function getConfig() {
  const db = getDb();
  const keys = ['alfresco.url', 'alfresco.username', 'alfresco.password'];
  const config = {};
  for (const k of keys) {
    const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', k);
    config[k] = row?.setting_value || '';
  }
  return { url: config['alfresco.url'], username: config['alfresco.username'], password: config['alfresco.password'] };
}

exports.getConfig = async (req, res) => {
  try {
    const { url, username, password } = await getConfig();
    console.log(`[GED getConfig] url=${url ? url : '(vide)'}, username=${username ? username : '(vide)'}, hasPassword=${!!password}`);
    res.json({ url, username, hasPassword: !!password });
  } catch (err) {
    console.error('[GED getConfig ERROR]', err.message);
    res.status(500).json({ error: `Impossible de charger la configuration GED : ${err.message}` });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { url, username, password } = req.body;
    console.log(`[GED saveConfig] Sauvegarde config — url=${url}, username=${username}, passwordProvided=${!!(password && password !== '••••••••')}`);

    const db = getDb();

    // Vérifier que la table app_settings existe
    const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'");
    if (!tableCheck) {
      console.error('[GED saveConfig ERROR] Table app_settings introuvable dans la base SQLite');
      return res.status(500).json({ error: 'Table app_settings introuvable dans la base SQLite. La base de données est peut-être corrompue ou non initialisée.' });
    }

    const sql = `INSERT INTO app_settings (setting_key, setting_value, description)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`;

    await db.run(sql, ['alfresco.url', url || '', 'URL du serveur Alfresco (ex: https://alfresco.ivry.local)']);
    console.log('[GED saveConfig] alfresco.url sauvegardé');

    await db.run(sql, ['alfresco.username', username || '', 'Compte de service Alfresco']);
    console.log('[GED saveConfig] alfresco.username sauvegardé');

    if (password !== undefined && password !== '' && password !== '••••••••') {
      await db.run(sql, ['alfresco.password', password, 'Mot de passe du compte de service Alfresco']);
      console.log('[GED saveConfig] alfresco.password sauvegardé');
    }

    // Re-lire pour confirmer
    const verify = await getConfig();
    console.log(`[GED saveConfig] Vérification après sauvegarde — url=${verify.url}, username=${verify.username}, hasPassword=${!!verify.password}`);

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
    const { url, username, password } = await getConfig();
    console.log(`[GED testConnection] url=${url}, username=${username}, hasPassword=${!!password}`);

    if (!url) return res.json({ success: false, error: 'URL du serveur Alfresco non configurée. Renseignez-la dans le formulaire et cliquez sur "Enregistrer" d\'abord.' });
    if (!username) return res.json({ success: false, error: 'Nom d\'utilisateur Alfresco non configuré.' });
    if (!password) return res.json({ success: false, error: 'Mot de passe Alfresco non configuré.' });

    const targetUrl = `${alfrescoBase(url)}/nodes/-root-`;
    console.log(`[GED testConnection] Appel API : GET ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: { Authorization: basicAuth(username, password) },
      timeout: 10000
    });

    const rootName = response.data?.entry?.name || 'Company Home';
    console.log(`[GED testConnection] Succès ! Nœud racine : "${rootName}"`);
    res.json({ success: true, rootName });
  } catch (err) {
    const error = describeAxiosError(err, 'testConnection');
    console.error('[GED testConnection ERROR]', error);
    res.json({ success: false, error });
  }
};

exports.getNode = async (req, res) => {
  try {
    const { url, username, password } = await getConfig();
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

exports.listChildren = async (req, res) => {
  try {
    const { url, username, password } = await getConfig();
    const { nodeId } = req.params;
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
    const { url, username, password } = await getConfig();
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
    const { url, username, password } = await getConfig();
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
    const { url, username, password } = await getConfig();
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
    const { url, username, password } = await getConfig();
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
