const { pgDb } = require('../shared/pg_db');

// Get all docs (metadata only, without content, for a light menu list)
exports.getAllDocs = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT id, title, sort_order, created_by, created_at, updated_at
      FROM hub.vibecoding_docs
      ORDER BY sort_order ASC, created_at ASC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching vibecoding docs:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get one doc with its content
exports.getDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`
      SELECT * FROM hub.vibecoding_docs WHERE id = $1
    `, [id]);

    if (!item) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching vibecoding doc:', error);
    res.status(500).json({ error: error.message });
  }
};

// Upload a new .md doc (multipart file, read via multer memoryStorage)
exports.uploadDoc = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier .md requis' });
    }

    const content = req.file.buffer.toString('utf-8');
    const title = (req.body.title || req.file.originalname.replace(/\.md$/i, '')).trim();
    const username = req.user.username;

    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis' });
    }

    const maxOrder = await pgDb.get(`SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM hub.vibecoding_docs`);

    const result = await pgDb.run(`
      INSERT INTO hub.vibecoding_docs (title, content, sort_order, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [title, content, (maxOrder?.max_order || 0) + 1, username]);

    res.json({ id: result.lastID, title, sort_order: (maxOrder?.max_order || 0) + 1, created_by: username });
  } catch (error) {
    console.error('Error uploading vibecoding doc:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete a doc
exports.deleteDoc = async (req, res) => {
  try {
    const { id } = req.params;
    await pgDb.run('DELETE FROM hub.vibecoding_docs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vibecoding doc:', error);
    res.status(500).json({ error: error.message });
  }
};
