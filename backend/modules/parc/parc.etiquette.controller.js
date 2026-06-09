// ── Logo des étiquettes du parc ────────────────────────────────────────────────
// Le logo imprimé sur les étiquettes (page /parc → Gestion des étiquettes) est un
// réglage global unique. Il est stocké dans le dépôt de documents configuré dans
// /GED (shared/storage : filesystem local/UNC ou SMB), sous le module « etiquettes ».
// Le chemin de stockage est persisté dans app_settings (SQLite) pour pouvoir le
// servir et le remplacer. Le fichier est servi publiquement via /storage/<chemin>.
const storage = require('../../shared/storage');
const { getSqlite } = require('../../shared/database');

const LOGO_SETTING_KEY = 'etiquette.logo_path';
const STORAGE_MODULE = 'etiquettes';
const STORAGE_ID = 'logo';

async function readLogoPath() {
  const db = getSqlite();
  if (!db) return '';
  try {
    const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', LOGO_SETTING_KEY);
    return (row && row.setting_value) ? row.setting_value : '';
  } catch (e) {
    return '';
  }
}

// Construit l'URL publique servie par le mount /api/storage (proxifié en dev,
// disponible en prod). dbPath commence par "storage/…".
function buildUrl(dbPath) {
  const rel = String(dbPath || '').replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return '/api/' + rel;
}

async function writeLogoPath(dbPath) {
  const db = getSqlite();
  if (!db) throw new Error('Base SQLite non initialisée.');
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value, description)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`,
    [LOGO_SETTING_KEY, dbPath || '', 'Chemin de stockage du logo des étiquettes du parc (GED)']
  );
}

// GET /api/parc/etiquette/logo → { url, path } (url null si aucun logo)
exports.getLogo = async (req, res) => {
  try {
    const dbPath = await readLogoPath();
    if (!dbPath) return res.json({ url: null, path: null });
    res.json({ url: buildUrl(dbPath), path: dbPath });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture logo', details: e.message });
  }
};

// POST /api/parc/etiquette/logo (multipart "file") → { url, path }
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Aucun fichier fourni.' });
    if (!/^image\//.test(req.file.mimetype || '')) {
      return res.status(400).json({ error: 'Le logo doit être une image.' });
    }
    // Supprime l'ancien logo s'il existe.
    const old = await readLogoPath();
    if (old) { try { await storage.deleteFile(old); } catch (e) { /* ignore */ } }

    const file = { buffer: req.file.buffer, originalname: storage.fixUploadName(req.file.originalname) };
    const saved = await storage.saveFile(STORAGE_MODULE, STORAGE_ID, file);
    await writeLogoPath(saved.dbPath);
    res.json({ url: buildUrl(saved.dbPath), path: saved.dbPath });
  } catch (e) {
    res.status(500).json({ error: "Erreur lors de l'enregistrement du logo", details: e.message });
  }
};

// DELETE /api/parc/etiquette/logo
exports.deleteLogo = async (req, res) => {
  try {
    const old = await readLogoPath();
    if (old) { try { await storage.deleteFile(old); } catch (e) { /* ignore */ } }
    await writeLogoPath('');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors de la suppression du logo', details: e.message });
  }
};
