/**
 * Client SMB/CIFS applicatif (sans montage OS, sans docker-compose volume).
 *
 * Reproduit l'approche du module de facturation d'ODP : on parle au partage
 * Windows directement depuis Node via la lib `smb2`, avec les identifiants
 * stockés en base. Cela permet à une instance Linux (Docker) d'écrire sur un
 * partage UNC sans avoir à monter le partage au niveau du système.
 *
 * NB : `smb2` utilise NTLM (MD4/RC4) ; sous OpenSSL 3 (Node >= 18) il faut
 * lancer Node avec NODE_OPTIONS="--openssl-legacy-provider".
 */
const SMB2 = require('smb2');
const { promisify } = require('util');

/** Vrai si le chemin ressemble à un chemin UNC (\\serveur\partage[\sous-dossier]). */
function isUncPath(p) {
    if (typeof p !== 'string') return false;
    const s = p.replace(/\//g, '\\');
    return /^\\\\[^\\]+\\[^\\]+/.test(s);
}

/** Découpe un chemin UNC en { server, share, basePrefix }. */
function parseUnc(root) {
    const norm = String(root || '').replace(/\//g, '\\');
    const parts = norm.split('\\').filter(Boolean);
    if (parts.length < 2) {
        throw new Error('Chemin UNC invalide (attendu \\\\serveur\\partage[\\sous-dossier]).');
    }
    return { server: parts[0], share: parts[1], basePrefix: parts.slice(2).join('\\') };
}

/** Assemble des segments en un chemin SMB (séparateur antislash, relatif au partage). */
function smbJoin(...segs) {
    return segs
        .flatMap(s => String(s == null ? '' : s).replace(/\//g, '\\').split('\\'))
        .filter(seg => seg && seg !== '.' && seg !== '..')   // anti-traversée
        .join('\\');
}

/** Crée un client SMB + API promisifiée à partir de la config de stockage. */
function makeClient(config) {
    const { server, share, basePrefix } = parseUnc(config.root_path);
    const client = new SMB2({
        share: `\\\\${server}\\${share}`,
        domain: config.domain || config.login_domain || 'WORKGROUP',
        username: config.login,
        password: config.password,
        autoCloseTimeout: 10000,
    });
    const p = {
        exists: promisify(client.exists.bind(client)),
        mkdir: promisify(client.mkdir.bind(client)),
        readdir: promisify(client.readdir.bind(client)),
        readFile: promisify(client.readFile.bind(client)),
        writeFile: promisify(client.writeFile.bind(client)),
        unlink: promisify(client.unlink.bind(client)),
        rmdir: promisify(client.rmdir.bind(client)),
        rename: promisify(client.rename.bind(client)),
    };
    return { client, p, basePrefix };
}

/** Exécute `fn(api, basePrefix)` avec un client SMB, en fermant la connexion à la fin. */
async function withClient(config, fn) {
    const { client, p, basePrefix } = makeClient(config);
    try {
        return await fn(p, basePrefix);
    } finally {
        try { client.close(); } catch (e) { /* ignore */ }
    }
}

/** Crée récursivement un dossier (smb2.mkdir n'est pas récursif). */
async function ensureDir(p, smbPath) {
    const parts = String(smbPath).split('\\').filter(Boolean);
    let cur = '';
    for (const part of parts) {
        cur = cur ? `${cur}\\${part}` : part;
        const exists = await p.exists(cur).catch(() => false);
        if (!exists) {
            await p.mkdir(cur).catch(err => {
                if (err && err.code !== 'STATUS_OBJECT_NAME_COLLISION') throw err;
            });
        }
    }
}

/** Vrai si le chemin SMB est un dossier (readdir réussit sur un dossier, échoue sur un fichier). */
async function isDir(p, smbPath) {
    try { await p.readdir(smbPath || ''); return true; } catch (e) { return false; }
}

/** Suppression récursive (fichier ou dossier). */
async function removeRecursive(p, smbPath) {
    if (!smbPath) return;
    // tente d'abord en tant que fichier
    try { await p.unlink(smbPath); return; } catch (e) { /* peut être un dossier */ }
    let names;
    try { names = await p.readdir(smbPath); } catch (e) { return; }
    for (const n of names) {
        await removeRecursive(p, `${smbPath}\\${n}`);
    }
    try { await p.rmdir(smbPath); } catch (e) { /* ignore */ }
}

// ─── API de haut niveau (config + chemin relatif au stockage "module/id/fichier") ──

/** Écrit un buffer à un chemin relatif au stockage. */
async function writeFileRel(config, rel, buffer) {
    return withClient(config, async (p, basePrefix) => {
        const target = smbJoin(basePrefix, rel);
        const dir = target.split('\\').slice(0, -1).join('\\');
        if (dir) await ensureDir(p, dir);
        await p.writeFile(target, buffer);
        return true;
    });
}

/** Lit un buffer à un chemin relatif. Renvoie null si introuvable. */
async function readFileRel(config, rel) {
    return withClient(config, async (p, basePrefix) => {
        const target = smbJoin(basePrefix, rel);
        try {
            const data = await p.readFile(target);
            return Buffer.isBuffer(data) ? data : Buffer.from(data);
        } catch (e) {
            return null;
        }
    });
}

/** Crée un dossier (récursif) à un chemin relatif. */
async function mkdirRel(config, rel) {
    return withClient(config, async (p, basePrefix) => {
        await ensureDir(p, smbJoin(basePrefix, rel));
        return true;
    });
}

/** Supprime (récursivement) un chemin relatif. Refuse la racine. */
async function deleteRel(config, rel) {
    const cleanRel = smbJoin(rel);
    if (!cleanRel) throw new Error('Suppression de la racine interdite.');
    return withClient(config, async (p, basePrefix) => {
        await removeRecursive(p, smbJoin(basePrefix, rel));
        return true;
    });
}

/** Liste un dossier relatif : [{ name, isFolder, relPath }]. */
async function listRel(config, rel) {
    const cleanRel = String(rel || '').replace(/\\/g, '/').replace(/\/$/, '');
    return withClient(config, async (p, basePrefix) => {
        const dirPath = smbJoin(basePrefix, rel);
        let names;
        try { names = await p.readdir(dirPath || ''); }
        catch (e) { return { entries: [], relPath: cleanRel }; }
        const entries = [];
        for (const name of names) {
            const childSmb = dirPath ? `${dirPath}\\${name}` : name;
            const folder = await isDir(p, childSmb);
            entries.push({
                name,
                relPath: cleanRel ? `${cleanRel}/${name}` : name,
                isFolder: folder,
                size: null,           // smb2.readdir ne fournit pas la taille
                modifiedAt: null,
            });
        }
        entries.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : (a.isFolder ? -1 : 1)));
        return { entries, relPath: cleanRel };
    });
}

/** Test d'accès en écriture : crée puis supprime un fichier témoin. */
async function testAccess(config) {
    return withClient(config, async (p, basePrefix) => {
        const name = `.storage_test_${Date.now()}.tmp`;
        const target = smbJoin(basePrefix, name);
        const dir = target.split('\\').slice(0, -1).join('\\');
        if (dir) await ensureDir(p, dir);
        await p.writeFile(target, Buffer.from('ok'));
        try { await p.unlink(target); } catch (e) { /* ignore */ }
        return true;
    });
}

module.exports = {
    isUncPath,
    parseUnc,
    smbJoin,
    writeFileRel,
    readFileRel,
    mkdirRel,
    deleteRel,
    listRel,
    testAccess,
};
