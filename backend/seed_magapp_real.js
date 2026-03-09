const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

const categoriesRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '../categories.json'), 'utf8'));
const applisConf = JSON.parse(fs.readFileSync(path.join(__dirname, '../applis.conf'), 'utf8'));

db.serialize(() => {
    db.run("DELETE FROM magapp_apps");
    db.run("DELETE FROM magapp_categories");

    const stmtCat = db.prepare("INSERT INTO magapp_categories (id, name, display_order) VALUES (?, ?, ?)");
    
    // Some icons mappings for categories (optional, but nice)
    const catIcons = {
        "0": "Users",
        "1": "FileText",
        "2": "Landmark",
        "3": "Baby",
        "4": "Monitor",
        "5": "Dumbbell",
        "6": "Map",
        "7": "Users",
        "8": "Stethoscope",
        "9": "Wrench",
        "10": "Coins",
        "11": "Home",
        "12": "Heart"
    };

    let order = 1;
    for (const [key, value] of Object.entries(categoriesRaw)) {
        // We use the JSON key + 1 as the ID to avoid 0 if needed, but SQLite allows 0 as ID.
        // Let's just use the key as ID to make mapping easier, but ensure it's an integer.
        const id = parseInt(key, 10) + 1; 
        const icon = catIcons[key] || "LayoutGrid";
        stmtCat.run(id, value, order++);
    }
    stmtCat.finalize();

    const stmtApp = db.prepare("INSERT INTO magapp_apps (category_id, name, description, url, icon, display_order) VALUES (?, ?, ?, ?, ?, ?)");
    
    let appOrder = 1;
    applisConf.applis.forEach(app => {
        if (app.name === "Default") return; // Skip default entry

        const catIdStr = app.cat || "0";
        const category_id = parseInt(catIdStr, 10) + 1;
        
        const name = app.name || "";
        const desc = app.desc || "";
        let url = app.url || "";
        if (url === "./rdp/alto.rdp") url = "https://magapp.ivry.local/rdp/alto.rdp";
        
        let iconUrl = app.icon || "./img/default.png";
        if (iconUrl.startsWith("./")) {
            iconUrl = "https://magapp.ivry.local" + iconUrl.substring(1);
        }
        
        stmtApp.run(category_id, name, desc, url, iconUrl, appOrder++);
    });
    stmtApp.finalize();

    console.log("Database successfully seeded with real magapp data!");
});
