const setupDb = require('./backend/db');
setupDb().then(async db => {
    const today = await db.get("SELECT date('now', 'localtime') as d");
    console.log('TODAY SQL:', today.d);
    
    const stats = await db.all(`
        WITH today_stats AS (
            SELECT app_id, COUNT(*) as today_clicks
            FROM magapp_clicks
            WHERE date(clicked_at, 'localtime') = date('now', 'localtime')
            GROUP BY app_id
        )
        SELECT 
            a.id, a.name, COALESCE(ts.today_clicks, 0) as today_clicks
        FROM magapp_apps a
        JOIN today_stats ts ON a.id = ts.app_id
    `);
    console.log('MATCHED STATS:', JSON.stringify(stats, null, 2));
    process.exit(0);
});
