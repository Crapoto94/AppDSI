const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
  try {
    const db = await open({
      filename: path.join(__dirname, 'backend', 'data', 'database.sqlite'),
      driver: sqlite3.Database
    });
    await db.run('DELETE FROM transcript_meetings');
    await db.run('DELETE FROM transcript_cues');
    await db.run('DELETE FROM transcript_tasks');
    console.log('Transcript data deleted from SQLite.');
  } catch (error) {
    console.error('Error deleting transcript data:', error.message);
  }
})();
