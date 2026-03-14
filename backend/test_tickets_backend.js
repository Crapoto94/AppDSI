const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function test() {
    const db = new sqlite3.Database('database.sqlite');
    
    db.serialize(() => {
        db.run(`ATTACH DATABASE 'glpi.sqlite' AS glpi`);
        
        db.run(`
            CREATE TEMP VIEW v_tickets AS
            SELECT t.*, s.label as status_label,
            LOWER(COALESCE(t.requester_email, '')) as search_email,
            LOWER(COALESCE(REPLACE(t.requester_email, '@ivry94.fr', ''), '')) as search_username
            FROM glpi.tickets t
            LEFT JOIN glpi.ticket_statuses s ON t.status = s.id
        `);

        db.all('SELECT glpi_id, title, type, status, search_email FROM v_tickets LIMIT 5', (err, rows) => {
            if (err) console.error(err);
            console.log('Sample Tickets:', rows);
            
            if (rows && rows.length > 0) {
                const email = rows[0].search_email;
                db.get(`SELECT COUNT(*) as count FROM v_tickets WHERE (search_email = ? OR search_username = ?) AND status != 6`, 
                    [email, email.split('@')[0]], (err, row) => {
                    console.log(`Count for ${email} (excl. closed):`, row);
                });
            }
        });
    });
}

test();
