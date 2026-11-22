'use strict';
/**
 * Mot de passe universel (accès de secours / recette) — PARAMÉTRABLE, jamais écrit en dur.
 *
 * Il permet de se connecter à MagApp / DSI Hub sous l'identité de n'importe quel compte : c'est un accès « passe-partout »,
 * donc sensible. Il est donc :
 *   - DÉSACTIVÉ par défaut (aucun mot de passe défini = aucun contournement) ;
 *   - stocké HACHÉ (bcrypt) dans app_settings, jamais en clair ;
 *   - défini et activé par un super-administrateur dans /admin/hub (onglet « Accès de secours ») ;
 *   - limité dans le temps (date d'expiration facultative) ;
 *   - interdit par défaut pour les comptes administrateurs (option modifiable) ;
 *   - journalisé à chaque utilisation.
 */
const bcrypt = require('bcryptjs');

const K = {
    hash: 'auth.universal_pwd_hash',
    enabled: 'auth.universal_pwd_enabled',
    expires: 'auth.universal_pwd_expires',
    blockAdmins: 'auth.universal_pwd_block_admins',
    setBy: 'auth.universal_pwd_set_by',
    setAt: 'auth.universal_pwd_set_at',
};
const MIN_LENGTH = 12;

async function read(db, key) {
    try { const r = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]); return r ? String(r.setting_value || '') : ''; }
    catch (e) { return ''; }
}
async function write(db, key, value, description) {
    await db.run('INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)', [key, String(value == null ? '' : value), description || '']);
}

/** État courant (sans jamais exposer le mot de passe ni son empreinte). */
async function getStatus(db) {
    const hash = await read(db, K.hash);
    const enabled = (await read(db, K.enabled)) === '1';
    const expires = await read(db, K.expires);
    const blockRaw = await read(db, K.blockAdmins);
    const expired = !!expires && new Date(expires).getTime() < Date.now();
    return {
        has_password: !!hash,
        enabled,
        expires_at: expires || '',
        expired,
        block_admins: blockRaw === '' ? true : blockRaw === '1',
        active: !!hash && enabled && !expired,
        set_by: await read(db, K.setBy),
        set_at: await read(db, K.setAt),
        min_length: MIN_LENGTH,
    };
}

/** Enregistre les réglages. `password` (facultatif) remplace le mot de passe ; vide = inchangé. */
async function save(db, { password, enabled, expires_at, block_admins }, by) {
    if (typeof password === 'string' && password.length) {
        if (password.length < MIN_LENGTH) { const e = new Error(`Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`); e.status = 400; throw e; }
        await write(db, K.hash, await bcrypt.hash(password, 12), 'Empreinte du mot de passe universel');
        await write(db, K.setBy, by || '', 'Auteur du dernier changement du mot de passe universel');
        await write(db, K.setAt, new Date().toISOString(), 'Date du dernier changement du mot de passe universel');
    }
    if (typeof enabled === 'boolean') {
        if (enabled && !(await read(db, K.hash))) { const e = new Error('Définissez d’abord un mot de passe.'); e.status = 400; throw e; }
        await write(db, K.enabled, enabled ? '1' : '0', 'Mot de passe universel activé');
    }
    if (expires_at !== undefined) {
        const v = String(expires_at || '').trim();
        if (v && Number.isNaN(new Date(v).getTime())) { const e = new Error('Date d’expiration invalide.'); e.status = 400; throw e; }
        await write(db, K.expires, v, 'Date d’expiration du mot de passe universel');
    }
    if (typeof block_admins === 'boolean') await write(db, K.blockAdmins, block_admins ? '1' : '0', 'Mot de passe universel interdit pour les comptes administrateurs');
}

/** Supprime le mot de passe universel (désactive le contournement). */
async function clear(db) {
    await write(db, K.hash, '', 'Empreinte du mot de passe universel');
    await write(db, K.enabled, '0', 'Mot de passe universel activé');
}

/**
 * Le mot de passe saisi ouvre-t-il l'accès de secours pour ce compte ?
 * Faux si le dispositif est inactif, expiré, si le mot de passe ne correspond pas, ou si le compte est administrateur (option).
 */
async function allows({ password, username, db, pool }) {
    try {
        if (!password || !username) return false;
        const st = await getStatus(db);
        if (!st.active) return false;
        const hash = await read(db, K.hash);
        if (!hash || !(await bcrypt.compare(String(password), hash))) return false;
        const name = String(username).toLowerCase();
        if (st.block_admins) {
            const isAdmin = (r) => ['admin', 'superadmin'].includes(String(r || '').toLowerCase());
            const row = await db.get('SELECT role FROM users WHERE username = ?', [name]).catch(() => null);
            let hubRole = '';
            try { const r = await pool.query('SELECT role FROM hub.users WHERE LOWER(username) = LOWER($1)', [name]); hubRole = r.rows[0]?.role || ''; } catch (e) { /* ignore */ }
            if (isAdmin(row && row.role) || isAdmin(hubRole) || ['admin', 'adminhub'].includes(name)) {
                console.warn(`[MOT DE PASSE UNIVERSEL] refusé pour le compte administrateur « ${name} » (option activée)`);
                return false;
            }
        }
        console.warn(`[MOT DE PASSE UNIVERSEL] connexion en tant que « ${name} » avec le mot de passe universel`);
        return true;
    } catch (e) {
        console.error('[MOT DE PASSE UNIVERSEL]', e.message);
        return false;
    }
}

module.exports = { getStatus, save, clear, allows, MIN_LENGTH };
