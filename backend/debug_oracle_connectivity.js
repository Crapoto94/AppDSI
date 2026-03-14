const oracledb = require('oracledb');

// Configuration - Drawn from the DB settings
const config = {
    user: process.env.ORACLE_USER || "FI",
    password: process.env.ORACLE_PASSWORD || "oTlLjDNK9qYvoxnrWMpy",
    connectString: process.env.ORACLE_CONN_STRING || "oracle02:1527/SMPROD"
};

async function run() {
    console.log('--- Oracle Connectivity Diagnostic (Thin Mode) ---');
    console.log(`User: ${config.user}`);
    console.log(`Connect String: ${config.connectString}`);
    console.log('--------------------------------------------------');

    let connection;

    try {
        console.log('Attempting to connect to Oracle...');
        connection = await oracledb.getConnection(config);
        console.log('[SUCCESS] Successfully connected to Oracle Database!');

        console.log('Running a test query (SELECT 1 FROM DUAL)...');
        const result = await connection.execute('SELECT 1 FROM DUAL');
        console.log('[SUCCESS] Query executed successfully. Result:', result.rows);

    } catch (err) {
        console.error('[ERROR] Oracle connection failed:');
        console.error('Code:', err.code);
        console.error('Message:', err.message);
        
        if (err.message.includes('NJS-045') || err.message.includes('NJS-067')) {
            console.log('\n[TIP] This error might be due to thin mode configuration or network resolution issues.');
        }
        if (err.message.includes('NJS-511') || err.message.includes('DPI-1047')) {
            console.log('\n[TIP] This suggests a missing library or driver if not in thin mode, but with v6.10.0 thin mode should be default.');
        }
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log('Connection closed.');
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
}

run();
