const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function checkSearchOptions() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const dbPath = path.join(__dirname, 'database.sqlite');
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    
    const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
    if (!settings) {
        console.error('GLPI not configured');
        return;
    }

    let url = settings.url.trim();
    if (!url.includes('apirest.php')) {
        url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
    }

    const commonHeaders = { 
        'App-Token': settings.app_token, 
        'Content-Type': 'application/json', 
        'Accept': 'application/json' 
    };
    
    let authHeader = settings.login && settings.password 
        ? `Basic ${Buffer.from(`${settings.login}:${settings.password}`).toString('base64')}`
        : `user_token ${settings.user_token}`;

    try {
        const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
        const sessionToken = sessionRes.data.session_token;
        if (!sessionToken) throw new Error('Session GLPI échouée');

        // Séquence cruciale pour GLPI 9.4
        await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
        await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });
        
        console.log('Exporting all search options for Ticket...');
        const optionsRes = await axios.get(`${url}/listSearchOptions/Ticket?session_token=${sessionToken}`, { headers: commonHeaders });
        const fs = require('fs');
        fs.writeFileSync('glpi_ticket_options.json', JSON.stringify(optionsRes.data, null, 2));
        console.log('Exported to glpi_ticket_options.json');
        
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkSearchOptions();
