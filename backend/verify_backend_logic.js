const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function verify() {
    const db = new sqlite3.Database('database.sqlite');
    
    db.get('SELECT * FROM glpi_settings WHERE id = 1', async (err, settings) => {
        if (err || !settings) {
            console.error('Settings not found');
            process.exit(1);
        }

        let url = settings.url.trim();
        let app_token = (settings.app_token || '').trim();
        let user_token = (settings.user_token || '').trim();

        const commonHeaders = {
            'App-Token': app_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        try {
            console.log('--- TEST FULL SEQUENCE ---');
            
            // 1. initSession
            const initRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': `user_token ${user_token}` },
            });
            const sessionToken = initRes.data.session_token;
            console.log('1. Session Token:', sessionToken);

            // 2. getMyProfiles (IMPORTANTE: Ça peut débloquer la session côté PHP/Plugin)
            console.log('2. getMyProfiles...');
            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

            // 3. getFullSession
            console.log('3. getFullSession...');
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            // 4. search/Ticket
            console.log('4. search/Ticket...');
            const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-5&get_all_entities=1`;
            const res = await axios.get(searchUrl, { headers: commonHeaders });

            console.log('Search Status:', res.status);
            console.log('Content-Type:', res.headers['content-type']);
            console.log('TotalCount FOUND:', res.data.totalcount);
            
            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
            console.log('Done.');
        } catch (e) {
            console.error('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
        }
    });
}

verify();
