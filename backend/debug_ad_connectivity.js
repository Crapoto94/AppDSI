const ldap = require('ldapjs');

// Configuration - To be updated if needed or passed via env/args
const config = {
    host: process.env.AD_HOST || "10.103.130.118",
    port: process.env.AD_PORT || 389,
    bindDN: process.env.AD_BIND_DN || "CN=testo,OU=IRS,OU=IVRY,DC=ivry,DC=local",
    bindPassword: process.env.AD_BIND_PASSWORD || "JeNeSuisPas!2025",
    baseDN: process.env.AD_BASE_DN || "DC=ivry,DC=local"
};

console.log('--- AD Connectivity Diagnostic ---');
console.log(`Connecting to: ldap://${config.host}:${config.port}`);
console.log(`Bind DN: ${config.bindDN}`);
console.log(`Base DN: ${config.baseDN}`);
console.log('----------------------------------');

const client = ldap.createClient({
    url: `ldap://${config.host}:${config.port}`,
    connectTimeout: 5000,
    timeout: 5000
});

client.on('error', (err) => {
    console.error('[ERROR] LDAP Client Error:', err.message);
    process.exit(1);
});

console.log('Attempting to bind...');
client.bind(config.bindDN, config.bindPassword, (err) => {
    if (err) {
        console.error('[ERROR] Bind failed:', err.message);
        client.destroy();
        process.exit(1);
    }
    
    console.log('[SUCCESS] Bind successful!');
    
    console.log(`Searching for users in ${config.baseDN}...`);
    const opts = {
        filter: '(objectClass=user)',
        scope: 'sub',
        sizeLimit: 5
    };

    client.search(config.baseDN, opts, (err, res) => {
        if (err) {
            console.error('[ERROR] Search failed:', err.message);
            client.destroy();
            process.exit(1);
        }

        let entryCount = 0;
        res.on('searchEntry', (entry) => {
            entryCount++;
            console.log(`Found entry: ${entry.objectName}`);
        });

        res.on('error', (err) => {
            console.error('[ERROR] Search result error:', err.message);
            client.destroy();
            process.exit(1);
        });

        res.on('end', (result) => {
            console.log(`[SUCCESS] Search finished. Found ${entryCount} entries.`);
            client.destroy();
            console.log('Diagnostic complete.');
            process.exit(0);
        });
    });
});
