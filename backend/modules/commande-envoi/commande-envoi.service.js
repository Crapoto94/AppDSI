/**
 * Envoi d'une commande (bon de commande Sedit signé) aux contacts « destinataire
 * commande » d'un tiers. Lecture seule dans Sedit — voir skill "sedit-finances".
 */
const oracledb = require('oracledb');
const financeShare = require('../finance/finance-share.controller');
const smb = require('../../shared/smb_client');
const encadrantsController = require('../rh/encadrants.controller');

const OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Commande + tiers + service + correspondant (« émetteur ») depuis FI.COMMANDE. */
async function getCommande(roo) {
    return financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(
            `SELECT TRIM(c.ROO_IMA_REF) AS ROO, c.COMMANDE AS NUMERO,
                    TO_CHAR(c.CMD_DATECOMMANDE, 'DD/MM/YYYY') AS DATE_COMMANDE,
                    c.MONTANT_HT, c.MONTANT_TTC,
                    c.LIBELLE || c.CMD_LIBELLE2 AS LIBELLE, c.REFERENCE,
                    c.CORRESP, TRIM(c.MAILCORRESP) AS MAILCORRESP, c.TELCORRESP,
                    TRIM(t.TIERS) AS TIERS_CODE,
                    TRIM(REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2)) AS TIERS_NOM,
                    TRIM(s.CLEACCES) AS SERVICE_CODE, s.LIBELLE AS SERVICE_LIBELLE
               FROM FI.COMMANDE c
               LEFT JOIN FI.TIERS t ON TRIM(t.ROO_IMA_REF) = TRIM(c.TIERS)
               LEFT JOIN FI.SERVICEFI s ON TRIM(s.ROO_IMA_REF) = TRIM(c.SERVICE)
              WHERE TRIM(c.ROO_IMA_REF) = :roo`,
            { roo: String(roo).trim() }, OPTS
        );
        return r.rows[0] || null;
    });
}

/**
 * Bon de commande SIGNÉ : PJ_PES « BonDeCommande… » avec SIGNED = 1 (les brouillons /
 * « BrouillardDeCommande » et les bons non signés sont exclus). Le plus récent.
 */
async function getSignedBonDeCommande(roo) {
    return financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(
            `SELECT * FROM (
               SELECT TRIM(pj.ROO_IMA_REF) AS DOC_ID, pj.NOM_PJ, pj.CHEMIN_FICHIER, pj.FORMAT
                 FROM FI.FIPES_OBJ_PJ lnk
                 JOIN FI.PJ_PES pj ON pj.ROO_IMA_REF = lnk.PJPES_ROO
                WHERE TRIM(lnk.OBJECT_ROO) = :roo AND TRIM(lnk.OBJECT_TYPE) = 'COMMANDE'
                  AND pj.NOM_PJ LIKE 'BonDeCommand%' AND pj.SIGNED = 1
                ORDER BY pj.DATE_CREAT DESC NULLS LAST, pj.ROO_IMA_REF DESC)
             WHERE ROWNUM = 1`,
            { roo: String(roo).trim() }, OPTS
        );
        return r.rows[0] || null;
    });
}

/**
 * Devis rattachés à la commande : PJ de type « Devis » (FI.TYPE_PIECE 65, cf. skill
 * sedit-finances), y compris les `order-BD…` (devis du portail fournisseur) dont le NOM_PJ
 * n'a pas d'extension (voir attachmentName).
 */
async function getDevis(roo) {
    const rows = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(
        `SELECT TRIM(pj.ROO_IMA_REF) AS DOC_ID, pj.NOM_PJ, pj.CHEMIN_FICHIER, pj.FORMAT
           FROM FI.FIPES_OBJ_PJ lnk
           JOIN FI.PJ_PES pj ON pj.ROO_IMA_REF = lnk.PJPES_ROO
          WHERE TRIM(lnk.OBJECT_ROO) = :roo AND TRIM(lnk.OBJECT_TYPE) = 'COMMANDE' AND pj.TYPE_PIECE_ID = 65
          ORDER BY pj.DATE_CREAT, pj.ROO_IMA_REF`,
        { roo: String(roo).trim() }, OPTS
    )).rows);
    return rows;
}

const EXT_BY_FORMAT = { '06': '.pdf', '03': '.xml' };

/**
 * Nom de fichier à donner à la pièce jointe du mail. NOM_PJ n'a souvent pas d'extension
 * (ex. « order-BD8981731688 » alors que le fichier réel est « order-BD8981731688.pdf ») :
 * on la reprend du chemin réel sur le partage (CHEMIN_FICHIER), à défaut du code FORMAT.
 */
function attachmentName(doc) {
    const nom = String(doc.NOM_PJ || 'document').trim();
    const extOf = (s) => (String(s || '').trim().match(/\.[A-Za-z0-9]{2,5}$/) || [''])[0];
    if (extOf(nom)) return nom;
    const real = String(doc.CHEMIN_FICHIER || '').trim().split(/[\\/]/).pop();
    const ext = extOf(real) || EXT_BY_FORMAT[String(doc.FORMAT || '').trim()] || '';
    return nom + ext;
}

/** Contenu d'une pièce jointe depuis le partage UNC Sedit (Buffer, ou null). */
async function readDocument(doc) {
    const config = await financeShare.resolveShareConfig();
    if (!config.login || !config.password) throw new Error('Aucun compte disponible pour accéder au partage de pièces jointes Sedit.');
    const rel = financeShare.toRelativePath(config, doc.CHEMIN_FICHIER);
    return smb.readFileRel(config, rel);
}

