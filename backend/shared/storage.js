/**
 * Service de stockage de documents unifié.
 *
 * Première passe : backend "filesystem" uniquement (local ou UNC).
 * Le backend "ged" (Alfresco) sera branché ultérieurement.
 *
 * Organisation des fichiers : <root>/<module>/<id>/<fichier>
 *   - <module> = nom du module "le plus bas" qui possède le fichier
 *                (ex. une PJ de tâche affectée depuis les tickets -> "taches")
 *   - <id>     = identifiant de l'élément (ex. id du certificat)
 *
 * Le chemin stocké en base est de la forme "storage/<module>/<id>/<fichier>"
 * afin que les liens front (`/<file_path>`) soient servis par la route /storage/*.
 */
const fs = require('fs');
const path = require('path');
const { getSqlite } = require('./database');
const smb = require('./smb_client');

const STORAGE_PREFIX = 'storage';

const SETTING_KEYS = {
    backend: 'storage.backend',
    root_path: 'storage.root_path',
    login: 'storage.login',
    password: 'storage.password',
    domain: 'storage.domain',
};

/**
 * Mode SMB applicatif (accès au partage UNC directement depuis Node, comme le
 * module de facturation d'ODP) : actif si le chemin est UNC ET que des
 * identifiants sont fournis. Cela évite tout montage CIFS/Samba au niveau de
 * l'OS et fonctionne donc sur une instance Linux (Docker) sans docker-compose.
 * Sur Windows sans identifiants, on continue d'utiliser le FS (l'OS gère l'UNC).
 */
function isSmbConfig(config) {
    return !!(config && config.login && config.password && smb.isUncPath(config.root_path));
}

/** Convertit un chemin BD/relatif en chemin relatif au stockage (sans préfixe). */
function toStorageRelative(storageRelative) {
    let rel = String(storageRelative || '').replace(/\\/g, '/');
    if (rel.startsWith(STORAGE_PREFIX + '/')) rel = rel.slice(STORAGE_PREFIX.length + 1);
    return rel.split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
}

/** Racine de repli si aucun chemin n'est configuré : le dossier du backend. */
function defaultRoot() {
    return path.join(__dirname, '..');
}

/**
 * Normalise un chemin racine (local ou UNC) :
 *  - effondre les séquences d'antislashs/slashs en un seul antislash
 *  - préserve le double antislash de tête d'un chemin UNC
 *  - retire l'antislash final (sauf racine de lecteur "X:\")
 * Corrige notamment les chemins saisis avec des antislashs doublés
 * (ex. "\\\\srv\\partage" -> "\\srv\partage").
 */
function normalizeRootPath(p) {
    if (!p) return '';
    let s = String(p).trim();
    if (!s) return '';
    // Style Windows : présence d'un antislash ou d'une lettre de lecteur "X:".
    const isWindows = /\\/.test(s) || /^[A-Za-z]:/.test(s);
    if (isWindows) {
        const isUnc = /^[\\/]{2,}/.test(s);
        s = s.replace(/[\\/]+/g, '\\');      // antislash/slash répété -> un seul antislash
        if (isUnc) s = '\\' + s;             // restaure le double antislash UNC
        s = s.replace(/\\+$/, '');           // pas d'antislash final
        if (/^[A-Za-z]:$/.test(s)) s += '\\'; // garde "C:\" pour une racine de lecteur
    } else {
        // Style POSIX (Linux/Docker) : on garde les slashs avant.
        s = s.replace(/\/+/g, '/');          // slash répété -> un seul slash
        if (s.length > 1) s = s.replace(/\/+$/, ''); // pas de slash final (sauf "/")
    }
    return s;
}

/** Vrai si le chemin est de style Windows (antislash ou lettre de lecteur). */
function isWindowsStylePath(p) {
    return typeof p === 'string' && (/\\/.test(p) || /^[A-Za-z]:/.test(p));
}

