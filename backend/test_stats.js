const setupDb = require('./db');

async function test() {
    const db = await setupDb();
    const stats = await db.all(`
        WITH daily_stats AS (
            SELECT 
                app_id, 
                date(clicked_at, 'localtime') as day, 
                COUNT(*) as click_count,
                COUNT(DISTINCT COALESCE(username, ip_address)) as unique_users
            FROM magapp_clicks
            GROUP BY app_id, day
        ),
        day_counts AS (
            SELECT app_id, COUNT(DISTINCT day) as total_days
            FROM daily_stats
            GROUP BY app_id
        )
        SELECT 
            a.id,
            a.name,
            COALESCE(SUM(ds.click_count), 0) as total_clicks,
            ROUND(CAST(COALESCE(SUM(ds.click_count), 0) AS REAL) / COALESCE(dc.total_days, 1), 2) as avg_clicks_per_day,
            ROUND(CAST(COALESCE(SUM(ds.unique_users), 0) AS REAL) / COALESCE(dc.total_days, 1), 2) as avg_unique_users_per_day
        FROM magapp_apps a
        LEFT JOIN daily_stats ds ON a.id = ds.app_id
        LEFT JOIN day_counts dc ON a.id = dc.app_id
        GROUP BY a.id
        HAVING total_clicks > 0
        ORDER BY a.name ASC
    `);
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
}

test();
