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
const oracledb = require('oracledb');
const { getSqlite } = require('../../shared/database');
const smb = require('../../shared/smb_client');
const storage = require('../../shared/storage');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const MIME_BY_FORMAT = { '06': 'application/pdf', '03': 'application/xml' };
function guessMime(format, filename) {
    if (format && MIME_BY_FORMAT[format]) return MIME_BY_FORMAT[format];
    const ext = path.extname(filename || '').toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.xml') return 'application/xml';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
    return 'application/octet-stream';
}

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

/** Chemin relatif à la racine du partage configuré, à partir d'un CHEMIN_FICHIER Oracle absolu. */
function toRelativePath(config, cheminFichier) {
    const rootParsed = smb.parseUnc(config.root_path);
    const fileParsed = smb.parseUnc(cheminFichier);
    if (fileParsed.server.toLowerCase() !== rootParsed.server.toLowerCase() ||
        fileParsed.share.toLowerCase() !== rootParsed.share.toLowerCase()) {
        throw new Error(`Le fichier "${cheminFichier}" n'est pas sur le partage configuré (${config.root_path}).`);
    }
    const rootPrefix = rootParsed.basePrefix;
    if (rootPrefix && !fileParsed.basePrefix.toLowerCase().startsWith(rootPrefix.toLowerCase())) {
        throw new Error(`Le fichier "${cheminFichier}" n'est pas sous la racine configurée.`);
    }
    return fileParsed.basePrefix.slice(rootPrefix.length).replace(/^[\\/]+/, '');
}

async function getFinanceOracleSettings() {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const row = await db.get("SELECT * FROM oracle_settings WHERE type = 'FINANCES'");
    if (!row || !row.host || !row.port || !row.service_name || !row.username || !row.password) {
        throw new Error('Connexion Oracle FINANCES non configurée (Admin > Oracle > FINANCES).');
    }
    return row;
}

/** Exécute `fn(connection)` sur une connexion Oracle FINANCES, fermée dans tous les cas. */
async function withFinanceOracle(fn) {
    const settings = await getFinanceOracleSettings();
    const connection = await oracledb.getConnection({
        user: settings.username,
        password: settings.password,
        connectString: `${settings.host}:${settings.port}/${settings.service_name}`,
    });
    try {
        return await fn(connection);
    } finally {
        try { await connection.close(); } catch (e) { /* ignore */ }
    }
}

/**
 * Pièces jointes PES d'une facture Sedit (FI.FACTURE -> FI.FIPES_OBJ_PJ -> FI.PJ_PES).
 * Voir skill "sedit-finances" pour le détail du chemin de jointure.
 */
async function queryFactureDocuments(numero) {
    return withFinanceOracle(async (connection) => {
        const result = await connection.execute(
            `SELECT TRIM(pj.ROO_IMA_REF) AS DOC_ID, pj.NOM_PJ, pj.CHEMIN_FICHIER, pj.FORMAT, pj.TAILLE, lnk.PRINCIPAL
             FROM FI.FACTURE f
             JOIN FI.FIPES_OBJ_PJ lnk ON lnk.OBJECT_ROO = f.ROO_IMA_REF AND lnk.OBJECT_TYPE = 'FACTURE'
             JOIN FI.PJ_PES pj ON pj.ROO_IMA_REF = lnk.PJPES_ROO
             WHERE f.FACTURE = :numero
             ORDER BY lnk.PRINCIPAL DESC, pj.NOM_PJ`,
            { numero }
        );
        return result.rows;
    });
}

/** Liste les pièces jointes d'une facture (numéro Sedit, ex. "F26008278"). */
exports.getFactureDocuments = async (req, res) => {
    const numero = String(req.params.numero || '').trim();
    if (!numero) return res.status(400).json({ error: 'Numéro de facture requis.' });
    try {
        const rows = await queryFactureDocuments(numero);
        const documents = rows.map(r => ({
            doc_id: r.DOC_ID,
            nom: r.NOM_PJ,
            format: r.FORMAT,
            mime: guessMime(r.FORMAT, r.NOM_PJ),
            taille: r.TAILLE,
            principal: r.PRINCIPAL === 1,
            url: `/api/finance/pj-share/facture/${encodeURIComponent(numero)}/documents/${encodeURIComponent(r.DOC_ID)}`,
        }));
        res.json({ numero, documents });
    } catch (err) {
        console.error('[finance-share] getFactureDocuments error:', err);
        res.status(500).json({ error: err.message });
    }
};

/** Sert le contenu d'une pièce jointe précise d'une facture. */
exports.getFactureDocumentFile = async (req, res) => {
    const numero = String(req.params.numero || '').trim();
    const docId = String(req.params.docId || '').trim();
    if (!numero || !docId) return res.status(400).json({ error: 'Paramètres invalides.' });
    try {
        const rows = await queryFactureDocuments(numero);
        const doc = rows.find(r => r.DOC_ID === docId);
        if (!doc) return res.status(404).json({ error: 'Document introuvable pour cette facture.' });

        const config = await resolveShareConfig();
        if (!config.login || !config.password) {
            return res.status(400).json({ error: 'Aucun compte disponible pour accéder au partage de pièces jointes.' });
        }
        const rel = toRelativePath(config, doc.CHEMIN_FICHIER);
        const buffer = await smb.readFileRel(config, rel);
        if (!buffer) {
            return res.status(404).json({ error: `Fichier introuvable ou accès refusé via le compte "${config.login}".` });
        }

        res.setHeader('Content-Type', guessMime(doc.FORMAT, doc.NOM_PJ));
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.NOM_PJ)}"`);
        res.send(buffer);
    } catch (err) {
        console.error('[finance-share] getFactureDocumentFile error:', err);
        res.status(500).json({ error: err.message });
    }
};

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
