const fs = require('fs');
const options = JSON.parse(fs.readFileSync('glpi_ticket_options.json', 'utf8'));

const keywords = ['urgence', 'urgency'];

console.log('--- RECHERCHE CHAMPS GLPI (URGENCY) ---');
Object.entries(options).forEach(([id, field]) => {
    const name = (field.name || '').toLowerCase();
    if (keywords.some(k => name.includes(k))) {
        console.log(`[${id}] ${field.name} (${field.table || 'N/A'})`);
    }
});
