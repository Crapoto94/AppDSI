const oracledb = require('oracledb');
const { pool } = require('../../shared/database');

class OracleSyncService {
  async getOracleConnection(settings) {
    try {
      if (!settings.host || !settings.port || !settings.service_name || !settings.username || !settings.password) {
        throw new Error('Oracle connection settings incomplete. Please configure all required fields.');
      }

      const connection = await oracledb.getConnection({
        user: settings.username,
        password: settings.password,
        connectionString: `${settings.host}:${settings.port}/${settings.service_name}`
      });

      return connection;
    } catch (err) {
      throw new Error(`Failed to connect to Oracle: ${err.message}`);
    }
  }

  async fetchDataFromOracle(connection, tables) {
    try {
      const results = {};

      for (const table of tables) {
        const query = `SELECT * FROM ${table.table_name}`;
        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        results[table.table_name] = result.rows || [];
      }

      return results;
    } catch (err) {
      throw new Error(`Failed to fetch data from Oracle: ${err.message}`);
    }
  }

  async getConfiguredTables(settings) {
    try {
      if (!settings.sync_config_json || !settings.sync_config_json.tables) {
        return [];
      }

      const config = typeof settings.sync_config_json === 'string'
        ? JSON.parse(settings.sync_config_json)
        : settings.sync_config_json;

      return config.tables || [];
    } catch (err) {
      console.error('Error parsing sync config:', err);
      return [];
    }
  }

  async storeData(syncType, data, recordCount) {
    try {
      // Store sync metadata
      const syncMetadata = {
        sync_type: syncType,
        tables_synced: Object.keys(data).length,
        total_records: recordCount,
        synced_at: new Date(),
        data_snapshot: JSON.stringify(data)
      };

      // For now, we'll store a summary in the sync logs
      // In production, you'd store actual data in appropriate tables
      console.log(`[Oracle Sync Service] Synced ${recordCount} records from ${Object.keys(data).length} tables for ${syncType}`);

      return syncMetadata;
    } catch (err) {
      throw new Error(`Failed to store synced data: ${err.message}`);
    }
  }

  async testConnection(settings) {
    let connection;
    try {
      connection = await this.getOracleConnection(settings);

      // Test query
      const result = await connection.execute('SELECT 1 FROM DUAL');

      return {
        success: true,
        message: 'Connection to Oracle successful'
      };
    } catch (err) {
      return {
        success: false,
        message: err.message
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.error('Error closing Oracle connection:', closeErr);
        }
      }
    }
  }
}

module.exports = new OracleSyncService();
