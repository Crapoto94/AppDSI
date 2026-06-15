const ldap = require('ldapjs');
const { flattenLDAPEntry, decodeLDAPString } = require('./utils');

// Domaine e-mail de l'organisation (ex. login → login@ivry94.fr)
const EMAIL_DOMAIN = 'ivry94.fr';

/**
 * Déduit l'adresse e-mail d'une valeur « usager » qui contient déjà un identifiant
 * suivi d'une ébauche de domaine. Ex. « sotest@IVRY » → « sotest@ivry94.fr ».
 * Renvoie null si la valeur ne contient pas de partie locale exploitable.
 */
function deriveEmailFromUsager(value) {
    if (!value) return null;
    const s = String(value).trim();
    const at = s.indexOf('@');
    if (at <= 0) return null;                       // pas de « @ » ou « @ » en tête
    const local = s.slice(0, at).trim().toLowerCase().replace(/\s+/g, '');
    if (!local || /[()\\,;:"<>]/.test(local)) return null; // partie locale invalide
    return `${local}@${EMAIL_DOMAIN}`;
}

/**
 * Search for users in AD by query (displayName, sAMAccountName, or cn).
 * La Promise se résout TOUJOURS (jamais reject) et dispose d'un garde-temps dur :
 * une recherche qui n'émet ni `end` ni `error` ne peut plus bloquer l'appelant.
 */
async function searchADUsersByQuery(query, config) {
    return new Promise((resolve) => {
        const results = [];
        const foundUsernames = new Set();
        let settled = false;

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 5000,
            timeout: 5000
        });

        // Résout une seule fois, ferme proprement le client et annule le garde-temps.
        const finish = (val) => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            try { client.destroy(); } catch (e) { /* ignore */ }
            resolve(val);
        };

        // Garde-temps global : si rien ne se résout en 10 s, on rend ce qu'on a.
        const guard = setTimeout(() => {
            console.error(`[AD] Timeout sur la recherche « ${query} » — abandon.`);
            finish(results);
        }, 10000);

        client.on('error', (err) => {
            console.error('LDAP Client Error:', err.message);
            finish([]);
        });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                console.error('LDAP Bind Error:', err.message);
                return finish([]);
            }

            const escaped = query.replace(/[*()\\\x00]/g, '\\$&');

            // Fuzzy version: replace accented characters with *
            const fuzzy = query.normalize("NFD").replace(/[̀-ͯ]/g, "*");
            const escapedFuzzy = fuzzy.replace(/[*()\\\x00]/g, '\\$&');

            // On essaye d'abord un match exact/partiel simple
            let filter = `(&(objectClass=user)(|(displayName=*${escaped}*)(sAMAccountName=*${escaped}*)(cn=*${escaped}*)(mail=*${escaped}*)(displayName=*${escapedFuzzy}*)))`;

            // Si le nom contient des espaces, on tente un match sur chaque partie pour être plus flexible
            const parts = query.split(/\s+/).filter(p => p.length > 2);
            if (parts.length > 1) {
                const partFilters = parts.map(p => {
                    const pEscaped = p.replace(/[*()\\\x00]/g, '\\$&');
                    const pFuzzy = p.normalize("NFD").replace(/[̀-ͯ]/g, "*");
                    const pEscapedFuzzy = pFuzzy.replace(/[*()\\\x00]/g, '\\$&');
                    return `(|(displayName=*${pEscaped}*)(displayName=*${pEscapedFuzzy}*))`;
                }).join('');
                filter = `(|${filter}(&(objectClass=user)${partFilters}))`;
            }

            const opts = {
                filter,
                scope: 'sub',
                attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'department', 'company'],
                sizeLimit: 10
            };

            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) return finish([]);

                searchRes.on('searchEntry', (entry) => {
                    const user = flattenLDAPEntry(entry);
                    if (user && user.sAMAccountName && !foundUsernames.has(user.sAMAccountName)) {
                        foundUsernames.add(user.sAMAccountName);
                        results.push({
                            username: user.sAMAccountName,
                            displayName: decodeLDAPString(user.displayName || user.cn || user.sAMAccountName),
                            email: user.mail || '',
                            service: user.department || ''
                        });
                    }
                });

                searchRes.on('error', () => finish(results));
                searchRes.on('end', () => finish(results));
            });
        });
    });
}

/**
 * Convertit un « generalizedTime » LDAP (ex. « 20230115093000.0Z ») en Date JS.
 */
function parseGeneralizedTime(val) {
    if (!val) return null;
    const s = String(val);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi, se] = m;
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se));
    return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Convertit un « filetime » Active Directory (100-ns depuis 1601) en Date JS.
 */
function parseFiletime(val) {
    if (!val) return null;
    const n = Number(val);
    if (!n || isNaN(n) || n <= 0) return null;
    return new Date(n / 10000 - 11644473600000);
}

/**
 * Énumère TOUS les ordinateurs (objectClass=computer) de l'Active Directory.
 * Utilise le contrôle de pagination LDAP pour dépasser la limite serveur (≈1000).
 * La Promise se résout toujours (jamais reject) avec la liste des machines trouvées.
 */
