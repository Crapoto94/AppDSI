const { pool } = require('../../shared/pg_db');

module.exports = {
  getAgents: async (req, res) => {
    try {
      const agents = await pool.query(`
        SELECT a.*,
          COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days,
          COALESCE(json_agg(json_build_object('id', ap.id, 'jour_semaine', ap.jour_semaine, 'periode', ap.periode)) FILTER (WHERE ap.id IS NOT NULL), '[]') as absences
        FROM hub_calendrier.agents_dsi a
        LEFT JOIN hub_calendrier.absences_permanentes ap ON a.username = ap.agent_username
        GROUP BY a.username
        ORDER BY LOWER(COALESCE(a.service, '')), LOWER(a.nom)
      `);
      res.json(agents.rows);
    } catch (error) {
      console.error('[Agents DSI] getAgents error:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération', error: error.message });
    }
  },

  createAgent: async (req, res) => {
    const client = await pool.connect();
    try {
      const { username, nom, email, service, tt_fixed_days } = req.body;
      if (!username || !nom) {
        client.release();
        return res.status(400).json({ message: 'Champs requis : username, nom' });
      }
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO hub_calendrier.agents_dsi (username, nom, email, service, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING username, nom, email, service, created_by, created_at`,
        [username, nom, email || '', service || '', req.user.username]
      );
      if (Array.isArray(tt_fixed_days)) {
        for (const day of tt_fixed_days) {
          if (day >= 0 && day <= 6) {
            await client.query(
              `INSERT INTO hub_calendrier.agents_tt_days (agent_username, jour_semaine) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [username, day]
            );
          }
        }
      }
      await client.query('COMMIT');
      const agent = await pool.query(`
        SELECT a.*,
          COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days
        FROM hub_calendrier.agents_dsi a WHERE a.username = $1
      `, [username]);
      res.json(agent.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') {
        client.release();
        return res.status(409).json({ message: 'Cet agent existe déjà' });
      }
      console.error('[Agents DSI] createAgent error:', error);
      res.status(500).json({ message: "Erreur lors de la création", error: error.message });
    } finally {
      client.release();
    }
  },

  updateAgent: async (req, res) => {
    const client = await pool.connect();
    try {
      const { username } = req.params;
      const { nom, email, service, tt_fixed_days } = req.body;
      if (!Array.isArray(tt_fixed_days)) {
        client.release();
        return res.status(400).json({ message: 'tt_fixed_days requis (tableau)' });
      }
      for (const day of tt_fixed_days) {
        if (day < 0 || day > 6) {
          client.release();
          return res.status(400).json({ message: 'Les jours doivent être entre 0 et 6' });
        }
      }
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE hub_calendrier.agents_dsi SET nom = COALESCE($1, nom), email = COALESCE($2, email), service = COALESCE($3, service) WHERE username = $4`,
        [nom || null, email != null ? email : null, service != null ? service : null, username]
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ message: 'Agent non trouvé' });
      }
      // Replace all TT days
      await client.query('DELETE FROM hub_calendrier.agents_tt_days WHERE agent_username = $1', [username]);
      for (const day of tt_fixed_days) {
        await client.query(
          `INSERT INTO hub_calendrier.agents_tt_days (agent_username, jour_semaine) VALUES ($1, $2)`,
          [username, day]
        );
      }
      await client.query('COMMIT');
      const agent = await pool.query(`
        SELECT a.*,
          COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days
        FROM hub_calendrier.agents_dsi a WHERE a.username = $1
      `, [username]);
      res.json(agent.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Agents DSI] updateAgent error:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    } finally {
      client.release();
    }
  },

  deleteAgent: async (req, res) => {
    try {
      const { username } = req.params;
      const result = await pool.query('DELETE FROM hub_calendrier.agents_dsi WHERE username = $1', [username]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'Agent non trouvé' });
      res.json({ message: 'Agent supprimé' });
    } catch (error) {
      console.error('[Agents DSI] deleteAgent error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  },

  addAbsence: async (req, res) => {
    try {
      const { username } = req.params;
      const { jour_semaine, periode } = req.body;
      if (jour_semaine == null || jour_semaine < 0 || jour_semaine > 6) {
        return res.status(400).json({ message: 'jour_semaine requis (0-6)' });
      }
      if (!['journee', 'matin', 'apres-midi'].includes(periode)) {
        return res.status(400).json({ message: "période doit être 'journee', 'matin' ou 'apres-midi'" });
      }
      const agent = await pool.query('SELECT username FROM hub_calendrier.agents_dsi WHERE username = $1', [username]);
      if (agent.rowCount === 0) return res.status(404).json({ message: 'Agent non trouvé' });
      const result = await pool.query(
        `INSERT INTO hub_calendrier.absences_permanentes (agent_username, jour_semaine, periode) VALUES ($1, $2, $3) RETURNING *`,
        [username, jour_semaine, periode]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Agents DSI] addAbsence error:', error);
      res.status(500).json({ message: "Erreur lors de l'ajout de l'absence", error: error.message });
    }
  },

  deleteAbsence: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM hub_calendrier.absences_permanentes WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'Absence non trouvée' });
      res.json({ message: 'Absence supprimée' });
    } catch (error) {
      console.error('[Agents DSI] deleteAbsence error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  }
};
