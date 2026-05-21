const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

// Mapping des initiales aux noms complets
const userMapping = {
  'FB': { name: 'Farouk Bouatou', username: 'farouk.bouatou' },
  'AFE': { name: 'Albine Ferreira', username: 'albine.ferreira' },
  'YT': { name: 'Yassine Taraki', username: 'yassine.taraki' }
};

// Mapping des modules
const moduleMapping = {
  'Portefeuille Projet': 'Portefeuille Projets',
  'Portefeuille projet': 'Portefeuille Projets',
  'FB': 'Portefeuille Projets',
  'YT': 'Calendrier DSI',
  'AFE': 'Admin',
  'Magapp': 'Magasin d\'Applications',
  'Journal de maintenance': 'Calendrier DSI',
  'maintenance': 'Calendrier DSI'
};

function parseBacklogTitle(title) {
  // Pattern: Bug/AFE/Title or Bug\AFE\Title or Amélioration/FB/...
  const patterns = [
    /^([^\\\/]+)[\\\/]([A-Z]+)[\\\/](.*)/,  // Bug/FB/Titre
    /^([^\\\/]+)\s*\\([A-Z]+)\\\s*(.*)/      // Bug\AFE\ Titre
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      let [, category, initials, rest] = match;
      category = category.trim();
      initials = initials.trim();
      rest = rest.trim();

      // Normalize category
      if (category.toLowerCase() === 'bug') category = 'Bug';
      else if (category.toLowerCase() === 'amélioration') category = 'Amélioration';
      else if (category.toLowerCase() === 'bug') category = 'Bug';

      const userInfo = userMapping[initials];

      return {
        category: category,
        createdBy: userInfo ? userInfo.name : initials,
        newTitle: rest,
        initials: initials,
        isValid: true
      };
    }
  }

  // If no pattern matched, return original
  return {
    category: null,
    createdBy: null,
    newTitle: title,
    initials: null,
    isValid: false
  };
}

async function runMigration() {
  try {
    console.log('Parsing and updating backlog titles...\n');

    // Get all backlog items
    const items = await pool.query('SELECT id, title, category, created_by FROM hub.backlog');

    let updated = 0;
    for (const item of items.rows) {
      const parsed = parseBacklogTitle(item.title);

      if (parsed.isValid) {
        // Update the item with parsed information
        await pool.query(
          `UPDATE hub.backlog
           SET title = $1, category = $2, created_by = $3
           WHERE id = $4`,
          [parsed.newTitle, parsed.category, parsed.createdBy, item.id]
        );

        console.log(`✓ Updated: "${item.title}"`);
        console.log(`  → Title: "${parsed.newTitle}"`);
        console.log(`  → Category: ${parsed.category}`);
        console.log(`  → Created by: ${parsed.createdBy}\n`);
        updated++;
      }
    }

    console.log(`✅ Migration completed: ${updated} backlog items updated`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
