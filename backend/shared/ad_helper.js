const ldap = require('ldapjs');
const { flattenLDAPEntry, decodeLDAPString } = require('./utils');

/**
 * Search for users in AD by query (displayName, sAMAccountName, or cn)
 */
async function searchADUsersByQuery(query, config) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ 
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 5000,
            timeout: 5000
        });

        client.on('error', (err) => {
            console.error('LDAP Client Error:', err.message);
            resolve([]);
        });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                client.destroy();
                console.error('LDAP Bind Error:', err.message);
                return resolve([]);
            }

            const escaped = query.replace(/[*()\\\x00]/g, '\\$&');
            
            // Fuzzy version: replace accented characters with *
            const fuzzy = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "*");
            const escapedFuzzy = fuzzy.replace(/[*()\\\x00]/g, '\\$&');

            // On essaye d'abord un match exact/partiel simple
            let filter = `(&(objectClass=user)(|(displayName=*${escaped}*)(sAMAccountName=*${escaped}*)(cn=*${escaped}*)(mail=*${escaped}*)(displayName=*${escapedFuzzy}*)))`;
            
            // Si le nom contient des espaces, on tente un match sur chaque partie pour être plus flexible
            const parts = query.split(/\s+/).filter(p => p.length > 2);
            if (parts.length > 1) {
                const partFilters = parts.map(p => {
                    const pEscaped = p.replace(/[*()\\\x00]/g, '\\$&');
                    const pFuzzy = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "*");
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

            const results = [];
            const foundUsernames = new Set();

            client.search(config.base_dn, opts, (err, searchRes) => {
                if (err) {
                    client.destroy();
                    return resolve([]);
                }

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

                searchRes.on('error', (err) => {
                    client.destroy();
                    resolve(results);
                });

                searchRes.on('end', () => {
                    client.destroy();
                    resolve(results);
                });
            });
        });
    });
}

module.exports = {
    searchADUsersByQuery
};