async function searchADComputers(config, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
        const results = [];
        let settled = false;

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 30000
        });

        const finish = (val, err) => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            try { client.destroy(); } catch (e) { /* ignore */ }
            if (err) reject(err); else resolve(val);
        };

        // Garde-temps global : 5 minutes max pour une énumération complète.
        const guard = setTimeout(() => {
            console.error('[AD] Timeout sur l\'énumération des ordinateurs — abandon.');
            finish(results);
        }, 5 * 60 * 1000);

        client.on('error', (err) => {
            console.error('LDAP Client Error:', err.message);
            finish(null, err);
        });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                console.error('LDAP Bind Error:', err.message);
                return finish(null, err);
            }

            const opts = {
                filter: '(objectClass=computer)',
                scope: 'sub',
                attributes: [
                    'cn', 'name', 'sAMAccountName', 'dNSHostName',
                    'operatingSystem', 'operatingSystemVersion',
                    'lastLogonTimestamp', 'description', 'whenCreated',
                    'userAccountControl', 'distinguishedName'
                ],
                paged: { pageSize: 500, pagePause: false }
            };

            client.search(config.base_dn, opts, (err2, searchRes) => {
                if (err2) return finish(null, err2);

                searchRes.on('searchEntry', (entry) => {
                    const c = flattenLDAPEntry(entry);
                    if (!c) return;
                    const dn = c.distinguishedName || c.dn || '';
                    // OU = premier composant OU= du DN
                    const ouMatch = /OU=([^,]+)/i.exec(dn);
                    const uac = parseInt(c.userAccountControl, 10) || 0;
                    results.push({
                        cn:                c.cn || null,
                        name:              c.name || c.cn || null,
                        samaccountname:    c.sAMAccountName || null,
                        dnshostname:       c.dNSHostName || null,
                        operatingsystem:   c.operatingSystem || null,
                        osversion:         c.operatingSystemVersion || null,
                        lastlogon:         parseFiletime(c.lastLogonTimestamp),
                        description:       Array.isArray(c.description) ? c.description.join(' ') : (c.description || null),
                        whencreated:       parseGeneralizedTime(c.whenCreated),
                        enabled:           (uac & 2) === 0,   // ACCOUNTDISABLE = 0x2
                        distinguishedname: dn || null,
                        ou:                ouMatch ? ouMatch[1] : null
                    });
                    if (onProgress && results.length % 200 === 0) onProgress(results.length);
                });

                searchRes.on('error', (e) => {
                    // Une SizeLimitExceeded malgré la pagination : on garde ce qu'on a.
                    if (e && e.name === 'SizeLimitExceededError') return finish(results);
                    finish(null, e);
                });
                searchRes.on('end', () => finish(results));
            });
        });
    });
}

/**
 * Cherche jusqu'à `usernames.length` comptes AD en une seule connexion LDAP
 * (filtre OR sur sAMAccountName) et retourne une Map<username_lower → {department, company}>.
 * Traite les lots de 50 pour ne pas dépasser les limites de complexité du filtre.
 */
async function lookupADUsersOrg(usernames, config) {
    const result = new Map();
    if (!config || !config.is_enabled || !usernames || !usernames.length) return result;

    const BATCH = 50;

    const runBatch = (batch) => new Promise((resolve) => {
        let settled = false;
        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 15000
        });
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            try { client.destroy(); } catch (_) {}
            resolve();
        };
        const guard = setTimeout(finish, 20000);
        client.on('error', (e) => { console.error('[AD lookupOrg]', e.message); finish(); });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { console.error('[AD lookupOrg bind]', err.message); return finish(); }

            const parts = batch.map(u => `(sAMAccountName=${u.replace(/[*()\\\x00]/g, '\\$&')})`);
            const filter = batch.length === 1 ? `(&(objectClass=user)${parts[0]})` : `(&(objectClass=user)(|${parts.join('')}))`;

            client.search(config.base_dn, {
                filter, scope: 'sub',
                attributes: ['sAMAccountName', 'department', 'company']
            }, (err2, res) => {
                if (err2) { console.error('[AD lookupOrg search]', err2.message); return finish(); }
                res.on('searchEntry', (entry) => {
                    const obj = flattenLDAPEntry(entry);
                    if (obj && obj.sAMAccountName) {
                        result.set(obj.sAMAccountName.toLowerCase(), {
                            department: obj.department || '',
                            company: obj.company || ''
                        });
                    }
                });
                res.on('error', finish);
                res.on('end', finish);
            });
        });
    });

    for (let i = 0; i < usernames.length; i += BATCH) {
        await runBatch(usernames.slice(i, i + BATCH));
    }
    return result;
}

module.exports = {
    searchADUsersByQuery,
    lookupADUsersOrg,
    searchADComputers,
    deriveEmailFromUsager,
    parseGeneralizedTime,
    parseFiletime,
    EMAIL_DOMAIN
};
