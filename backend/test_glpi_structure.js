process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const axios = require('axios');
const setupDb = require('./db');

(async () => {
    try {
        const db = await setupDb();
        
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        
        if (!settings || !settings.url) {
            console.log('GLPI non configuré');
            process.exit(1);
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const commonHeaders = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        let authHeader = settings.login && settings.password
            ? `Basic ${Buffer.from(`${settings.login}:${settings.password}`).toString('base64')}`
            : `user_token ${(settings.user_token || '').trim()}`;

        console.log('[TEST] Connecting to GLPI:', url);
        console.log('[TEST] Auth method:', authHeader.includes('Basic') ? 'Basic Auth' : 'User Token');

        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        console.log('[TEST] Session created:', sessionToken ? 'OK' : 'FAILED');

        if (!sessionToken) process.exit(1);

        // Get first 3 users
        console.log('\n[TEST] Fetching first 3 users...\n');
        const usersRes = await axios.get(
            `${url}/search/User?session_token=${sessionToken}&range=0-3`,
            { headers: commonHeaders, timeout: 30000 }
        );

        console.log('Raw users data:');
        console.log(JSON.stringify(usersRes.data, null, 2));

        // Get detailed info for first user
        if (usersRes.data.data && usersRes.data.data[0]) {
            const firstUser = usersRes.data.data[0];
            const userId = firstUser[0] || firstUser.id;
            
            console.log(`\n[TEST] Detailed info for user ID ${userId}:\n`);
            const detailRes = await axios.get(`${url}/User/${userId}?session_token=${sessionToken}`, {
                headers: commonHeaders,
                timeout: 10000
            });

            console.log(JSON.stringify(detailRes.data, null, 2));
        }

        // Kill session
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, {
            headers: commonHeaders,
            timeout: 10000
        });

        process.exit(0);

    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
        process.exit(1);
    }
})();
