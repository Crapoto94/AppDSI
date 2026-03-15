const fs = require('fs');
let serverJS = fs.readFileSync('server.js', 'utf8');

const alignRoute = `
app.get('/api/admin/rh/align-mappings', authenticateAdmin, async (req, res) => {
    try {
        const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_ad_align_mappings'");
        res.json(setting && setting.setting_value ? JSON.parse(setting.setting_value) : [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}]);
    } catch (err) {
        res.status(500).json({ message: 'Erreur lecture mappings', error: err.message });
    }
});

app.post('/api/admin/rh/align-mappings', authenticateAdmin, async (req, res) => {
    try {
        const { mappings } = req.body;
        await db.run("INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
            ['rh_ad_align_mappings', JSON.stringify(mappings || []), 'Paramétrage des champs RH/AD pour les alignements']);
        res.json({ message: 'Mappings enregistrés' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur sauvegarde mappings', error: err.message });
    }
});
`;

if (!serverJS.includes('/api/admin/rh/align-mappings')) {
    serverJS = serverJS.replace('// Synchronisation RH : Import complet', alignRoute + '\n// Synchronisation RH : Import complet');
}

// In server.js alignements GET we read mappings from DB:
// Instead of setting mappings from req.query.mappings, let's load from db:
const getAlignmentsTarget = `        const mappingsStr = req.query.mappings;
        let mappings = [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}];
        if (mappingsStr) {
            try { mappings = JSON.parse(mappingsStr); } catch (e) { console.error("Invalid mappings format"); }
        }`;

const getAlignmentsReplacement = `        const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_ad_align_mappings'");
        let mappings = [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}];
        if (setting && setting.setting_value) {
            try { mappings = JSON.parse(setting.setting_value); } catch (e) { console.error("Invalid mappings format"); }
        }`;

if (serverJS.includes(getAlignmentsTarget)) {
    serverJS = serverJS.replace(getAlignmentsTarget, getAlignmentsReplacement);
}

fs.writeFileSync('server.js', serverJS);
console.log("server.js updated");
