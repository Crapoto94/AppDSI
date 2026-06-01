/**
 * Module Infra — gestion des définitions d'API externes (hub.infra_apis)
 * et déclenchement des synchronisations associées.
 */
const { pgDb, pool } = require('../../shared/database');
const { syncReseauLinks, fetchLinks } = require('./reseau-sync');

function maskKey(k) {
    if (!k) return null;
    const s = String(k);
    if (s.length <= 4) return '••••';
    return '••••••••' + s.slice(-4);
}

function publicApi(row) {
    return { ...row, api_key: maskKey(row.api_key), api_key_set: !!row.api_key };
}

module.exports = {
    // GET /api/infra/apis
    listApis: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub.infra_apis ORDER BY key');
            res.json(rows.map(publicApi));
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // PUT /api/infra/apis/:key
    updateApi: async (req, res) => {
        try {
            const { key } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', [key]);
            if (!existing) return res.status(404).json({ message: 'API inconnue' });

            const f = req.body || {};
            // api_key : ne pas écraser si non fourni / vide (la valeur affichée est masquée)
            const newKey = (f.api_key !== undefined && f.api_key !== '' && !/^•/.test(f.api_key)) ? f.api_key : existing.api_key;

            const { rows } = await pool.query(
                `UPDATE hub.infra_apis SET
                   label=COALESCE($1,label), base_url=COALESCE($2,base_url), endpoint=COALESCE($3,endpoint),
                   api_key=$4, header_name=COALESCE($5,header_name), enabled=COALESCE($6,enabled), updated_at=NOW()
                 WHERE key=$7 RETURNING *`,
                [f.label, f.base_url, f.endpoint, newKey, f.header_name,
                 f.enabled !== undefined ? !!f.enabled : null, key]
            );
            res.json(publicApi(rows[0]));
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // POST /api/infra/apis/:key/test
    testApi: async (req, res) => {
        try {
            const { key } = req.params;
            const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', [key]);
            if (!cfg) return res.status(404).json({ message: 'API inconnue' });
            const data = await fetchLinks(cfg);
            res.json({ ok: true, count: data.length, sample: data.slice(0, 3) });
        } catch (e) {
            res.status(502).json({ ok: false, message: e.message });
        }
    },

    // POST /api/infra/sync/reseau
    syncReseau: async (req, res) => {
        try {
            const result = await syncReseauLinks('manual');
            res.json({ ok: true, ...result });
        } catch (e) {
            res.status(502).json({ ok: false, message: e.message });
        }
    },
};
