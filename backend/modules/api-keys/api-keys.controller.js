const { pool, pgDb } = require('../../shared/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function generateApiKey() {
  const raw = crypto.randomBytes(32).toString('hex');
  const prefix = 'dsk_' + raw.slice(0, 16);
  const secret = raw.slice(16);
  return { raw: prefix + secret, prefix, secret };
}

async function hashKey(secret) {
  return bcrypt.hash(secret, 10);
}

async function verifyKey(raw, hash) {
  return bcrypt.compare(raw, hash);
}

module.exports = {
  // GET /api/admin/api-keys
  async list(req, res) {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, key_prefix, scope, permissions, expires_at, is_active, created_by, created_at, last_used_at
         FROM hub.api_keys ORDER BY created_at DESC`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // POST /api/admin/api-keys  { name, scope?, permissions?, expires_at? }
  async create(req, res) {
    const { name, scope, permissions, expires_at } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name requis' });
    const perms = permissions === 'read_write' ? 'read_write' : 'read';
    try {
      const { raw, prefix, secret } = generateApiKey();
      const key_hash = await hashKey(secret);
      const { rows } = await pool.query(
        `INSERT INTO hub.api_keys (name, key_hash, key_prefix, scope, permissions, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [name.trim(), key_hash, prefix, scope || '*', perms, expires_at || null, req.user?.username || 'admin']
      );
      res.status(201).json({
        id: rows[0].id,
        name: name.trim(),
        key_prefix: prefix,
        api_key: raw,
        scope: scope || '*',
        permissions: perms,
        expires_at: expires_at || null,
        message: 'Cette clé ne sera plus jamais affichée. Conservez-la précieusement.'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // PATCH /api/admin/api-keys/:id  { name?, scope?, permissions?, expires_at?, is_active? }
  async update(req, res) {
    const { id } = req.params;
    const fields = [];
    const params = [];
    let idx = 1;
    for (const key of ['name', 'scope', 'permissions', 'expires_at', 'is_active']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    params.push(id);
    try {
      await pool.query(
        `UPDATE hub.api_keys SET ${fields.join(', ')} WHERE id = $${idx}`,
        params
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // DELETE /api/admin/api-keys/:id
  async remove(req, res) {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM hub.api_keys WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
};
