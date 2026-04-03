const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

const sqliteDb = new sqlite3.Database('database.sqlite');

async function migrateUsers() {
  const pgClient = await pool.connect();
  try {
    console.log('Starting users migration...');
    
    // Create schema and table just in case
    await pgClient.query('CREATE SCHEMA IF NOT EXISTS hub;');
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS hub.users (
        username VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        displayName VARCHAR(255),
        email VARCHAR(255),
        service_code VARCHAR(100),
        service_complement VARCHAR(255),
        last_activity VARCHAR(100),
        is_approved INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get users from SQLite
    sqliteDb.all('SELECT * FROM users', async (err, rows) => {
      if (err) {
        console.error('Error reading SQLite users:', err);
        return;
      }

      console.log(`Found ${rows.length} users to migrate.`);

      for (const user of rows) {
        try {
          await pgClient.query(`
            INSERT INTO hub.users (
              username, password, role, displayName, email, 
              service_code, service_complement, last_activity, is_approved
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (username) DO UPDATE SET
              password = EXCLUDED.password,
              role = EXCLUDED.role,
              displayName = EXCLUDED.displayName,
              email = EXCLUDED.email,
              service_code = EXCLUDED.service_code,
              service_complement = EXCLUDED.service_complement,
              last_activity = EXCLUDED.last_activity,
              is_approved = EXCLUDED.is_approved
          `, [
            user.username, user.password, user.role, user.displayName, user.email,
            user.service_code, user.service_complement, user.last_activity, user.is_approved
          ]);
        } catch (e) {
          console.error(`Error migrating user ${user.username}:`, e.message);
        }
      }

      console.log('Users migration completed successfully.');
      pgClient.release();
      pool.end();
      sqliteDb.close();
    });
  } catch (error) {
    console.error('Migration failed:', error);
    pgClient.release();
  }
}

migrateUsers();
