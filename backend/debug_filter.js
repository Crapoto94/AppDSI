const axios = require('axios');

const url = 'https://glpi-prod.ivry.local/glpi/apirest.php';
const app_token = 'HbP9ubGMo2PpYLJI10hZkw4HHATsRarW1kKu44sv';
const user_token = '3oFYd2xeojMk6KBJo3DH2W6XQb0kNPlb3Z0Iw6IW'; 

const commonHeaders = {
    'App-Token': app_token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

async function test() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        console.log('1. initSession...');
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': `user_token ${user_token}` }
        });
        const sessionToken = sessionRes.data.session_token;
        console.log('Session Token:', sessionToken);

        console.log('\n2. Test /Ticket avec range (Censé marcher)...');
        const resOk = await axios.get(`${url}/Ticket`, {
            params: { 'range': '0-5' },
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });
        console.log('Status /Ticket:', resOk.status);
        console.log('Type /Ticket:', typeof resOk.data);
        console.log('Content-Range:', resOk.headers['content-range']);

        console.log('\n3. Test /Ticket avec status=1 (Vérification rejet)...');
        try {
            const resStatus = await axios.get(`${url}/Ticket`, {
                params: { 'range': '0-5', 'status': 1 },
                headers: { ...commonHeaders, 'Session-Token': sessionToken }
            });
            console.log('Status /Ticket+status:', resStatus.status);
            console.log('Content-Type:', resStatus.headers['content-type']);
        } catch (e) {
            console.log('Erreur /Ticket+status:', e.message);
        }

        console.log('\n4. Test /search/Ticket (Avec Token dans l URL)...');
        try {
            const resSearch = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&criteria[0][field]=12&criteria[0][searchtype]=lessthan&criteria[0][value]=5`, {
                headers: commonHeaders
            });
            console.log('Status /search:', resSearch.status);
            console.log('Content-Type:', resSearch.headers['content-type']);
            console.log('TotalCount:', resSearch.data.totalcount);
            if (resSearch.data && resSearch.data.totalcount === undefined) {
                console.log('Data keys:', Object.keys(resSearch.data));
            }
        } catch (e) {
            console.log('Erreur /search:', e.message);
        }

        await axios.get(`${url}/killSession`, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });

    } catch (error) {
        console.error('Erreur globale:', error.message);
    }
}

test();
