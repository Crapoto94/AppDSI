const ldap = require('ldapjs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function runDiagnostic() {
    console.log(`--- TEST AD DIAGNOSTIC (AUTO) ---`);
    
    let config;
    try {
        const db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });
        config = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        await db.close();
    } catch (e) {
        console.error('Erreur lecture base :', e.message);
        return;
    }

    const usernameToSearch = 'fbouatou';
    const client = ldap.createClient({
        url: `ldap://${config.host}:${config.port}`
    });

    client.bind(config.bind_dn, config.bind_password, (err) => {
        if (err) {
            console.error('ERREUR LIAISON :', err.message);
            client.destroy();
            return;
        }
        console.log('LIAISON REUSSIE !');

        const searchOptions = {
            filter: `(|(sAMAccountName=*${usernameToSearch}*)(cn=*${usernameToSearch}*)(sn=*${usernameToSearch}*))`,
            scope: 'sub',
            attributes: ['dn', 'cn', 'sAMAccountName', 'displayName', 'mail']
        };

        client.search(config.base_dn, searchOptions, (err, res) => {
            res.on('searchEntry', (entry) => {
                // Utilisation de pojo pour inspecter les attributs réels
                const attrs = entry.pojo.attributes;
                const sam = attrs.find(a => a.type === 'sAMAccountName')?.values[0];
                const cn = attrs.find(a => a.type === 'cn')?.values[0];
                console.log(`[TROUVE] samAccountName: ${sam} | CN: ${cn} | DN: ${entry.pojo.objectName}`);
            });

            res.on('end', () => {
                console.log('Recherche terminée.');
                client.destroy();
            });
        });
    });
}

runDiagnostic();
