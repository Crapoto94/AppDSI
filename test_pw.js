const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

(async () => {
  const db = await open({
    filename: 'C:\\dev\\AppDSI\\backend\\data\\database.sqlite',
    driver: sqlite3.Database
  });
  const users = await db.all('SELECT username, password FROM users WHERE password IS NOT NULL');
  const passwords = ['admin', 'adminhub', 'password', 'test', '1234', 'ivryadmin', 'ivry94'];
  for (const u of users) {
    for (const pw of passwords) {
      const match = await bcrypt.compare(pw, u.password);
      if (match) {
        console.log(`MATCH: ${u.username} / ${pw}`);
      }
    }
  }
  console.log('Done checking');
  await db.close();
})().catch(e => console.error(e));
