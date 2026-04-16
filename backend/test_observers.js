process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite');

async function testObservers() {
    const settings = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM glpi_settings WHERE id = 1', (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (!settings || !settings.url) {
        console.log('GLPI non configuré');
        db.close();
        return;
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

    let authHeader = (settings.user_token || '').trim()
        ? `user_token ${(settings.user_token || '').trim()}`
        : `Basic ${Buffer.from(`${(settings.login || '').trim()}:${(settings.password || '').trim()}`).toString('base64')}`;

    console.log('Init session...');
    const sessionRes = await axios.get(`${url}/initSession`, {
        headers: { ...commonHeaders, 'Authorization': authHeader },
        timeout: 10000
    });

    const sessionToken = sessionRes.data?.session_token;
    if (!sessionToken) {
        console.log('Session échouée');
        db.close();
        return;
    }

    console.log('Session OK');

    await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
    await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

    const ticketId = 43496;
    
    // Essayer Ticket/{id}/Ticket_User
    console.log('\n--- Ticket/{id}/Ticket_User ---');
    try {
        const res = await axios.get(
            `${url}/Ticket/${ticketId}/Ticket_User?session_token=${sessionToken}`,
            { headers: commonHeaders, timeout: 10000 }
        );
        console.log('Résultat:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log('Erreur Ticket_User:', e.response?.status, e.response?.data || e.message);
    }

    // Essayer avec subentities
    console.log('\n--- Search Ticket_User avec subentities ---');
    try {
        const res = await axios.get(
            `${url}/search/Ticket_User?session_token=${sessionToken}&criteria[0][field]=2&criteria[0][searchtype]=equals&criteria[0][value]=${ticketId}&get_hateoas=false`,
            { headers: commonHeaders, timeout: 10000 }
        );
        console.log('Résultat:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log('Erreur search:', e.response?.data || e.message);
    }

    await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
    db.close();
}

testObservers().catch(console.error);
