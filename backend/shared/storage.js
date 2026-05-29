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

const STORAGE_PREFIX = 'storage';

const SETTING_KEYS = {
    backend: 'storage.backend',
    root_path: 'storage.root_path',
    login: 'storage.login',
    password: 'storage.password',
};

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
    const config = { backend: 'filesystem', root_path: '', login: '', password: '' };
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
async function saveStorageConfig({ backend, root_path, login, password }) {
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
    // sur un serveur Linux (les antislashs y sont des caractères normaux et les
    // fichiers finiraient dans un dossier local mal nommé au lieu du partage).
    if (process.platform !== 'win32' && isWindowsStylePath(root)) {
        throw new Error(
            `Chemin de stockage Windows ("${root}") incompatible avec ce serveur Linux. ` +
            `Montez le partage Samba (CIFS) et configurez un point de montage POSIX, ex : /mnt/dsihub.`
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

    const root = resolveRoot(config);
    const moduleSeg = sanitizeSegment(moduleName);
    const idSeg = sanitizeSegment(id);
    const dir = path.join(root, moduleSeg, idSeg);
    fs.mkdirSync(dir, { recursive: true });

    const base = path.basename(file.originalname || 'fichier');
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}`.replace(/[\r\n]/g, '');
    const absolutePath = path.join(dir, safeName);
    fs.writeFileSync(absolutePath, file.buffer);

    const relativePath = `${moduleSeg}/${idSeg}/${safeName}`;
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
    const root = resolveRoot(config);
    const abs = resolveAbsolute(root, dbPath);
    if (abs && fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch (e) { /* ignore */ }
    }
}

/** Renvoie le chemin absolu d'un fichier (pour streaming), ou null. */
async function getAbsolutePath(storageRelative) {
    const config = await getStorageConfig();
    const root = resolveRoot(config);
    return resolveAbsolute(root, storageRelative);
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
    const root = resolveRoot(config);
    const parentAbs = absForRel(root, relPath);
    if (!parentAbs) throw new Error('Chemin invalide.');
    const seg = sanitizeSegment(name);
    const abs = path.join(parentAbs, seg);
    fs.mkdirSync(abs, { recursive: true });
    const cleanRel = (relPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    return { relPath: cleanRel ? `${cleanRel}/${seg}` : seg };
}

/** Écrit un fichier dans un dossier relatif (conserve le nom d'origine). */
async function saveFileAt(relPath, file) {
    if (!file || !file.buffer) throw new Error('Aucun contenu de fichier fourni.');
    const config = await getStorageConfig();
    const root = resolveRoot(config);
    const dirAbs = absForRel(root, relPath);
    if (!dirAbs) throw new Error('Chemin invalide.');
    fs.mkdirSync(dirAbs, { recursive: true });
    const base = path.basename(file.originalname || 'fichier');
    fs.writeFileSync(path.join(dirAbs, base), file.buffer);
    const cleanRel = (relPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    return { relPath: cleanRel ? `${cleanRel}/${base}` : base };
}

// ─── Récupération des fichiers mal placés (chemin Windows sur Linux) ──────────

function _walkAndMove(current, badRoot, correctRoot, report, dryRun) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (e) { report.errors.push({ path: current, error: e.message }); return; }
    for (const ent of entries) {
        const src = path.join(current, ent.name);
        if (ent.isDirectory()) {
            _walkAndMove(src, badRoot, correctRoot, report, dryRun);
        } else {
            const rel = path.relative(badRoot, src);          // ex: certificats/25/xxx.pdf
            const dest = path.join(correctRoot, rel);
            report.items.push({ from: src, to: dest });
            if (dryRun) { report.moved++; continue; }
            try {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                try { fs.renameSync(src, dest); }
                catch (e) {                                     // cross-device (conteneur -> CIFS)
                    fs.copyFileSync(src, dest);
                    fs.unlinkSync(src);
                }
                report.moved++;
            } catch (e) {
                report.errors.push({ path: src, error: e.message });
            }
        }
    }
}

function _removeEmptyDirs(dir) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return; }
    for (const name of entries) {
        const p = path.join(dir, name);
        try { if (fs.statSync(p).isDirectory()) _removeEmptyDirs(p); } catch (e) { /* ignore */ }
    }
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (e) { /* ignore */ }
}

/**
 * Récupère les fichiers écrits par erreur dans un dossier au nom contenant des
 * antislashs (cas d'un chemin Windows interprété littéralement sur Linux) et
 * les déplace vers la racine de stockage correcte (point de montage POSIX).
 * Les chemins en base (storage/<module>/<id>/...) restent valides après coup.
 */
async function recoverMisplaced({ dryRun } = {}) {
    const config = await getStorageConfig();
    const correctRoot = resolveRoot(config); // lève une erreur si racine encore Windows sur Linux
    const scanBases = Array.from(new Set([process.cwd(), defaultRoot()]));
    const report = { correctRoot, scannedBases: scanBases, badRoots: [], moved: 0, errors: [], items: [] };
    for (const base of scanBases) {
        let names;
        try { names = fs.readdirSync(base); } catch (e) { continue; }
        for (const name of names) {
            if (!name.includes('\\')) continue;                // dossier mal nommé
            const badRoot = path.join(base, name);
            try { if (!fs.statSync(badRoot).isDirectory()) continue; } catch (e) { continue; }
            // évite de se déplacer dans la racine correcte elle-même
            if (path.resolve(badRoot) === path.resolve(correctRoot)) continue;
            report.badRoots.push(badRoot);
            _walkAndMove(badRoot, badRoot, correctRoot, report, dryRun);
            if (!dryRun) _removeEmptyDirs(badRoot);
        }
    }
    return report;
}

/** Supprime un fichier ou dossier (récursif). Refuse la racine. */
async function deletePath(relPath) {
    const config = await getStorageConfig();
    const root = resolveRoot(config);
    const abs = resolveAbsolute(root, relPath);
    if (!abs) throw new Error('Chemin invalide.');
    if (abs === path.resolve(root)) throw new Error('Suppression de la racine interdite.');
    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}

module.exports = {
    STORAGE_PREFIX,
    getStorageConfig,
    saveStorageConfig,
    saveFile,
    deleteFile,
    getAbsolutePath,
    resolveAbsolute,
    resolveRoot,
    isStoragePath,
    sanitizeSegment,
    fixUploadName,
    listDirectory,
    createDirectory,
    saveFileAt,
    deletePath,
};
