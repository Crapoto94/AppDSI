const { pool, getSqlite } = require('../../shared/database');
const axios = require('axios');

const KEY_MSG  = 'auto_actions.sms_message';
const KEY_LINK = 'auto_actions.sms_tuto_link';

const DEFAULT_MSG  = 'Bonjour {PRENOM}, votre nouveau mot de passe Windows est : {MOT_DE_PASSE}\nPour le personnaliser, consultez : {LIEN}';
const DEFAULT_LINK = '';

module.exports = {

  getSettings: async (req, res) => {
    try {
      const db = getSqlite();
      const rows = await db.all(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)',
        [KEY_MSG, KEY_LINK]
      );
      const map = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
      res.json({
        sms_message:   map[KEY_MSG]  ?? DEFAULT_MSG,
        sms_tuto_link: map[KEY_LINK] ?? DEFAULT_LINK,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  saveSettings: async (req, res) => {
    try {
      const { sms_message, sms_tuto_link } = req.body;
      const db = getSqlite();
      await db.run(
        'INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        [KEY_MSG, sms_message ?? DEFAULT_MSG]
      );
      await db.run(
        'INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        [KEY_LINK, sms_tuto_link ?? '']
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  getBeneficiaires: async (req, res) => {
    try {
      const [elusRes, encadRes] = await Promise.all([
        pool.query(`
          SELECT id::text AS id, nom, prenom,
                 telephone AS phone,
                 COALESCE(role, '') AS fonction,
                 COALESCE(delegation, '') AS service,
                 'elu' AS type
          FROM hub.elus
          WHERE telephone IS NOT NULL AND TRIM(telephone) != ''
          ORDER BY nom, prenom
        `),
        pool.query(`
          SELECT e.matricule AS id,
                 COALESCE(u.displayname, e.ad_username, e.matricule) AS nom,
                 '' AS prenom,
                 COALESCE(NULLIF(TRIM(e.telephone),''), NULLIF(TRIM(e.telephone_perso),'')) AS phone,
                 'Encadrant' AS fonction,
                 '' AS service,
                 'encadrant' AS type
          FROM hub.encadrants e
          LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(e.ad_username)
          WHERE NULLIF(TRIM(e.telephone),'') IS NOT NULL
             OR NULLIF(TRIM(e.telephone_perso),'') IS NOT NULL
          ORDER BY nom
        `),
      ]);
      res.json([...elusRes.rows, ...encadRes.rows]);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  sendPasswordSms: async (req, res) => {
    try {
      const { phone, prenom, nom, password, message } = req.body;
      if (!phone || !password || !message) {
        return res.status(400).json({ message: 'Paramètres manquants (phone, password, message)' });
      }

      const db = getSqlite();
      const frizbi = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
      if (!frizbi?.is_enabled || !frizbi.client_id || !frizbi.client_secret) {
        return res.status(503).json({ message: 'Service SMS (Frizbi) non configuré ou désactivé' });
      }

      const authRes = await axios.post(`${frizbi.api_url}/api/auth/login`, {
        login: frizbi.client_id,
        password: frizbi.client_secret,
      });
      const frizbiToken = authRes.data?.token;
      if (!frizbiToken) {
        return res.status(502).json({ message: 'Échec authentification Frizbi' });
      }

      const mobile = phone.replace(/\D/g, '');
      const payload = {
        customerSmsId: `pwd_renew_${Date.now()}`.substring(0, 50),
        date: new Date().toISOString(),
        title: 'Renouvellement mot de passe',
        message,
        customerSenderId: frizbi.sender_id || 'IVRY',
        smsContacts: [{
          customerSmsContactId: `pwd_${mobile}`.substring(0, 50),
          mobile,
          firstName: prenom || '',
          lastName: nom || '',
        }],
      };

      await axios.post(`${frizbi.api_url}/api/sms/send`, payload, {
        headers: { Authorization: `Bearer ${frizbiToken}` },
      });

      try {
        await pool.query(
          `INSERT INTO hub.sms_logs (recipient, message, sender_id, status, source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [mobile, message, frizbi.sender_id || 'IVRY', 'sent', 'password_renew', req.user?.username || 'admin']
        );
      } catch (logErr) {
        console.error('[AUTO-ACTIONS] SMS log error:', logErr.message);
      }

      res.json({ ok: true, message: `SMS envoyé au ${mobile}` });
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[AUTO-ACTIONS] sendPasswordSms error:', detail);

      try {
        const { phone, message } = req.body;
        const db = getSqlite();
        const frizbi = await db.get('SELECT sender_id FROM frizbi_settings WHERE id = 1');
        const mobile = (phone || '').replace(/\D/g, '');
        await pool.query(
          `INSERT INTO hub.sms_logs (recipient, message, sender_id, status, error_message, source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [mobile, message || '', frizbi?.sender_id || 'IVRY', 'error', detail, 'password_renew', req.user?.username || 'admin']
        );
      } catch {}

      res.status(500).json({ message: detail });
    }
  },
};
