const axios = require('axios');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function debugTicket(ticketId) {
    const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
    
    const settings = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM glpi_settings LIMIT 1', (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (!settings) {
        console.error("Paramètres GLPI non trouvés en base.");
        db.close();
        return;
    }

    const { url, app_token, user_token } = settings;
    const commonHeaders = {
        'App-Token': app_token,
        'Authorization': `user_token ${user_token}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log(`[DEBUG] Initialisation session GLPI...`);
        const sessionRes = await axios.get(`${url}/initSession`, { headers: commonHeaders });
        const sessionToken = sessionRes.data.session_token;
        console.log(`[DEBUG] Session Token: ${sessionToken}`);

        console.log(`[DEBUG] Récupération brute du ticket ${ticketId}...`);
        // On récupère le ticket via l'API REST standard (pas Search)
        const ticketRes = await axios.get(`${url}/Ticket/${ticketId}?session_token=${sessionToken}`, { headers: commonHeaders });
        console.log("[DEBUG] Données brutes du ticket (REST):", JSON.stringify(ticketRes.data, null, 2));

        console.log(`\n[DEBUG] Recherche du ticket ${ticketId} via Search API (pour voir les IDs de champs)...`);
        // On utilise Search API pour voir comment les colonnes 34, 22, etc. sont remplies
        const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22];
        const forcedStr = forcedFields.map((id, idx) => `forcedisplay[${idx}]=${id}`).join('&');
        const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&criteria[0][field]=2&criteria[0][searchtype]=equals&criteria[0][value]=${ticketId}&${forcedStr}`;
        
        const searchRes = await axios.get(searchUrl, { headers: commonHeaders });
        if (searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {
            console.log("[DEBUG] Données Search API:", JSON.stringify(searchRes.data.data[0], null, 2));
        } else {
            console.log("[DEBUG] Ticket non trouvé via Search API avec ces critères.");
        }

        // Fermeture session
        await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: commonHeaders });

    } catch (error) {
        console.error("[DEBUG] Erreur:", error.response ? error.response.data : error.message);
    } finally {
        db.close();
    }
}

const targetId = process.argv[2] || 43040;
debugTicket(targetId);
