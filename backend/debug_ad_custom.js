const ldap = require('ldapjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function testAD(config, hostOverride = null) {
    const host = hostOverride || config.host;
    const url = `ldap://${host}:${config.port}`;
    
    console.log(`\n--- Testing ${url} ---`);
    
    return new Promise((resolve) => {
        const client = ldap.createClient({
            url: url,
            connectTimeout: 5000,
            timeout: 5000
        });

        client.on('error', (err) => {
            console.error(`[LDAP Client Error]:`, err.message);
            resolve(false);
        });

        console.log(`Attempting to bind with DN: ${config.bind_dn}`);
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) {
                console.error(`[LDAP Bind Failed]:`, err.message);
                client.destroy();
                resolve(false);
            } else {
                console.log(`[LDAP Bind Success!]`);
                client.unbind();
                resolve(true);
            }
        });
    });
}

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.get('SELECT * FROM ad_settings WHERE id = 1', (err, config) => {
    if (err) {
        console.error('Error fetching config:', err.message);
        process.exit(1);
    }
    
    (async () => {
        console.log('Original Host:', config.host);
        await testAD(config); // Original
        console.log('\nTrying alternative DC: 10.103.130.154');
        await testAD(config, '10.103.130.154');
        db.close();
    })();
});
