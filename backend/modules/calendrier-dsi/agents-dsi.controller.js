const { pool } = require('../../shared/pg_db');

function parseFlexibleDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const frMatch = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
    return val.split(' ')[0];
  }
  return null;
}

function mapDemabsRow(row, allColumns) {
  const find = (patterns) => {
    for (const p of patterns) {
      const col = allColumns.find(c => c.toUpperCase() === p.toUpperCase() || c.toUpperCase().includes(p.toUpperCase()));
      if (col) return row[col] || row[col.toUpperCase()] || null;
    }
    return null;
  };

  const matricule = find(['MATRICULE']) || find(['MATR']);
  const nom = find(['NOM_AGENT', 'NOM', 'NOMEMP']) || '';
  const prenom = find(['PRENOM_AGENT', 'PRENOM', 'PRENOMEMP']) || '';
  const dateDebut = parseFlexibleDate(find(['DATE_DEBUT', 'DATE_DEB', 'DATEDEBUT', 'DATE_DEM', 'DATE_DEMANDE']));
  const dateFin = parseFlexibleDate(find(['DATE_FIN', 'DATEFIN', 'DATE_RETOUR']));
  const typeAbsence = find(['TYPE_ABSENCE', 'TYPEABS', 'MOTIF_ABSENCE', 'MOTIFABS', 'CODE_ABS', 'CODE_ABSENCE', 'NATURE', 'NATURE_ABS']) || '';
  const motif = find(['LIBELLE_ABSENCE', 'LIBELLE', 'LIBELLEABS', 'LIBELLE_ABS', 'COMMENTAIRE']) || find(['TYPE_ABSENCE', 'TYPEABS', 'MOTIF_ABSENCE', 'MOTIFABS']) || '';
  const periodeDebut = find(['PERIODE_DEBUT', 'PERIODE_DEB', 'DEMI_JOUR_DEB', 'DEMIJDEB', 'MATIN_APRES MIDI_DEB']) || '';
  const periodeFin = find(['PERIODE_FIN', 'PERIODEFIN', 'DEMI_JOUR_FIN', 'DEMIJFIN', 'MATIN_APRES_MIDI_FIN']) || '';
  const statut = find(['STATUT', 'ETAT', 'STATUS', 'VALIDATION', 'ETAT_ABS']) || '';

  return {
    matricule: matricule ? String(matricule).trim() : null,
    nom: String(nom).trim(),
    prenom: String(prenom).trim(),
    date_debut: dateDebut,
    date_fin: dateFin,
    type_absence: String(typeAbsence).trim(),
    motif: String(motif).trim(),
    periode_debut: String(periodeDebut).trim(),
    periode_fin: String(periodeFin).trim(),
    statut: String(statut).trim(),
    commentaire: '',
    raw_data: row
  };
}

