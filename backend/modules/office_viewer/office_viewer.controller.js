const crypto = require('crypto');
const os = require('os');
const { PORT } = require('../../shared/config');
const onlyoffice = require('../../shared/onlyoffice');

// Visionneuse Office lecture seule, basée sur le Document Server d'AppDSI
// (hub.infra_apis, clé 'onlyoffice' — cf. shared/onlyoffice.js).
// Le moteur récupère le fichier via /source/:ticket (jeton aléatoire, 15 min),
// sur ONLYOFFICE_CALLBACK_URL (réseau Docker interne) ou, à défaut, l'IP LAN.

const TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const store = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
}, 60 * 1000).unref();

function callbackBase() {
    const env = (process.env.ONLYOFFICE_CALLBACK_URL || '').replace(/\/+$/, '');
    if (env) return env;
    const addrs = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal);
    const pick = addrs.find(a => a.address.startsWith('10.')) || addrs[0];
    return `http://${pick ? pick.address : '127.0.0.1'}:${PORT}`;
}

exports.status = async (req, res) => {
    const cfg = await onlyoffice.getConfig().catch(() => null);
    res.json({ enabled: !!cfg });
};

exports.prepare = async (req, res) => {
    try {
        const cfg = await onlyoffice.getConfig();
        if (!cfg) return res.status(503).json({ message: 'Visionneuse Office non configurée (hub.infra_apis, clé onlyoffice)' });
        const name = String(req.query.name || 'document').replace(/[\/]/g, '_');
        if (!onlyoffice.estPriseEnCharge(name)) return res.status(400).json({ message: 'Format non pris en charge' });
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || !buffer.length) return res.status(400).json({ message: 'Fichier vide' });
        if (buffer.length > MAX_BYTES) return res.status(413).json({ message: 'Fichier trop volumineux' });

        const ticket = crypto.randomBytes(24).toString('hex');
        store.set(ticket, { buffer, name, expires: Date.now() + TTL_MS });

        const out = onlyoffice.buildViewConfig(cfg, {
            cle: `v-${crypto.randomBytes(8).toString('hex')}`,
            nom: name,
            url: `${callbackBase()}/api/office-viewer/source/${ticket}`,
            utilisateur: { id: String(req.user.username), nom: req.user.displayName || req.user.username },
            minimal: true,
        });
        res.json(out);
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
