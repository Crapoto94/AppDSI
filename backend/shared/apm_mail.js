/**
 * Client d'envoi de mails via l'API Ville (APM).
 *
 * L'APM applique SON template HTML global (template « général » de la Ville),
 * contrairement au sendMail local du DSI Hub qui enveloppe le contenu dans le
 * template DSI. On l'utilise donc pour les mails « ville » (ex. compte rendu
 * de réunion du Transcript Manager).
 *
 * Config : hub.infra_apis WHERE key='apm_mail' (base_url, api_key, header_name),
 * avec repli sur 'apm_ai' (même hôte APM ; la clé API doit alors porter la
 * permission `mail_send`). Endpoint APM : POST {base_url}/api/v1/mail/send
 *   body : { to, subject, content, attachments?, from_name?, from_email? }
 */
const { pgDb } = require('./database');

async function getConfig() {
    let cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['apm_mail']);
    if (!cfg || !cfg.base_url || !cfg.api_key) {
        const ai = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['apm_ai']);
        if (ai && ai.base_url && ai.api_key) cfg = { ...ai, key: 'apm_mail' };
    }
    if (!cfg || !cfg.base_url) throw new Error("API Ville (APM) non configurée — renseigner base_url/api_key via /admin/infra");
    if (cfg.enabled === false) throw new Error("L'API Ville (APM) est désactivée — l'activer via /admin/infra");
    if (!cfg.api_key) throw new Error("Clé API Ville (APM) manquante — à renseigner via /admin/infra");
    return cfg;
}

function buildUrl(cfg) {
    const base = (cfg.base_url || '').replace(/\/+$/, '');
    return `${base}/api/v1/mail/send`;
}

/**
 * Envoie un mail via l'API Ville (APM) — le template global de l'APM est appliqué.
 * @param {{ to:string, subject:string, content:string, attachments?:Array<{filename:string,content:string}>, fromName?:string, fromEmail?:string }} mail
 */
async function sendMail({ to, subject, content, attachments = [], fromName, fromEmail }) {
    const cfg = await getConfig();
    const headerName = cfg.header_name || 'X-API-KEY';
    const body = { to, subject, content, attachments };
    if (fromName) body.from_name = fromName;
    if (fromEmail) body.from_email = fromEmail;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
        const resp = await fetch(buildUrl(cfg), {
            method: 'POST',
            headers: { [headerName]: cfg.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        const text = await resp.text().catch(() => '');
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} depuis l'API Ville (mail)${text ? ' — ' + text.slice(0, 300) : ''}`);
        }
        return true;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { getConfig, sendMail };
