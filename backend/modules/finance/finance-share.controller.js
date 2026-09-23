/**
 * Accès au partage de fichiers Sedit Finances (eGF/pjust) où sont stockées les
 * pièces jointes des factures/mandats dématérialisés (voir skill "sedit-finances").
 * Ce partage est distinct du stockage AppDSI piloté par /admin/ged.
 *
 * Comme pour le stockage GED (shared/storage.js), l'accès se fait via un compte
 * SMB applicatif explicite (lib smb2, shared/smb_client.js) plutôt que de
 * compter sur l'identité Windows du process. Si aucun compte dédié n'est
 * configuré ici, on retombe sur le compte de sauvegarde/stockage déjà utilisé
 * par /admin/ged (storage.login / storage.password / storage.domain).
 */
const path = require('path');
const { getSqlite } = require('../../shared/database');
const smb = require('../../shared/smb_client');
const storage = require('../../shared/storage');

const SETTING_KEYS = {
    root_path: 'finance.share_root_path',
    login: 'finance.share_login',
    password: 'finance.share_password',
    domain: 'finance.share_domain',
};

const DEFAULT_ROOT = '//seditgf-prod/editions$/SMPROD/eGF/pjust';
// Domaine AD requis par le serveur seditgf-prod (confirmé : un domaine vide fait
// échouer silencieusement la lecture — readdir renvoie 0 entrée sans erreur NTLM).
const DEFAULT_DOMAIN = 'IVRY';

// Pièces de la facture Sedit F26008278 (UGAP, commande 26D006458), utilisées comme
// cas de test connu — retrouvées via FI.FACTURE -> FI.FIPES_OBJ_PJ -> FI.PJ_PES.
const TEST_FILES = {
    pdf: 'FACTURE_D/30/00/UGAP/2026/7007125275/PJ00XFAC776056467005877007125275_20260911150039.pdf',
    xml: 'FACTURE_D/30/00/UGAP/2026/7007125275/FAC776056467005877007125275_20260911150039.xml',
};

async function getFinanceShareConfig() {
    const config = { root_path: '', login: '', password: '', domain: '' };
    const db = getSqlite();
    if (!db) return config;
    for (const [field, key] of Object.entries(SETTING_KEYS)) {
        try {
            const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', key);
            if (row && row.setting_value != null) config[field] = row.setting_value;
        } catch (e) {
            // table absente / non initialisée -> valeurs par défaut
        }
    }
    if (!config.root_path) config.root_path = DEFAULT_ROOT;
    if (!config.domain) config.domain = DEFAULT_DOMAIN;
    return config;
}

/** Config effective : compte Finance dédié si renseigné, sinon repli sur le compte de sauvegarde/GED. */
async function resolveShareConfig() {
    const financeConfig = await getFinanceShareConfig();
    if (financeConfig.login && financeConfig.password) {
        return { ...financeConfig, source: 'finance' };
    }
    const backupConfig = await storage.getStorageConfig();
    return {
        root_path: financeConfig.root_path, // toujours la racine Sedit, pas celle du stockage AppDSI
        login: backupConfig.login,
        password: backupConfig.password,
        // le domaine dépend du serveur cible (seditgf-prod), pas du compte de
        // sauvegarde : on garde celui configuré/déduit pour Sedit, pas celui du stockage GED.
        domain: financeConfig.domain,
        source: 'backup',
    };
}

exports.getShareSettings = async (req, res) => {
    try {
        const config = await getFinanceShareConfig();
        const backupConfig = await storage.getStorageConfig();
        res.json({
            root_path: config.root_path,
            login: config.login,
            domain: config.domain,
            has_password: !!config.password,
            fallback_available: !!(backupConfig.login && backupConfig.password),
            fallback_login: backupConfig.login || null,
        });
    } catch (err) {
        console.error('[finance-share] getShareSettings error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.saveShareSettings = async (req, res) => {
    const { root_path, login, password, domain } = req.body || {};
    try {
        const db = getSqlite();
        if (!db) throw new Error('Base SQLite non initialisée.');

        const upsert = `INSERT INTO app_settings (setting_key, setting_value, description)
            VALUES (?, ?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`;

        if (root_path !== undefined) {
            await db.run(upsert, [SETTING_KEYS.root_path, root_path || DEFAULT_ROOT, 'Racine UNC du partage de pièces jointes Sedit Finances (eGF/pjust)']);
        }
        if (login !== undefined) {
            await db.run(upsert, [SETTING_KEYS.login, login || '', 'Compte dédié pour accéder au partage de pièces jointes Sedit Finances']);
        }
        if (password !== undefined && password !== '' && password !== '••••••••') {
            await db.run(upsert, [SETTING_KEYS.password, password, 'Mot de passe du compte dédié Sedit Finances']);
        }
        if (domain !== undefined) {
            await db.run(upsert, [SETTING_KEYS.domain, domain || '', 'Domaine du compte dédié Sedit Finances']);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[finance-share] saveShareSettings error:', err);
        res.status(500).json({ error: err.message });
    }
};

/** Sert un fichier de test connu (facture F26008278) pour valider l'accès au partage. */
exports.testDisplayFile = async (req, res) => {
    const which = req.query.file === 'xml' ? 'xml' : 'pdf';
    const rel = TEST_FILES[which];
    try {
        const config = await resolveShareConfig();
        if (!config.login || !config.password) {
            return res.status(400).json({
                error: 'Aucun compte disponible : ni compte dédié Sedit Finances, ni compte de sauvegarde (storage.login) configuré.',
            });
        }
        if (!smb.isUncPath(config.root_path)) {
            return res.status(400).json({ error: `Racine "${config.root_path}" invalide (attendu un chemin UNC \\\\serveur\\partage\\...).` });
        }

        const buffer = await smb.readFileRel(config, rel);
        if (!buffer) {
            return res.status(404).json({
                error: `Fichier introuvable ou accès refusé via le compte "${config.login}" (source: ${config.source === 'finance' ? 'compte dédié Finance' : 'compte de sauvegarde'}).`,
            });
        }

        res.setHeader('Content-Type', which === 'pdf' ? 'application/pdf' : 'application/xml');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(rel)}"`);
        res.setHeader('X-Finance-Share-Source', config.source);
        res.setHeader('X-Finance-Share-Login', config.login);
        res.send(buffer);
    } catch (err) {
        console.error('[finance-share] testDisplayFile error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.resolveShareConfig = resolveShareConfig;
