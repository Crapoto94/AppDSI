const { pgDb, pool } = require('../../shared/pg_db');

let sendMailFn = null;

const ctrl = {
  setSendMail(fn) { sendMailFn = fn; },

  // ── Dashboards CRUD ────────────────────────────────────────────────────────

  async listDashboards(req, res) {
    try {
      const rows = await pgDb.all(
        'SELECT * FROM hub.dsi_dashboards WHERE username = ? ORDER BY is_default DESC, created_at ASC',
        [req.user.username]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async createDashboard(req, res) {
    try {
      const { name } = req.body;
      const existing = await pgDb.all(
        'SELECT id FROM hub.dsi_dashboards WHERE username = ?', [req.user.username]
      );
      const isDefault = existing.length === 0;
      const r = await pool.query(
        'INSERT INTO hub.dsi_dashboards (username, name, is_default) VALUES ($1,$2,$3) RETURNING *',
        [req.user.username, name || 'Mon tableau de bord', isDefault]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async updateDashboard(req, res) {
    try {
      const { name, is_default } = req.body;
      const { id } = req.params;
      // verify ownership
      const row = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!row) return res.status(404).json({ message: 'Non trouvé' });

      if (is_default) {
        await pool.query(
          'UPDATE hub.dsi_dashboards SET is_default = false WHERE username = $1', [req.user.username]
        );
      }
      const { rotation_seconds, rotation_order, rotation_filter, is_rotating } = req.body;
      const r = await pool.query(
        `UPDATE hub.dsi_dashboards SET
          name = COALESCE($1, name),
          is_default = COALESCE($2, is_default),
          is_rotating = COALESCE($5, is_rotating),
          rotation_seconds = COALESCE($6, rotation_seconds),
          rotation_order = COALESCE($7, rotation_order),
          rotation_filter = COALESCE($8, rotation_filter)
         WHERE id = $3 AND username = $4 RETURNING *`,
        [name || null, is_default ?? null, id, req.user.username,
         is_rotating ?? null, rotation_seconds ?? null, rotation_order ?? null,
         rotation_filter ? JSON.stringify(rotation_filter) : null]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async deleteDashboard(req, res) {
    try {
      const { id } = req.params;
      const row = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!row) return res.status(404).json({ message: 'Non trouvé' });
      await pool.query('DELETE FROM hub.dsi_dashboards WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // ── Widgets ────────────────────────────────────────────────────────────────

  async getWidgets(req, res) {
    try {
      const { id } = req.params;
      const dash = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!dash) return res.status(404).json({ message: 'Non trouvé' });
      const rows = await pgDb.all(
        'SELECT * FROM hub.dsi_dashboard_widgets WHERE dashboard_id = ? ORDER BY pos_y, pos_x',
        [id]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async saveWidgets(req, res) {
    try {
      const { id } = req.params;
      const dash = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!dash) return res.status(404).json({ message: 'Non trouvé' });

      const { widgets } = req.body; // array of {widget_key, pos_x, pos_y, width, height, config_json}
      await pool.query('DELETE FROM hub.dsi_dashboard_widgets WHERE dashboard_id = $1', [id]);

      if (widgets && widgets.length > 0) {
        for (const w of widgets) {
          await pool.query(
            `INSERT INTO hub.dsi_dashboard_widgets
              (dashboard_id, widget_key, pos_x, pos_y, width, height, config_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id, w.widget_key, w.pos_x ?? 0, w.pos_y ?? 0, w.width ?? 6, w.height ?? 4, JSON.stringify(w.config_json || {})]
          );
        }
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getSubscription(req, res) {
    try {
      const { id } = req.params;
      const dash = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!dash) return res.status(404).json({ message: 'Non trouvé' });
      const sub = await pgDb.get(
        'SELECT * FROM hub.dsi_dashboard_subscriptions WHERE dashboard_id = ?', [id]
      );
      res.json(sub || null);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async saveSubscription(req, res) {
    try {
      const { id } = req.params;
      const dash = await pgDb.get(
        'SELECT id FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!dash) return res.status(404).json({ message: 'Non trouvé' });

      const { frequency, send_hour, send_day, emails, enabled } = req.body;
      const r = await pool.query(
        `INSERT INTO hub.dsi_dashboard_subscriptions
           (dashboard_id, frequency, send_hour, send_day, emails, enabled)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (dashboard_id) DO UPDATE SET
           frequency = EXCLUDED.frequency,
           send_hour = EXCLUDED.send_hour,
           send_day  = EXCLUDED.send_day,
           emails    = EXCLUDED.emails,
           enabled   = EXCLUDED.enabled
         RETURNING *`,
        [id, frequency || 'weekly', send_hour ?? 7, send_day ?? 1, emails || '', enabled ?? true]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // ── Email sending ──────────────────────────────────────────────────────────

  async sendNow(req, res) {
    try {
      const { id } = req.params;
      const dash = await pgDb.get(
        'SELECT * FROM hub.dsi_dashboards WHERE id = ? AND username = ?',
        [id, req.user.username]
      );
      if (!dash) return res.status(404).json({ message: 'Non trouvé' });
      const sub = await pgDb.get(
        'SELECT * FROM hub.dsi_dashboard_subscriptions WHERE dashboard_id = ?', [id]
      );
      if (!sub || !sub.emails) return res.status(400).json({ message: 'Aucun destinataire configuré' });

      const result = await ctrl._sendDashboardEmail(dash, sub);
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async _sendDashboardEmail(dash, sub) {
    if (!sendMailFn) return { sent: 0, message: 'Service email non configuré' };

    const widgets = await pgDb.all(
      'SELECT * FROM hub.dsi_dashboard_widgets WHERE dashboard_id = ? ORDER BY pos_y, pos_x',
      [dash.id]
    );

    const html = buildDashboardEmailHtml(dash, widgets, sub);
    const subject = `📊 Tableau de bord DSI — ${dash.name}`;
    const emailList = sub.emails.split(',').map(e => e.trim()).filter(Boolean);

    let sent = 0, failed = 0;
    for (const email of emailList) {
      try {
        await sendMailFn(email, subject, html, [], 'dsi-dashboard');
        sent++;
      } catch (e) {
        console.error('[DSI-DASH] Email error:', e.message);
        failed++;
      }
    }

    await pool.query(
      'UPDATE hub.dsi_dashboard_subscriptions SET last_sent_at = NOW() WHERE dashboard_id = $1',
      [dash.id]
    );

    return { sent, failed, message: `Envoyé à ${sent} destinataire(s)` };
  },

  // ── Cron runner ────────────────────────────────────────────────────────────

  async runScheduledSends() {
    try {
      const now = new Date();
      const hh = now.getHours();
      const dayOfWeek = now.getDay(); // 0=dimanche
      const dayOfMonth = now.getDate();

      const subs = await pgDb.all(
        `SELECT s.*, d.name, d.username
         FROM hub.dsi_dashboard_subscriptions s
         JOIN hub.dsi_dashboards d ON d.id = s.dashboard_id
         WHERE s.enabled = true`
      );

      for (const sub of subs) {
        let shouldSend = false;

        if (sub.frequency === 'daily' && hh === parseInt(sub.send_hour)) {
          shouldSend = true;
        } else if (sub.frequency === 'weekly' && dayOfWeek === parseInt(sub.send_day) && hh === parseInt(sub.send_hour)) {
          shouldSend = true;
        } else if (sub.frequency === 'monthly' && dayOfMonth === 1 && hh === parseInt(sub.send_hour)) {
          shouldSend = true;
        }

        if (!shouldSend) continue;

        // Avoid double send within same hour
        if (sub.last_sent_at) {
          const diff = (now - new Date(sub.last_sent_at)) / 3600000;
          if (diff < 1) continue;
        }

        const dash = { id: sub.dashboard_id, name: sub.name, username: sub.username };
        await ctrl._sendDashboardEmail(dash, sub).catch(e =>
          console.error(`[DSI-DASH] Cron send error for dashboard ${sub.dashboard_id}:`, e.message)
        );
      }
    } catch (e) {
      console.error('[DSI-DASH] Cron error:', e.message);
    }
  }
};

// ── Email HTML builder ─────────────────────────────────────────────────────

const WIDGET_LABELS = {
  tickets_kpi: 'KPIs Tickets',
  tickets_trend: 'Tendance tickets',
  tickets_status: 'Répartition par statut',
  tickets_categories: 'Top catégories',
  tickets_technicians: 'Charge techniciens',
  tickets_sla: 'Statut SLA',
  tickets_backlog: 'Âge du backlog',
  tickets_weekly: 'Activité hebdomadaire',
  tickets_perf: 'Performance techniciens',
  tickets_monthly: 'Statuts 12 mois',
  copieurs_kpi: 'KPIs Copieurs',
  copieurs_evolution: 'Évolution copies',
  copieurs_costs: 'Évolution coûts',
  copieurs_top_dir: 'Top directions copies',
  copieurs_alerts: 'Alertes copieurs',
  budget_kpi: 'KPIs Budget',
  budget_trend: 'Dépenses cumulées',
  budget_invoices: 'Factures à traiter',
  magapp_maintenances: 'Maintenances applicatifs',
  magapp_ideas: 'Idées en attente',
  magapp_clicks: 'Clics applicatifs',
  consommables: 'Consommables en attente',
  certificats: 'Certificats à renouveler',
  contrats: 'Contrats expirant',
  taches: 'Tâches en cours',
  projets: 'Projets par statut',
};

function buildDashboardEmailHtml(dash, widgets, sub) {
  const freqLabel = { daily: 'quotidien', weekly: 'hebdomadaire', monthly: 'mensuel' }[sub.frequency] || sub.frequency;
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const widgetItems = widgets.map(w => {
    const label = WIDGET_LABELS[w.widget_key] || w.widget_key;
    return `<li style="padding:6px 0; border-bottom:1px solid #f0f4f8; color:#374151;">${label}</li>`;
  }).join('');

  return `
<div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; color:#1e293b;">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); color:white; padding:32px; border-radius:12px 12px 0 0;">
    <h1 style="margin:0 0 8px; font-size:22px;">📊 ${dash.name}</h1>
    <p style="margin:0; opacity:.8; font-size:14px;">Rapport ${freqLabel} — ${dateStr}</p>
  </div>
  <div style="background:white; padding:28px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px;">
    <p style="color:#64748b; font-size:14px; margin-top:0;">
      Ce tableau de bord contient <strong>${widgets.length} widget(s)</strong>.
      Pour voir les données en temps réel, accédez à l'application DSI Hub.
    </p>
    <h2 style="font-size:16px; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:10px;">
      Widgets configurés
    </h2>
    <ul style="list-style:none; padding:0; margin:0;">
      ${widgetItems || '<li style="color:#94a3b8;font-style:italic;">Aucun widget</li>'}
    </ul>
    <div style="margin-top:24px; padding:16px; background:#f8fafc; border-radius:8px; border-left:4px solid #3b82f6;">
      <p style="margin:0; font-size:13px; color:#64748b;">
        🔗 Consultez votre tableau de bord complet dans l'application pour accéder aux graphiques interactifs et aux données actualisées.
      </p>
    </div>
  </div>
</div>`;
}

module.exports = ctrl;
