const fs = require('fs');

const serverFile = './server.js';
let content = fs.readFileSync(serverFile, 'utf8');

if (!content.includes("const { pgDb, setupPgDb } = require('./pg_db');")) {
    content = content.replace("const setupDb = require('./db');", "const setupDb = require('./db');\nconst { pgDb, setupPgDb } = require('./pg_db');");
}

if (!content.includes("await setupPgDb();")) {
    content = content.replace("setupDb().then(async database => {", "setupDb().then(async database => {\n    await setupPgDb();");
}

let modified = false;

// We need to carefully replace "db." with "pgDb." only inside magapp-related routes
// We can define boundaries or just look for magapp_ keywords in proximity 
// Actually, it's easier to just globally replace db.all, db.run, db.get with pgDb.all etc 
// IF the query contains "magapp_"

content = content.replace(/db\.(all|get|run)\((['`"])([\s\S]*?)(\2)/g, (match, method, quote, sql) => {
    if (sql.includes('magapp_')) {
        modified = true;
        return `pgDb.${method}(${quote}${sql}${quote}`;
    }
    return match;
});

// For queries that span multiple lines and might use template literals without magapp_ on the first line (there is one at 4102 and 6790) hmm
// Actually, in javascript it usually spans multiple lines if it's a template literal.
content = content.replace(/db\.(run|all|get)\(([`'"])([\s\S]*?)\2([^)]*)\)/g, (match, method, quote, sql, params) => {
    if (sql.includes('magapp_categories') || sql.includes('magapp_apps') || sql.includes('magapp_favorites') || sql.includes('magapp_clicks') || sql.includes('magapp_subscriptions')) {
        modified = true;
        return `pgDb.${method}(${quote}${sql}${quote}${params})`;
    }
    return match;
});

fs.writeFileSync(serverFile, content, 'utf8');
console.log('server.js updated successfully: replacements made:', modified);

