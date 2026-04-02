const { pgDb } = require('./pg_db');
pgDb.all(`SELECT app_id, COUNT(*) as today_clicks FROM magapp_clicks WHERE DATE(clicked_at) = CURRENT_DATE GROUP BY app_id`)
  .then(console.log)
  .catch(console.error)
  .finally(() => process.exit(0));
