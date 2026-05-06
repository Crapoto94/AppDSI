const setupSqlite = require('./sqlite_db');
const { pgDb, pool, setupPgDb } = require('./pg_db');

let sqliteInstance = null;

/**
 * Unified database interface for the backend.
 */
module.exports = {
    /**
     * Initializes SQLite and stores the instance.
     */
    setupDb: async () => {
        sqliteInstance = await setupSqlite();
        return sqliteInstance;
    },
    
    /**
     * Returns the active SQLite instance.
     */
    getSqlite: () => sqliteInstance,
    
    pgDb,       // PostgreSQL wrapper
    pool,       // Raw PostgreSQL pool
    setupPgDb,  // PostgreSQL schema initializer

    /**
     * Oracle Connection Helper
     */
    getOracleConnection: async (settings) => {
        const oracledb = require('oracledb');
        if (!settings || !settings.is_enabled) {
            throw new Error('La connexion Oracle est désactivée dans les paramètres.');
        }

        const config = {
            user: settings.username,
            password: settings.password,
            connectString: `${settings.host}:${settings.port}/${settings.service_name}`
        };

        try {
            return await oracledb.getConnection(config);
        } catch (err) {
            console.error('Oracle Connection Error:', err.message);
            throw new Error(`Erreur de connexion Oracle (${settings.type}) : ${err.message}`);
        }
    }
};
