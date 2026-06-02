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

module.exports = {
    searchADUsersByQuery,
    deriveEmailFromUsager,
    EMAIL_DOMAIN
};
