const { pgDb } = require('../shared/pg_db');

// Get all doctrines
exports.getAllDoctrines = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT id, title, content, category, doctrine_date, created_by, created_at
      FROM hub.doctrines
      ORDER BY doctrine_date DESC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching doctrines:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create new doctrine
exports.createDoctrine = async (req, res) => {
  try {
    const { title, content, category, doctrine_date } = req.body;
    const username = req.user.username;

    if (!title || !content || !doctrine_date) {
      return res.status(400).json({ error: 'Title, content and date are required' });
    }

    const result = await pgDb.run(`
      INSERT INTO hub.doctrines (title, content, category, doctrine_date, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `, [title, content, category || null, doctrine_date, username]);

    res.json({ id: result.lastID, title, content, category, doctrine_date, created_by: username });
  } catch (error) {
    console.error('Error creating doctrine:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update doctrine
exports.updateDoctrine = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, doctrine_date } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount++}`);
      params.push(title);
    }
    if (content) {
      updates.push(`content = $${paramCount++}`);
      params.push(content);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      params.push(category);
    }
    if (doctrine_date) {
      updates.push(`doctrine_date = $${paramCount++}`);
      params.push(doctrine_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pgDb.run(`
      UPDATE hub.doctrines
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
    `, params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating doctrine:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete doctrine
exports.deleteDoctrine = async (req, res) => {
  try {
    const { id } = req.params;

    await pgDb.run('DELETE FROM hub.doctrines WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting doctrine:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get doctrine by ID
exports.getDoctrine = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`
      SELECT * FROM hub.doctrines WHERE id = $1
    `, [id]);

    if (!item) {
      return res.status(404).json({ error: 'Doctrine not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching doctrine:', error);
    res.status(500).json({ error: error.message });
  }
};
