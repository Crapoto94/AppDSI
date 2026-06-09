const { pgDb, pool } = require('../../../shared/database');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

async function checkUpcomingRenewals() {
  try {
    if (!sendMailFn) return;
    const rows = await pgDb.all(`SELECT cr.*, u.email FROM hub.contract_renewals cr
      LEFT JOIN hub.users u ON u.username = SPLIT_PART(cr.nom_prenom, ' ', 1)
      WHERE cr.statut = 'actif' AND cr.est_cdi = 0
      AND cr.date_relance IS NOT NULL
      AND cr.date_relance <= CURRENT_DATE + INTERVAL '7 days'
      AND cr.date_relance >= CURRENT_DATE - INTERVAL '1 day'
      AND cr.fait = 0
      ORDER BY cr.date_relance ASC`);
    for (const r of rows) {
      const sujet = `Relance renouvellement contrat - ${r.nom_prenom}`;
      const html = `
        <h2>Relance automatique : renouvellement de contrat</h2>
        <p><strong>Agent :</strong> ${r.nom_prenom}</p>
        <p><strong>Direction :</strong> ${r.direction || 'Non renseignée'}</p>
        <p><strong>Date reconduction :</strong> ${r.date_reconduction ? new Date(r.date_reconduction).toLocaleDateString('fr-FR') : 'Non définie'}</p>
        <p><strong>Date relance :</strong> ${r.date_relance ? new Date(r.date_relance).toLocaleDateString('fr-FR') : 'Non définie'}</p>
        <p>Merci de traiter cette relance dans les plus brefs délais.</p>
        <hr>
        <p style="color:#64748b;font-size:12px;">Ce message est envoyé automatiquement par le module RH.</p>
      `;
      await sendMailFn(r.email || 'dsi@ivry94.fr', sujet, html, [], 'contract-renewal-auto');
      await pgDb.run('UPDATE hub.contract_renewals SET alertes_envoyees = alertes_envoyees + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [r.id]);
    }
  } catch (e) {
    console.error('[CONTRACTS] Auto-check error:', e.message);
  }
}

module.exports = { setSendMail, checkUpcomingRenewals,

  list: async (req, res) => {
    try {
      const rows = await pgDb.all('SELECT * FROM hub.contract_renewals ORDER BY date_reconduction ASC NULLS LAST, nom_prenom ASC');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: 'Erreur chargement contractuels', error: err.message });
    }
  },

  get: async (req, res) => {
    try {
      const row = await pgDb.get('SELECT * FROM hub.contract_renewals WHERE id = $1', [req.params.id]);
      if (!row) return res.status(404).json({ message: 'Contractuel non trouvé' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: 'Erreur', error: err.message });
    }
  },

  create: async (req, res) => {
    try {
      const { direction, nom_prenom, date_arrivee, date_reconduction, est_cdi, date_relance, notes, fait } = req.body;
      const result = await pool.query(`INSERT INTO hub.contract_renewals (direction, nom_prenom, date_arrivee, date_reconduction, est_cdi, date_relance, notes, fait)
        VALUES ($1, $2, $3::date, $4::date, $5, $6::date, $7, $8) RETURNING id`,
        [direction || '', nom_prenom, date_arrivee || null, date_reconduction || null, !!est_cdi, date_relance || null, notes || '', !!fait]);
      res.status(201).json({ id: result.rows[0]?.id, message: 'Contractuel ajouté' });
    } catch (err) {
      console.error('[CONTRACTS] create error:', err.message, err.stack);
      res.status(500).json({ message: 'Erreur création', error: err.message });
    }
  },

  update: async (req, res) => {
    try {
      const { direction, nom_prenom, date_arrivee, date_reconduction, est_cdi, date_relance, fait, statut, notes } = req.body;
      await pool.query(`UPDATE hub.contract_renewals SET
        direction = $1, nom_prenom = $2, date_arrivee = $3::date, date_reconduction = $4::date,
        est_cdi = $5, date_relance = $6::date, fait = $7, statut = $8, notes = $9,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $10`,
        [direction || '', nom_prenom, date_arrivee || null, date_reconduction || null,
          !!est_cdi, date_relance || null, !!fait, statut || 'actif', notes || '', req.params.id]);
      res.json({ message: 'Contractuel mis à jour' });
    } catch (err) {
      console.error('[CONTRACTS] update error:', err.message, err.stack);
      res.status(500).json({ message: 'Erreur mise à jour', error: err.message });
    }
  },

  remove: async (req, res) => {
    try {
      await pgDb.run('DELETE FROM hub.contract_renewals WHERE id = $1', [req.params.id]);
      res.json({ message: 'Contractuel supprimé' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur suppression', error: err.message });
    }
  },

  toggleFait: async (req, res) => {
    try {
      const row = await pgDb.get('SELECT fait FROM hub.contract_renewals WHERE id = $1', [req.params.id]);
      if (!row) return res.status(404).json({ message: 'Contractuel non trouvé' });
      await pgDb.run('UPDATE hub.contract_renewals SET fait = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [row.fait ? 0 : 1, req.params.id]);
      res.json({ fait: !row.fait });
    } catch (err) {
      res.status(500).json({ message: 'Erreur', error: err.message });
    }
  },

  sendAlert: async (req, res) => {
    try {
      if (!sendMailFn) return res.status(500).json({ message: 'sendMail non initialisé' });
      const row = await pgDb.get('SELECT * FROM hub.contract_renewals WHERE id = $1', [req.params.id]);
      if (!row) return res.status(404).json({ message: 'Contractuel non trouvé' });

      const sujet = `Renouvellement de contrat - ${row.nom_prenom}`;
      const reconduction = row.date_reconduction ? new Date(row.date_reconduction).toLocaleDateString('fr-FR') : 'Non défini';
      const html = `
        <h2>Relance renouvellement de contrat</h2>
        <p><strong>Agent :</strong> ${row.nom_prenom}</p>
        <p><strong>Direction :</strong> ${row.direction || 'Non renseignée'}</p>
        <p><strong>Date d'arrivée :</strong> ${row.date_arrivee ? new Date(row.date_arrivee).toLocaleDateString('fr-FR') : 'Non définie'}</p>
        <p><strong>Prochaine reconduction :</strong> ${reconduction}</p>
        <p><strong>Date de relance :</strong> ${row.date_relance ? new Date(row.date_relance).toLocaleDateString('fr-FR') : 'Non définie'}</p>
        <p>Merci de prendre les mesures nécessaires pour le renouvellement de ce contrat.</p>
      `;

      const destinataires = req.body.emails;
      if (!destinataires || !destinataires.length) {
        return res.status(400).json({ message: 'Aucun destinataire' });
      }

      const results = [];
      for (const email of destinataires) {
        try {
          await sendMailFn(email.trim(), sujet, html, [], 'contract-renewal');
          results.push({ email: email.trim(), status: 'sent' });
        } catch (e) {
          results.push({ email: email.trim(), status: 'error', error: e.message });
        }
      }

      await pgDb.run('UPDATE hub.contract_renewals SET alertes_envoyees = alertes_envoyees + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
      res.json({ message: 'Alertes envoyées', results });
    } catch (err) {
      res.status(500).json({ message: 'Erreur envoi alerte', error: err.message });
    }
  },

  importExcel: async (req, res) => {
    try {
      const { rows } = req.body;
      if (!rows || !rows.length) return res.status(400).json({ message: 'Aucune ligne à importer' });

      let imported = 0;
      for (const r of rows) {
        const estCdi = (r.date_reconduction || '').toString().toUpperCase().includes('CDI');
        await pgDb.run(`INSERT INTO hub.contract_renewals (direction, nom_prenom, date_arrivee, date_reconduction, est_cdi, date_relance, fait)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [r.direction || '', r.nom_prenom, r.date_arrivee || null,
            estCdi ? null : (r.date_reconduction || null),
            estCdi ? 1 : 0,
            r.date_relance || null,
            r.fait ? 1 : 0]);
        imported++;
      }
      res.status(201).json({ message: `${imported} contractuels importés` });
    } catch (err) {
      res.status(500).json({ message: 'Erreur import', error: err.message });
    }
  },

  stats: async (req, res) => {
    try {
      const total = await pgDb.get('SELECT COUNT(*) as count FROM hub.contract_renewals');
      const actifs = await pgDb.get("SELECT COUNT(*) as count FROM hub.contract_renewals WHERE statut = 'actif'");
      const cdi = await pgDb.get('SELECT COUNT(*) as count FROM hub.contract_renewals WHERE est_cdi = 1');
      const reconductionProche = await pgDb.get(`SELECT COUNT(*) as count FROM hub.contract_renewals
        WHERE statut = 'actif' AND est_cdi = 0 AND date_reconduction IS NOT NULL
        AND date_reconduction BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`);
      const relanceImminente = await pgDb.get(`SELECT COUNT(*) as count FROM hub.contract_renewals
        WHERE statut = 'actif' AND date_relance IS NOT NULL
        AND date_relance <= CURRENT_DATE + INTERVAL '30 days'`);
      const enRetard = await pgDb.get(`SELECT COUNT(*) as count FROM hub.contract_renewals
        WHERE statut = 'actif' AND est_cdi = 0 AND date_reconduction IS NOT NULL
        AND date_reconduction < CURRENT_DATE AND fait = 0`);

      res.json({
        total: Number(total.count),
        actifs: Number(actifs.count),
        cdi: Number(cdi.count),
        reconductionProche: Number(reconductionProche.count),
        relanceImminente: Number(relanceImminente.count),
        enRetard: Number(enRetard.count),
      });
    } catch (err) {
      res.status(500).json({ message: 'Erreur statistiques', error: err.message });
    }
  },

  prochainesEcheances: async (req, res) => {
    try {
      const jours = parseInt(req.query.jours) || 90;
      const rows = await pgDb.all(`SELECT * FROM hub.contract_renewals
        WHERE statut = 'actif' AND est_cdi = 0 AND date_reconduction IS NOT NULL
        AND date_reconduction BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${jours} days'
        ORDER BY date_reconduction ASC`);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: 'Erreur', error: err.message });
    }
  },

};
