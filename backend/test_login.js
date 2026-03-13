const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite');

db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, user) => {
    if (err) {
        console.error('Error:', err);
        return db.close();
    }
    
    if (!user) {
        console.log('User not found');
        return db.close();
    }
    
    console.log('User found:', user.username, user.role);
    console.log('Password hash:', user.password);
    
    try {
        const result = await bcrypt.compare('admin123', user.password);
        console.log('Password match:', result);
    } catch (e) {
        console.error('Bcrypt error:', e);
    }
    
    db.close();
});
