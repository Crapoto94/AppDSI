const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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

async function setPassword(username, password) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    console.log(`Setting password for user: ${username}`);

    // Update SQLite
    return new Promise((resolve, reject) => {
        db.run('UPDATE users SET password = ?, is_approved = 1 WHERE LOWER(username) = LOWER(?)', [hash, username], async function(err) {
            if (err) {
                console.error('Error updating SQLite:', err.message);
            } else {
                console.log(`[SQLite] Password updated for ${username}. Changes: ${this.changes}`);
                if (this.changes === 0) {
                    console.log(`[SQLite] User ${username} not found, inserting...`);
                    await new Promise((res, rej) => {
                        db.run('INSERT INTO users (username, password, role, is_approved) VALUES (?, ?, ?, 1)', [username.toLowerCase(), hash, 'admin'], (e) => e ? rej(e) : res());
                    });
                }
            }

            // Update PostgreSQL
            try {
                const res = await pool.query(`
                    INSERT INTO hub.users (username, password, role, is_approved)
                    VALUES ($1, $2, $3, 1)
                    ON CONFLICT (username) DO UPDATE SET
                    password = EXCLUDED.password,
                    is_approved = 1,
                    last_login = CURRENT_TIMESTAMP
                    RETURNING id
                `, [username.toLowerCase(), hash, 'admin']);
                console.log(`[PostgreSQL] Password updated/inserted for ${username}. ID: ${res.rows[0].id}`);
            } catch (err) {
                console.error('Error updating PostgreSQL:', err.message);
            }

            db.close();
            await pool.end();
            resolve();
        });
    });
}

const targetUser = process.argv[2] || 'admin';
const targetPass = process.argv[3] || 'admin';

setPassword(targetUser, targetPass).then(() => {
    console.log('Done.');
}).catch(err => {
    console.error('Final error:', err);
});
