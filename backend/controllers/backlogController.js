const { pgDb } = require('../shared/pg_db');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

// Get all backlog items
exports.getAllBacklogItems = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT
        id, title, description, category, status, created_by,
        created_at, updated_at, user_id, attachments
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

    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.originalname,
          path: file.filename,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString()
        });
      });
    }

    const result = await pgDb.run(`
      INSERT INTO hub.backlog (title, description, category, status, user_id, created_by, tile_id, attachments, created_at, updated_at)
      VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, NOW(), NOW())
    `, [title, description || '', category, userId, username, tile_id || null, JSON.stringify(attachments)]);

    res.json({ id: result.lastID, title, description, category, status: 'open', tile_id, attachments });
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

    // Get current item to check if status changed
    const currentItem = await pgDb.get('SELECT * FROM hub.backlog WHERE id = $1', [id]);
    if (!currentItem) {
      return res.status(404).json({ error: 'Item not found' });
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

    // Send email if status changed
    if (status && status !== currentItem.status && sendMailFn) {
      const requesterUsername = created_by || currentItem.created_by;
      console.log(`[BACKLOG] Status change: ${currentItem.status} → ${status}, requester: ${requesterUsername}`);

      try {
        // Get requester's email
        const requesterUser = await pgDb.get(
          'SELECT email FROM hub.users WHERE username = $1',
          [requesterUsername]
        );

        console.log(`[BACKLOG] User lookup for ${requesterUsername}:`, requesterUser);

        if (requesterUser && requesterUser.email) {
          const statusLabels = {
            'open': 'En attente',
            'in_progress': 'En cours',
            'accepted': 'Acceptée',
            'rejected': 'Rejetée',
            'completed': 'Complétée'
          };

          const oldStatusLabel = statusLabels[currentItem.status] || currentItem.status;
          const newStatusLabel = statusLabels[status] || status;

          const emailContent = `
            <h2>Mise à jour de votre demande</h2>
            <p>Votre demande <strong>"${currentItem.title}"</strong> a été mise à jour.</p>
            <p><strong>Statut précédent :</strong> ${oldStatusLabel}</p>
            <p><strong>Nouveau statut :</strong> ${newStatusLabel}</p>
            <p>Vous pouvez consulter les détails dans le portail DSI Hub.</p>
          `;

          console.log(`[BACKLOG] Sending email to ${requesterUser.email}`);
          await sendMailFn(requesterUser.email, `[DSI Hub] Mise à jour : ${currentItem.title}`, emailContent);
          console.log(`[BACKLOG] Email sent successfully to ${requesterUser.email}`);
        } else {
          console.log(`[BACKLOG] No email found for user ${requesterUsername}`);
        }
      } catch (emailError) {
        console.error(`[BACKLOG] Error sending email to requester:`, emailError);
        // Don't fail the request if email fails
      }
    }

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

exports.setSendMail = setSendMail;
