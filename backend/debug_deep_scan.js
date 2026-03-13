const axios = require('axios');

const url = 'https://glpi-prod.ivry.local/glpi/apirest.php';
const app_token = 'HbP9ubGMo2PpYLJI10hZkw4HHATsRarW1kKu44sv';
const user_token = '3oFYd2xeojMk6KBJo3DH2W6XQb0kNPlb3Z0Iw6IW'; 

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const commonHeaders = {
    'App-Token': app_token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

async function runDeepScan() {
    try {
        console.log('--- DEEP SCAN GLPI (FIXED) ---');
        
        console.log('1. initSession...');
        const initRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': `user_token ${user_token}` }
        });
        const sessionToken = initRes.data.session_token;
        console.log('Session Token obtained.');

        console.log('\n2. getMyProfiles...');
        const profilesRes = await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        console.log('Profiles response type:', typeof profilesRes.data);
        const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : (profilesRes.data.myprofiles || []);
        console.log('Available Profiles Count:', profiles.length);
        profiles.forEach(p => console.log(` - ID: ${p.id}, Name: ${p.name}`));

        console.log('\n3. getFullSession...');
        const sessionFull = await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });
        if (sessionFull.data.session) {
            console.log('Current Entity:', sessionFull.data.session.glpiactive_entity_name);
            console.log('Current Profile:', sessionFull.data.session.glpiactiveprofile ? sessionFull.data.session.glpiactiveprofile.name : 'N/A');
        } else {
            console.log('Session data keys:', Object.keys(sessionFull.data));
        }

        console.log('\n4. Testing /search/Ticket with forced Entity context...');
        // GLPI 9.4 search can take 'is_recursive' and 'entities_id' in query params
        const testConfigs = [
            { name: "Standard", params: { range: '0-5' } },
            { name: "Recursive Entity 0", params: { range: '0-5', 'entities_id': 0, 'is_recursive': 1 } },
            { name: "With UID & Personal Token", params: { range: '0-5', 'session_token': sessionToken } }
        ];

        for (const config of testConfigs) {
            try {
                let fullUrl = `${url}/search/Ticket?session_token=${sessionToken}`;
                Object.keys(config.params).forEach(k => fullUrl += `&${k}=${config.params[k]}`);
                const res = await axios.get(fullUrl, { headers: commonHeaders });
                console.log(` - ${config.name}: totalcount = ${res.data.totalcount}`);
            } catch (e) {
                console.log(` - ${config.name}: FAILED (${e.message})`);
            }
        }

        console.log('\n5. List entities?');
        try {
            const entRes = await axios.get(`${url}/Entity?session_token=${sessionToken}&range=0-10`, { headers: commonHeaders });
            console.log('Total entities found:', entRes.headers['content-range'] || 'N/A');
            if (Array.isArray(entRes.data)) {
                 entRes.data.forEach(e => console.log(` - Entity ID: ${e.id}, Name: ${e.name}`));
            }
        } catch (e) {
            console.log('Entity list failed.');
        }

        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
        console.log('\nDone.');

    } catch (error) {
        console.error('\nGLOBAL ERROR:', error.response ? error.response.status + ' ' + JSON.stringify(error.response.data) : error.message);
    }
}

runDeepScan();
