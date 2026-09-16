// Activation d'un collecteur mail, propre à chaque instance (dev/prod peuvent différer).
// Source de vérité exclusive : SQLite local_settings — jamais hub_tickets.mail_collectors.is_enabled
// (PostgreSQL, partagé entre toutes les instances qui pointent vers la même base).

function key(collectorId) {
  return `mail_collector_${collectorId}_enabled`;
}

async function isEnabledLocally(sqlite, collectorId) {
  const row = await sqlite.get('SELECT value FROM local_settings WHERE key = ?', [key(collectorId)]);
  return row ? row.value === 'true' : true;
}

async function setEnabledLocally(sqlite, collectorId, enabled) {
  await sqlite.run('CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT)');
  const value = enabled ? 'true' : 'false';
  const existing = await sqlite.get('SELECT key FROM local_settings WHERE key = ?', [key(collectorId)]);
  if (existing) {
    await sqlite.run('UPDATE local_settings SET value = ? WHERE key = ?', [value, key(collectorId)]);
  } else {
    await sqlite.run('INSERT INTO local_settings (key, value) VALUES (?, ?)', [key(collectorId), value]);
  }
}

module.exports = { isEnabledLocally, setEnabledLocally };
