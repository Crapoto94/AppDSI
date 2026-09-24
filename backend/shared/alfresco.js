/**
 * Client Alfresco — API REST publique v1 (GED des documents AppDSI).
 *
 * Porté depuis c:\dev\delib\backend\src\adapters\alfresco.js, simplifié pour
 * AppDSI (une seule instance Alfresco, pas d'organisme).
 *
 * Endpoints utilisés :
 *   GET  /alfresco/api/discovery                                  version/édition (test d'authentification)
 *   GET  /nodes/{id}?relativePath=…                               résolution du dossier racine / dossiers existants
 *   POST /nodes/{parent}/children  (JSON)                         création d'un dossier (cm:folder)
 *   POST /nodes/{parent}/children  (multipart filedata, name…)    dépôt d'un document
 *   PUT  /nodes/{id}/content?majorVersion=true                    nouvelle version d'un document existant
 *   GET  /nodes/{id}/children · GET /nodes/{id}/content           exploration et lecture
 *   DELETE /nodes/{id}?permanent=true                             suppression
 *
 * Authentification HTTP Basic (compte technique). La configuration (URL, compte,
 * mot de passe, dossier racine) est lue dans SQLite `app_settings` :
 *   alfresco.url, alfresco.username, alfresco.password (chiffré), alfresco.root_path
 */
const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const { getSqlite } = require('./database');
const { createSecretBox, looksEncrypted } = require('./secretbox');
const { SECRET_KEY } = require('./config');

const API = '/alfresco/api/-default-/public/alfresco/versions/1';

/** Dossier racine par défaut sous Company Home (sibling de « delib », « parapheur », …). */
const DEFAULT_ROOT = 'DSIHUB';

const box = createSecretBox(SECRET_KEY, 'ged');

function decryptStoredPassword(stored) {
    if (!stored) return '';
    // Rétro-compatibilité : les mots de passe enregistrés avant le chiffrement
    // sont stockés en clair ; on les accepte tels quels.
    return looksEncrypted(stored) ? box.dechiffre(stored) : String(stored);
}

async function readSetting(key) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
    return (row && row.setting_value) || '';
}

/** Lit et déchiffre la configuration Alfresco. */
async function getConfig() {
    const [url, username, storedPass, rootPath] = await Promise.all([
        readSetting('alfresco.url'),
        readSetting('alfresco.username'),
        readSetting('alfresco.password'),
        readSetting('alfresco.root_path'),
    ]);
    return {
        url: (url || '').trim(),
        username: (username || '').trim(),
        password: decryptStoredPassword(storedPass),
        rootPath: (rootPath || '').trim(),
    };
}

/** Enregistre la configuration (le mot de passe est chiffré avant stockage). */
async function saveConfig({ url, username, password, rootPath } = {}) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    const sql = `INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`;

    await db.run(sql, ['alfresco.url', url || '', 'URL du serveur Alfresco (ex: https://alfresco.ivry.local)']);
    await db.run(sql, ['alfresco.username', username || '', 'Compte de service Alfresco']);
    await db.run(sql, ['alfresco.root_path', rootPath || '', `Dossier racine GED (défaut: ${DEFAULT_ROOT})`]);
    if (password !== undefined && password !== null && password !== '') {
        await db.run(sql, ['alfresco.password', box.chiffre(password), 'Mot de passe du compte de service Alfresco (chiffré)']);
    }
}

function isConfigured(cfg) {
    return !!(cfg && cfg.url && cfg.username && cfg.password);
}

function assertConfigured(cfg) {
    if (!cfg || !cfg.url) throw new Error('Alfresco non configuré : renseignez l\'URL dans /admin/ged.');
    if (!cfg.username) throw new Error('Alfresco : compte de service non configuré.');
    if (!cfg.password) throw new Error('Alfresco : mot de passe non configuré.');
}

function httpClient(cfg) {
    return axios.create({
        baseURL: String(cfg.url || '').replace(/\/+$/, ''),
        timeout: 30000,
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64'),
            Accept: 'application/json',
        },
        // Alfresco interne : certificat auto-signé accepté (client dédié).
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: (s) => s >= 200 && s < 500,
    });
}

function explain(r) {
    if (r.status === 401 || r.status === 403) return 'Identifiants refusés par Alfresco (compte technique ou droits insuffisants)';
    if (r.status === 404) return 'Ressource introuvable (URL du serveur ou dossier racine erroné ?)';
    return `Alfresco a répondu HTTP ${r.status}${r.data?.error?.briefSummary ? ` : ${r.data.error.briefSummary}` : ''}`;
}

