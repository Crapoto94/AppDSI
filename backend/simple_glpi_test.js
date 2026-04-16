process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const setupDb = require('./db');

(async () => {
    try {
        const db = await setupDb();
        const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
        
        if (!settings || !settings.url) {
            console.log('GLPI not configured');
            process.exit(1);
        }

        let url = settings.url.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }

        const headers = {
            'App-Token': (settings.app_token || '').trim(),
            'Content-Type': 'application/json'
        };

        let authHeader = settings.login && settings.password
            ? `Basic ${Buffer.from(`${settings.login}:${settings.password}`).toString('base64')}`
            : `user_token ${(settings.user_token || '').trim()}`;

        console.log('1. Initializing session...');
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...headers, 'Authorization': authHeader },
            timeout: 10000
        });

        const sessionToken = sessionRes.data?.session_token;
        console.log('   Session token:', sessionToken);

        if (!sessionToken) process.exit(1);

        console.log('\n2. Fetching users WITH session in every header...');
        try {
            const usersRes = await axios.get(
                `${url}/search/User/`,
                { 
                    params: { session_token: sessionToken },
                    headers: { ...headers, 'Authorization': authHeader, 'Session-Token': sessionToken },
                    timeout: 30000
                }
            );
            console.log('   ✓ Success! Response type:', typeof usersRes.data);
            if (typeof usersRes.data === 'object') {
                console.log('   Total users:', usersRes.data.totalcount);
                if (usersRes.data.data && usersRes.data.data[0]) {
                    console.log('   First user sample:', JSON.stringify(usersRes.data.data[0]));
                }
            }
        } catch (e) {
            console.log('   ERROR:', e.message);
        }

        process.exit(0);
    } catch (err) {
        console.error('Fatal:', err.message);
        process.exit(1);
    }
})();
