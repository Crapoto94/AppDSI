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

// Classification par motif de nom de fichier (confirmé sur des cas réels, ex. F26008275) :
// le seul TYPE_PIECE_ID Oracle ne suffit pas à distinguer la facture elle-même d'un bon de
// commande (les deux peuvent partager le même DOMAINE_PES) — le nom de fichier est fiable.
const CATEGORY_ORDER = { facture: 0, bon_commande: 1, autre: 2 };
function classifyDocument(nomPj) {
    const nom = (nomPj || '').trim();
    if (/^(PJ\d+X?)?FAC/i.test(nom)) return 'facture';
    if (/^BonDeCommandeSIIM/i.test(nom)) return 'bon_commande';
    return 'autre';
}

/**
 * Statuts « rapprochement » et « service fait » tels qu'enregistrés directement dans le
 * circuit Sedit (indépendant du workflow de validation AppDSI) — FI.FACSUIVI contient une
 * ligne par étape du circuit de la facture (SAISIE, RAPPROCHEMENT, SERVICE_FAIT, LIQUIDE,
 * PAYEE...), jointe à FI.FACTURE via ROO_IMA_REF (FACSUIVI.FACTURE stocke en réalité
 * la référence technique, pas le numéro affiché malgré son nom). Une étape avec
 * ETAT='VALIDE' signifie qu'elle est déjà validée dans Sedit lui-même (ex. F26008275 :
 * RAPPROCHEMENT validé, SERVICE_FAIT encore EN_COURS).
 */
async function queryFacsuiviStatus(numeros) {
    if (!numeros || numeros.length === 0) return {};
    return withFinanceOracle(async (connection) => {
        const binds = {};
        const placeholders = numeros.map((n, i) => {
            binds[`r${i}`] = n;
            return `:r${i}`;
        });
        const result = await connection.execute(
            `SELECT TRIM(f.FACTURE) AS NUMERO, fs.AVANCEMENT, fs.ETAT, fs.DATE_SERVICE_FAIT
             FROM FI.FACTURE f
             JOIN FI.FACSUIVI fs ON fs.FACTURE = f.ROO_IMA_REF AND fs.AVANCEMENT IN ('RAPPROCHEMENT', 'SERVICE_FAIT')
             WHERE TRIM(f.FACTURE) IN (${placeholders.join(',')})`,
            binds
        );
        const map = {};
        for (const row of result.rows) {
            if (!map[row.NUMERO]) map[row.NUMERO] = {};
            if (row.AVANCEMENT === 'RAPPROCHEMENT') {
                map[row.NUMERO].rapprochement = { done: row.ETAT === 'VALIDE' };
            } else if (row.AVANCEMENT === 'SERVICE_FAIT') {
                map[row.NUMERO].service_fait = { done: row.ETAT === 'VALIDE', date: row.DATE_SERVICE_FAIT };
            }
        }
        return map;
    });
}
exports.getFacsuiviStatus = queryFacsuiviStatus;

/**
 * Valide le service fait DIRECTEMENT dans Sedit (écriture Oracle) une fois la décision
 * positive rendue côté AppDSI — voir service-fait.controller.js#submitDecision. Ne touche
 * que la ligne d'étape FACSUIVI (AVANCEMENT='SERVICE_FAIT') de la facture concernée, et
 * seulement si elle n'est pas déjà à VALIDE (idempotent, ne réécrase pas une date déjà
 * posée directement dans Sedit par un agent). Écriture explicitement demandée par
 * l'utilisateur — voir garde-fous de la skill "sedit-finances" sur les écritures Oracle.
 */
async function updateServiceFaitDone(numero, actorUsername) {
    return withFinanceOracle(async (connection) => {
        const result = await connection.execute(
            `UPDATE FI.FACSUIVI fs
             SET fs.ETAT = 'VALIDE',
                 fs.DATE_SERVICE_FAIT = SYSDATE,
                 fs.USER_MODIF = :actor,
                 fs.DATE_MODIF = SYSDATE,
                 fs.UPDATOKEN = fs.UPDATOKEN + 1
             WHERE fs.AVANCEMENT = 'SERVICE_FAIT'
               AND fs.ETAT != 'VALIDE'
               AND fs.FACTURE = (SELECT f.ROO_IMA_REF FROM FI.FACTURE f WHERE TRIM(f.FACTURE) = :numero)`,
            { actor: String(actorUsername || 'APPDSI').slice(0, 10), numero },
            { autoCommit: true }
        );
        return result.rowsAffected || 0;
    });
}
exports.updateServiceFaitDone = updateServiceFaitDone;

