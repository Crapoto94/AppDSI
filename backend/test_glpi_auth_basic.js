const axios = require('axios');

const url = 'https://glpi-prod.ivry.local/glpi/apirest.php';
const app_token = 'HbP9ubGMo2PpYLJI10hZkw4HHATsRarW1kKu44sv';

// REMPLAÇEZ PAR VOS IDENTIFIANTS ICI POUR TESTER
const login = 'VOTRE_LOGIN'; 
const password = 'VOTRE_PASSWORD';

const authHeader = 'Basic ' + Buffer.from(login + ':' + password).toString('base64');

const commonHeaders = {
    'App-Token': app_token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

async function test() {
    console.log('--- TEST AUTHENTIFICATION BASIC (login/password) ---');
    try {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        
        console.log('1. initSession...');
        const sessionRes = await axios.get(`${url}/initSession`, {
            headers: { ...commonHeaders, 'Authorization': authHeader }
        });
        const sessionToken = sessionRes.data.session_token;
        console.log('Succès ! Session Token:', sessionToken);

        console.log('\n2. Recherche Tickets (Non résolus)...');
        // On teste via /search/Ticket car c'est plus précis
        // Si /search échoue, on tentera /Ticket
        const ticketsRes = await axios.get(`${url}/search/Ticket/`, {
            params: { 
                'criteria[0][field]': 12, 
                'criteria[0][searchtype]': 'lessthan', 
                'criteria[0][value]': 5,
                'range': '0-1' 
            },
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });

        if (ticketsRes.headers['content-type'].includes('json')) {
            console.log('Total tickets non résolus:', ticketsRes.data.totalcount);
        } else {
            console.log('Alerte : Toujours du HTML en retour de recherche.');
        }

        console.log('\n3. killSession...');
        await axios.get(`${url}/killSession`, {
            headers: { ...commonHeaders, 'Session-Token': sessionToken }
        });
        console.log('Terminé.');

    } catch (error) {
        console.error('Erreur:', error.response ? error.response.status + ' ' + JSON.stringify(error.response.data) : error.message);
    }
}

test();
