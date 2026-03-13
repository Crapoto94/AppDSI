const axios = require('axios');

const url = 'https://glpi-prod.ivry.local/glpi/apirest.php';
const app_token = 'HbP9ubGMo2PpYLJI10hZkw4HHATsRarW1kKu44sv';
const user_token = '3oFYd2xeojMk6KBJo3DH2W6XQb0kNPlb3Z0Iw6IW'; // Le jeton d'API qui a fonctionné

const commonHeaders = {
    'App-Token': app_token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

async function test() {
    try {
        console.log('--- Phase 1: initSession ---');
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': `user_token ${user_token}` }
        });
        const sessionToken = sessionRes.data.session_token;
        console.log('Session Token:', sessionToken);

        console.log('\n--- Phase 2: Ticket (No search, range in params) ---');
        const ticketsRes = await axios.get(`${url}/Ticket`, {
            params: { 
                'range': '0-1',
                'is_deleted': 0
            },
            headers: {
                ...commonHeaders,
                'Session-Token': sessionToken
            }
        });
        console.log('Status code:', ticketsRes.status);
        console.log('Content-Type:', ticketsRes.headers['content-type']);
        console.log('Content-range:', ticketsRes.headers['content-range']);

        console.log('\n--- Phase 4: killSession ---');
        await axios.get(`${url}/killSession`, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });
        console.log('Session killed.');

    } catch (error) {
        console.error('Error:', error.response ? error.response.status + ' ' + JSON.stringify(error.response.data) : error.message);
    }
}

test();
