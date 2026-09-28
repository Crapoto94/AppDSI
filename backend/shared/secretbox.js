/**
 * Chiffrement applicatif au repos (AES-256-GCM).
 *
 * La clé est dérivée du secret de l'application et d'un « usage » (ged, …),
 * de sorte qu'un contenu chiffré pour un usage ne se déchiffre pas pour un
 * autre. Format : iv.tag.contenu (base64). Un contenu illisible ou altéré
 * donne une chaîne vide, jamais une exception.
 *
 * Porté depuis c:\dev\delib\backend\src\shared\secretbox.js.
 */
const crypto = require('crypto');

function createSecretBox(secret, usage) {
    const key = crypto.createHash('sha256').update(`${secret}:${usage}`).digest();
    return {
        chiffre(texte) {
            if (texte === null || texte === undefined) return null;
            const iv = crypto.randomBytes(12);
            const c = crypto.createCipheriv('aes-256-gcm', key, iv);
            const enc = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
            return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
        },
        dechiffre(s) {
            if (!s) return '';
            try {
                const [iv, tag, enc] = String(s).split('.').map((x) => Buffer.from(x, 'base64'));
                const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
                d.setAuthTag(tag);
                return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
            } catch { return ''; }
        },
    };
}

/** Vrai si la valeur ressemble à un secret chiffré par createSecretBox (iv.tag.contenu). */
function looksEncrypted(s) {
    return typeof s === 'string' && /^[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$/.test(s);
}

module.exports = { createSecretBox, looksEncrypted };
