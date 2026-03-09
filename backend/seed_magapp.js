const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database.sqlite');
db.all('SELECT * FROM magapp_categories', (err, rows) => {
    if (rows && rows.length === 0) {
        db.run("INSERT INTO magapp_categories (name, icon, display_order) VALUES ('Ressources Humaines', 'Users', 1), ('Finances', 'Coins', 2), ('Outils Techniques', 'Wrench', 3)", () => {
            db.run("INSERT INTO magapp_apps (category_id, name, description, url, icon, display_order) VALUES (1, 'Portail RH', 'Gestion des congés et absences', 'https://rh.ivry.local', 'Calendar', 1), (1, 'Astreintes', 'Suivi des astreintes', 'https://astreintes.ivry.local', 'Clock', 2), (2, 'Suivi Budgétaire', 'Application Hub DSI', 'http://localhost:5173', 'PieChart', 1), (3, 'GLPI', 'Gestion des tickets DSI', 'https://glpi.ivry.local', 'Ticket', 1), (3, 'Supervision', 'Tableau de bord réseau', 'https://nagios.ivry.local', 'Activity', 2)", () => {
                console.log('Database seeded with MagApp data.');
            });
        });
    } else {
        console.log('MagApp data already exists.');
    }
});
