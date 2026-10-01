const crypto = require('crypto');
const os = require('os');
const jwt = require('jsonwebtoken');
const { getSqlite } = require('../../shared/database');
const { PORT } = require('../../shared/config');

// Visionneuse Office en lecture seule : ONLYOFFICE Document Server (celui de delib, ou tout autre).
// Réglages (app_settings, repli sur variables d'environnement) :
//   office_viewer.url          adresse du moteur vue par le navigateur (ex. http://10.103.130.106:9980)
//   office_viewer.jwt_secret   secret JWT partagé avec le moteur
//   office_viewer.callback_url adresse de CE backend vue par le moteur (défaut : IP LAN détectée + port)

const TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const store = new Map();

const TYPES = {
    word: ['doc', 'docx', 'rtf', 'odt', 'txt'],
    cell: ['xls', 'xlsx', 'ods', 'xlsm', 'csv'],
    slide: ['ppt', 'pptx', 'odp', 'pptm'],
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(TYPES).flatMap(([t, l]) => l.map(e => [e, t])));

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
}, 60 * 1000).unref();

async function setting(key, envName) {
    try {
        const db = getSqlite();
        if (db) {
            const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', key);
            if (row && row.setting_value) return String(row.setting_value);
        }
    } catch (_) { /* table non initialisée */ }
    return process.env[envName] || '';
}

async function getConfig() {
    const url = (await setting('office_viewer.url', 'OFFICE_VIEWER_URL')).replace(/\/+$/, '');
    const secret = await setting('office_viewer.jwt_secret', 'OFFICE_VIEWER_JWT_SECRET');
    const callback = (await setting('office_viewer.callback_url', 'OFFICE_VIEWER_CALLBACK_URL')).replace(/\/+$/, '');
    return { url, secret, callback };
}

function lanBaseUrl() {
    const addrs = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal);
    const pick = addrs.find(a => a.address.startsWith('10.')) || addrs[0];
    return `http://${pick ? pick.address : '127.0.0.1'}:${PORT}`;
}

exports.status = async (req, res) => {
    const c = await getConfig();
    res.json({ enabled: !!(c.url && c.secret), formats: Object.keys(TYPE_BY_EXT) });
};

exports.prepare = async (req, res) => {
    try {
        const c = await getConfig();
        if (!c.url || !c.secret) return res.status(503).json({ message: 'Visionneuse Office non configurée' });
        const name = String(req.query.name || 'document').replace(/[\\/]/g, '_');
        const ext = name.split('.').pop().toLowerCase();
        const documentType = TYPE_BY_EXT[ext];
        if (!documentType) return res.status(400).json({ message: 'Format non pris en charge' });
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || !buffer.length) return res.status(400).json({ message: 'Fichier vide' });
        if (buffer.length > MAX_BYTES) return res.status(413).json({ message: 'Fichier trop volumineux' });

        const ticket = crypto.randomBytes(24).toString('hex');
        store.set(ticket, { buffer, name, expires: Date.now() + TTL_MS });
        const base = c.callback || lanBaseUrl();

        const config = {
            documentType,
            type: 'embedded',
            width: '100%',
            height: '100%',
            document: {
                fileType: ext,
                key: `v-${crypto.randomBytes(8).toString('hex')}`,
                title: name,
                url: `${base}/api/office-viewer/source/${ticket}`,
                permissions: { edit: false, download: false, print: false, copy: true, comment: false },
            },
            editorConfig: {
                mode: 'view',
                lang: 'fr-FR',
                customization: {
                    compactHeader: true, toolbarHideFileName: true, hideRightMenu: true,
                    chat: false, comments: false, plugins: false, help: false, feedback: false,
                },
            },
            documentServerUrl: c.url,
        };
        config.token = jwt.sign(config, c.secret, { expiresIn: '2h' });
        res.json({ sdk: `${c.url}/web-apps/apps/api/documents/api.js`, config });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// Appelée par le moteur (anonyme) : le ticket aléatoire à durée limitée fait office d'autorisation.
exports.source = (req, res) => {
    const entry = store.get(req.params.ticket);
    if (!entry || entry.expires < Date.now()) return res.status(404).end();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(entry.name)}"`);
    res.send(entry.buffer);
};
