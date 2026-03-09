const setupDb = require('./backend/db');
setupDb().then(async db => {
    const stats = await db.all(`
        SELECT 
            a.id,
            a.name,
            COALESCE(total_info.total_clicks, 0) as total_clicks,
            COALESCE(today_info.today_clicks, 0) as today_clicks,
            CASE WHEN COALESCE(today_info.today_clicks, 0) > 0 THEN 1 ELSE 0 END as has_today_stats,
            ROUND(CAST(COALESCE(total_info.total_clicks, 0) AS REAL) / COALESCE(total_info.total_days, 1), 2) as avg_clicks_per_day,
            ROUND(CAST(COALESCE(total_info.unique_users_total, 0) AS REAL) / COALESCE(total_info.total_days, 1), 2) as avg_unique_users_per_day
        FROM magapp_apps a
        LEFT JOIN (
            SELECT app_id, COUNT(*) as total_clicks, COUNT(DISTINCT date(clicked_at, 'localtime')) as total_days, COUNT(DISTINCT COALESCE(username, ip_address)) as unique_users_total
            FROM magapp_clicks GROUP BY app_id
        ) total_info ON a.id = total_info.app_id
        LEFT JOIN (
            SELECT app_id, COUNT(*) as today_clicks
            FROM magapp_clicks 
            WHERE date(clicked_at, 'localtime') = date('now', 'localtime')
            GROUP BY app_id
        ) today_info ON a.id = today_info.app_id
        ORDER BY a.name ASC
    `);
    console.log('STATS COUNT:', stats.length);
    console.log('TODAY STATS:', JSON.stringify(stats.filter(s => s.has_today_stats === 1), null, 2));
    process.exit(0);
});
