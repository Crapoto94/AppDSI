const fs = require('fs');
const path = require('path');
const { pgDb } = require('../shared/pg_db');

// Le document de doctrine affiché par la tuile « Notes & doctrines ».
// Il est livré avec le code (docs/DOCTRINE-DSI.md) et non stocké en base.
const DOCTRINE_MD_PATH = path.join(__dirname, '..', '..', 'docs', 'DOCTRINE-DSI.md');

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'section';
}

// Découpe le markdown sur les titres de niveau 2 (## ...) : chaque section
// devient une ancre stable pour les commentaires.
function parseSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  const seen = {};
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    const title = m[1].trim();
    const base = slugify(title);
    if (seen[base] === undefined) {
      seen[base] = 0;
    } else {
      seen[base] += 1;
    }
    const key = seen[base] === 0 ? base : `${base}-${seen[base]}`;
    sections.push({ key, title });
  }
  return sections;
}

function readDoctrine() {
  const markdown = fs.readFileSync(DOCTRINE_MD_PATH, 'utf-8');
  return { markdown, sections: parseSections(markdown) };
}

// GET /api/doctrines/markdown
exports.getMarkdown = async (req, res) => {
  try {
    const { markdown, sections } = readDoctrine();
    const stat = fs.statSync(DOCTRINE_MD_PATH);
    res.json({ markdown, sections, updated_at: stat.mtime });
  } catch (error) {
    console.error('Error reading doctrine markdown:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/doctrines/comments
exports.getAllComments = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT id, section_key, section_title, content, created_by, created_at
      FROM hub.doctrine_comments
      ORDER BY created_at ASC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching doctrine comments:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/doctrines/comments  { section_key, section_title, content }
exports.createComment = async (req, res) => {
  try {
    const { section_key, section_title, content } = req.body;
    const username = req.user.username;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
    }

    const row = await pgDb.get(`
      INSERT INTO hub.doctrine_comments (section_key, section_title, content, created_by, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, section_key, section_title, content, created_by, created_at
    `, [section_key || 'document', section_title || null, String(content).trim(), username]);

    res.json(row);
  } catch (error) {
    console.error('Error creating doctrine comment:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/doctrines/comments/:id — auteur ou admin/superadmin
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pgDb.get('SELECT id, created_by FROM hub.doctrine_comments WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (existing.created_by !== req.user.username && !isAdmin) {
      return res.status(403).json({ error: 'Suppression réservée à l\'auteur ou à un administrateur' });
    }
    await pgDb.run('DELETE FROM hub.doctrine_comments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting doctrine comment:', error);
    res.status(500).json({ error: error.message });
  }
};
