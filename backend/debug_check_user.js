const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

async function checkUser(username) {
    console.log(`Checking user: ${username}`);
    
    // SQLite
    const sRow = await new Promise((res) => {
        db.get('SELECT username, password FROM users WHERE LOWER(username) = ?', [username.toLowerCase()], (err, row) => res(row));
    });
    console.log('SQLite Result:', sRow ? { username: sRow.username, hasPassword: !!sRow.password } : 'Not found');

    // PG
    try {
        const pRes = await pool.query('SELECT username, password FROM hub.users WHERE LOWER(username) = $1', [username.toLowerCase()]);
        const pRow = pRes.rows[0];
        console.log('PG Result:', pRow ? { username: pRow.username, hasPassword: !!pRow.password } : 'Not found');
    } catch (err) {
        console.error('PG Error:', err.message);
    }

    db.close();
    await pool.end();
}

const target = process.argv[2] || 'machevalier';
checkUser(target);
