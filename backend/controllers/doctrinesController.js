const fs = require('fs');
const path = require('path');
const { pgDb } = require('../shared/pg_db');

// Le document de doctrine affiché par la tuile « Notes & doctrines ».
// Il est livré avec le code (docs/DOCTRINE-DSI.md) et non stocké en base.
//
// Chemins candidats, dans l'ordre :
//  - DOCTRINE_MD_PATH (surcharge explicite) ;
//  - dev / repo : <repo>/docs/DOCTRINE-DSI.md (backend/controllers -> 2 niveaux) ;
//  - doc embarqué côté backend : backend/docs/DOCTRINE-DSI.md ;
//  - Docker : le dossier docs/ est monté dans le conteneur (/app/docs ou /docs).
const DOCTRINE_MD_CANDIDATES = [
  process.env.DOCTRINE_MD_PATH,
  path.join(__dirname, '..', '..', 'docs', 'DOCTRINE-DSI.md'),
  path.join(__dirname, '..', 'docs', 'DOCTRINE-DSI.md'),
  '/app/docs/DOCTRINE-DSI.md',
  '/docs/DOCTRINE-DSI.md',
].filter(Boolean);

function resolveDoctrinePath() {
  for (const candidate of DOCTRINE_MD_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      // ignore et passe au candidat suivant
    }
  }
  return DOCTRINE_MD_CANDIDATES[0];
}

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
  const filePath = resolveDoctrinePath();
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return { filePath, markdown, sections: parseSections(markdown) };
}

// GET /api/doctrines/markdown
exports.getMarkdown = async (req, res) => {
  try {
    const { filePath, markdown, sections } = readDoctrine();
    const stat = fs.statSync(filePath);
    res.json({ markdown, sections, updated_at: stat.mtime });
  } catch (error) {
    console.error('Error reading doctrine markdown:', error, '| candidats:', DOCTRINE_MD_CANDIDATES);
    res.status(500).json({
      error: 'Document de doctrine introuvable',
      detail: error.message,
      candidates: DOCTRINE_MD_CANDIDATES,
    });
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

// Statuts de revue autorisés pour une doctrine.
const REVIEW_STATUSES = ['ok', 'a_voir', 'a_supprimer'];

// GET /api/doctrines/reviews — état de revue de chaque doctrine (règle).
exports.getReviews = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT id, item_key, section_key, section_title, rule_excerpt, status, comment, reviewed_by, updated_at
      FROM hub.doctrine_reviews
      ORDER BY updated_at DESC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching doctrine reviews:', error);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/doctrines/reviews  { item_key, section_key, section_title, rule_excerpt, status, comment }
// Réservé aux administrateurs (voir routes).
exports.upsertReview = async (req, res) => {
  try {
    const { item_key, section_key, section_title, rule_excerpt, status, comment } = req.body;
    if (!item_key || !String(item_key).trim()) {
      return res.status(400).json({ error: 'item_key requis' });
    }
    if (!REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status doit être l'un de : ${REVIEW_STATUSES.join(', ')}` });
    }

    const row = await pgDb.get(`
      INSERT INTO hub.doctrine_reviews (item_key, section_key, section_title, rule_excerpt, status, comment, reviewed_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (item_key) DO UPDATE SET
        section_key = EXCLUDED.section_key,
        section_title = EXCLUDED.section_title,
        rule_excerpt = EXCLUDED.rule_excerpt,
        status = EXCLUDED.status,
        comment = EXCLUDED.comment,
        reviewed_by = EXCLUDED.reviewed_by,
        updated_at = NOW()
      RETURNING id, item_key, section_key, section_title, rule_excerpt, status, comment, reviewed_by, updated_at
    `, [
      String(item_key).trim(),
      section_key || null,
      section_title || null,
      rule_excerpt ? String(rule_excerpt).slice(0, 500) : null,
      status,
      comment ? String(comment).trim() : null,
      req.user.username,
    ]);

    res.json(row);
  } catch (error) {
    console.error('Error upserting doctrine review:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/doctrines/reviews/:item_key — réinitialise l'état (admin).
exports.deleteReview = async (req, res) => {
  try {
    await pgDb.run('DELETE FROM hub.doctrine_reviews WHERE item_key = $1', [req.params.item_key]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting doctrine review:', error);
    res.status(500).json({ error: error.message });
  }
};
