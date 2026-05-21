const { pgDb } = require('../shared/pg_db');

// Get all backlog items
exports.getAllBacklogItems = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT
        id, title, description, category, status, created_by,
        created_at, updated_at, user_id
      FROM hub.backlog
      ORDER BY created_at DESC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching backlog:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create new backlog item
exports.createBacklogItem = async (req, res) => {
  try {
    const { title, description, category, tile_id } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const validCategories = ['Bug', 'Amélioration', 'Nouvelle fonctionnalité', 'Graphisme'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const result = await pgDb.run(`
      INSERT INTO hub.backlog (title, description, category, status, user_id, created_by, tile_id, created_at, updated_at)
      VALUES ($1, $2, $3, 'open', $4, $5, $6, NOW(), NOW())
    `, [title, description || '', category, userId, username, tile_id || null]);

    res.json({ id: result.lastID, title, description, category, status: 'open', tile_id });
  } catch (error) {
    console.error('Error creating backlog item:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update backlog item (admin only)
exports.updateBacklogItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, status, created_by } = req.body;

    const validStatuses = ['open', 'in_progress', 'accepted', 'rejected', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description);
    }
    if (category) {
      updates.push(`category = $${paramCount++}`);
      params.push(category);
    }
    if (status) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }
    if (created_by) {
      updates.push(`created_by = $${paramCount++}`);
      params.push(created_by);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pgDb.run(`
      UPDATE hub.backlog
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
    `, params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating backlog item:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete backlog item (admin only)
exports.deleteBacklogItem = async (req, res) => {
  try {
    const { id } = req.params;

    await pgDb.run('DELETE FROM hub.backlog WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting backlog item:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get backlog item by ID
exports.getBacklogItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`
      SELECT * FROM hub.backlog WHERE id = $1
    `, [id]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching backlog item:', error);
    res.status(500).json({ error: error.message });
  }
};
