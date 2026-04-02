const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { pool, setupPgDb } = require('./pg_db');

async function migrateData() {
    console.log('[MIGRATE] Setup Postgres Schema and Tables...');
    await setupPgDb();

    console.log('[MIGRATE] Connecting to SQLite...');
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const client = await pool.connect();
    
    try {
        console.log('[MIGRATE] Starting data migration...');

        // 1. Categories
        const categories = await db.all('SELECT * FROM magapp_categories');
        for (const cat of categories) {
            await client.query(`
                INSERT INTO magapp.categories (id, name, icon, display_order)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET name = $2, icon = $3, display_order = $4
            `, [cat.id, cat.name, cat.icon, cat.display_order]);
        }
        console.log(`[MIGRATE] Categories migrated: ${categories.length}`);

        // Update categories sequence
        await client.query(`SELECT setval('magapp.categories_id_seq', (SELECT MAX(id) FROM magapp.categories))`);

        // 2. Apps
        const apps = await db.all('SELECT * FROM magapp_apps');
        for (const app of apps) {
            await client.query(`
                INSERT INTO magapp.apps (id, category_id, name, description, url, icon, display_order, is_maintenance, maintenance_start, maintenance_end)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO UPDATE SET 
                  category_id = $2, name = $3, description = $4, url = $5, icon = $6, display_order = $7, is_maintenance = $8, maintenance_start = $9, maintenance_end = $10
            `, [app.id, app.category_id, app.name, app.description, app.url, app.icon, app.display_order, app.is_maintenance, app.maintenance_start, app.maintenance_end]);
        }
        console.log(`[MIGRATE] Apps migrated: ${apps.length}`);

        // Update apps sequence
        await client.query(`SELECT setval('magapp.apps_id_seq', (SELECT MAX(id) FROM magapp.apps))`);

        // 3. Favorites
        const favorites = await db.all('SELECT * FROM magapp_favorites');
        let favErrs = 0;
        for (const fav of favorites) {
            try {
                await client.query(`
                    INSERT INTO magapp.favorites (username, app_id)
                    VALUES ($1, $2)
                    ON CONFLICT (username, app_id) DO NOTHING
                `, [fav.username, fav.app_id]);
            } catch (e) {
                favErrs++;
            }
        }
        console.log(`[MIGRATE] Favorites migrated: ${favorites.length - favErrs} (Orphaned skipped: ${favErrs})`);

        // 4. Clicks
        const clicks = await db.all('SELECT * FROM magapp_clicks');
        let clickErrs = 0;
        for (const click of clicks) {
            try {
                await client.query(`
                    INSERT INTO magapp.clicks (app_id, username, ip_address, user_agent, clicked_at)
                    VALUES ($1, $2, $3, $4, $5)
                `, [click.app_id, click.username, click.ip_address, click.user_agent, click.clicked_at]);
            } catch (e) {
                clickErrs++;
            }
        }
        console.log(`[MIGRATE] Clicks migrated: ${clicks.length - clickErrs} (Orphaned skipped: ${clickErrs})`);

        // 5. Subscriptions
        const subscriptions = await db.all('SELECT * FROM magapp_subscriptions');
        let subErrs = 0;
        for (const sub of subscriptions) {
            try {
                await client.query(`
                    INSERT INTO magapp.subscriptions (app_id, email, subscribed_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (email, app_id) DO NOTHING
                `, [sub.app_id, sub.email, sub.subscribed_at]);
            } catch (e) {
                subErrs++;
            }
        }
        console.log(`[MIGRATE] Subscriptions migrated: ${subscriptions.length - subErrs} (Orphaned skipped: ${subErrs})`);

        console.log('[MIGRATE] Migration completed successfully!');

    } catch (error) {
        console.error('[MIGRATE] Error during migration:', error);
    } finally {
        client.release();
        await db.close();
        pool.end();
    }
}

migrateData();
