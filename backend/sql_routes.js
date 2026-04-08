module.exports = function(app, db, authenticateAdmin) {
    // Simple test route
    app.get('/api/sql-test', (req, res) => {
        res.json({ message: 'sql test works' });
    });

    // SQL Explorer API (Admin only)
    app.get('/api/admin/sql/databases', authenticateAdmin, async (req, res) => {
        try {
            const databases = await db.all("PRAGMA database_list");
            
            // On convertit les chemins absolus en chemins relatifs/noms de fichiers
            // pour éviter d'exposer la structure de l'hôte et rester cohérent en Docker
            const sanitizedDatabases = databases.map(d => ({
                ...d,
                file: d.file ? require('path').basename(d.file) : d.file
            }));
            
            res.json(sanitizedDatabases);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/admin/sql/tables', authenticateAdmin, async (req, res) => {
        try {
            const dbName = typeof req.query.db === 'string' && req.query.db ? req.query.db.replace(/[^a-zA-Z0-9_]/g, '') : 'main';
            const tables = await db.all(`
                SELECT name, type 
                FROM "${dbName}".sqlite_master 
                WHERE type IN ('table', 'view') 
                AND name NOT LIKE 'sqlite_%'
                ORDER BY type, name
            `);
            res.json(tables);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.get('/api/admin/sql/table/:name', authenticateAdmin, async (req, res) => {
        try {
            const dbName = typeof req.query.db === 'string' && req.query.db ? req.query.db.replace(/[^a-zA-Z0-9_]/g, '') : 'main';
            const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;
            
            const tableInfo = await db.all(`PRAGMA "${dbName}".table_info("${tableName}")`);
            const records = await db.all(`SELECT * FROM "${dbName}"."${tableName}" LIMIT ? OFFSET ?`, [limit, offset]);
            const countResult = await db.get(`SELECT COUNT(*) as total FROM "${dbName}"."${tableName}"`);
            
            res.json({
                columns: tableInfo,
                records: records,
                total: countResult.total
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    app.post('/api/admin/sql/query', authenticateAdmin, async (req, res) => {
        try {
            const { sql } = req.body;
            
            if (!sql || typeof sql !== 'string') {
                return res.status(400).json({ message: 'SQL query required' });
            }
            
            const trimmedSql = sql.trim().toLowerCase();
            
            if (!trimmedSql.startsWith('select')) {
                return res.status(400).json({ message: 'Only SELECT queries are allowed' });
            }
            
            if (trimmedSql.includes('drop') || trimmedSql.includes('delete') || 
                trimmedSql.includes('update') || trimmedSql.includes('insert') ||
                trimmedSql.includes('alter') || trimmedSql.includes('create')) {
                return res.status(400).json({ message: 'Only SELECT queries are allowed' });
            }
            
            const startTime = Date.now();
            const records = await db.all(sql);
            const executionTime = Date.now() - startTime;
            
            res.json({
                records: records,
                count: records.length,
                executionTime: executionTime
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    console.log('[SQL Explorer routes loaded]');
};