/** Racine : identifiant de nœud, ou chemin relatif à Company Home (ex. « DSIHUB », « Sites/…/DSIHUB »). */
async function resolveRootId(http, cfg) {
    const r = cfg.rootPath && cfg.rootPath !== '-root-' ? String(cfg.rootPath) : DEFAULT_ROOT;
    if (r === '-root-' || /^[0-9a-f-]{36}$/i.test(r)) return r;
    const res = await http.get(`${API}/nodes/-root-`, {
        params: { relativePath: r.replace(/^\/+/, ''), fields: 'id,name,isFolder' },
    });
    if (res.status !== 200 || !res.data?.entry?.isFolder) {
        throw new Error(`Dossier racine « ${r} » introuvable dans Alfresco.`);
    }
    return res.data.entry.id;
}

/**
 * Garantit l'existence d'une arborescence de dossiers sous la racine.
 * @param {object} cfg
 * @param {Array<{nom:string, description?:string}|string>} segments
 * @returns {Promise<{id:string, crees:string[]}>}
 */
async function ensurePath(cfg, segments) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    let cur = await resolveRootId(http, cfg);
    const crees = [];
    const chemin = [];
    for (const raw of segments) {
        const seg = typeof raw === 'string' ? { nom: raw } : raw;
        if (!seg || !seg.nom) continue;
        chemin.push(seg.nom);
        const existant = await http.get(`${API}/nodes/${cur}`, {
            params: { relativePath: seg.nom, fields: 'id,isFolder' },
        });
        if (existant.status === 200 && existant.data?.entry?.isFolder) {
            cur = existant.data.entry.id;
            continue;
        }
        const c = await http.post(`${API}/nodes/${cur}/children`, {
            name: seg.nom,
            nodeType: 'cm:folder',
            properties: { 'cm:title': seg.nom, ...(seg.description ? { 'cm:description': seg.description } : {}) },
        }, { params: { autoRename: false } });
        if (c.status === 409) {
            const again = await http.get(`${API}/nodes/${cur}`, { params: { relativePath: seg.nom } });
            cur = again.data.entry.id;
            continue;
        }
        if (c.status !== 201) throw new Error(`Création du dossier « ${seg.nom} » : ${explain(c)}`);
        cur = c.data.entry.id;
        crees.push(chemin.join(' / '));
    }
    return { id: cur, crees };
}

/**
 * Dépose un document dans un dossier (crée une nouvelle version si le nom existe déjà).
 * @returns {Promise<{nodeId:string, versionLabel:string|null, nouveau:boolean, nouvelleVersion:boolean}>}
 */
async function deposit(cfg, folderId, { name, buffer, mime = 'application/octet-stream', description }) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const form = new FormData();
    form.append('filedata', buffer, { filename: name, contentType: mime });
    form.append('name', name);
    form.append('nodeType', 'cm:content');
    form.append('autoRename', 'false');
    form.append('cm:title', name.replace(/\.[^.]+$/, ''));
    if (description) form.append('cm:description', description);

    const r = await http.post(`${API}/nodes/${folderId}/children`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
    if (r.status === 201) {
        return {
            nodeId: r.data.entry.id,
            versionLabel: r.data.entry.properties?.['cm:versionLabel'] || '1.0',
            nouveau: true,
            nouvelleVersion: false,
        };
    }
    if (r.status === 409) {
        const ex = await http.get(`${API}/nodes/${folderId}`, { params: { relativePath: name, fields: 'id' } });
        if (ex.status !== 200) throw new Error(`Dépôt de « ${name} » : ${explain(ex)}`);
        const id = ex.data.entry.id;
        const u = await http.put(`${API}/nodes/${id}/content`, buffer, {
            params: { majorVersion: true, comment: 'Nouvelle version déposée par DSIHUB' },
            headers: { 'Content-Type': mime },
            maxBodyLength: Infinity,
        });
        if (u.status !== 200) throw new Error(`Nouvelle version de « ${name} » : ${explain(u)}`);
        return {
            nodeId: id,
            versionLabel: u.data?.entry?.properties?.['cm:versionLabel'] || null,
            nouveau: false,
            nouvelleVersion: true,
        };
    }
    throw new Error(`Dépôt de « ${name} » : ${explain(r)}`);
}