// Encadrants (directeurs / responsables de service, avec e-mail) — mis en cache 15 min
// car l'appel déclenche des recherches AD/LDAP (même méthode que le service fait).
let encadrantsCache = { list: null, expiresAt: 0 };
async function getEncadrants() {
    if (encadrantsCache.list && Date.now() < encadrantsCache.expiresAt) return encadrantsCache.list;
    let raw = [];
    await new Promise((resolve) => {
        const fakeRes = { status: () => fakeRes, json: (d) => { raw = Array.isArray(d) ? d : []; resolve(); } };
        Promise.resolve(encadrantsController.getEncadrants({}, fakeRes)).catch(() => resolve());
    });
    encadrantsCache = { list: raw, expiresAt: Date.now() + 15 * 60 * 1000 };
    return raw;
}

const fullName = (e) => [e.prenom, e.nom].filter(Boolean).join(' ').trim();

/**
 * Personnes à mettre en copie : le responsable du service de la commande (code service
 * Sedit = code service RH, ex. BF8) et le directeur de sa direction. Le service d'accueil
 * d'une direction (ex. BF1) n'a pas de responsable propre : le directeur le dirige aussi.
 */
async function resolveCc(serviceCode) {
    const code = String(serviceCode || '').trim();
    if (!code) return [];
    const list = await getEncadrants();
    const svcHead = list.find(e => e.role === 'responsable_service' && String(e.service_code || '').trim() === code);
    const dirCode = (svcHead && svcHead.direction_code) || code.replace(/\d+$/, '');
    const director = list.find(e => e.role === 'directeur' && String(e.direction_code || '').trim() === dirCode);
    const out = [];
    for (const [role, e] of [['Responsable de service', svcHead], ['Directeur', director]]) {
        if (e && e.email && e.email.includes('@') && !out.some(o => o.email.toLowerCase() === e.email.toLowerCase())) {
            out.push({ role, name: fullName(e), email: e.email });
        }
    }
    return out;
}

// Téléphone de l'agent dans l'AD (telephoneNumber : à Ivry, le numéro de poste, ex. « 29 99 »).
// Meilleur effort (« » si AD désactivé / injoignable / agent introuvable), caché 10 min.
const phoneCache = new Map();
async function getAdPhone(username) {
    const key = String(username || '').trim().toLowerCase();
    if (!key) return '';
    const hit = phoneCache.get(key);
    if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.value;
    let value = '';
    try {
        const { getSqlite } = require('../../shared/database');
        const ldap = require('ldapjs');
        const { flattenLDAPEntry } = require('../../shared/utils');
        const db = getSqlite();
        const ad = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
        if (ad && ad.is_enabled) {
            value = await new Promise((resolve) => {
                const client = ldap.createClient({ url: `ldap://${ad.host}:${ad.port || 389}`, connectTimeout: 5000, timeout: 8000 });
                let out = '';
                const done = () => { try { client.destroy(); } catch (e) { /* ignore */ } resolve(out); };
                const guard = setTimeout(done, 10000);
                client.on('error', () => { clearTimeout(guard); done(); });
                client.bind(ad.bind_dn, ad.bind_password, (err) => {
                    if (err) { clearTimeout(guard); return done(); }
                    const esc = (s) => s.replace(/[*()\\\x00]/g, '\\$&');
                    try {
                        client.search(ad.base_dn, { filter: `(&(objectClass=user)(sAMAccountName=${esc(String(username))}))`, scope: 'sub', sizeLimit: 1, attributes: ['telephoneNumber'] }, (e2, sr) => {
                            if (e2) { clearTimeout(guard); return done(); }
                            const pick = (v) => String(Array.isArray(v) ? (v[0] || '') : (v || '')).trim();
                            sr.on('searchEntry', (entry) => {
                                const u = flattenLDAPEntry(entry);
                                out = pick(u.telephoneNumber);
                            });
                            sr.on('error', () => { clearTimeout(guard); done(); });
                            sr.on('end', () => { clearTimeout(guard); done(); });
                        });
                    } catch (e3) { clearTimeout(guard); done(); }
                });
            });
        }
    } catch (e) { /* signature sans téléphone */ }
    phoneCache.set(key, { value, ts: Date.now() });
    return value;
}

// Logo Ivry pour la signature : l'API Ville n'accepte pas de pièce « inline » (CID), on l'intègre
// donc au HTML (data URI). L'image source a de larges marges blanches : on la rogne puis on la
// réduit (≈ 10 Ko au lieu de 88 Ko). Calculé une fois.
let logoDataUri = null;
async function getLogoDataUri() {
    if (logoDataUri) return logoDataUri;
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '../../magapp_img/Ivry.png');
    try {
        const { createCanvas, loadImage } = require('@napi-rs/canvas');
        const img = await loadImage(file);
        const c = createCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const i = (y * img.width + x) * 4;
                if (data[i + 3] > 10 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) {
                    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                }
            }
        }
        const pad = 6;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(img.width - 1, x1 + pad); y1 = Math.min(img.height - 1, y1 + pad);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const outW = 200, outH = Math.round(h * outW / w);
        const out = createCanvas(outW, outH);
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, outW, outH);
        octx.drawImage(c, x0, y0, w, h, 0, 0, outW, outH);
        logoDataUri = `data:image/png;base64,${out.toBuffer('image/png').toString('base64')}`;
    } catch (e) {
        logoDataUri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    }
    return logoDataUri;
}

module.exports = { attachmentName, getLogoDataUri, getCommande, getSignedBonDeCommande, getDevis, readDocument, resolveCc, getAdPhone };
