const { pool, getSqlite } = require('../../shared/database');
const axios = require('axios');
const ldap = require('ldapjs');

const KEY_MSG     = 'auto_actions.sms_message';
const KEY_LINK    = 'auto_actions.sms_tuto_link';
const KEY_SYNC_URL = 'auto_actions.ad_sync_url';

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
        attributes: ['dn', 'userPrincipalName', 'mail'],
      }, (err2, searchRes) => {
        if (err2) return finish(new Error(`Recherche AD échouée : ${err2.message}`));

        let userDN = null;
        let userPrincipalName = null;
        let mail = null;
        searchRes.on('searchEntry', (entry) => {
          userDN = entry.objectName;
          const upnAttr = entry.attributes && entry.attributes.find(a => a.type === 'userPrincipalName');
          if (upnAttr && upnAttr.vals && upnAttr.vals.length) userPrincipalName = upnAttr.vals[0];
          const mailAttr = entry.attributes && entry.attributes.find(a => a.type === 'mail');
          if (mailAttr && mailAttr.vals && mailAttr.vals.length) mail = mailAttr.vals[0];
        });
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
            finish(null, { success: true, userPrincipalName, mail });
          });
        });
      });
    });
  });
}

async function getGraphToken() {
  const db = getSqlite();
  const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
  if (!settings || !settings.is_enabled || !settings.tenant_id || !settings.client_id || !settings.client_secret) {
    throw new Error('Azure AD settings non configurés ou désactivés');
  }

  const tokenRes = await axios.post(
    `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: settings.client_id,
      client_secret: settings.client_secret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return tokenRes.data.access_token;
}

async function resolveO365User(token, identifier) {
  const escaped = identifier.replace(/'/g, "''").toLowerCase();
  const res = await axios.get(
    'https://graph.microsoft.com/v1.0/users',
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        $filter: `mail eq '${escaped}' or userPrincipalName eq '${escaped}'`,
        $select: 'id,userPrincipalName,mail',
        $top: 1,
      },
    }
  );
  if (res.data.value && res.data.value.length) {
    return res.data.value[0].userPrincipalName;
  }
  return null;
}

async function changeO365Password(identifier, newPassword) {
  const token = await getGraphToken();

  // Résoudre l'identifiant vers le vrai UPN Azure AD
  const resolvedUpn = await resolveO365User(token, identifier);
  const targetUpn = resolvedUpn || identifier;

  // Vérifier si l'utilisateur est synchronisé depuis l'AD local
  try {
    const checkRes = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(targetUpn)}?$select=id,userPrincipalName,onPremisesSyncEnabled,mail`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (checkRes.data?.onPremisesSyncEnabled) {
      const syncErr = new Error('Utilisateur synchronisé depuis l\'AD local — le mot de passe sera synchronisé vers O365 au prochain cycle Azure AD Connect (généralement < 30 min).');
      syncErr.code = 'SYNCED_USER';
      throw syncErr;
    }
  } catch (e) {
    if (e.code === 'SYNCED_USER') throw e;
    // Ignorer les erreurs de vérification, tenter le PATCH directement
  }

  await axios.patch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(targetUpn)}`,
    {
      passwordProfile: {
        forceChangePasswordNextSignIn: false,
        password: newPassword,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

async function triggerAdSync() {
  const db = getSqlite();
  const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [KEY_SYNC_URL]);
  const syncUrl = row?.setting_value;
  if (!syncUrl) return null;

  // Fire-and-forget : réponse immédiate, la synchro continue en arrière-plan
  axios.post(syncUrl, {}, { timeout: 10000 }).then(() => {
    console.log('[AUTO-ACTIONS] Synchro AD Connect terminée');
  }).catch(err => {
    console.error('[AUTO-ACTIONS] Synchro AD Connect :', err.message);
  });

  return { triggered: true };
}

module.exports = {

  getSettings: async (req, res) => {
    try {
      const db = getSqlite();
      const rows = await db.all(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?)',
        [KEY_MSG, KEY_LINK, KEY_SYNC_URL]
      );
      const map = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
      res.json({
        sms_message:   map[KEY_MSG]  ?? DEFAULT_MSG,
        sms_tuto_link: map[KEY_LINK] ?? DEFAULT_LINK,
        ad_sync_url:   map[KEY_SYNC_URL] ?? '',
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  saveSettings: async (req, res) => {
    try {
      const { sms_message, sms_tuto_link, ad_sync_url } = req.body;
      const db = getSqlite();
      await db.run(
        'INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        [KEY_MSG, sms_message ?? DEFAULT_MSG]
      );
      await db.run(
        'INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        [KEY_LINK, sms_tuto_link ?? '']
      );
      await db.run(
        'INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        [KEY_SYNC_URL, ad_sync_url ?? '']
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
                   (SELECT TRIM(\"NOM\") FROM oracle.rh_v_extract_dsi o
                    WHERE TRIM(o.\"MATRICULE\") = TRIM(e.matricule) LIMIT 1),
                   e.ad_username,
                   'Mat. ' || e.matricule
                 ) AS nom,
                 COALESCE(
                   (SELECT TRIM(\"PRENOM\") FROM oracle.rh_v_extract_dsi o
                    WHERE TRIM(o.\"MATRICULE\") = TRIM(e.matricule) LIMIT 1),
                   ''
                 ) AS prenom,
                  COALESCE(NULLIF(TRIM(e.telephone),''), NULLIF(TRIM(e.telephone_perso),'')) AS phone,
                  COALESCE(
                    (SELECT TRIM(\"POSTE_L\") FROM oracle.rh_v_extract_dsi o
                     WHERE TRIM(o.\"MATRICULE\") = TRIM(e.matricule) LIMIT 1),
                    (SELECT TRIM(\"FONCTION_L\") FROM oracle.rh_v_extract_dsi o
                     WHERE TRIM(o.\"MATRICULE\") = TRIM(e.matricule) LIMIT 1),
                    'Encadrant'
                  ) AS fonction,
                  COALESCE(
                    (SELECT TRIM(\"SERVICE_L\") FROM oracle.rh_v_extract_dsi o
                     WHERE TRIM(o.\"MATRICULE\") = TRIM(e.matricule) LIMIT 1),
                    ''
                  ) AS service,
                  'encadrant' AS type,
                  e.ad_username
           FROM hub.encadrants e
           LEFT JOIN hub.users u ON LOWER(u.username) = LOWER(e.ad_username)
           WHERE NULLIF(TRIM(e.telephone),'') IS NOT NULL
              OR NULLIF(TRIM(e.telephone_perso),'') IS NOT NULL
           ORDER BY nom
         `),
       ]);
       const encadrantsMap = new Map();
       for (const row of encadRes.rows) {
         const key = row.phone + '|' + row.nom + '|' + row.prenom;
         if (!encadrantsMap.has(key)) encadrantsMap.set(key, row);
       }
       res.json([...elusRes.rows, ...encadrantsMap.values()]);
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
      let o365Changed = false;
      let o365Error = null;

      if (ad_username && ad_username.trim()) {
        try {
          const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
          if (!adSettings || !adSettings.is_enabled) {
            adError = 'AD non configuré ou désactivé';
          } else {
            const adResult = await changeAdPassword(adSettings, ad_username.trim(), password);
            adChanged = true;
            console.log(`[AUTO-ACTIONS] Mot de passe changé dans l'AD pour : ${ad_username}`);

            // Sync immédiat vers O365 via Graph API
            const upn = adResult.userPrincipalName;
            const mail = adResult.mail;

            if (!upn && !mail) {
              o365Error = 'UPN et mail non trouvés dans l\'AD, sync O365 impossible';
            } else {
              // Identifiants à essayer par ordre de priorité : UPN routable, mail, UPN local
              const candidates = [];
              if (upn && !upn.includes('.local')) candidates.push(upn);
              if (mail && (!upn || mail !== upn)) candidates.push(mail);
              if (upn && upn.includes('.local')) candidates.push(upn);

              let syncedUser = false;
              for (const identifier of candidates) {
                try {
                  await changeO365Password(identifier, password);
                  o365Changed = true;
                  console.log(`[AUTO-ACTIONS] Mot de passe synchronisé vers O365 pour : ${identifier}`);
                  break;
                } catch (o365Err) {
                  if (o365Err.code === 'SYNCED_USER') {
                    syncedUser = true;
                    o365Error = o365Err.message;
                    console.log(`[AUTO-ACTIONS] ${o365Err.message}`);
                    break;
                  }
                  o365Error = o365Err.message;
                  console.error(`[AUTO-ACTIONS] Erreur sync O365 (${identifier}):`, o365Err.message);
                }
              }

              // Tentative de déclenchement de la synchro AD Connect (utilisateur synchronisé ou échec)
              if (syncedUser) {
                const syncResult = await triggerAdSync();
                if (syncResult?.triggered) {
                  o365Changed = true;
                  o365Error = 'Synchro Azure AD Connect déclenchée avec succès';
                  console.log(`[AUTO-ACTIONS] Synchro AD Connect déclenchée pour : ${ad_username}`);
                } else if (syncResult === null) {
                  // non configuré, message par défaut déjà dans o365Error
                } else {
                  o365Error += ` | Webhook sync: ${syncResult.error}`;
                }
              }
            }
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
        o365_changed: o365Changed,
        o365_error: o365Error,
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

  searchAdUsers: async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) return res.json([]);

      const db = getSqlite();
      const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
      if (!adSettings || !adSettings.is_enabled) {
        return res.status(503).json({ message: 'AD non configuré ou désactivé' });
      }

      const users = await new Promise((resolve, reject) => {
        const client = ldap.createClient({
          url: `ldaps://${adSettings.host}:636`,
          tlsOptions: { rejectUnauthorized: false },
          connectTimeout: 8000, timeout: 10000,
        });
        let settled = false;
        const finish = (err, val) => { if (!settled) { settled = true; try { client.destroy(); } catch {} if (err) reject(err); else resolve(val); } };
        const guard = setTimeout(() => finish(new Error('Timeout LDAP')), 15000);
        client.on('error', (e) => finish(e));
        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
          if (err) return finish(new Error('Bind échoué'));
          const filter = `(&(objectClass=user)(objectCategory=person)(|(sAMAccountName=*${q.replace(/[*()\\\x00]/g, '\\$&')}*)(displayName=*${q.replace(/[*()\\\x00]/g, '\\$&')}*)(mail=*${q.replace(/[*()\\\x00]/g, '\\$&')}*)))`;
          client.search(adSettings.base_dn, { filter, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'mail', 'userAccountControl', 'lockoutTime', 'department', 'title'], paged: { pageSize: 50 } }, (err2, searchRes) => {
            if (err2) return finish(new Error('Recherche échouée'));
            const results = [];
            searchRes.on('searchEntry', (entry) => {
              const attrs = {};
              (entry.attributes || []).forEach(a => { attrs[a.type] = a.values || a.vals || []; });
              const lt = attrs.lockoutTime?.[0];
              results.push({
                sam: (attrs.sAMAccountName?.[0] || ''),
                displayName: (attrs.displayName?.[0] || ''),
                mail: (attrs.mail?.[0] || ''),
                enabled: !((attrs.userAccountControl?.[0] || 0) & 2),
                locked: lt !== undefined && lt !== null && String(lt) !== '0',
                department: (attrs.department?.[0] || ''),
                title: (attrs.title?.[0] || ''),
              });
            });
            searchRes.on('error', (e) => finish(new Error('Erreur recherche')));
            searchRes.on('end', () => finish(null, results));
          });
        });
      });

      res.json(users.slice(0, 30));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  getAdUserStatus: async (req, res) => {
    try {
      const { sam } = req.query;
      if (!sam) return res.status(400).json({ message: 'Paramètre sam manquant' });

      const db = getSqlite();
      const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
      if (!adSettings || !adSettings.is_enabled) {
        return res.status(503).json({ message: 'AD non configuré ou désactivé' });
      }

      const status = await new Promise((resolve, reject) => {
        const client = ldap.createClient({
          url: `ldaps://${adSettings.host}:636`,
          tlsOptions: { rejectUnauthorized: false },
          connectTimeout: 8000, timeout: 8000,
        });
        let settled = false;
        const finish = (err, val) => { if (!settled) { settled = true; try { client.destroy(); } catch {} if (err) reject(err); else resolve(val); } };
        const guard = setTimeout(() => finish(new Error('Timeout LDAP')), 12000);
        client.on('error', (e) => finish(e));
        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
          if (err) return finish(new Error('Bind échoué'));
          const esc = sam.replace(/[*()\\\x00]/g, '\\$&');
          client.search(adSettings.base_dn, { filter: `(sAMAccountName=${esc})`, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'mail', 'userAccountControl', 'lockoutTime', 'department', 'title', 'distinguishedName'] }, (err2, searchRes) => {
            if (err2) return finish(new Error('Recherche échouée'));
            let user = null;
            searchRes.on('searchEntry', (entry) => {
              const attrs = {};
              (entry.attributes || []).forEach(a => { attrs[a.type] = a.values || a.vals || []; });
              const lt = attrs.lockoutTime?.[0];
              user = {
                sam: (attrs.sAMAccountName?.[0] || ''),
                displayName: (attrs.displayName?.[0] || ''),
                mail: (attrs.mail?.[0] || ''),
                enabled: !((attrs.userAccountControl?.[0] || 0) & 2),
                locked: lt !== undefined && lt !== null && String(lt) !== '0',
                dn: (attrs.distinguishedName?.[0] || ''),
                department: (attrs.department?.[0] || ''),
                title: (attrs.title?.[0] || ''),
              };
            });
            searchRes.on('error', () => finish(new Error('Erreur recherche')));
            searchRes.on('end', () => finish(null, user));
          });
        });
      });

      if (!status) return res.status(404).json({ message: `Utilisateur "${sam}" introuvable` });
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  toggleAdUser: async (req, res) => {
    try {
      const { sam, enable } = req.body;
      if (!sam) return res.status(400).json({ message: 'Paramètre sam manquant' });
      if (enable === undefined) return res.status(400).json({ message: 'Paramètre enable manquant' });

      const db = getSqlite();
      const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
      if (!adSettings || !adSettings.is_enabled) {
        return res.status(503).json({ message: 'AD non configuré ou désactivé' });
      }

      const result = await new Promise((resolve, reject) => {
        const client = ldap.createClient({
          url: `ldaps://${adSettings.host}:636`,
          tlsOptions: { rejectUnauthorized: false },
          connectTimeout: 8000, timeout: 8000,
        });
        let settled = false;
        const finish = (err, val) => { if (!settled) { settled = true; try { client.destroy(); } catch {} if (err) reject(err); else resolve(val); } };
        const guard = setTimeout(() => finish(new Error('Timeout LDAP')), 15000);
        client.on('error', (e) => finish(e));
        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
          if (err) return finish(new Error('Bind échoué'));
          const esc = sam.replace(/[*()\\\x00]/g, '\\$&');
          client.search(adSettings.base_dn, { filter: `(sAMAccountName=${esc})`, scope: 'sub', attributes: ['dn', 'userAccountControl'] }, (err2, searchRes) => {
            if (err2) return finish(new Error('Recherche échouée'));
            let userDN = null;
            let uac = 512;
            searchRes.on('searchEntry', (entry) => {
              userDN = entry.objectName;
              const attrs = {};
              (entry.attributes || []).forEach(a => { attrs[a.type] = a.values || a.vals || []; });
              uac = attrs.userAccountControl?.[0] || 512;
            });
            searchRes.on('error', () => finish(new Error('Erreur recherche')));
            searchRes.on('end', () => {
              if (!userDN) return finish(new Error(`Utilisateur "${sam}" introuvable`));

              let newUac;
              if (enable) newUac = uac & ~2;  // clear bit 2
              else newUac = uac | 2;           // set bit 2

              const change = new ldap.Change({
                operation: 'replace',
                modification: new ldap.Attribute({
                  type: 'userAccountControl',
                  values: [newUac],
                }),
              });

              client.modify(userDN, [change], (err3) => {
                if (err3) return finish(new Error(`Modification refusée : ${err3.message}`));
                finish(null, { sam, enabled: enable, previous_uac: uac, new_uac: newUac });
              });
            });
          });
        });
      });

      // Déclencher synchro AD Connect si configurée
      const syncResult = await triggerAdSync();

      res.json({
        ok: true,
        ...result,
        sync_triggered: syncResult?.triggered || false,
        sync_error: syncResult && !syncResult.triggered ? syncResult.error : null,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  unlockAdUser: async (req, res) => {
    try {
      const { sam } = req.body;
      if (!sam) return res.status(400).json({ message: 'Paramètre sam manquant' });

      const db = getSqlite();
      const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
      if (!adSettings || !adSettings.is_enabled) {
        return res.status(503).json({ message: 'AD non configuré ou désactivé' });
      }

      const result = await new Promise((resolve, reject) => {
        const client = ldap.createClient({
          url: `ldaps://${adSettings.host}:636`,
          tlsOptions: { rejectUnauthorized: false },
          connectTimeout: 8000, timeout: 8000,
        });
        let settled = false;
        const finish = (err, val) => { if (!settled) { settled = true; try { client.destroy(); } catch {} if (err) reject(err); else resolve(val); } };
        const guard = setTimeout(() => finish(new Error('Timeout LDAP')), 15000);
        client.on('error', (e) => finish(e));
        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
          if (err) return finish(new Error('Bind échoué'));
          const esc = sam.replace(/[*()\\\x00]/g, '\\$&');
          client.search(adSettings.base_dn, { filter: `(sAMAccountName=${esc})`, scope: 'sub', attributes: ['dn', 'lockoutTime'] }, (err2, searchRes) => {
            if (err2) return finish(new Error('Recherche échouée'));
            let userDN = null;
            searchRes.on('searchEntry', (entry) => {
              userDN = entry.objectName;
            });
            searchRes.on('error', () => finish(new Error('Erreur recherche')));
            searchRes.on('end', () => {
              if (!userDN) return finish(new Error(`Utilisateur "${sam}" introuvable`));

              const change = new ldap.Change({
                operation: 'replace',
                modification: new ldap.Attribute({
                  type: 'lockoutTime',
                  values: ['0'],
                }),
              });

              client.modify(userDN, [change], (err3) => {
                if (err3) return finish(new Error(`Déverrouillage refusé : ${err3.message}`));
                finish(null, { sam, unlocked: true });
              });
            });
          });
        });
      });

      // Déclencher synchro AD Connect si configurée
      const syncResult = await triggerAdSync();

      res.json({
        ok: true,
        ...result,
        sync_triggered: syncResult?.triggered || false,
        sync_error: syncResult && !syncResult.triggered ? syncResult.error : null,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
};