module.exports = {
  getAgents: async (req, res) => {
    try {
      const agents = await pool.query(`
        SELECT a.username, a.nom, a.email, a.service, a.matricule, a.created_by, a.created_at,
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
    console.log('[Agents DSI] createAgent request:', { body: req.body, user: req.user?.username });
    const client = await pool.connect();
    try {
      const { username, nom, email, service, tt_fixed_days } = req.body;
      if (!username || !nom) {
        client.release();
        console.error('[Agents DSI] Missing required fields: username or nom');
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
        SELECT a.username, a.nom, a.email, a.service, a.matricule, a.created_by, a.created_at,
          COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days,
          COALESCE(json_agg(json_build_object('id', ap.id, 'jour_semaine', ap.jour_semaine, 'periode', ap.periode)) FILTER (WHERE ap.id IS NOT NULL), '[]') as absences
        FROM hub_calendrier.agents_dsi a
        LEFT JOIN hub_calendrier.absences_permanentes ap ON a.username = ap.agent_username
        WHERE a.username = $1
        GROUP BY a.username
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
        SELECT a.username, a.nom, a.email, a.service, a.matricule, a.created_by, a.created_at,
          COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days,
          COALESCE(json_agg(json_build_object('id', ap.id, 'jour_semaine', ap.jour_semaine, 'periode', ap.periode)) FILTER (WHERE ap.id IS NOT NULL), '[]') as absences
        FROM hub_calendrier.agents_dsi a
        LEFT JOIN hub_calendrier.absences_permanentes ap ON a.username = ap.agent_username
        WHERE a.username = $1
        GROUP BY a.username
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
  },

  linkMatricule: async (req, res) => {
    try {
      const { username } = req.params;
      const { matricule } = req.body;

      if (matricule && matricule.trim() !== '') {
        const result = await pool.query(
          `UPDATE hub_calendrier.agents_dsi SET matricule = $1 WHERE username = $2 RETURNING username, nom, email, service, matricule`,
          [String(matricule).trim(), username]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Agent non trouvé' });
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `UPDATE hub_calendrier.agents_dsi SET matricule = '' WHERE username = $1 RETURNING username, nom, email, service, matricule`,
          [username]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Agent non trouvé' });
        res.json(result.rows[0]);
      }
    } catch (error) {
      console.error('[Agents DSI] linkMatricule error:', error);
      res.status(500).json({ message: 'Erreur lors de la liaison du matricule', error: error.message });
    }
  },

searchMatricule: async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.length < 1) {
        return res.json([]);
      }

      const searchTerm = `%${q.toUpperCase()}%`;

      const results = await pool.query(`
        SELECT DISTINCT "RH_AGENT_MATRICULE" as matricule,
          MAX("RH_AGENT_NOM") as nom,
          MAX("RH_AGENT_PRENOM") as prenom
        FROM oracle.rh_tps_demabs
        WHERE UPPER(CAST("RH_AGENT_MATRICULE" AS TEXT)) LIKE $1
           OR UPPER(CAST("RH_AGENT_NOM" AS TEXT)) LIKE $1
           OR UPPER(CAST("RH_AGENT_PRENOM" AS TEXT)) LIKE $1
        GROUP BY "RH_AGENT_MATRICULE"
        ORDER BY "RH_AGENT_MATRICULE"
        LIMIT 30
      `, [searchTerm]);

      res.json(results.rows.map(r => ({
        matricule: String(r.matricule || '').trim(),
        nom: String(r.nom || '').trim(),
        prenom: String(r.prenom || '').trim(),
        full_name: [String(r.prenom || '').trim(), String(r.nom || '').trim()].filter(Boolean).join(' ') || String(r.matricule || '').trim(),
        nb_absences: 0,
        date_debut_min: null,
        date_fin_max: null
      })));
    } catch (error) {
      console.error('[Agents DSI] searchMatricule error:', error);
      if (error.message && error.message.includes('does not exist')) {
        return res.status(500).json({ message: 'La table oracle.rh_tps_demabs n\'existe pas encore dans PostgreSQL. Vérifiez que la synchronisation Oracle a bien été effectuée.' });
      }
      res.status(500).json({ message: 'Erreur lors de la recherche', error: error.message });
    }
  },

  syncDemabs: async (req, res) => {
    try {
      let totalInSource = 0;
      try {
        const countResult = await pool.query('SELECT COUNT(*) as c FROM oracle.rh_tps_demabs');
        totalInSource = parseInt(countResult.rows[0].c);
      } catch (e) {
        return res.status(500).json({ message: 'La table oracle.rh_tps_demabs n\'existe pas dans PostgreSQL. Vérifiez que la synchronisation Oracle a bien été effectuée.' });
      }

      if (totalInSource === 0) {
        return res.status(404).json({ message: 'La table oracle.rh_tps_demabs est vide. Vérifiez que la synchronisation Oracle a bien été effectuée.' });
      }

      const rows = await pool.query(`
        SELECT "RH_AGENT_MATRICULE", "RH_AGENT_NOM", "RH_AGENT_PRENOM",
               "TPS_DMDA_DT_DEBUT", "TPS_DMDA_DT_FIN",
               "TPS_DMDA_TYPE", "TPS_DMDA_ID_CODEABS",
               "TPS_DMDA_TYPJOUR_DEB", "TPS_DMDA_TYPJOUR_FIN",
               "TPS_DMDA_ETAT", "TPS_DMDA_CHRONO", "TPS_DMDA_SUPPR"
        FROM oracle.rh_tps_demabs
        WHERE "TPS_DMDA_SUPPR" = '0' OR "TPS_DMDA_SUPPR" IS NULL
      `);

      // Clear existing demabs data
      await pool.query('DELETE FROM hub_calendrier.demabs');

      let inserted = 0;
      let errors = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const row of rows.rows) {
          try {
            const matricule = String(row.RH_AGENT_MATRICULE || '').trim();
            const nom = String(row.RH_AGENT_NOM || '').trim();
            const prenom = String(row.RH_AGENT_PRENOM || '').trim();

            if (!matricule) continue;

            const parseDate = (d) => {
              if (!d) return null;
              if (d instanceof Date) return d.toISOString().split('T')[0];
              if (typeof d === 'string') return d.split('T')[0];
              return null;
            };

            const dateDebut = parseDate(row.TPS_DMDA_DT_DEBUT);
            const dateFin = parseDate(row.TPS_DMDA_DT_FIN);

            if (!dateDebut) continue;

            const typeAbsence = String(row.TPS_DMDA_TYPE || '').trim();
            const etat = String(row.TPS_DMDA_ETAT || '').trim();
            const periodeDebut = String(row.TPS_DMDA_TYPJOUR_DEB || '').trim();
            const periodeFin = String(row.TPS_DMDA_TYPJOUR_FIN || '').trim();
            const chrono = String(row.TPS_DMDA_CHRONO || '').trim();

            await client.query(
              `INSERT INTO hub_calendrier.demabs (matricule, nom, prenom, date_debut, date_fin, type_absence, motif, periode_debut, periode_fin, statut, commentaire, raw_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                matricule, nom, prenom, dateDebut, dateFin,
                typeAbsence, chrono, periodeDebut, periodeFin, etat, '',
                JSON.stringify(row)
              ]
            );
            inserted++;
          } catch (e) {
            errors++;
          }
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Update matricule-linked agents with nom/prenom from demabs
      await pool.query(`
        UPDATE hub_calendrier.agents_dsi a
        SET matricule = d.matricule
        FROM (SELECT DISTINCT "RH_AGENT_MATRICULE" as matricule, "RH_AGENT_NOM" as nom, "RH_AGENT_PRENOM" as prenom 
              FROM oracle.rh_tps_demabs) d
        WHERE UPPER(a.nom) = UPPER(d.nom || ' ' || d.prenom)
           OR UPPER(a.nom) = UPPER(d.prenom || ' ' || d.nom)
      `).catch(() => {});

      res.json({
        message: `Sync terminé : ${inserted} absences importées depuis oracle.rh_tps_demabs${errors > 0 ? `, ${errors} erreurs` : ''}`,
        stats: { total: totalInSource, inserted, errors }
      });
    } catch (error) {
      console.error('[Agents DSI] syncDemabs error:', error);
      res.status(500).json({ message: 'Erreur lors de la synchronisation des absences', error: error.message });
    }
  },

  getDemabsSyncInfo: async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT matricule) as agents_count,
          MIN(date_debut) as date_min,
          MAX(date_fin) as date_max
        FROM hub_calendrier.demabs
      `);

      const lastSync = await pool.query(`
        SELECT MAX(created_at) as last_sync FROM hub_calendrier.demabs
      `);

      const linkedAgents = await pool.query(`
        SELECT a.username, a.nom, a.matricule, COUNT(d.id) as demabs_count
        FROM hub_calendrier.agents_dsi a
        LEFT JOIN hub_calendrier.demabs d ON a.matricule = d.matricule
        WHERE a.matricule IS NOT NULL AND a.matricule != ''
        GROUP BY a.username, a.nom, a.matricule
        ORDER BY a.nom
      `);

      res.json({
        stats: stats.rows[0],
        lastSync: lastSync.rows[0]?.last_sync || null,
        linkedAgents: linkedAgents.rows
      });
    } catch (error) {
      console.error('[Agents DSI] getDemabsSyncInfo error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  }
};