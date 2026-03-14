const setupDb = require('./db.js');
setupDb()
  .then(() => console.log('success'))
  .catch(e => console.error(e));
