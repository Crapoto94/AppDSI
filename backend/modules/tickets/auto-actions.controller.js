const { pool, getSqlite } = require('../../shared/database');
const axios = require('axios');
const ldap = require('ldapjs');

const KEY_MSG  = 'auto_actions.sms_message';
const KEY_LINK = 'auto_actions.sms_tuto_link';

const DEFAULT_MSG  = 'Bonjour {PRENOM}, votre nouveau mot de passe Windows est : {MOT_DE_PASSE}\nPour le personnaliser, consultez : {LIEN}';
const DEFAULT_LINK = '';

function encodeAdPassword(clearText) {
  return Buffer.from(`"${clearText}"`, 'utf16le');
}

async function changeAdPassword(adSettings, adUsernameRaw, newPassword) {
  const sam = adUsernameRaw.includes('\\') ? adUsernameRaw.split('\\').pop() : adUsernameRaw;

  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: `ldaps://${adSettings.host}:636`,
      tlsOptions: { rejectUnauthorized: false },
      connectTimeout: 8000,
      timeout: 8000,
    });

    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      try { client.destroy(); } catch (_) {}
      if (err) reject(err); else resolve(val);
    };
    const guard = setTimeout(() => finish(new Error('Timeout connexion LDAPS')), 12000);

    client.on('error', (err) => finish(err));

    client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
      if (err) return finish(new Error(`Bind LDAPS échoué : ${err.message}`));

      const escapedSam = sam.replace(/[*()\\\x00]/g, '\\$&');
      client.search(adSettings.base_dn, {
        filter: `(sAMAccountName=${escapedSam})`,
        scope: 'sub',
        attributes: ['dn'],
      }, (err2, searchRes) => {
        if (err2) return finish(new Error(`Recherche AD échouée : ${err2.message}`));

        let userDN = null;
        searchRes.on('searchEntry', (entry) => { userDN = entry.objectName; });
        searchRes.on('error', (e) => finish(new Error(`Erreur recherche : ${e.message}`)));
        searchRes.on('end', () => {
          if (!userDN) return finish(new Error(`Utilisateur "${sam}" introuvable dans l'AD`));

          let change;
          try {
            change = new ldap.Change({
              operation: 'replace',
              modification: new ldap.Attribute({
                type: 'unicodePwd',
                values: [encodeAdPassword(newPassword)],
              }),
            });
          } catch (buildErr) {
            return finish(new Error(`Erreur construction Change AD : ${buildErr.message}`));
          }

          client.modify(userDN, [change], (err3) => {
            if (err3) return finish(new Error(`Changement mot de passe refusé : ${err3.message}`));
            finish(null, true);
          });
        });
      });
    });
  });
}

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
                 'elu' AS type,
                 CASE WHEN email IS NOT NULL AND email LIKE '%@%'
                      THEN SPLIT_PART(email, '@', 1)
                      ELSE NULL
                 END AS ad_username
          FROM hub.elus
          WHERE telephone IS NOT NULL AND TRIM(telephone) != ''
          ORDER BY nom, prenom
        `),
        pool.query(`
          SELECT e.matricule AS id,
                 COALESCE(
                   u.displayname,
                   (SELECT a.nom FROM hub_calendrier.agents_dsi a
                    WHERE e.ad_username IS NOT NULL AND TRIM(e.ad_username) != ''
                      AND LOWER(a.username) = LOWER(e.ad_username) LIMIT 1),
                   (SELECT a.nom FROM hub_calendrier.agents_dsi a
                    WHERE TRIM(a.matricule) = TRIM(e.matricule) LIMIT 1),
                   e.ad_username
                 ) AS nom,
                 '' AS prenom,
                 COALESCE(NULLIF(TRIM(e.telephone),''), NULLIF(TRIM(e.telephone_perso),'')) AS phone,
                 'Encadrant' AS fonction,
                 '' AS service,
                 'encadrant' AS type,
                 e.ad_username
          FROM hub.encadrants e
          LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(e.ad_username)
          WHERE (NULLIF(TRIM(e.telephone),'') IS NOT NULL
             OR NULLIF(TRIM(e.telephone_perso),'') IS NOT NULL)
            AND COALESCE(
                   u.displayname,
                   (SELECT a.nom FROM hub_calendrier.agents_dsi a
                    WHERE e.ad_username IS NOT NULL AND TRIM(e.ad_username) != ''
                      AND LOWER(a.username) = LOWER(e.ad_username) LIMIT 1),
                   (SELECT a.nom FROM hub_calendrier.agents_dsi a
                    WHERE TRIM(a.matricule) = TRIM(e.matricule) LIMIT 1),
                   e.ad_username
                ) IS NOT NULL
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
      const { phone, prenom, nom, password, message, ad_username } = req.body;
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

      // Changement de mot de passe AD si un username est fourni
      let adChanged = false;
      let adError = null;

      if (ad_username && ad_username.trim()) {
        try {
          const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
          if (!adSettings || !adSettings.is_enabled) {
            adError = 'AD non configuré ou désactivé';
          } else {
            await changeAdPassword(adSettings, ad_username.trim(), password);
            adChanged = true;
            console.log(`[AUTO-ACTIONS] Mot de passe changé dans l'AD pour : ${ad_username}`);
          }
        } catch (adErr) {
          adError = adErr.message;
          console.error(`[AUTO-ACTIONS] Erreur changement AD (${ad_username}):`, adErr.message);
        }
      }

      res.json({
        ok: true,
        message: `SMS envoyé au ${mobile}`,
        ad_changed: adChanged,
        ad_error: adError,
      });
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