/** Lit la configuration de stockage depuis app_settings (SQLite). */
async function getStorageConfig() {
    const config = { backend: 'filesystem', root_path: '', login: '', password: '', domain: '' };
    const db = getSqlite();
    if (!db) return config;
    for (const [field, key] of Object.entries(SETTING_KEYS)) {
        try {
            const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', key);
            if (row && row.setting_value != null) config[field] = row.setting_value;
        } catch (e) {
            // table absente / non initialisée -> on garde les valeurs par défaut
        }
    }
    if (!config.backend) config.backend = 'filesystem';
    return config;
}

/** Sauvegarde la configuration de stockage. Ne touche pas au mot de passe si absent. */
async function saveStorageConfig({ backend, root_path, login, password, domain }) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');

    const upsert = `INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`;

    if (backend !== undefined) {
        await db.run(upsert, [SETTING_KEYS.backend, backend || 'filesystem', 'Backend de stockage : filesystem | ged']);
    }
    if (root_path !== undefined) {
        await db.run(upsert, [SETTING_KEYS.root_path, normalizeRootPath(root_path), 'Chemin racine de stockage (UNC ou local)']);
    }
    if (login !== undefined) {
        await db.run(upsert, [SETTING_KEYS.login, login || '', 'Identifiant pour le partage de stockage (si applicable)']);
    }
    if (password !== undefined && password !== '' && password !== '••••••••') {
        await db.run(upsert, [SETTING_KEYS.password, password, 'Mot de passe pour le partage de stockage (si applicable)']);
    }
    if (domain !== undefined) {
        await db.run(upsert, [SETTING_KEYS.domain, domain || '', 'Domaine SMB pour le partage de stockage (si applicable)']);
    }
}

/**
 * Corrige un nom de fichier d'upload mal décodé par multer/busboy
 * (octets UTF-8 interprétés en latin1 -> mojibake "PrÃ©sentation").
 * Reconvertit latin1 -> utf8 ; conserve l'original si la conversion échoue.
 */
function fixUploadName(name) {
    if (!name) return name;
    try {
        const decoded = Buffer.from(name, 'latin1').toString('utf8');
        return decoded.includes('�') ? name : decoded;
    } catch (e) {
        return name;
    }
}

/** Nettoie un segment de chemin (module / id) pour éviter toute traversée. */
function sanitizeSegment(value) {
    return String(value == null ? '' : value).replace(/[^a-zA-Z0-9._-]/g, '_') || '_';
}

/** Résout la racine effective à partir de la config. */
function resolveRoot(config) {
    let root;
    if (config && config.root_path && config.root_path.trim()) {
        root = normalizeRootPath(config.root_path);
    } else {
        root = defaultRoot();
    }
    // Garde-fou : un chemin Windows (UNC / lettre de lecteur) ne fonctionne pas
    // sur un serveur Linux en accès FS direct. EXCEPTION : en mode SMB applicatif
    // (UNC + identifiants), on parle au partage via la lib smb2, le chemin UNC
    // est donc volontairement conservé et géré par le client SMB.
    if (process.platform !== 'win32' && isWindowsStylePath(root) && !isSmbConfig(config)) {
        throw new Error(
            `Chemin de stockage Windows ("${root}") incompatible avec ce serveur Linux en accès direct. ` +
            `Renseignez un identifiant et un mot de passe pour activer l'accès SMB au partage, ` +
            `ou configurez un chemin POSIX local.`
        );
    }
    return root;
}

/**
 * Convertit un chemin relatif au stockage (avec ou sans préfixe "storage/")
 * en chemin absolu sûr (à l'intérieur de la racine). Renvoie null si invalide.
 */
function resolveAbsolute(root, storageRelative) {
    if (!storageRelative) return null;
    let rel = String(storageRelative).replace(/\\/g, '/');
    if (rel.startsWith(STORAGE_PREFIX + '/')) rel = rel.slice(STORAGE_PREFIX.length + 1);
    // Empêche la traversée de répertoire
    const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const abs = path.resolve(root, normalized);
    const rootResolved = path.resolve(root);
    if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) return null;
    return abs;
}

