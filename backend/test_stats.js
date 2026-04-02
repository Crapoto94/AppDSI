const { pgDb } = require('./pg_db');
pgDb.all(`
            SELECT 
                a.id,
                a.name,
                COALESCE(total_info.total_clicks, 0) as total_clicks,
                COALESCE(today_info.today_clicks, 0) as today_clicks,
                CASE WHEN COALESCE(today_info.today_clicks, 0) > 0 THEN 1 ELSE 0 END as has_today_stats,
                ROUND(CAST(COALESCE(total_info.total_clicks, 0) AS NUMERIC) / NULLIF(COALESCE(total_info.total_days, 1), 0), 2) as avg_clicks_per_day,
                ROUND(CAST(COALESCE(total_info.unique_users_total, 0) AS NUMERIC) / NULLIF(COALESCE(total_info.total_days, 1), 0), 2) as avg_unique_users_per_day
            FROM magapp_apps a
            LEFT JOIN (
                SELECT app_id, COUNT(*) as total_clicks, COUNT(DISTINCT DATE(clicked_at)) as total_days, COUNT(DISTINCT COALESCE(username, ip_address)) as unique_users_total
                FROM magapp_clicks GROUP BY app_id
            ) total_info ON a.id = total_info.app_id
            LEFT JOIN (
                SELECT app_id, COUNT(*) as today_clicks
                FROM magapp_clicks 
                WHERE DATE(clicked_at) = CURRENT_DATE
                GROUP BY app_id
            ) today_info ON a.id = today_info.app_id
            ORDER BY a.name ASC
`)
  .then(res => console.log(res.filter(r => r.today_clicks > 0).slice(0, 5)))
  .catch(console.error)
  .finally(() => process.exit(0));
