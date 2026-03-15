const ldap = require('ldapjs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function debug() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
    if (!adSettings) {
        console.error("No AD settings found");
        return;
    }

    const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
    client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
        if (err) {
            console.error("Bind error:", err);
            client.destroy();
            return;
        }

        const searchTerm = 'Bourdelet';
        const opts = {
            filter: `(&(objectClass=user)(|(sn=*${searchTerm}*)(displayName=*${searchTerm}*)(sAMAccountName=*${searchTerm}*)))`,
            scope: 'sub',
            attributes: ['sAMAccountName', 'displayName', 'cn', 'lastLogonTimestamp', 'lastLogon', 'userAccountControl']
        };

        client.search(adSettings.base_dn, opts, (err, res) => {
            if (err) {
                console.error("Search error:", err);
                client.destroy();
                return;
            }

            res.on('searchEntry', (entry) => {
                console.log("Entry found:", JSON.stringify(entry.pojo, null, 2));
                const pojo = entry.pojo;
                const attrs = {};
                pojo.attributes.forEach(a => {
                    attrs[a.type] = a.values;
                });
                console.log("Attributes:", attrs);
                
                // Decode timestamps
                ['lastLogonTimestamp', 'lastLogon'].forEach(key => {
                    const val = attrs[key]?.[0];
                    if (val) {
                        try {
                            const timestamp = parseInt(val);
                            const date = new Date((timestamp / 10000) - 11644473600000);
                            console.log(`${key} decoded:`, date.toISOString(), `(raw: ${val})`);
                        } catch (e) {
                            console.error(`Error decoding ${key}:`, e.message);
                        }
                    } else {
                        console.log(`${key} is missing or empty`);
                    }
                });
            });

            res.on('end', (result) => {
                console.log("Search ended status:", result.status);
                client.destroy();
                process.exit(0);
            });

            res.on('error', (err) => {
                console.error("Search result error:", err);
                client.destroy();
                process.exit(1);
            });
        });
    });
}

debug();
