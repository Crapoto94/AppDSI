const axios = require('axios');
const FormData = require('form-data');
const { getSqlite } = require('../../shared/database');

function alfrescoBase(url) {
  return `${url.replace(/\/$/, '')}/alfresco/api/-default-/public/alfresco/versions/1`;
}

function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

async function getConfig() {
  const db = getSqlite();
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
    res.json({ url, username, hasPassword: !!password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { url, username, password } = req.body;
    const db = getSqlite();
    const sql = `INSERT INTO app_settings (setting_key, setting_value, description)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`;
    await db.run(sql, ['alfresco.url', url || '', 'URL du serveur Alfresco (ex: http://10.x.x.x:8080)']);
    await db.run(sql, ['alfresco.username', username || '', 'Compte de service Alfresco']);
    if (password !== undefined && password !== '') {
      await db.run(sql, ['alfresco.password', password, 'Mot de passe du compte de service Alfresco']);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[GED saveConfig ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.testConnection = async (req, res) => {
  try {
    const { url, username, password } = await getConfig();
    if (!url || !username || !password) {
      return res.json({ success: false, error: 'Configuration incomplète — renseignez URL, utilisateur et mot de passe.' });
    }
    const response = await axios.get(`${alfrescoBase(url)}/nodes/-root-`, {
      headers: { Authorization: basicAuth(username, password) },
      timeout: 8000
    });
    res.json({ success: true, rootName: response.data?.entry?.name || 'Company Home' });
  } catch (err) {
    let error = err.message;
    if (err.response?.status === 401) error = 'Identifiants incorrects (401)';
    else if (err.response?.status === 403) error = 'Accès refusé (403)';
    else if (err.code === 'ECONNREFUSED') error = 'Connexion refusée — vérifiez l\'URL et que le serveur est démarré';
    else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') error = 'Timeout — serveur inaccessible';
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
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.briefSummary || err.message });
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
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.briefSummary || err.message });
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
    res.status(err.response?.status || 500).json({ error: err.message });
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
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.briefSummary || err.message });
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
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.briefSummary || err.message });
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
    res.status(err.response?.status || 500).json({ error: err.message });
  }
};
