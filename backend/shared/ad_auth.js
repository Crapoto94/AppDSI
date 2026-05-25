const ldap = require('ldapjs');
const path = require('path');
const fs = require('fs');
const { flattenLDAPEntry } = require('./utils');

const LOG_FILE = path.join(__dirname, '../logs/mouchard.log');

function log(msg) {
    const line = `[${new Date().toISOString()}] [AD Auth] ${msg}\n`;
    console.log(line.trim());
    try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}

async function authenticateAD(username, password, config) {
    return new Promise((resolve, reject) => {
        if (!config.is_enabled) return resolve(null);

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 10000,
        });

        client.on('error', (err) => {
            log(`Client error: ${err.message}`);
            resolve(null);
        });

        log(`Technical bind with: ${config.bind_dn}`);
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                client.destroy();
                return reject(new Error('Erreur de liaison AD : ' + err.message));
            }

            const opts = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'memberOf', 'mail', 'displayName'],
                referrals: false,
                paged: false,
            };

            client.search(config.base_dn, opts, (err, res) => {
                if (err) {
                    client.destroy();
                    return reject(new Error('Erreur de recherche AD : ' + err.message));
                }

                let userEntry = null;

                res.on('searchEntry', (entry) => {
                    userEntry = flattenLDAPEntry(entry);
                });

                res.on('error', (err) => {
                    client.destroy();
                    reject(new Error('Erreur lors de la recherche AD : ' + err.message));
                });

                res.on('end', () => {
                    if (!userEntry) {
                        client.destroy();
                        return resolve(null);
                    }

                    const userClient = ldap.createClient({
                        url: `ldap://${config.host}:${config.port}`,
                        connectTimeout: 10000,
                        timeout: 10000,
                    });

                    userClient.bind(userEntry.dn, password, (err) => {
                        userClient.destroy();
                        client.destroy();

                        if (err) {
                            log(`User bind failed for ${username}: ${err.message}`);
                            return resolve(null);
                        }

                        if (config.required_group) {
                            const needed = config.required_group.toLowerCase().trim().normalize('NFC');
                            const groups = Array.isArray(userEntry.memberOf)
                                ? userEntry.memberOf
                                : (userEntry.memberOf ? [userEntry.memberOf] : []);
                            const ok = groups.some(g => g && g.toLowerCase().normalize('NFC').includes(needed));
                            if (!ok) {
                                return reject(new Error(`Groupe requis non trouvé : ${config.required_group}`));
                            }
                        }

                        resolve({
                            username,
                            displayName: userEntry.displayName || userEntry.cn || username,
                            email: userEntry.mail || null,
                            dn: userEntry.dn,
                        });
                    });
                });
            });
        });
    });
}

// Lookup only — no password check. Returns user info or null.
async function lookupADUser(username, config) {
    return new Promise((resolve, reject) => {
        if (!config.is_enabled) return resolve(null);

        const client = ldap.createClient({
            url: `ldap://${config.host}:${config.port}`,
            connectTimeout: 10000,
            timeout: 10000,
        });

        client.on('error', (err) => {
            log(`Client error (lookup): ${err.message}`);
            resolve(null);
        });

        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                client.destroy();
                return reject(new Error('Erreur de liaison AD : ' + err.message));
            }

            const opts = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['dn', 'cn', 'mail', 'displayName'],
                referrals: false,
                paged: false,
            };

            client.search(config.base_dn, opts, (err, res) => {
                if (err) {
                    client.destroy();
                    return reject(new Error('Erreur de recherche AD : ' + err.message));
                }

                let userEntry = null;

                res.on('searchEntry', (entry) => {
                    userEntry = flattenLDAPEntry(entry);
                });

                res.on('error', (err) => {
                    client.destroy();
                    reject(new Error('Erreur lors de la recherche AD : ' + err.message));
                });

                res.on('end', () => {
                    client.destroy();
                    if (!userEntry) return resolve(null);
                    resolve({
                        username,
                        displayName: userEntry.displayName || userEntry.cn || username,
                        email: userEntry.mail || null,
                        dn: userEntry.dn,
                    });
                });
            });
        });
    });
}

module.exports = { authenticateAD, lookupADUser };