/**
 * Enregistre un fichier pour un module/élément donné.
 * @param {string} moduleName  ex. "certificats"
 * @param {string|number} id   identifiant de l'élément
 * @param {{ buffer: Buffer, originalname: string }} file
 * @returns {Promise<{ filename, relativePath, dbPath, absolutePath }>}
 */
async function saveFile(moduleName, id, file) {
    const config = await getStorageConfig();
    if (config.backend && config.backend !== 'filesystem') {
        throw new Error(`Backend de stockage "${config.backend}" non encore supporté (filesystem uniquement).`);
    }
    if (!file || !file.buffer) throw new Error('Aucun contenu de fichier fourni.');

    const moduleSeg = sanitizeSegment(moduleName);
    const idSeg = sanitizeSegment(id);
    const base = path.basename(file.originalname || 'fichier');
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}`.replace(/[\r\n]/g, '');
    const relativePath = `${moduleSeg}/${idSeg}/${safeName}`;

    if (isSmbConfig(config)) {
        await smb.writeFileRel(config, relativePath, file.buffer);
        return {
            filename: safeName,
            relativePath,
            dbPath: `${STORAGE_PREFIX}/${relativePath}`,
            absolutePath: null,
        };
    }

    const root = resolveRoot(config);
    const dir = path.join(root, moduleSeg, idSeg);
    fs.mkdirSync(dir, { recursive: true });
    const absolutePath = path.join(dir, safeName);
    fs.writeFileSync(absolutePath, file.buffer);

    return {
        filename: safeName,
        relativePath,                                   // ex. "certificats/25/123-abc.pdf"
        dbPath: `${STORAGE_PREFIX}/${relativePath}`,     // ex. "storage/certificats/25/123-abc.pdf"
        absolutePath,
    };
}

/** Supprime un fichier référencé par son chemin BD (préfixe "storage/"). */
async function deleteFile(dbPath) {
    if (!dbPath) return;
    const config = await getStorageConfig();
    if (isSmbConfig(config)) {
        try { await smb.deleteRel(config, toStorageRelative(dbPath)); } catch (e) { /* ignore */ }
        return;
    }
    const root = resolveRoot(config);
    const abs = resolveAbsolute(root, dbPath);
    if (abs && fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch (e) { /* ignore */ }
    }
}

/** Renvoie le chemin absolu d'un fichier (pour streaming), ou null. (FS uniquement) */
async function getAbsolutePath(storageRelative) {
    const config = await getStorageConfig();
    if (isSmbConfig(config)) return null; // pas de chemin local en mode SMB
    const root = resolveRoot(config);
    return resolveAbsolute(root, storageRelative);
}

/**
 * Renvoie de quoi servir un fichier, quel que soit le backend :
 *   - { absolutePath, filename } en mode FS (à servir via res.sendFile)
 *   - { buffer, filename }       en mode SMB (à servir via res.send)
 * Renvoie null si le fichier est introuvable.
 */
async function getFileForServe(storageRelative) {
    const config = await getStorageConfig();
    const rel = toStorageRelative(storageRelative);
    if (isSmbConfig(config)) {
        const buffer = await smb.readFileRel(config, rel);
        if (!buffer) return null;
        return { buffer, filename: path.basename(rel) };
    }
    const root = resolveRoot(config);
    const abs = resolveAbsolute(root, storageRelative);
    if (!abs || !fs.existsSync(abs)) return null;
    return { absolutePath: abs, filename: path.basename(abs) };
}

/** Vrai si un chemin BD relève du nouveau stockage (préfixe "storage/"). */
function isStoragePath(dbPath) {
    return typeof dbPath === 'string' && dbPath.replace(/\\/g, '/').startsWith(STORAGE_PREFIX + '/');
}

// ─── Explorateur filesystem (admin) ──────────────────────────────────────────

/** Résout un chemin relatif en absolu sûr ; la racine elle-même si vide. */
function absForRel(root, rel) {
    if (!rel || rel === '/' ) return path.resolve(root);
    return resolveAbsolute(root, rel);
}

/** Liste le contenu d'un dossier relatif à la racine de stockage. */
async function listDirectory(relPath) {
    const config = await getStorageConfig();
    if (config.backend && config.backend !== 'filesystem') {
        throw new Error(`Explorateur indisponible pour le backend "${config.backend}".`);
    }
    if (isSmbConfig(config)) {
        const r = await smb.listRel(config, relPath || '');
        return { entries: r.entries, root: normalizeRootPath(config.root_path), relPath: r.relPath };
    }
    const root = resolveRoot(config);
    const abs = absForRel(root, relPath);
    if (!abs) throw new Error('Chemin invalide.');
    const cleanRel = (relPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    if (!fs.existsSync(abs)) return { entries: [], root, relPath: cleanRel };
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) throw new Error("Le chemin n'est pas un dossier.");
    const entries = [];
    for (const name of fs.readdirSync(abs)) {
        try {
            const st = fs.statSync(path.join(abs, name));
            entries.push({
                name,
                relPath: cleanRel ? `${cleanRel}/${name}` : name,
                isFolder: st.isDirectory(),
                size: st.isDirectory() ? null : st.size,
                modifiedAt: st.mtime.toISOString(),
            });
        } catch (e) { /* entrée illisible : on ignore */ }
    }
    entries.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : (a.isFolder ? -1 : 1)));
    return { entries, root, relPath: cleanRel };
}

/** Crée un sous-dossier sous un chemin relatif. */
async function createDirectory(relPath, name) {
    const config = await getStorageConfig();
    const seg = sanitizeSegment(name);
    const cleanRel = (relPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    const newRel = cleanRel ? `${cleanRel}/${seg}` : seg;
    if (isSmbConfig(config)) {
        await smb.mkdirRel(config, newRel);
        return { relPath: newRel };
    }
    const root = resolveRoot(config);
    const parentAbs = absForRel(root, relPath);
    if (!parentAbs) throw new Error('Chemin invalide.');
    const abs = path.join(parentAbs, seg);
    fs.mkdirSync(abs, { recursive: true });
    return { relPath: newRel };
}

/** Écrit un fichier dans un dossier relatif (conserve le nom d'origine). */
async function saveFileAt(relPath, file) {
    if (!file || !file.buffer) throw new Error('Aucun contenu de fichier fourni.');
    const config = await getStorageConfig();
    const base = path.basename(file.originalname || 'fichier');
    const cleanRel = (relPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    const newRel = cleanRel ? `${cleanRel}/${base}` : base;
    if (isSmbConfig(config)) {
        await smb.writeFileRel(config, newRel, file.buffer);
        return { relPath: newRel };
    }
    const root = resolveRoot(config);
    const dirAbs = absForRel(root, relPath);
    if (!dirAbs) throw new Error('Chemin invalide.');
    fs.mkdirSync(dirAbs, { recursive: true });
    fs.writeFileSync(path.join(dirAbs, base), file.buffer);
    return { relPath: newRel };
}

// ─── Récupération des fichiers mal placés (chemin Windows sur Linux) ──────────

/**
 * Parcourt récursivement un dossier local mal placé et COPIE chaque fichier vers
 * la destination correcte (FS local ou partage SMB). Opération NON destructive :
 * les fichiers d'origine ne sont jamais supprimés (consigne : ne rien supprimer
 * sur le serveur). Les copies locales parasites pourront être nettoyées à la main.
 */
async function _walkAndCopy(current, badRoot, dest, report, dryRun) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (e) { report.errors.push({ path: current, error: e.message }); return; }
    for (const ent of entries) {
        const src = path.join(current, ent.name);
        if (ent.isDirectory()) {
            await _walkAndCopy(src, badRoot, dest, report, dryRun);
        } else {
            const rel = path.relative(badRoot, src).replace(/\\/g, '/'); // ex: certificats/25/xxx.pdf
            report.items.push({ from: src, to: dest.label(rel) });
            if (dryRun) { report.moved++; continue; }
            try {
                await dest.copy(src, rel);
                report.moved++;
            } catch (e) {
                report.errors.push({ path: src, error: e.message });
            }
        }
    }
}

/**
 * Récupère les fichiers écrits par erreur dans un dossier au nom contenant des
 * antislashs (cas d'un chemin Windows interprété littéralement sur Linux) et les
 * COPIE vers la racine de stockage correcte (FS local POSIX ou partage SMB).
 * Les chemins en base (storage/<module>/<id>/...) restent valides après coup.
 * Non destructif : aucun fichier d'origine n'est supprimé.
 */
async function recoverMisplaced({ dryRun } = {}) {
    const config = await getStorageConfig();
    const smbMode = isSmbConfig(config);
    const correctRoot = smbMode ? normalizeRootPath(config.root_path) : resolveRoot(config);
    const scanBases = Array.from(new Set([process.cwd(), defaultRoot()]));
    const report = { correctRoot, mode: smbMode ? 'smb' : 'filesystem', scannedBases: scanBases, badRoots: [], moved: 0, errors: [], items: [] };

    // Destination : abstraction FS local vs SMB.
    const dest = smbMode
        ? {
            label: (rel) => `${correctRoot}\\${rel.replace(/\//g, '\\')}`,
            copy: async (src, rel) => { await smb.writeFileRel(config, rel, fs.readFileSync(src)); },
        }
        : {
            label: (rel) => path.join(correctRoot, rel),
            copy: async (src, rel) => {
                const d = path.join(correctRoot, rel);
                fs.mkdirSync(path.dirname(d), { recursive: true });
                fs.copyFileSync(src, d);
            },
        };

    for (const base of scanBases) {
        let names;
        try { names = fs.readdirSync(base); } catch (e) { continue; }
        for (const name of names) {
            if (!name.includes('\\')) continue;                // dossier mal nommé
            const badRoot = path.join(base, name);
            try { if (!fs.statSync(badRoot).isDirectory()) continue; } catch (e) { continue; }
            if (!smbMode && path.resolve(badRoot) === path.resolve(correctRoot)) continue;
            report.badRoots.push(badRoot);
            await _walkAndCopy(badRoot, badRoot, dest, report, dryRun);
        }
    }
    return report;
}

