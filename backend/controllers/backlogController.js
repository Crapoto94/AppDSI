const { pgDb } = require('../shared/pg_db');
const { getSqlite } = require('../shared/database');
const ldap = require('ldapjs');

let sendMailFn = null;
let dbFn = null; // SQLite database
const setSendMail = (fn) => { sendMailFn = fn; };
const setDb = (fn) => { dbFn = fn; };

// Helper to flatten LDAP entries
function flattenLDAPEntry(entry) {
  if (!entry || !entry.pojo) return null;
  const obj = {};
  if (entry.pojo.attributes) {
    entry.pojo.attributes.forEach(attr => {
      obj[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
    });
  }
  return obj;
}

// Get email from AD (Active Directory / Entra AD)
async function getADUserEmail(username) {
  try {
    if (!dbFn) {
      console.log(`[BACKLOG] DB function not available for AD lookup`);
      return null;
    }

    const adSettings = await dbFn.get('SELECT * FROM ad_settings WHERE id = 1', []);
    if (!adSettings || !adSettings.is_enabled) {
      console.log(`[BACKLOG] AD not enabled`);
      return null;
    }

    return new Promise((resolve) => {
      const client = ldap.createClient({
        url: `ldap://${adSettings.host}:${adSettings.port}`,
        connectTimeout: 5000,
        timeout: 5000
      });

      client.on('error', (err) => {
        console.log(`[BACKLOG] AD LDAP error: ${err.message}`);
        client.destroy();
        resolve(null);
      });

      client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
        if (err) {
          console.log(`[BACKLOG] AD bind failed: ${err.message}`);
          client.destroy();
          return resolve(null);
        }

        const searchOptions = {
          filter: `(sAMAccountName=${username})`,
          scope: 'sub',
          attributes: ['mail'],
          referrals: false,
          paged: false
        };

        client.search(adSettings.base_dn, searchOptions, (err, res) => {
          if (err) {
            console.log(`[BACKLOG] AD search error: ${err.message}`);
            client.destroy();
            return resolve(null);
          }

          let userEmail = null;
          res.on('searchEntry', (entry) => {
            const obj = flattenLDAPEntry(entry);
            if (obj && obj.mail) {
              userEmail = Array.isArray(obj.mail) ? obj.mail[0] : obj.mail;
            }
          });

          res.on('error', (err) => {
            console.log(`[BACKLOG] AD search results error: ${err.message}`);
            client.destroy();
            resolve(null);
          });

          res.on('end', () => {
            client.destroy();
            if (userEmail) {
              console.log(`[BACKLOG] Found email in AD for ${username}: ${userEmail}`);
            } else {
              console.log(`[BACKLOG] No email found in AD for ${username}`);
            }
            resolve(userEmail);
          });
        });
      });
    });
  } catch (error) {
    console.error(`[BACKLOG] Error getting AD user email:`, error.message);
    return null;
  }
}

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
    const userEmail = req.user.email || '';

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
      INSERT INTO hub.backlog (title, description, category, status, user_id, created_by, created_by_email, tile_id, attachments, created_at, updated_at)
      VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, NOW(), NOW())
    `, [title, description || '', category, userId, username, userEmail, tile_id || null, JSON.stringify(attachments)]);

    // Send acknowledgment email (AR)
    if (userEmail && sendMailFn) {
      try {
        const arContent = `
          <h2>Accusé de réception - Demande enregistrée</h2>
          <p>Votre demande <strong>"${title}"</strong> a été enregistrée avec succès.</p>
          <p><strong>Catégorie :</strong> ${category}</p>
          <p><strong>Statut :</strong> En attente</p>
          <p>Un administrateur traitera votre demande au plus tôt.</p>
          <p>Vous pouvez consulter l'état de votre demande dans le portail DSI Hub.</p>
        `;
        console.log(`[BACKLOG] Sending AR email to ${userEmail}`);
        await sendMailFn(userEmail, `[DSI Hub] AR - Demande reçue : ${title}`, arContent);
        console.log(`[BACKLOG] AR email sent successfully to ${userEmail}`);
      } catch (emailError) {
        console.error(`[BACKLOG] Error sending AR email:`, emailError);
      }
    }

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
    const { title, description, category, status, created_by, admin_comment, tile_id } = req.body;

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
    if (admin_comment !== undefined) {
      updates.push(`admin_comment = $${paramCount++}`);
      params.push(admin_comment || null);
    }
    if (tile_id !== undefined) {
      updates.push(`tile_id = $${paramCount++}`);
      params.push(tile_id || null);
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
      let requesterEmail = currentItem.created_by_email || '';

      console.log(`[BACKLOG] Status change: ${currentItem.status} → ${status}, requester: ${requesterUsername}`);

      try {
        // If email not stored, try to find it from AD first, then PostgreSQL, then SQLite
        if (!requesterEmail) {
          console.log(`[BACKLOG] Email not found in backlog item, searching for ${requesterUsername}`);

          // Try AD first
          requesterEmail = await getADUserEmail(requesterUsername);

          // Fallback to PostgreSQL if not found in AD
          if (!requesterEmail) {
            let requesterUser = await pgDb.get(
              'SELECT email FROM hub.users WHERE username = $1',
              [requesterUsername]
            );

            console.log(`[BACKLOG] PostgreSQL lookup for ${requesterUsername}:`, requesterUser);

            if (requesterUser && requesterUser.email) {
              requesterEmail = requesterUser.email;
            }
          }

          // Fallback to SQLite if not found in PostgreSQL
          if (!requesterEmail) {
            const sqlite = getSqlite();
            if (sqlite) {
              try {
                let requesterUser = await sqlite.get(
                  'SELECT email FROM users WHERE username = ?',
                  [requesterUsername]
                );
                console.log(`[BACKLOG] SQLite fallback lookup for ${requesterUsername}:`, requesterUser);

                if (requesterUser && requesterUser.email) {
                  requesterEmail = requesterUser.email;
                }
              } catch (sqliteErr) {
                console.log(`[BACKLOG] SQLite lookup failed: ${sqliteErr.message}`);
              }
            }
          }
        }

        if (requesterEmail) {
          const statusLabels = {
            'open': 'En attente',
            'in_progress': 'En cours',
            'accepted': 'Acceptée',
            'rejected': 'Rejetée',
            'completed': 'Complétée'
          };

          const oldStatusLabel = statusLabels[currentItem.status] || currentItem.status;
          const newStatusLabel = statusLabels[status] || status;

          let emailContent = `
            <h2>Mise à jour de votre demande</h2>
            <p>Votre demande <strong>"${currentItem.title}"</strong> a été mise à jour.</p>
            <p><strong>Statut précédent :</strong> ${oldStatusLabel}</p>
            <p><strong>Nouveau statut :</strong> ${newStatusLabel}</p>
          `;

          if (admin_comment) {
            emailContent += `
              <div style="background-color: #f0f4f8; padding: 12px; border-left: 4px solid #3b82f6; margin: 16px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e40af;">Commentaire administrateur :</p>
                <p style="margin: 0; color: #334155; white-space: pre-wrap; word-break: break-word;">${admin_comment}</p>
              </div>
            `;
          }

          emailContent += `<p>Vous pouvez consulter les détails dans le portail DSI Hub.</p>`;

          console.log(`[BACKLOG] Sending email to ${requesterEmail}`);
          await sendMailFn(requesterEmail, `[DSI Hub] Mise à jour : ${currentItem.title}`, emailContent);
          console.log(`[BACKLOG] Email sent successfully to ${requesterEmail}`);
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
exports.setDb = setDb;