/**
 * Construit la liste des documents (métadonnées + URL) d'une facture, avec un préfixe
 * d'URL paramétrable pour être réutilisable à la fois par la route JWT (/pj-share/...)
 * et par la route publique du service fait (/service-fait/public/:token/...).
 */
async function buildFactureDocumentsList(numero, urlPrefix) {
    const rows = await queryFactureDocuments(numero);
    const documents = rows.map(r => ({
        doc_id: r.DOC_ID,
        nom: r.NOM_PJ,
        format: r.FORMAT,
        mime: guessMime(r.FORMAT, r.NOM_PJ),
        taille: r.TAILLE,
        principal: r.PRINCIPAL === 1,
        categorie: classifyDocument(r.NOM_PJ),
        url: `${urlPrefix}/documents/${encodeURIComponent(r.DOC_ID)}`,
    }));
    // Tri stable par catégorie (Facture, puis Bon de commande, puis Autres) — l'ordre
    // secondaire (principal d'abord, puis nom) posé par la requête SQL est conservé.
    documents.sort((a, b) => CATEGORY_ORDER[a.categorie] - CATEGORY_ORDER[b.categorie]);
    return documents;
}
exports.buildFactureDocumentsList = buildFactureDocumentsList;

/** Écrit le contenu d'une pièce jointe précise d'une facture dans `res` (utilisé par les deux routes ci-dessous). */
async function streamFactureDocumentFile(numero, docId, res) {
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
}
exports.streamFactureDocumentFile = streamFactureDocumentFile;

/** Liste les pièces jointes d'une facture (numéro Sedit, ex. "F26008278"). */
exports.getFactureDocuments = async (req, res) => {
    const numero = String(req.params.numero || '').trim();
    if (!numero) return res.status(400).json({ error: 'Numéro de facture requis.' });
    try {
        const documents = await buildFactureDocumentsList(numero, `/api/finance/pj-share/facture/${encodeURIComponent(numero)}`);
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
        await streamFactureDocumentFile(numero, docId, res);
    } catch (err) {
        console.error('[finance-share] getFactureDocumentFile error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getShareSettings = async (req, res) => {
    try {
        const config = await getFinanceShareConfig();
        const backupConfig = await storage.getStorageConfig();
        let seditWriteEnabled = false;
        try {
            const db = getSqlite();
            if (db) {
                const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'finance.sedit_write_enabled'");
                seditWriteEnabled = !!(row && String(row.setting_value).toLowerCase() === 'true');
            }
        } catch (e) { /* config non initialisée */ }
        res.json({
            root_path: config.root_path,
            login: config.login,
            domain: config.domain,
            has_password: !!config.password,
            fallback_available: !!(backupConfig.login && backupConfig.password),
            fallback_login: backupConfig.login || null,
            sedit_write_enabled: seditWriteEnabled,
        });
    } catch (err) {
        console.error('[finance-share] getShareSettings error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.saveShareSettings = async (req, res) => {
    const { root_path, login, password, domain, sedit_write_enabled } = req.body || {};
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
        if (sedit_write_enabled !== undefined) {
            await db.run(upsert, ['finance.sedit_write_enabled', sedit_write_enabled ? 'true' : 'false',
                'Pousse le PV de service fait scellé dans Sedit (écriture Oracle) lors d\'une validation']);
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
// Exposés pour le service d'écriture Sedit (PV de service fait — sedit-pj.service.js) :
exports.withFinanceOracle = withFinanceOracle;
exports.getFinanceOracleSettings = getFinanceOracleSettings;
exports.toRelativePath = toRelativePath;
exports.queryFactureDocuments = queryFactureDocuments;
exports.DEFAULT_ROOT = DEFAULT_ROOT;