/** Supprime un fichier ou dossier (récursif). Refuse la racine. */
async function deletePath(relPath) {
    const config = await getStorageConfig();
    if (isSmbConfig(config)) {
        await smb.deleteRel(config, relPath);
        return;
    }
    const root = resolveRoot(config);
    const abs = resolveAbsolute(root, relPath);
    if (!abs) throw new Error('Chemin invalide.');

    // En mode SMB (Linux/Docker), resolveAbsolute peut renvoyer un chemin qui ne correspond pas
    // strictement à resolveRoot(config) via path.resolve. On vérifie la vacuité du relPath.
    const cleanRel = (relPath || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
    if (!cleanRel || cleanRel === '.' || cleanRel === '..') {
        throw new Error('Suppression de la racine interdite.');
    }

    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}

/** Test d'accès en écriture sur le stockage (FS ou SMB). Renvoie la racine effective. */
async function testAccess() {
    const config = await getStorageConfig();
    if (isSmbConfig(config)) {
        await smb.testAccess(config);
        return { root: normalizeRootPath(config.root_path), mode: 'smb' };
    }
    const root = resolveRoot(config);
    const testDir = path.join(root, '.storage_test');
    fs.mkdirSync(testDir, { recursive: true });
    const testFile = path.join(testDir, `test_${Date.now()}.tmp`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    try { fs.rmdirSync(testDir); } catch (e) { /* ignore */ }
    return { root, mode: 'filesystem' };
}

module.exports = {
    STORAGE_PREFIX,
    getStorageConfig,
    saveStorageConfig,
    saveFile,
    deleteFile,
    getAbsolutePath,
    getFileForServe,
    resolveAbsolute,
    resolveRoot,
    isStoragePath,
    isSmbConfig,
    testAccess,
    sanitizeSegment,
    fixUploadName,
    listDirectory,
    createDirectory,
    saveFileAt,
    deletePath,
    recoverMisplaced,
};
