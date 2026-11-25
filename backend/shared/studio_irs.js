/**
 * Connexion à Studio IRS (API externe).
 *
 * Config : hub.infra_apis WHERE key='studio_irs' (gérée depuis /admin/infra). Tant que l'URL ou la clé
 * n'y sont pas saisies, elles viennent de STUDIO_IRS_URL / STUDIO_IRS_KEY (.env à la racine, transmises
 * au conteneur par docker-compose). La clé n'est jamais journalisée ni renvoyée en clair au navigateur.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/** Le backend ne charge pas dotenv : en développement local, on lit STUDIO_IRS_* dans le .env de la racine. */
function fromEnv(name) {
    if (process.env[name]) return process.env[name];
    try {
        const txt = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
        const m = txt.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'));
        return m ? m[1].replace(/^["']|["']$/g, '') : '';
    } catch { return ''; }
}

// API externe de Studio IRS (dépôt dgaultier/StudioIRS, server/api/rest/external.go) :
// en-tête X-API-Key, chaque route exige un « scope » porté par la clé.
const API = '/api/external/v1';
const DEFAULT_ENDPOINT = `${API}/hosts`;
// Lectures sans paramètre, sondées par le bouton « Tester » pour connaître les droits de la clé.
const READS = [
    ['Hôtes supervisés', '/hosts'],
    ['Postes Windows 10/11', '/desktops'],
    ['Alertes', '/alerts'],
    ['Incidents', '/incidents'],
    ['Correctifs / paquets', '/patches'],
    ['Vulnérabilités', '/vuln'],
    ['Événements SIEM', '/siem/events'],
    ['Checks applicatifs', '/health-checks'],
    ['Checks réseau', '/network-checks'],
    ['Synthèse tableau de bord', '/dashboard/summary'],
    ['État réseau', '/network-status'],
    ['Campagnes d’inventaire', '/inventory/campaigns'],
];

/** Complète la ligne de hub.infra_apis avec les valeurs du .env (et l'endpoint par défaut) là où elle est vide. */
function withEnv(row) {
    return {
        ...row,
        base_url: row.base_url || fromEnv('STUDIO_IRS_URL'),
        api_key: row.api_key || fromEnv('STUDIO_IRS_KEY'),
        endpoint: row.endpoint || DEFAULT_ENDPOINT,
    };
}

/**
 * Sonde en GET chaque famille de l'API externe et dit lesquelles la clé peut lire.
 * Seul le code de réponse est lu : aucune donnée n'est conservée. Les droits d'écriture ne sont pas testés.
 */
async function testConnection(row) {
    const cfg = withEnv(row);
    if (!cfg.base_url || !cfg.api_key) throw new Error('URL ou clé API de Studio IRS non renseignée');
    const base = String(cfg.base_url).replace(/\/+$/, '');
    const results = await Promise.all(READS.map(async ([label, path]) => {
        const r = await axios.get(base + API + path, {
            headers: { [cfg.header_name || 'X-API-Key']: cfg.api_key },
            timeout: 15000,
            maxRedirects: 0, // la clé ne doit pas suivre une redirection vers un autre hôte
            validateStatus: () => true,
            responseType: 'stream',
        }).catch((e) => ({ error: e.code || e.message }));
        if (r.data) r.data.destroy();
        // Une page web répond 200 même sans clé valide : seul du JSON prouve que l'API a répondu.
        const json = String(r.headers?.['content-type'] || '').includes('json');
        return { label, path, status: r.status || null, error: r.error || null, ok: r.status === 200 && json };
    }));
    const readable = results.filter((x) => x.ok);
    if (readable.length) return { readable, results };
    if (results.every((x) => x.error)) throw new Error(`Studio IRS injoignable (${results[0].error})`);
    if (results.some((x) => x.status === 401)) throw new Error('Studio IRS refuse la clé API (invalide ou expirée)');
    if (results.some((x) => x.status === 403)) throw new Error("Clé reconnue, mais elle n'a aucun droit de lecture");
    throw new Error(`Réponse inattendue de Studio IRS (HTTP ${results.find((x) => x.status)?.status}) : vérifier l'URL`);
}

/** Postes Windows 10/11 suivis par Studio IRS, avec le lien vers leur page de prise en main. */
async function listDesktops(row) {
    const cfg = withEnv(row);
    if (!cfg.base_url || !cfg.api_key) throw new Error('URL ou clé API de Studio IRS non renseignée');
    const base = String(cfg.base_url).replace(/\/+$/, '');
    const r = await axios.get(`${base}${API}/desktops`, {
        headers: { [cfg.header_name || 'X-API-Key']: cfg.api_key },
        timeout: 15000,
        maxRedirects: 0,
    });
    if (!Array.isArray(r.data)) throw new Error('Réponse inattendue de Studio IRS');
    return r.data.map((h) => ({
        id: h.id,
        name: h.display_name || h.hostname,
        fqdn: h.fqdn || h.hostname,
        os: [h.os_name, h.os_version].filter(Boolean).join(' '),
        status: h.status,
        lastSeenAt: h.last_seen_at || null,
        // Page « Prise en main » de Studio IRS, poste présélectionné (paramètre ?host=).
        url: `${base}/remote-control?host=${encodeURIComponent(h.id)}`,
    }));
}

// Consultation (écran /admin/studio-irs) : seules ces lectures sont relayées.
const BROWSE = ['hosts', 'desktops', 'alerts', 'incidents', 'patches', 'vuln', 'siem/events', 'health-checks', 'network-checks', 'dashboard/summary'];
const DETAILS = { packages: (id) => `desktops/${id}/packages`, hardware: (id) => `desktops/${id}/hardware` };
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Chemin de l'API externe pour une demande de consultation, ou null si elle n'est pas autorisée. */
function browsePath(resource, id) {
    if (id !== undefined) return DETAILS[resource] && UUID.test(id) ? DETAILS[resource](id) : null;
    return BROWSE.includes(resource) ? resource : null;
}

/** Lecture GET d'un chemin renvoyé par browsePath. Les données ne sont ni stockées ni journalisées. */
async function read(row, path) {
    const cfg = withEnv(row);
    if (!cfg.base_url || !cfg.api_key) throw new Error('URL ou clé API de Studio IRS non renseignée');
    const r = await axios.get(`${String(cfg.base_url).replace(/\/+$/, '')}${API}/${path}`, {
        headers: { [cfg.header_name || 'X-API-Key']: cfg.api_key },
        params: ['vuln', 'siem/events'].includes(path) ? { limit: 500 } : undefined, // 500 = maximum de l'API
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: () => true,
    });
    if (r.status === 403) throw Object.assign(new Error("La clé API n'a pas le droit de lire ces données"), { status: 403 });
    if (r.status === 404) throw Object.assign(new Error('Aucune donnée pour cet élément'), { status: 404 });
    if (r.status !== 200 || typeof r.data !== 'object') throw new Error(`Studio IRS a répondu HTTP ${r.status}`);
    return r.data;
}

module.exports = { withEnv, testConnection, listDesktops, browsePath, read };