/** Contenu binaire d'un nœud. */
async function getContent(cfg, nodeId) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const r = await http.get(`${API}/nodes/${nodeId}/content`, {
        responseType: 'arraybuffer',
        headers: { Accept: 'application/octet-stream' },
    });
    if (r.status !== 200) throw new Error(explain(r));
    return Buffer.from(r.data);
}

/** Métadonnées d'un nœud (nom, dossier, taille…). */
async function getNode(cfg, nodeId) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const r = await http.get(`${API}/nodes/${nodeId}`, {
        params: { include: 'properties,path', fields: 'id,name,isFolder,content,modifiedAt,properties,path' },
    });
    if (r.status !== 200) throw new Error(explain(r));
    return r.data.entry;
}

/** Enfants d'un dossier (ou de la racine si nodeId absent). */
async function listChildren(cfg, nodeId) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const parent = nodeId || (await resolveRootId(http, cfg));
    const r = await http.get(`${API}/nodes/${parent}/children`, {
        params: { maxItems: 500, orderBy: 'isFolder DESC,name ASC', include: 'properties,path', fields: 'id,name,isFolder,content,modifiedAt,properties,path' },
    });
    if (r.status !== 200) throw new Error(explain(r));
    return (r.data?.list?.entries || []).map(({ entry: n }) => ({
        id: n.id,
        name: n.name,
        isFolder: !!n.isFolder,
        size: n.content?.sizeInBytes ?? null,
        versionLabel: n.properties?.['cm:versionLabel'] ?? null,
        modifiedAt: n.modifiedAt,
        description: n.properties?.['cm:description'] ?? null,
        path: n.path?.name ?? null,
    }));
}

/** Vrai si le nœud existe encore. */
async function exists(cfg, nodeId) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const r = await http.get(`${API}/nodes/${nodeId}`, { params: { fields: 'id' } });
    if (r.status === 200) return true;
    if (r.status === 404) return false;
    throw new Error(explain(r));
}

/** Suppression définitive d'un nœud. */
async function remove(cfg, nodeId) {
    assertConfigured(cfg);
    const http = httpClient(cfg);
    const r = await http.delete(`${API}/nodes/${nodeId}`, { params: { permanent: true } });
    if (![204, 404].includes(r.status)) throw new Error(explain(r));
}

/** Test de connexion + résolution de la racine. Ne lève pas : renvoie { ok, message, details }. */
async function testConnexion(cfg) {
    const t = Date.now();
    try {
        assertConfigured(cfg);
        const http = httpClient(cfg);
        const d = await http.get('/alfresco/api/discovery');
        if (d.status !== 200) {
            return { ok: false, message: explain(d), details: { etape: 'authentification', http: d.status } };
        }
        const repo = d.data?.entry?.repository || {};
        let racine = null;
        try {
            const id = await resolveRootId(http, cfg);
            const n = await http.get(`${API}/nodes/${id}`, { params: { fields: 'id,name,isFolder' } });
            racine = n.status === 200 ? { id: n.data.entry.id, nom: n.data.entry.name } : null;
        } catch (e) {
            return { ok: false, message: e.message, details: { etape: 'dossier racine' } };
        }
        if (!racine) {
            return { ok: false, message: 'Dossier racine illisible (droits insuffisants ?)', details: { etape: 'dossier racine' } };
        }
        return {
            ok: true,
            message: 'Connexion à Alfresco réussie',
            details: {
                serveur: 'Alfresco',
                version: repo.version?.display || repo.version?.major || null,
                edition: repo.edition || null,
                racine,
                ms: Date.now() - t,
            },
        };
    } catch (e) {
        return { ok: false, message: `Alfresco injoignable : ${e.code || e.message}`, details: { etape: 'réseau' } };
    }
}

const REF_PREFIX = 'alf:';
function makeRef(nodeId) { return `${REF_PREFIX}${nodeId}`; }
function parseRef(ref) {
    if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
    const id = ref.slice(REF_PREFIX.length).trim();
    return id || null;
}
function isRef(ref) { return typeof ref === 'string' && ref.startsWith(REF_PREFIX); }

module.exports = {
    API,
    DEFAULT_ROOT,
    getConfig,
    saveConfig,
    decryptStoredPassword,
    isConfigured,
    assertConfigured,
    resolveRootId,
    ensurePath,
    deposit,
    getContent,
    getNode,
    listChildren,
    exists,
    remove,
    testConnexion,
    makeRef,
    parseRef,
    isRef,
};
