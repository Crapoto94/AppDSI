/**
 * Service du module Parapheur électronique.
 *
 * - Création d'un parapheur (N documents PDF, N signataires, positionnement).
 * - Jeton de signature par signataire (lien email public).
 * - Application des signatures (image PNG) dans les PDF via pdf-lib.
 * - Séquencement séquentiel / parallèle, complétion et refus.
 * - Notifications email + relances.
 */
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pgDb, getSqlite } = require('../../shared/database');
const storage = require('../../shared/storage');
const docsService = require('../../shared/documents.service');
const { SECRET_KEY } = require('../../shared/config');
const forge = require('node-forge');
const axios = require('axios');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const archiver = require('archiver');
const { SignPdf } = require('@signpdf/signpdf');
const { P12Signer } = require('@signpdf/signer-p12');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const emailTemplates = require('./parapheur-email');
const apmMail = require('../../shared/apm_mail');

const MODULE = 'parapheur';
const SIGN_MODULE = 'parapheur-signatures';
const CERT_MODULE = 'parapheur-certificats';
const TOKEN_EXPIRY_DAYS = 30;
const REMINDER_MAX = 3;
const REMINDER_INTERVAL_DAYS = 2;
// Durée de validité du lien (minutes) et seuil au-delà duquel un code e-mail est
// exigé pour confirmer l'identité du signataire extérieur.
const LINK_VALIDITY_CHOICES = [10, 30, 60, 1440, 10080];
const OTP_THRESHOLD_MINUTES = 60;

function normalizeLinkValidity(value) {
    const n = Number(value);
    return LINK_VALIDITY_CHOICES.includes(n) ? n : 10;
}
function linkValidityOf(parapheur) {
    return Number(parapheur && parapheur.link_validity_minutes) || 10;
}
/** Code e-mail requis uniquement si le lien est valable plus d'une heure. */
function otpRequiredFor(parapheur) {
    return linkValidityOf(parapheur) > OTP_THRESHOLD_MINUTES;
}
function isLinkExpired(signataire) {
    if (!signataire || !signataire.token_expires_at) return false;
    return new Date(signataire.token_expires_at).getTime() < Date.now();
}
function assertLinkValid(signataire) {
    if (isLinkExpired(signataire)) {
        throw { status: 410, message: 'Lien de signature expiré. Demandez un nouveau lien au demandeur.' };
    }
}
/** Jeton d'accès restreint d'un signataire extérieur (aucun compte requis). */
function externalAccessToken(signataire) {
    return jwt.sign({
        scope: 'parapheur_external',
        signataire_id: signataire.id,
        username: 'signataire-externe',
        displayName: signataire.nom,
        email: signataire.email,
        role: 'external',
    }, SECRET_KEY, { expiresIn: '12h' });
}

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

/**
 * Envoie un e-mail du parapheur via l'API Ville (APM) si elle est configurée :
 * le template général de la Ville est alors appliqué. Repli sur le mailer local
 * du Hub DSI (template DSI Hub) si l'API Ville est indisponible.
 * @param {string} to
 * @param {{ subject:string, content?:string, html?:string }} tpl
 */
async function sendParapheurEmail(to, tpl) {
    if (!to || !tpl) return;
    const { subject, content, html } = tpl;
    let apmErr = null;
    try {
        await apmMail.sendMail({ to, subject, content: content || html });
        return;
    } catch (e) {
        apmErr = e;
        console.warn('[PARAPHEUR] API Ville indisponible, repli mailer local:', e.message);
    }
    if (!sendMailFn) throw apmErr || new Error("Aucun service d'envoi d'e-mails disponible.");
    await sendMailFn(to, subject, html, [], 'parapheur');
}

async function getAppBaseUrl() {
    try {
        const db = getSqlite();
        const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
        const val = row?.setting_value?.trim();
        return val || process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    } catch {
        return process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    }
}

/**
 * Résout le nom d'affichage (« Prénom Nom ») d'un agent à partir de son
 * username, en interrogeant hub.users puis magapp.users. Repli sur la valeur
 * fournie (ou le username) si introuvable.
 */
async function resolveAgentDisplayName(username, fallback) {
    const u = String(username || '').trim();
    if (!u) return fallback || null;
    try {
        const row = await pgDb.get(`SELECT displayname FROM hub.users WHERE LOWER(username) = LOWER(?) LIMIT 1`, [u]);
        if (row && row.displayname) return row.displayname;
    } catch { /* ignore */ }
    try {
        const row = await pgDb.get(`SELECT displayname FROM magapp.users WHERE LOWER(username) = LOWER(?) LIMIT 1`, [u]);
        if (row && row.displayname) return row.displayname;
    } catch { /* ignore */ }
    return fallback || u;
}

/** Complète `created_by_name` de chaque élément depuis `created_by_username`. */
async function attachCreatorDisplayNames(list) {
    const cache = new Map();
    for (const item of list) {
        const username = item && item.created_by_username;
        if (!username) continue;
        const key = String(username).toLowerCase();
        if (!cache.has(key)) {
            try { cache.set(key, await resolveAgentDisplayName(username, null)); }
            catch { cache.set(key, null); }
        }
        const name = cache.get(key);
        if (name) item.created_by_name = name;
    }
    return list;
}

/**
 * URL de base utilisée pour les liens de signature envoyés par e-mail : l'URL
 * publique externe du parapheur (ex. https://parapheur.ivry94.fr) si elle est
 * configurée, afin de permettre la signature en mobilité ; sinon l'URL interne.
 */
async function getSignatureBaseUrl() {
    const s = await getParapheurSettings();
    return s.effective_base_url || await getAppBaseUrl();
}

const PUBLIC_BASE_URL_KEY = 'parapheur.public_base_url';
const SEAL_ENABLED_KEY = 'parapheur.seal_enabled';
const BULK_SIGN_MENTION_KEY = 'parapheur.bulk_sign_mention';
const NOTIFY_INTERVAL_KEY = 'parapheur.notify_interval_minutes';
const VERIFY_PATH = '/parapheur/verification';

/**
 * Formule juridique affichée avant une signature « en masse » (sans lecture
 * intégrale). Modifiable dans /admin/parapheur-certificats.
 */
const DEFAULT_BULK_SIGN_MENTION =
    "En cochant les documents et en validant, je reconnais avoir eu connaissance des documents listés " +
    "et je consens à leur signature électronique en masse. Cette signature vaut acceptation pleine et " +
    "entière des documents concernés et emporte les mêmes effets que ma signature manuscrite. Je renonce " +
    "expressément à toute contestation tirée de l'absence de lecture intégrale de chaque document.";

/**
 * Paramétrage du parapheur (SQLite app_settings) :
 * - `public_base_url` : URL externe (ex. https://chat.ivry94.fr) utilisée pour
 *   construire le lien du QR code de vérification, afin qu'il soit joignable
 *   hors du réseau interne (le domaine peut changer, la fonction reste la même).
 * À défaut, on retombe sur l'URL de base interne de l'application.
 */
async function getParapheurSettings() {
    let publicBaseUrl = '';
    let sealEnabled = true;
    let bulkSignMention = '';
    let notifyIntervalMinutes = 2;
    try {
        const db = getSqlite();
        if (db) {
            const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [PUBLIC_BASE_URL_KEY]);
            publicBaseUrl = (row && row.setting_value) ? String(row.setting_value).trim() : '';
            const sealRow = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [SEAL_ENABLED_KEY]);
            if (sealRow && sealRow.setting_value != null) sealEnabled = String(sealRow.setting_value) !== 'false';
            const bulkRow = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [BULK_SIGN_MENTION_KEY]);
            bulkSignMention = (bulkRow && bulkRow.setting_value) ? String(bulkRow.setting_value).trim() : '';
            const notifyRow = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [NOTIFY_INTERVAL_KEY]);
            const notifyVal = notifyRow && notifyRow.setting_value != null ? Number(notifyRow.setting_value) : NaN;
            if (Number.isFinite(notifyVal) && notifyVal > 0) notifyIntervalMinutes = Math.min(240, Math.round(notifyVal));
        }
    } catch { /* configuration non initialisée */ }
    const internal = await getAppBaseUrl();
    return {
        public_base_url: publicBaseUrl,
        internal_base_url: internal,
        effective_base_url: String(publicBaseUrl || internal || '').replace(/\/+$/, ''),
        verify_path: VERIFY_PATH,
        seal_enabled: sealEnabled,
        bulk_sign_mention: bulkSignMention || DEFAULT_BULK_SIGN_MENTION,
        notify_interval_minutes: notifyIntervalMinutes,
    };
}

async function saveParapheurSettings({ publicBaseUrl, sealEnabled, bulkSignMention, notifyIntervalMinutes } = {}) {
    const db = getSqlite();
    if (!db) throw { status: 503, message: 'Configuration indisponible (base non initialisée).' };
    const upsert = `INSERT INTO app_settings (setting_key, setting_value, description)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, description = excluded.description`;
    if (publicBaseUrl !== undefined) {
        const value = String(publicBaseUrl || '').trim().replace(/\/+$/, '');
        if (value && !/^https?:\/\//i.test(value)) {
            throw { status: 400, message: "L'URL publique doit commencer par http:// ou https://." };
        }
        await db.run(upsert, [PUBLIC_BASE_URL_KEY, value, 'URL publique externe du parapheur (lien de vérification du QR code)']);
    }
    if (sealEnabled !== undefined) {
        await db.run(upsert, [SEAL_ENABLED_KEY, sealEnabled === false ? 'false' : 'true', 'Sceau PAdES de fin de circuit (AC interne)']);
    }
    if (bulkSignMention !== undefined) {
        const value = String(bulkSignMention || '').trim().slice(0, 2000);
        await db.run(upsert, [BULK_SIGN_MENTION_KEY, value, 'Formule juridique affichée avant une signature en masse']);
    }
    if (notifyIntervalMinutes !== undefined) {
        const n = Number(notifyIntervalMinutes);
        const value = Number.isFinite(n) && n > 0 ? String(Math.min(240, Math.round(n))) : '2';
        await db.run(upsert, [NOTIFY_INTERVAL_KEY, value, "Intervalle d'envoi des e-mails de signature (minutes)"]);
    }
    return getParapheurSettings();
}

async function getVerifyBaseUrl() {
    const s = await getParapheurSettings();
    return s.effective_base_url;
}

function getClientIp(req) {
    const fwd = req.headers && req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return (req.ip || (req.connection && req.connection.remoteAddress) || '') + '';
}

function getUserAgent(req) {
    return String((req.headers && req.headers['user-agent']) || '').slice(0, 500);
}

/** Masque un numéro de mobile : « 06 •••••• 89 ». */
function maskPhone(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length < 4) return '••••';
    return `${d.slice(0, 2)} •••••• ${d.slice(-2)}`;
}

/** Envoie un SMS via Frizbi (même mécanisme que les autres modules). */
async function sendSms(mobile, message, source) {
    const db = getSqlite();
    if (!db) throw { status: 503, message: 'Service SMS indisponible (configuration non initialisée).' };
    const frizbi = await db.get('SELECT * FROM frizbi_settings WHERE id = 1');
    if (!frizbi || !frizbi.is_enabled || !frizbi.client_id || !frizbi.client_secret) {
        throw { status: 503, message: 'Service SMS (Frizbi) non configuré ou désactivé.' };
    }
    const authRes = await axios.post(`${frizbi.api_url}/api/auth/login`, {
        login: frizbi.client_id,
        password: frizbi.client_secret,
    });
    const frizbiToken = authRes.data && authRes.data.token;
    if (!frizbiToken) throw { status: 502, message: "Échec d'authentification au service SMS." };

    const clean = String(mobile).replace(/\D/g, '');
    const payload = {
        customerSmsId: `${source}_${Date.now()}`.substring(0, 50),
        date: new Date().toISOString(),
        title: 'Parapheur — code de signature',
        message,
        customerSenderId: frizbi.sender_id || 'IVRY',
        smsContacts: [{
            customerSmsContactId: `${source}_${clean}`.substring(0, 50),
            mobile: clean,
            firstName: '',
            lastName: '',
        }],
    };
    await axios.post(`${frizbi.api_url}/api/sms/send`, payload, { headers: { Authorization: `Bearer ${frizbiToken}` } });
    try {
        await pgDb.run(
            `INSERT INTO hub.sms_logs (recipient, message, sender_id, status, source, created_by)
             VALUES (?, ?, ?, 'sent', ?, ?)`,
            [clean, message, frizbi.sender_id || 'IVRY', source, 'parapheur']
        );
    } catch (e) { /* log non bloquant */ }
}

/** Demande l'envoi d'un code SMS (OTP) pour un signataire. */
async function requestOtp(token) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    if (signataire.status === 'refuse') throw { status: 400, message: 'Vous avez déjà refusé de signer.' };
    if (signataire.status !== 'en_cours' && signataire.status !== 'a_signe') {
        throw { status: 409, message: "Ce n'est pas encore votre tour de signer." };
    }
    if (signataire.signature_mode !== 'sms') throw { status: 400, message: "Ce signataire n'utilise pas la signature par SMS." };
    if (!signataire.sms_phone) throw { status: 400, message: 'Aucun numéro de portable renseigné pour cette signature.' };
    const parapheur = await pgDb.get(`SELECT status FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    if (!parapheur || parapheur.status !== 'en_cours') throw { status: 400, message: "Ce parapheur n'est plus ouvert." };
    // Comparaison faite côté base : évite tout décalage de fuseau entre Postgres
    // (session UTC) et le processus Node (heure locale) qui ferait apparaître un
    // code tout juste envoyé comme déjà expiré.
    const otpState = await pgDb.get(
        `SELECT (otp_code_hash IS NOT NULL AND otp_expires_at IS NOT NULL
                 AND otp_expires_at > NOW() + INTERVAL '9 minutes 30 seconds') AS too_soon
         FROM hub_parapheur.signataires WHERE id = ?`,
        [signataire.id]
    );
    if (otpState && otpState.too_soon) {
        throw { status: 429, message: 'Un code vient de vous être envoyé. Patientez quelques secondes avant de redemander.' };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = sha256(Buffer.from(code, 'utf8'));
    await pgDb.run(
        `UPDATE hub_parapheur.signataires
         SET otp_code_hash = ?, otp_expires_at = NOW() + INTERVAL '10 minutes', otp_attempts = 0
         WHERE id = ?`,
        [hash, signataire.id]
    );
    await sendSms(signataire.sms_phone, `Code de signature : ${code}. Valable 10 minutes.`, 'parapheur_otp');
    return { sent: true, phone_masked: maskPhone(signataire.sms_phone) };
}

/** Masque une adresse e-mail : « ma•••••@domaine.fr ». */
function maskEmail(email) {
    const e = String(email || '');
    const at = e.indexOf('@');
    if (at <= 0) return '••••';
    const name = e.slice(0, at);
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}${e.slice(at)}`;
}

/**
 * Un signataire est « extérieur » s'il a été déclaré comme tel, ou s'il n'a
 * aucun agent associé (agent_id absent) — cas des parapheurs créés avant
 * l'introduction du drapeau explicite.
 */
function isExternalSigner(signataire) {
    if (!signataire) return false;
    return signataire.is_external === true || signataire.agent_id == null;
}

/**
 * Informations d'accès publiques (aucune authentification) : permet à la page
 * de signature de savoir si le signataire est interne (auth AD) ou extérieur
 * (code par e-mail) avant de proposer le bon mode de connexion.
 */
async function getSignerAccessInfo(token) {
    const signataire = await getSignerByToken(token);
    if (!signataire) return null;
    const p = await pgDb.get(`SELECT status, title, reference, link_validity_minutes FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    const isExternal = isExternalSigner(signataire);
    const otpRequired = otpRequiredFor(p);
    const expired = isLinkExpired(signataire);
    // Lien court (≤ 1 h) : accès DIRECT au parapheur, sans code e-mail.
    const canSignDirectly = isExternal && !otpRequired && !expired
        && (signataire.status === 'en_cours' || signataire.status === 'a_signe')
        && p && p.status === 'en_cours';

    const info = {
        exists: true,
        is_external: isExternal,
        otp_required: otpRequired,
        link_expires_at: signataire.token_expires_at,
        expired,
        nom: signataire.nom,
        email_masked: maskEmail(signataire.email),
        status: signataire.status,
        parapheur_status: p ? p.status : null,
        title: p ? p.title : null,
        reference: p ? p.reference : null,
    };
    if (canSignDirectly) {
        info.accessToken = externalAccessToken(signataire);
        info.user = { id: signataire.id, username: 'signataire-externe', displayName: signataire.nom, email: signataire.email, role: 'external' };
    }
    return info;
}

/** Envoie un code de vérification par e-mail à un signataire extérieur. */
async function requestEmailOtp(token) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    assertLinkValid(signataire);
    if (!isExternalSigner(signataire)) {
        throw { status: 400, message: "Cette signature utilise l'authentification de la collectivité." };
    }
    if (signataire.status === 'refuse') throw { status: 400, message: 'Vous avez déjà refusé de signer.' };
    if (signataire.status !== 'en_cours' && signataire.status !== 'a_signe') {
        throw { status: 409, message: "Ce n'est pas encore votre tour de signer." };
    }
    if (!signataire.email) throw { status: 400, message: 'Aucune adresse e-mail renseignée.' };
    const parapheur = await pgDb.get(`SELECT status, title, reference FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    if (!parapheur || parapheur.status !== 'en_cours') throw { status: 400, message: "Ce parapheur n'est plus ouvert." };

    const otpState = await pgDb.get(
        `SELECT (otp_code_hash IS NOT NULL AND otp_expires_at IS NOT NULL
                 AND otp_expires_at > NOW() + INTERVAL '9 minutes 30 seconds') AS too_soon
         FROM hub_parapheur.signataires WHERE id = ?`,
        [signataire.id]
    );
    if (otpState && otpState.too_soon) {
        throw { status: 429, message: 'Un code vient de vous être envoyé. Patientez quelques secondes avant de redemander.' };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = sha256(Buffer.from(code, 'utf8'));
    await pgDb.run(
        `UPDATE hub_parapheur.signataires
         SET otp_code_hash = ?, otp_expires_at = NOW() + INTERVAL '10 minutes', otp_attempts = 0
         WHERE id = ?`,
        [hash, signataire.id]
    );
    try {
        const tpl = emailTemplates.signatureOtp({
            signataireNom: signataire.nom,
            code,
            title: parapheur.title,
        });
        await sendParapheurEmail(signataire.email, tpl);
    } catch (e) {
        console.error('[PARAPHEUR] envoi code e-mail échoué:', e.message);
        throw { status: 502, message: "L'envoi du code par e-mail a échoué. Réessayez." };
    }
    return { sent: true, email_masked: maskEmail(signataire.email) };
}

/**
 * Vérifie le code e-mail d'un signataire extérieur et délivre un jeton d'accès
 * restreint (scope 'parapheur_external') permettant de signer sans compte AD.
 */
async function verifyEmailOtp(token, code) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    assertLinkValid(signataire);
    if (!isExternalSigner(signataire)) throw { status: 400, message: 'Authentification non applicable.' };
    if (!code) throw { status: 400, message: 'Code de vérification requis.' };
    if (!signataire.otp_code_hash) throw { status: 400, message: 'Aucun code envoyé. Demandez un nouveau code.' };

    const otpCheck = await pgDb.get(
        `SELECT (otp_expires_at IS NULL OR otp_expires_at < NOW()) AS expired,
                COALESCE(otp_attempts, 0) AS attempts
         FROM hub_parapheur.signataires WHERE id = ?`,
        [signataire.id]
    );
    if (otpCheck && otpCheck.expired) throw { status: 400, message: 'Code expiré. Demandez-en un nouveau.' };
    if (Number(otpCheck?.attempts || 0) >= 5) throw { status: 429, message: 'Trop de tentatives. Demandez un nouveau code.' };

    const ok = signataire.otp_code_hash === sha256(Buffer.from(String(code).trim(), 'utf8'));
    if (!ok) {
        await pgDb.run(`UPDATE hub_parapheur.signataires SET otp_attempts = otp_attempts + 1 WHERE id = ?`, [signataire.id]);
        throw { status: 400, message: 'Code de vérification incorrect.' };
    }
    await pgDb.run(
        `UPDATE hub_parapheur.signataires SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?`,
        [signataire.id]
    );
    const accessToken = externalAccessToken(signataire);
    return {
        accessToken,
        user: {
            id: signataire.id,
            username: 'signataire-externe',
            displayName: signataire.nom,
            email: signataire.email,
            role: 'external',
        },
    };
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

async function readStorageFile(dbPath) {
    const f = await storage.getFileForServe(dbPath);
    if (!f) throw new Error('Fichier introuvable: ' + dbPath);
    if (f.buffer) return f.buffer;
    return fs.readFileSync(f.absolutePath);
}

/** Détecte la présence d'une signature électronique (PAdES/PKCS#7) dans un PDF. */
async function pdfHasSignature(dbPath) {
    try {
        const f = await storage.getFileForServe(dbPath);
        if (!f) return false;
        const buf = f.buffer || fs.readFileSync(f.absolutePath);
        const raw = buf.toString('latin1');
        if (!raw.includes('/ByteRange')) return false;
        if (!/\/SubFilter\s*\/adbe\.pkcs7\.detached/.test(raw) && !/\/Type\s*\/Sig/.test(raw)) return false;
        // Un vrai signature a un /Contents hexadécimal non vide (le placeholder est vide).
        const m = raw.match(/\/Contents\s*<([0-9A-Fa-f\s]+)>/);
        return !!(m && m[1].replace(/\s/g, '').replace(/0/g, '').length > 0);
    } catch {
        return false;
    }
}

async function audit(parapheurId, actor, action, details, ip) {
    try {
        await pgDb.run(
            `INSERT INTO hub_parapheur.audit_log (parapheur_id, actor, action, details, ip) VALUES (?, ?, ?, ?, ?)`,
            [parapheurId || null, actor || 'système', action, details ? JSON.stringify(details) : null, ip || null]
        );
    } catch (e) {
        console.warn('[PARAPHEUR] audit échoué:', e.message);
    }
}

// ─── Certificats P12 (chiffrés au repos) ─────────────────────────────────────
const CERT_KEY = crypto.createHash('sha256').update(`parapheur-cert:${SECRET_KEY || 'secret'}`).digest();

function encryptBuffer(buf) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CERT_KEY, iv);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
}

function decryptBuffer(data) {
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const enc = data.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', CERT_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
}

/**
 * Analyse un buffer PKCS#12 et renvoie les métadonnées du certificat.
 * Le mot de passe est nécessaire pour déverrouiller le fichier.
 */
function inspectP12(buffer, password) {
    try {
        const asn1 = forge.asn1.fromDer(buffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || '');
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const cert = (certBags[forge.pki.oids.certBag] || [])[0]?.cert;
        const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keys = p12.getBags({ bagType: forge.pki.oids.keyBag });
        const hasPrivateKey = Boolean(
            (shrouded[forge.pki.oids.pkcs8ShroudedKeyBag] || []).length ||
            (keys[forge.pki.oids.keyBag] || []).length
        );
        if (!cert) return { ok: false, hasPrivateKey, error: 'Aucun certificat trouvé dans le fichier.' };
        const cn = cert.subject.getField('CN');
        return {
            ok: true,
            hasPrivateKey,
            subject: cn ? cn.value : cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '),
            issuer: (cert.issuer.getField('CN') || {}).value || '',
            serial: cert.serialNumber,
            validFrom: cert.validity.notBefore,
            validTo: cert.validity.notAfter,
        };
    } catch (e) {
        return { ok: false, hasPrivateKey: false, error: e.message || 'Fichier PKCS#12 illisible (mot de passe incorrect ?)' };
    }
}

async function saveCertificate(email, agentId, file, { password, name, remember } = {}) {
    if (!email) throw { status: 400, message: 'Email requis' };
    if (!file || !file.buffer) throw { status: 400, message: 'Fichier de certificat (.p12) requis' };

    // Validation avec le mot de passe (si fourni) : on vérifie que le fichier
    // est un PKCS#12 exploitable et on extrait les métadonnées du certificat.
    let meta = { ok: false, hasPrivateKey: false, error: 'Non vérifié (mot de passe non fourni).' };
    if (password) meta = inspectP12(file.buffer, password);

    const encrypted = encryptBuffer(file.buffer);
    const saved = await storage.saveFile(CERT_MODULE, Date.now(), { buffer: encrypted, originalname: 'certificat.p12.enc' });
    const filename = storage.fixUploadName(file.originalname || 'certificat.p12');
    const existing = await pgDb.get(`SELECT id, p12_path FROM hub_parapheur.agent_certificates WHERE LOWER(email) = LOWER(?)`, [email]);

    const metaValues = [
        agentId || null, filename, name || null,
        meta.subject || null, meta.issuer || null, meta.serial || null,
        meta.validFrom ? new Date(meta.validFrom).toISOString() : null,
        meta.validTo ? new Date(meta.validTo).toISOString() : null,
        meta.hasPrivateKey === true,
        meta.ok === true,
        meta.error || null,
    ];
    const rememberValue = remember !== false;
    if (existing) {
        await pgDb.run(
            `UPDATE hub_parapheur.agent_certificates
             SET p12_path = ?, agent_id = ?, filename = ?, nom = ?, subject = ?, issuer = ?, serial = ?,
                 valid_from = ?, valid_to = ?, has_private_key = ?, is_verified = ?, validation_error = ?,
                 remember = ?, validated_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [saved.dbPath, ...metaValues, rememberValue, existing.id]
        );
        if (existing.p12_path && existing.p12_path !== saved.dbPath) {
            try { await storage.deleteFile(existing.p12_path); } catch (e) { /* ignore */ }
        }
    } else {
        await pgDb.run(
            `INSERT INTO hub_parapheur.agent_certificates
                (email, p12_path, agent_id, filename, nom, subject, issuer, serial, valid_from, valid_to, has_private_key, is_verified, validation_error, remember, validated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [email, saved.dbPath, ...metaValues, rememberValue]
        );
    }
    return { success: true, verified: meta.ok === true, has_private_key: meta.hasPrivateKey === true, error: meta.ok ? null : (meta.error || null) };
}

async function getCertificateMeta(email) {
    if (!email) return null;
    const row = await pgDb.get(
        `SELECT p12_path, filename, subject, issuer, serial, valid_from, valid_to, has_private_key, is_verified, validation_error, validated_at, updated_at
         FROM hub_parapheur.agent_certificates WHERE LOWER(email) = LOWER(?)`,
        [email]
    );
    return row || null;
}

async function deleteCertificate(email) {
    const row = await pgDb.get(`SELECT id, p12_path FROM hub_parapheur.agent_certificates WHERE LOWER(email) = LOWER(?)`, [email]);
    if (row) {
        try { await storage.deleteFile(row.p12_path); } catch (e) { /* ignore */ }
        await pgDb.run(`DELETE FROM hub_parapheur.agent_certificates WHERE id = ?`, [row.id]);
    }
    return { success: true };
}

async function deleteCertificateById(id) {
    const row = await pgDb.get(`SELECT id, p12_path FROM hub_parapheur.agent_certificates WHERE id = ?`, [id]);
    if (!row) throw { status: 404, message: 'Certificat introuvable' };
    try { await storage.deleteFile(row.p12_path); } catch (e) { /* ignore */ }
    await pgDb.run(`DELETE FROM hub_parapheur.agent_certificates WHERE id = ?`, [id]);
    return { success: true };
}

/** Journal (admin) : qui a signé / refusé quoi et quand. */
async function listSignatureLogs() {
    const rows = await pgDb.all(
        `SELECT sg.nom, sg.email, sg.status, sg.signature_mode, sg.sms_phone, sg.signed_at, sg.rejected_at,
                sg.rejection_comment, sg.ip, sg.user_agent, sg.signed_by_name, sg.signed_by_email, sg.signature_note,
                p.id AS parapheur_id, p.title, p.reference, p.mode,
                (SELECT COUNT(*) FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS nb_documents,
                (SELECT string_agg(d.original_name, ' | ' ORDER BY d.sort_order, d.id)
                   FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS documents
         FROM hub_parapheur.signataires sg
         JOIN hub_parapheur.parapheurs p ON p.id = sg.parapheur_id
         WHERE sg.status IN ('a_signe', 'refuse')
         ORDER BY COALESCE(sg.signed_at, sg.rejected_at) DESC NULLS LAST`
    );
    return rows.map(r => ({
        nom: r.nom,
        email: r.email,
        status: r.status,
        signature_mode: r.signature_mode,
        signed_at: r.signed_at,
        rejected_at: r.rejected_at,
        rejection_comment: r.rejection_comment,
        sms_phone: r.sms_phone || null,
        signature_note: r.signature_note || null,
        ip: r.ip,
        user_agent: r.user_agent,
        signed_by_name: (r.signed_by_name && r.signed_by_name !== r.nom) ? r.signed_by_name : null,
        signed_by_email: r.signed_by_email || null,
        parapheur_id: r.parapheur_id,
        title: r.title,
        reference: r.reference,
        mode: r.mode,
        nb_documents: Number(r.nb_documents || 0),
        documents: r.documents || '',
    }));
}

/** Éléments de sécurisation / non-falsification (admin) par document. */
async function listSecurity() {
    const rows = await pgDb.all(
        `SELECT d.id, d.original_name, d.doc_hash, d.has_pades, d.signed_path, d.storage_path,
                p.id AS parapheur_id, p.reference, p.title, p.status
         FROM hub_parapheur.documents d
         JOIN hub_parapheur.parapheurs p ON p.id = d.parapheur_id
         ORDER BY p.id DESC, d.sort_order, d.id`
    );
    const out = [];
    for (const d of rows) {
        // Vérification d'intégrité : on recalcule l'empreinte du fichier stocké.
        let integrityOk = null;
        if (d.doc_hash) {
            try {
                const buf = await readStorageFile(d.storage_path);
                integrityOk = sha256(buf) === d.doc_hash;
            } catch (e) { integrityOk = null; }
        }
        out.push({
            id: d.id,
            parapheur_id: d.parapheur_id,
            reference: d.reference,
            title: d.title,
            parapheur_status: d.status,
            original_name: d.original_name,
            doc_hash: d.doc_hash,
            integrity_ok: integrityOk,
            has_signed: !!d.signed_path,
            has_pades: !!d.has_pades,
            has_crypto_signature: d.signed_path ? await pdfHasSignature(d.signed_path) : false,
        });
    }
    return out;
}

/** Liste (admin) de tous les certificats enregistrés, avec état de validité. */
async function listCertificates() {
    const rows = await pgDb.all(`SELECT * FROM hub_parapheur.agent_certificates ORDER BY updated_at DESC`);
    const now = Date.now();
    const out = [];
    for (const r of rows) {
        let decryptable = false;
        try { const enc = await readStorageFile(r.p12_path); decryptBuffer(enc); decryptable = true; } catch (e) { decryptable = false; }

        let validity = 'unknown';
        if (r.valid_to) {
            const to = new Date(r.valid_to).getTime();
            const from = r.valid_from ? new Date(r.valid_from).getTime() : 0;
            if (now > to) validity = 'expired';
            else if (now < from) validity = 'not_yet';
            else validity = 'valid';
        }
        out.push({
            id: r.id,
            email: r.email,
            agent_id: r.agent_id,
            nom: r.nom,
            filename: r.filename,
            subject: r.subject,
            issuer: r.issuer,
            serial: r.serial,
            valid_from: r.valid_from,
            valid_to: r.valid_to,
            has_private_key: r.has_private_key,
            is_verified: r.is_verified,
            validation_error: r.validation_error,
            validated_at: r.validated_at,
            updated_at: r.updated_at,
            decryptable,
            validity,
            ready_to_sign: decryptable && r.has_private_key === true && validity !== 'expired' && validity !== 'not_yet',
        });
    }
    return out;
}

async function readCertificateBuffer(email) {
    const row = await getCertificateMeta(email);
    if (!row) return null;
    const encrypted = await readStorageFile(row.p12_path);
    return decryptBuffer(encrypted);
}

/**
 * Après une signature P12 réussie, le mot de passe vient de valider le
 * certificat : on rafraîchit ses métadonnées (clé privée, validité, sujet…) afin
 * que l'administration le voie « vérifié / prêt à signer » alors qu'il avait pu
 * être importé sans mot de passe de vérification.
 */
async function refreshCertificateMeta(email, password) {
    try {
        const buf = await readCertificateBuffer(email);
        if (!buf) return;
        const meta = inspectP12(buf, password);
        if (!meta.ok) return;
        await pgDb.run(
            `UPDATE hub_parapheur.agent_certificates
             SET subject = ?, issuer = ?, serial = ?, valid_from = ?, valid_to = ?,
                 has_private_key = ?, is_verified = TRUE, validation_error = NULL,
                 validated_at = NOW(), updated_at = NOW()
             WHERE LOWER(email) = LOWER(?)`,
            [
                meta.subject || null,
                meta.issuer || null,
                meta.serial || null,
                meta.validFrom ? new Date(meta.validFrom).toISOString() : null,
                meta.validTo ? new Date(meta.validTo).toISOString() : null,
                meta.hasPrivateKey === true,
                email,
            ]
        );
    } catch (e) {
        console.warn('[PARAPHEUR] rafraîchissement certificat échoué:', e.message);
    }
}

/**
 * Applique une signature cryptographique (détachée PKCS#7 / PAdES-BES) sur un
 * buffer PDF via le certificat P12 du signataire.
 */
async function applyPadesToBuffer(pdfBuffer, p12Buffer, password, { name, reason, pos }) {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const idx = Math.max(0, Math.min((pos?.page || 1) - 1, pages.length - 1));
    const pdfPage = pages[idx];
    const { width, height } = pdfPage.getSize();
    const w = pos?.w || 150;
    const h = pos?.h || 60;
    const cx = ((pos?.xPct ?? 75) / 100) * width;
    const cyTop = ((pos?.yPct ?? 85) / 100) * height;
    const x1 = cx - w / 2;
    const y1 = height - cyTop - h / 2;
    const widgetRect = [x1, y1, x1 + w, y1 + h];

    pdflibAddPlaceholder({
        pdfDoc,
        pdfPage,
        reason: reason || 'Parapheur électronique',
        contactInfo: '',
        name: name || '',
        location: '',
        signatureLength: 16384,
        widgetRect,
        appName: 'DSI Hub - Parapheur électronique',
    });
    const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
    const signer = new P12Signer(p12Buffer, { passphrase: password });
    const signed = Buffer.from(await new SignPdf().sign(withPlaceholder, signer));

    // Vérifie que la signature a bien été inscrite.
    const raw = signed.toString('latin1');
    if (!raw.includes('/ByteRange') || !/\/Contents\s*<[0-9A-Fa-f]/.test(raw)) {
        throw new Error('La signature cryptographique n\'a pas pu être inscrite dans le PDF.');
    }
    return signed;
}

// ─── Autorité de certification interne (sceau de la plateforme) ──────────────
// Pour les signatures « internes » (simple / SMS), on émet un certificat
// technique à la volée lié à l'événement de signature. En fin de circuit, un
// sceau PAdES (certificat éphémère émis par l'AC interne) est apposé sur les
// documents. Portée : usage interne (voir dossier de preuves).

async function getPlatformCa() {
    const row = await pgDb.get(`SELECT * FROM hub_parapheur.platform_ca ORDER BY id DESC LIMIT 1`);
    if (!row) return null;
    let keyPem = null;
    try { keyPem = decryptBuffer(Buffer.from(row.key_enc, 'base64')).toString('utf8'); } catch { keyPem = null; }
    return {
        id: row.id,
        certPem: row.cert_pem,
        keyPem,
        subject: row.subject,
        serial: row.serial,
        fingerprint: row.fingerprint,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
    };
}

async function generatePlatformCa() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 15);
    const attrs = [
        { name: 'commonName', value: "AC Parapheur - Ville d'Ivry-sur-Seine" },
        { name: 'organizationName', value: "Ville d'Ivry-sur-Seine" },
        { name: 'organizationalUnitName', value: 'DSI' },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
        { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const enc = encryptBuffer(Buffer.from(keyPem, 'utf8')).toString('base64');
    const fingerprint = publicKeyFingerprintSha256(keys.publicKey);
    const serial = cert.serialNumber;

    const existing = await pgDb.get(`SELECT id FROM hub_parapheur.platform_ca ORDER BY id DESC LIMIT 1`);
    if (existing) {
        await pgDb.run(
            `UPDATE hub_parapheur.platform_ca
             SET cert_pem = ?, key_enc = ?, subject = ?, serial = ?, fingerprint = ?,
                 valid_from = ?, valid_to = ?, rotated_at = NOW()
             WHERE id = ?`,
            [certPem, enc, attrs[0].value, serial, fingerprint,
                cert.validity.notBefore.toISOString(), cert.validity.notAfter.toISOString(), existing.id]
        );
    } else {
        await pgDb.run(
            `INSERT INTO hub_parapheur.platform_ca (cert_pem, key_enc, subject, serial, fingerprint, valid_from, valid_to)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [certPem, enc, attrs[0].value, serial, fingerprint,
                cert.validity.notBefore.toISOString(), cert.validity.notAfter.toISOString()]
        );
    }
    return getPlatformCa();
}

async function ensurePlatformCa() {
    const ca = await getPlatformCa();
    if (ca && ca.keyPem) return ca;
    return generatePlatformCa();
}

function forgeSubjectAttributes(subject) {
    const attrs = [{ name: 'commonName', value: String(subject.cn || 'Signataire').slice(0, 64) }];
    if (subject.organizationName) attrs.push({ name: 'organizationName', value: subject.organizationName });
    if (subject.organizationalUnitName) attrs.push({ name: 'organizationalUnitName', value: subject.organizationalUnitName });
    attrs.push({ name: 'countryName', value: 'FR' });
    return attrs;
}

/** Émet un certificat feuille signé par l'AC interne. */
function issueLeafCertificate(ca, subject) {
    const caCert = forge.pki.certificateFromPem(ca.certPem);
    const caKey = forge.pki.privateKeyFromPem(ca.keyPem);
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '02' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 5);
    const attrs = forgeSubjectAttributes(subject);
    cert.setSubject(attrs);
    cert.setIssuer(caCert.subject.attributes);
    const extensions = [
        { name: 'basicConstraints', cA: false, critical: true },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true },
        { name: 'extKeyUsage', emailProtection: true },
        { name: 'subjectKeyIdentifier' },
    ];
    if (subject.email) extensions.push({ name: 'subjectAltName', altNames: [{ type: 1, value: subject.email }] });
    cert.setExtensions(extensions);
    cert.sign(caKey, forge.md.sha256.create());
    return {
        certPem: forge.pki.certificateToPem(cert),
        keyPem: forge.pki.privateKeyToPem(keys.privateKey),
        serial: cert.serialNumber,
    };
}

function p12BufferFromKeyAndChain(keyPem, certPems, password) {
    const key = forge.pki.privateKeyFromPem(keyPem);
    const certs = certPems.map((p) => forge.pki.certificateFromPem(p));
    const asn1 = forge.pkcs12.toPkcs12Asn1(key, certs, password);
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

/** Empreinte SHA-256 (hex) de la clé publique (DER SubjectPublicKeyInfo). */
function publicKeyFingerprintSha256(publicKey) {
    try {
        const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey)).getBytes();
        const md = forge.md.sha256.create();
        md.update(der);
        return md.digest().toHex();
    } catch { return null; }
}

function certFingerprintSha256(certPem) {
    try {
        const cert = forge.pki.certificateFromPem(certPem);
        return publicKeyFingerprintSha256(cert.publicKey);
    } catch { return null; }
}

/** Émet et enregistre un certificat technique pour une signature interne. */
async function recordSignatureCertificate(parapheurId, signataire, mode, signingTime) {
    try {
        const ca = await ensurePlatformCa();
        if (!ca || !ca.keyPem) return null;
        const leaf = issueLeafCertificate(ca, {
            cn: `${signataire.nom || signataire.email} (${signataire.email})`,
            email: signataire.email,
            organizationName: "Ville d'Ivry-sur-Seine",
            organizationalUnitName: 'DSI',
        });
        const issuer = forge.pki.certificateFromPem(ca.certPem).subject.getField('CN')?.value || ca.subject;
        const fingerprint = certFingerprintSha256(leaf.certPem);
        await pgDb.run(
            `INSERT INTO hub_parapheur.signature_certificates
                (parapheur_id, signataire_id, mode, subject, serial, issuer, fingerprint, cert_pem, signing_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [parapheurId, signataire.id, mode, signataire.nom || signataire.email, leaf.serial, issuer, fingerprint, leaf.certPem, signingTime]
        );
        return { serial: leaf.serial, fingerprint, issuer };
    } catch (e) {
        console.warn('[PARAPHEUR] certificat de signature non généré:', e.message);
        return null;
    }
}

/**
 * Sceau de fin de circuit : appose une signature PAdES (certificat éphémère
 * émis par l'AC interne) sur chaque document signable qui n'en porte pas déjà.
 */
async function sealParapheur(parapheurId) {
    const settings = await getParapheurSettings();
    if (settings && settings.seal_enabled === false) return { sealed: 0, skipped: true };
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!p) return null;
    const ca = await ensurePlatformCa();
    if (!ca || !ca.keyPem) return { sealed: 0 };

    // On reconstruit d'abord les PDF visuels à partir de toutes les signatures
    // appliquées (mention incluse) avant d'y apposer le sceau cryptographique :
    // garantit que rien n'est perdu, y compris la signature/mention du dernier
    // signataire.
    try { await regenerateSignedDocs(parapheurId); } catch (e) { console.warn('[PARAPHEUR] régénération avant sceau:', e.message); }

    const docs = await pgDb.all(
        `SELECT * FROM hub_parapheur.documents WHERE parapheur_id = ? AND COALESCE(is_annexe, FALSE) = FALSE ORDER BY sort_order, id`,
        [parapheurId]
    );
    let sealed = 0;
    let lastSerial = null;
    for (const doc of docs) {
        if (doc.has_pades) continue;
        const srcPath = doc.signed_path || doc.storage_path;
        if (!srcPath) continue;
        try {
            const buf = await readStorageFile(srcPath);
            const sealCert = issueLeafCertificate(ca, {
                cn: `Sceau parapheur ${p.reference || p.id}`,
                organizationName: "Ville d'Ivry-sur-Seine",
                organizationalUnitName: 'DSI',
            });
            const password = crypto.randomBytes(16).toString('hex');
            const p12 = p12BufferFromKeyAndChain(sealCert.keyPem, [sealCert.certPem, ca.certPem], password);
            const sealedBuf = await applyPadesToBuffer(buf, p12, password, {
                name: `Sceau plateforme — ${p.reference || p.id}`,
                reason: `Sceau de fin de circuit — ${p.title || ''}`.trim(),
                pos: { page: 1, xPct: 90, yPct: 96, w: 60, h: 18 },
            });
            const base = String(doc.original_name || 'document.pdf').replace(/\.pdf$/i, '');
            const saved = await storage.saveFile(MODULE, `${parapheurId}`, { buffer: sealedBuf, originalname: `${base}_signe.pdf` });
            const sealedHash = sha256(sealedBuf);
            await pgDb.run(
                `UPDATE hub_parapheur.documents SET signed_path = ?, has_pades = TRUE, seal_cert_pem = ?, seal_hash = ?, sealed_at = NOW() WHERE id = ?`,
                [saved.dbPath, sealCert.certPem, sealedHash, doc.id]
            );
            lastSerial = sealCert.serial;
            sealed++;
        } catch (e) {
            console.error('[PARAPHEUR] sceau de fin de circuit échoué (document', doc.id, '):', e.message);
        }
    }
    if (sealed > 0) {
        await pgDb.run(`UPDATE hub_parapheur.parapheurs SET sealed_at = NOW(), seal_serial = ? WHERE id = ?`, [lastSerial, parapheurId]);
        await audit(parapheurId, 'plateforme', 'sceau', { documents: sealed, serial: lastSerial }, null);
    }
    return { sealed };
}

/**
 * Vérification — par DSIHUB lui-même — du sceau de la plateforme :
 *  - le certificat de sceau a bien été émis par notre AC interne (chaîne) ;
 *  - le fichier scellé n'a pas été modifié depuis (empreinte SHA-256).
 * (Le « signataire inconnu » affiché par Acrobat vient seulement du fait que
 * l'AC interne n'est pas déployée dans le magasin de confiance du poste.)
 */
async function verifyParapheurSeal(parapheurId) {
    const p = await pgDb.get(`SELECT id, reference, sealed_at, seal_serial FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!p) return null;
    const ca = await getPlatformCa();
    let caCert = null;
    try { if (ca && ca.certPem) caCert = forge.pki.certificateFromPem(ca.certPem); } catch { caCert = null; }

    const docs = await pgDb.all(
        `SELECT id, original_name, has_pades, signed_path, seal_cert_pem, seal_hash, sealed_at
         FROM hub_parapheur.documents WHERE parapheur_id = ? AND COALESCE(is_annexe, FALSE) = FALSE ORDER BY sort_order, id`,
        [parapheurId]
    );

    let allValid = docs.length > 0;
    const documents = [];
    for (const d of docs) {
        let hashOk = null;
        if (d.seal_hash && d.signed_path) {
            try {
                const buf = await readStorageFile(d.signed_path);
                hashOk = sha256(buf) === d.seal_hash;
            } catch { hashOk = null; }
        }
        let chainOk = null;
        let certificate = null;
        if (d.seal_cert_pem) {
            try {
                const cert = forge.pki.certificateFromPem(d.seal_cert_pem);
                certificate = {
                    subject: cert.subject.getField('CN')?.value || null,
                    serial: cert.serialNumber || null,
                    valid_to: cert.validity.notAfter ? cert.validity.notAfter.toISOString() : null,
                    fingerprint: certFingerprintSha256(d.seal_cert_pem),
                };
                chainOk = caCert ? cert.verify(caCert) : null;
            } catch { chainOk = null; }
        }
        const valid = !!(d.has_pades && hashOk === true && chainOk === true);
        if (!valid) allValid = false;
        documents.push({
            id: d.id,
            original_name: d.original_name,
            has_seal: !!d.has_pades,
            sealed_at: d.sealed_at,
            hash_ok: hashOk,
            chain_ok: chainOk,
            valid,
            certificate,
        });
    }

    return {
        reference: p.reference,
        sealed_at: p.sealed_at,
        seal_serial: p.seal_serial,
        ca: ca ? { subject: ca.subject, serial: ca.serial, fingerprint: ca.fingerprint, valid_to: ca.valid_to } : null,
        all_valid: allValid,
        documents,
    };
}

async function verifyParapheurSealByToken(token) {
    if (!token) return null;
    const p = await pgDb.get(`SELECT id FROM hub_parapheur.parapheurs WHERE public_token = ?`, [token]);
    if (!p) return null;
    return verifyParapheurSeal(p.id);
}

/** Extrait les données binaires d'une dataURL (data:image/png;base64,...). */
function decodeDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// ─── Éligibilité « signature sécurisée » (DG / directeurs) ────────────────────
// Réutilise la liste d'encadrants (oracle.rh_v_extract_dsi + emails AD) exposée
// par le module RH, avec un cache mémoire de 15 min (même logique que
// tickets/request-forms.controller.js).
let encadrantsRoleCache = { map: null, expiresAt: 0 };

async function getEncadrantsRoleMap() {
    if (encadrantsRoleCache.map && Date.now() < encadrantsRoleCache.expiresAt) {
        return encadrantsRoleCache.map;
    }
    const map = new Map();
    try {
        const encadrantsController = require('../rh/encadrants.controller');
        await new Promise((resolve) => {
            const fakeRes = {
                status: () => fakeRes,
                json: (data) => {
                    (Array.isArray(data) ? data : []).forEach((e) => {
                        if (e.email) map.set(String(e.email).toLowerCase(), e.role);
                    });
                    resolve();
                },
            };
            Promise.resolve(encadrantsController.getEncadrants({}, fakeRes)).catch(() => resolve());
        });
    } catch (e) {
        console.warn('[PARAPHEUR] éligibilité sécurisée indisponible:', e.message);
    }
    encadrantsRoleCache = { map, expiresAt: Date.now() + 15 * 60 * 1000 };
    return map;
}

async function getEligibleEmails() {
    const map = await getEncadrantsRoleMap();
    const out = [];
    for (const [email, role] of map.entries()) {
        if (role === 'dg' || role === 'directeur') out.push({ email, role });
    }
    return out;
}

/** Met un intitulé en casse « Titre » (Directeur Des Système D'Informations). */
// Le référentiel RH Oracle stocke les intitulés en majuscules SANS accents
// (ex. « SYSTEMES D'INFORMATION »). On rétablit les accents des mots courants.
const FR_ACCENTS = {
    systemes: 'systèmes', systeme: 'système', numerique: 'numérique', numeriques: 'numériques',
    reseau: 'réseau', reseaux: 'réseaux', telephonie: 'téléphonie', telecommunication: 'télécommunication',
    telecommunications: 'télécommunications', general: 'général', generale: 'générale', generaux: 'généraux',
    delegation: 'délégation', education: 'éducation', sante: 'santé', batiment: 'bâtiment',
    marche: 'marché', marches: 'marchés', dechets: 'déchets', etat: 'état', medecin: 'médecin',
    medico: 'médico', periscolaire: 'périscolaire', ingenierie: 'ingénierie', regie: 'régie',
    referent: 'référent', referente: 'référente', evenementiel: 'événementiel', developpement: 'développement',
    amenagement: 'aménagement', electromecanique: 'électromécanique', electricite: 'électricité',
    electronique: 'électronique', mecanique: 'mécanique', genie: 'génie', accessibilite: 'accessibilité',
    prefiguration: 'préfiguration', evaluation: 'évaluation', prevention: 'prévention', securite: 'sécurité',
    surete: 'sûreté', hygiene: 'hygiène', financier: 'financier', financiere: 'financière',
    financieres: 'financières', comptabilite: 'comptabilité', citoyennete: 'citoyenneté',
    emploi: 'emploi', insertion: 'insertion', environnement: 'environnement', patrimoine: 'patrimoine',
};

const FR_SMALL_WORDS = new Set(['de', 'des', 'du', 'd', 'la', 'le', 'les', 'l', 'et', 'a', 'au', 'aux', 'en', 'sur', 'sous', 'pour', 'par', 'dans', 'avec', 'sans', 'ou', 'ni', 'the', 'of', 'and']);
const frAccent = (w) => FR_ACCENTS[w] || w;

function titleCaseFr(s) {
    if (!s) return s;
    const cleaned = String(s)
        .replace(/\s*[·•]\s*trice\b/gi, '')
        .replace(/[·•]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
    return cleaned.toLowerCase().split(' ').map((w, i) => {
        const acc = frAccent(w);
        if (i === 0) return cap(acc);
        const elision = acc.match(/^([a-zà-ÿ]{1,3}')(.+)$/);
        if (elision) {
            return /^(d|l|qu|j|n|s|t|c|m)'$/.test(elision[1]) ? elision[1] + cap(frAccent(elision[2])) : cap(acc);
        }
        if (FR_SMALL_WORDS.has(w)) return acc;
        return cap(acc);
    }).join(' ');
}

/**
 * Intitulé de poste (titre) d'un agent, depuis le référentiel RH Oracle.
 * Sert de valeur par défaut (modifiable) lors de l'envoi en signature.
 */
async function getAgentTitre({ matricule } = {}) {
    if (!matricule) return { titre: null, raw: null };
    try {
        const row = await pgDb.get(
            `SELECT "POSTE_L", "FONCTION_L" FROM oracle.rh_v_extract_dsi WHERE "MATRICULE" = ? LIMIT 1`,
            [String(matricule).trim()]
        );
        // Le libellé attendu (« Directeur des Systèmes d'Information ») est porté
        // par POSTE_L. FONCTION_L contient la famille de métier générique
        // (ex. « Directeur et expertise informatique » pour MARC CHEVALIER).
        const raw = row ? (row.POSTE_L || row.FONCTION_L || null) : null;
        return { titre: raw ? titleCaseFr(raw) : null, raw: raw || null };
    } catch (e) {
        console.warn('[PARAPHEUR] titre agent indisponible:', e.message);
        return { titre: null, raw: null };
    }
}

// ─── Délégations de signature (de date à date) ───────────────────────────────
// Un agent (délégant) peut désigner un autre agent (délégataire) qui signera en
// son nom sur la période choisie. Interdit pour la signature sécurisée P12 : le
// certificat appartient en propre au signataire.

function pad2(n) { return String(n).padStart(2, '0'); }

/** Normalise une valeur DATE en 'YYYY-MM-DD' (fuseau local). */
function dateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isValidDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function mapDelegation(r) {
    if (!r) return null;
    const start = dateOnly(r.date_start);
    const end = dateOnly(r.date_end);
    const today = dateOnly(new Date());
    return {
        id: r.id,
        delegant_email: r.delegant_email,
        delegant_name: r.delegant_name,
        delegate_email: r.delegate_email,
        delegate_name: r.delegate_name,
        delegate_agent_id: r.delegate_agent_id,
        date_start: start,
        date_end: end,
        created_at: r.created_at,
        active: !!(start && end && today >= start && today <= end),
    };
}

async function listDelegations(email) {
    if (!email) return [];
    const rows = await pgDb.all(
        `SELECT * FROM hub_parapheur.delegations
         WHERE LOWER(delegant_email) = LOWER(?) OR LOWER(delegate_email) = LOWER(?)
         ORDER BY date_start DESC, id DESC`,
        [email, email]
    );
    return rows.map(mapDelegation);
}

async function saveDelegation(email, name, payload = {}) {
    const delegantEmail = String(email || '').toLowerCase().trim();
    if (!delegantEmail) throw { status: 400, message: 'Utilisateur non identifié.' };
    const delegateEmail = String(payload.delegateEmail || '').toLowerCase().trim();
    if (!delegateEmail) throw { status: 400, message: 'Choisissez un délégataire.' };
    if (delegateEmail === delegantEmail) throw { status: 400, message: 'Vous ne pouvez pas vous déléguer à vous-même.' };
    const dateStart = String(payload.dateStart || '').slice(0, 10);
    const dateEnd = String(payload.dateEnd || '').slice(0, 10);
    if (!isValidDateStr(dateStart) || !isValidDateStr(dateEnd)) {
        throw { status: 400, message: 'Indiquez une date de début et une date de fin.' };
    }
    if (dateEnd < dateStart) throw { status: 400, message: 'La date de fin doit être postérieure à la date de début.' };

    const delegateName = String(payload.delegateName || '').slice(0, 200) || delegateEmail;
    const delegateAgentId = Number.isFinite(Number(payload.delegateAgentId)) ? Number(payload.delegateAgentId) : null;

    const existing = await pgDb.get(
        `SELECT id FROM hub_parapheur.delegations WHERE LOWER(delegant_email) = LOWER(?) ORDER BY id DESC LIMIT 1`,
        [delegantEmail]
    );
    if (existing) {
        await pgDb.run(
            `UPDATE hub_parapheur.delegations
             SET delegant_name = ?, delegate_email = ?, delegate_name = ?, delegate_agent_id = ?,
                 date_start = ?, date_end = ?, updated_at = NOW()
             WHERE id = ?`,
            [name || null, delegateEmail, delegateName, delegateAgentId, dateStart, dateEnd, existing.id]
        );
    } else {
        await pgDb.run(
            `INSERT INTO hub_parapheur.delegations
                (delegant_email, delegant_name, delegate_email, delegate_name, delegate_agent_id, date_start, date_end, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [delegantEmail, name || null, delegateEmail, delegateName, delegateAgentId, dateStart, dateEnd, delegantEmail]
        );
    }
    return { success: true };
}

async function deleteDelegation(id, email, admin = false) {
    const row = await pgDb.get(`SELECT * FROM hub_parapheur.delegations WHERE id = ?`, [id]);
    if (!row) throw { status: 404, message: 'Délégation introuvable.' };
    if (!admin && String(row.delegant_email || '').toLowerCase() !== String(email || '').toLowerCase()) {
        throw { status: 403, message: 'Vous ne pouvez supprimer que vos propres délégations.' };
    }
    await pgDb.run(`DELETE FROM hub_parapheur.delegations WHERE id = ?`, [id]);
    return { success: true };
}

/** Délégation active autorisant delegateEmail à signer pour delegantEmail. */
async function getActiveDelegation(delegantEmail, delegateEmail) {
    if (!delegantEmail || !delegateEmail) return null;
    const rows = await pgDb.all(
        `SELECT * FROM hub_parapheur.delegations
         WHERE LOWER(delegant_email) = LOWER(?) AND LOWER(delegate_email) = LOWER(?)
         ORDER BY date_start DESC`,
        [delegantEmail, delegateEmail]
    );
    const today = dateOnly(new Date());
    for (const r of rows) {
        const start = dateOnly(r.date_start);
        const end = dateOnly(r.date_end);
        if (start && end && today >= start && today <= end) return mapDelegation(r);
    }
    return null;
}

// ─── Création ────────────────────────────────────────────────────────────────

async function activateSignataires(parapheur, signataires, ip) {
    const now = new Date();
    // Validité du lien : durée choisie pour les signataires extérieurs ; les
    // signataires internes conservent une validité longue (30 jours).
    const p = await pgDb.get('SELECT link_validity_minutes FROM hub_parapheur.parapheurs WHERE id = ?', [parapheur.id]).catch(() => null);
    const linkMin = Number(parapheur.link_validity_minutes || (p && p.link_validity_minutes)) || 10;
    for (const s of signataires) {
        const isExternal = s.is_external === true;
        const ms = isExternal ? linkMin * 60 * 1000 : TOKEN_EXPIRY_DAYS * 24 * 3600 * 1000;
        const expires = new Date(now.getTime() + ms);
        const token = s.token || generateToken();
        await pgDb.run(
            `UPDATE hub_parapheur.signataires
             SET status = 'en_cours', token = ?, token_expires_at = ?, last_reminder_at = ?, activation_notified_at = NULL
             WHERE id = ?`,
            [token, expires.toISOString(), now.toISOString(), s.id]
        );
        s.token = token;
        s.status = 'en_cours';
        // L'e-mail n'est pas envoyé immédiatement : il est regroupé par le
        // digest périodique (intervalle paramétrable), afin de combiner
        // plusieurs nouveaux parapheurs en un seul message.
    }
    await audit(parapheur.id, 'système', 'activation', { signataires: signataires.map(s => s.id) }, ip);
}

async function sendSignerMail(parapheur, signataire) {
    if (!signataire.email) return;
    try {
        // Lien de signature via l'URL publique externe (mobilité) si configurée.
        const base = await getSignatureBaseUrl();
        const link = `${base}/signature/${signataire.token}`;
        const docs = await pgDb.all(
            `SELECT original_name FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`,
            [parapheur.id]
        );
        const tpl = emailTemplates.signatureRequest({
            signataireNom: signataire.nom,
            requesterName: parapheur.created_by_name || parapheur.created_by_username || 'La DSI',
            title: parapheur.title,
            reference: parapheur.reference,
            documents: docs,
            link,
            deadline: parapheur.deadline,
            mode: parapheur.mode,
            frontUrl: base,
        });
        await sendParapheurEmail(signataire.email, tpl);
    } catch (e) {
        console.warn('[PARAPHEUR] envoi mail signataire échoué:', e.message);
    }
}

/** Compte les pages d'un PDF (best effort : null si le fichier est illisible). */
async function countPdfPages(buffer) {
    try {
        const d = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return d.getPageCount();
    } catch {
        return null;
    }
}

async function createParapheur({ files, annexes, payload, user, req }) {
    const title = String(payload.title || '').trim();
    if (!title) throw { status: 400, message: 'Titre requis' };
    files = Array.isArray(files) ? files : [];
    annexes = Array.isArray(annexes) ? annexes : [];
    if (files.length === 0) throw { status: 400, message: 'Au moins un document PDF à signer est requis' };
    for (const f of [...files, ...annexes]) {
        const ok = (f.mimetype === 'application/pdf') || /\.pdf$/i.test(f.originalname || '');
        if (!ok) throw { status: 400, message: `Seuls les PDF sont acceptés (${f.originalname})` };
    }
    const signataires = Array.isArray(payload.signataires) ? payload.signataires : [];
    if (signataires.length === 0) throw { status: 400, message: 'Au moins un signataire est requis' };
    for (const s of signataires) {
        if (!s.email) throw { status: 400, message: 'Chaque signataire doit avoir un email' };
    }
    // Circuits : « puis » (sequentiel), « et » (parallele) et « ou » (alternative).
    const mode = ['sequentiel', 'parallele', 'alternative'].includes(payload.mode) ? payload.mode : 'parallele';
    const ip = getClientIp(req);
    const year = new Date().getFullYear();
    // Nom d'affichage « Prénom Nom » du demandeur (le JWT peut ne porter que le
    // username) : on le résout depuis hub.users/magapp.users.
    const createdByName = user.displayName || await resolveAgentDisplayName(user.username, user.username);

    const linkValidity = normalizeLinkValidity(payload.link_validity_minutes);
    const publicToken = generateToken();
    const pRes = await pgDb.run(
        `INSERT INTO hub_parapheur.parapheurs
            (title, message, status, mode, deadline, public_token, link_validity_minutes, created_by_username, created_by_name, created_by_email)
         VALUES (?, ?, 'en_cours', ?, ?, ?, ?, ?, ?, ?)`,
        [
            title,
            payload.message || '',
            mode,
            payload.deadline || null,
            publicToken,
            linkValidity,
            user.username || null,
            createdByName || null,
            user.email || null,
        ]
    );
    const parapheurId = pRes.lastID;
    const reference = `PARA-${year}-${String(parapheurId).padStart(4, '0')}`;
    await pgDb.run(`UPDATE hub_parapheur.parapheurs SET reference = ? WHERE id = ?`, [reference, parapheurId]);

    // Documents (à signer) puis annexes (PDF complémentaires, non signés).
    const docIds = [];
    let order = 0;
    const persistDocument = async (file, isAnnexe) => {
        if (file.originalname) file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(MODULE, parapheurId, file);
        const hash = sha256(file.buffer);
        const pageCount = await countPdfPages(file.buffer);
        const dRes = await pgDb.run(
            `INSERT INTO hub_parapheur.documents
                (parapheur_id, original_name, storage_path, mime_type, size, doc_hash, sort_order, is_annexe, page_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                parapheurId,
                file.originalname || 'document.pdf',
                saved.dbPath,
                file.mimetype || 'application/pdf',
                file.size || null,
                hash,
                order++,
                isAnnexe,
                pageCount,
            ]
        );
        const docId = dRes.lastID;
        if (!isAnnexe) docIds.push(docId);
        try {
            await docsService.registerExternalUpload({
                module: 'parapheur',
                entityType: isAnnexe ? 'annexe' : 'document',
                entityId: docId,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: file.mimetype || 'application/pdf',
                size: file.size,
                storageRef: saved.dbPath,
                uploadedBy: user.username || null,
                metadata: { parapheur_id: parapheurId, reference, is_annexe: isAnnexe, page_count: pageCount },
            });
        } catch (e) {
            console.warn('[PARAPHEUR] register GED échoué:', e.message);
        }
    };
    for (const file of files) await persistDocument(file, false);
    for (const file of annexes) await persistDocument(file, true);

    // Signataires + positions
    const inserted = [];
    let idx = 0;
    for (const s of signataires) {
        const sRes = await pgDb.run(
            `INSERT INTO hub_parapheur.signataires
                (parapheur_id, agent_id, nom, email, service, order_number, status, signature_mode, sms_phone, signature_title, is_external)
             VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?, ?)`,
            [
                parapheurId,
                Number.isFinite(Number(s.agentId)) ? Number(s.agentId) : null,
                s.nom || s.email,
                String(s.email).toLowerCase(),
                s.service || null,
                idx,
                ['securise', 'sms'].includes(s.signatureMode) ? s.signatureMode : 'simple',
                s.smsPhone ? String(s.smsPhone).replace(/\s/g, '') : null,
                s.title ? String(s.title).trim().slice(0, 200) : null,
                s.external === true,
            ]
        );
        const sid = sRes.lastID;
        const positions = Array.isArray(s.positions) ? s.positions : [];
        for (const pos of positions) {
            const targetDocId = docIds[parseInt(pos.documentIndex, 10)] || pos.documentId;
            if (!targetDocId) continue;
            await pgDb.run(
                `INSERT INTO hub_parapheur.signatures
                    (signataire_id, document_id, page, x_pct, y_pct, w_pt, h_pt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    sid,
                    targetDocId,
                    Math.max(1, parseInt(pos.page, 10) || 1),
                    Number(pos.x) || 75,
                    Number(pos.y) || 85,
                    Number(pos.w) || 150,
                    Number(pos.h) || 60,
                ]
            );
        }
        inserted.push({ id: sid, nom: s.nom || s.email, email: String(s.email).toLowerCase(), token: null, status: 'en_attente', is_external: s.external === true });
        idx++;
    }

    const parapheur = { id: parapheurId, title, reference, mode, deadline: payload.deadline || null, created_by_name: createdByName, created_by_username: user.username };

    // Activation initiale : tous les signataires en « et » et en « ou »
    // (n'importe lequel peut signer), le premier seulement en « puis ».
    let initial;
    if (mode === 'sequentiel') {
        initial = inserted.length ? [inserted[0]] : [];
    } else {
        initial = inserted;
    }
    if (initial.length) await activateSignataires(parapheur, initial, ip);

    await audit(parapheurId, user.username, 'creation', { documents: files.length, annexes: annexes.length, signataires: inserted.length, mode }, ip);

    return { id: parapheurId, reference };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

function mapParapheur(p) {
    if (!p) return null;
    return {
        id: p.id,
        reference: p.reference,
        title: p.title,
        message: p.message,
        status: p.status,
        mode: p.mode,
        deadline: p.deadline,
        created_by_username: p.created_by_username,
        created_by_name: p.created_by_name,
        created_by_email: p.created_by_email,
        created_at: p.created_at,
        completed_at: p.completed_at,
        cancelled_at: p.cancelled_at,
        sealed_at: p.sealed_at || null,
        seal_serial: p.seal_serial || null,
    };
}

async function listCreated(username) {
    const rows = await pgDb.all(
        `SELECT p.*,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS nb_signataires,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id AND s.status = 'a_signe') AS nb_signes,
            (SELECT COUNT(*) FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS nb_documents,
            (SELECT string_agg(s.nom, ', ' ORDER BY s.order_number, s.id) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS signataires_text
         FROM hub_parapheur.parapheurs p
         WHERE p.created_by_username = ?
         ORDER BY p.created_at DESC`,
        [username]
    );
    const out = rows.map(r => ({ ...mapParapheur(r), nb_signataires: Number(r.nb_signataires), nb_signes: Number(r.nb_signes), nb_documents: Number(r.nb_documents), signataires_text: r.signataires_text || '' }));
    return attachCreatorDisplayNames(out);
}

async function listAll() {
    const rows = await pgDb.all(
        `SELECT p.*,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS nb_signataires,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id AND s.status = 'a_signe') AS nb_signes,
            (SELECT COUNT(*) FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS nb_documents,
            (SELECT string_agg(s.nom, ', ' ORDER BY s.order_number, s.id) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS signataires_text
         FROM hub_parapheur.parapheurs p
         ORDER BY p.created_at DESC`
    );
    const out = rows.map(r => ({ ...mapParapheur(r), nb_signataires: Number(r.nb_signataires), nb_signes: Number(r.nb_signes), nb_documents: Number(r.nb_documents), signataires_text: r.signataires_text || '' }));
    return attachCreatorDisplayNames(out);
}

async function deleteParapheur(id) {
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [id]);
    if (!p) throw { status: 404, message: 'Parapheur introuvable' };

    // Suppression des fichiers (originaux, signés, images de signature)
    const docs = await pgDb.all(`SELECT storage_path, signed_path FROM hub_parapheur.documents WHERE parapheur_id = ?`, [id]);
    for (const d of docs) {
        for (const pth of [d.storage_path, d.signed_path]) {
            if (pth) { try { await storage.deleteFile(pth); } catch (e) { /* ignore */ } }
        }
    }
    const sigs = await pgDb.all(`SELECT signature_image_path FROM hub_parapheur.signataires WHERE parapheur_id = ?`, [id]);
    for (const s of sigs) {
        if (s.signature_image_path) { try { await storage.deleteFile(s.signature_image_path); } catch (e) { /* ignore */ } }
    }

    // Les documents / signataires / signatures sont supprimés en cascade.
    await pgDb.run(`DELETE FROM hub_parapheur.audit_log WHERE parapheur_id = ?`, [id]);
    await pgDb.run(`DELETE FROM hub_parapheur.parapheurs WHERE id = ?`, [id]);
    return { success: true };
}

async function listForEmail(email, { signed }) {
    const statuses = signed ? ['a_signe', 'refuse'] : ['en_attente', 'en_cours'];
    const rows = await pgDb.all(
        `SELECT p.*, s.id AS signataire_id, s.status AS signataire_status, s.order_number,
                (SELECT COUNT(*) FROM hub_parapheur.signataires x WHERE x.parapheur_id = p.id) AS nb_signataires,
                (SELECT COUNT(*) FROM hub_parapheur.signataires x WHERE x.parapheur_id = p.id AND x.status = 'a_signe') AS nb_signes,
                (SELECT string_agg(x.nom, ', ' ORDER BY x.order_number, x.id) FROM hub_parapheur.signataires x WHERE x.parapheur_id = p.id) AS signataires_text
         FROM hub_parapheur.signataires s
         JOIN hub_parapheur.parapheurs p ON p.id = s.parapheur_id
         WHERE LOWER(s.email) = LOWER(?)
           AND s.status IN (${statuses.map(() => '?').join(',')})
           ${signed ? '' : "AND p.status = 'en_cours'"}
         ORDER BY p.created_at DESC`,
        [email, ...statuses]
    );
    const out = rows.map(r => ({
        ...mapParapheur(r),
        signataire_id: r.signataire_id,
        signataire_status: r.signataire_status,
        order_number: r.order_number,
        nb_signataires: Number(r.nb_signataires),
        nb_signes: Number(r.nb_signes),
        signataires_text: r.signataires_text || '',
    }));
    return attachCreatorDisplayNames(out);
}

/**
 * Accepte un identifiant numérique OU une référence lisible (« PARA-2026-0030 »).
 * Les clients machine (ex. VibeDélib) peuvent ainsi interroger/annuler par référence ;
 * un identifiant non numérique ne doit JAMAIS être passé tel quel à SQL (NaN → colonne inexistante).
 * Renvoie l'id numérique, ou null si aucun dossier ne correspond.
 */
async function resolveParapheurId(idOrRef) {
    const brut = String(idOrRef == null ? '' : idOrRef).trim();
    if (/^\d+$/.test(brut)) {
        const p = await pgDb.get(`SELECT id FROM hub_parapheur.parapheurs WHERE id = ?`, [parseInt(brut, 10)]);
        return p ? p.id : null;
    }
    const ref = await pgDb.get(`SELECT id FROM hub_parapheur.parapheurs WHERE reference = ?`, [brut]);
    return ref ? ref.id : null;
}

async function getDetail(id) {
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [id]);
    if (!p) return null;
    const documents = await pgDb.all(`SELECT * FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [id]);
    const signataires = await pgDb.all(`SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`, [id]);
    const certs = await pgDb.all(
        `SELECT LOWER(email) AS email, subject, issuer, serial, valid_from, valid_to, filename FROM hub_parapheur.agent_certificates`
    );
    const certByEmail = new Map(certs.map(c => [c.email, c]));
    const techCerts = await pgDb.all(
        `SELECT signataire_id, serial, issuer, fingerprint, signing_time FROM hub_parapheur.signature_certificates WHERE parapheur_id = ? ORDER BY id DESC`,
        [id]
    );
    const techBySigner = new Map();
    for (const t of techCerts) if (!techBySigner.has(t.signataire_id)) techBySigner.set(t.signataire_id, t);
    const signatures = await pgDb.all(
        `SELECT s.* FROM hub_parapheur.signatures s
         JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
         WHERE sg.parapheur_id = ?`,
        [id]
    );
    // Signatures P12 (certificat personnel du signataire) réellement apposées, par
    // document : permet de distinguer une signature P12 d'un simple sceau de
    // plateforme (les deux produisent une signature cryptographique dans le PDF).
    const p12Rows = await pgDb.all(
        `SELECT DISTINCT s.document_id
         FROM hub_parapheur.signatures s
         JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
         WHERE sg.parapheur_id = ? AND sg.signature_mode = 'securise' AND sg.status = 'a_signe'`,
        [id]
    );
    const p12Docs = new Set(p12Rows.map(r => Number(r.document_id)));
    const auditLog = await pgDb.all(
        `SELECT * FROM hub_parapheur.audit_log WHERE parapheur_id = ? ORDER BY created_at DESC LIMIT 100`,
        [id]
    );
    const createdByName = await resolveAgentDisplayName(p.created_by_username, p.created_by_name);
    return {
        ...mapParapheur(p),
        created_by_name: createdByName || p.created_by_name || p.created_by_username,
        documents: await Promise.all(documents.map(async d => ({
            id: d.id,
            original_name: d.original_name,
            mime_type: d.mime_type,
            size: d.size,
            sort_order: d.sort_order,
            is_annexe: !!d.is_annexe,
            page_count: d.page_count,
            has_signed: !!d.signed_path,
            has_pades: !!d.has_pades,
            has_p12_signature: p12Docs.has(d.id),
            has_crypto_signature: d.signed_path ? await pdfHasSignature(d.signed_path) : false,
            doc_hash: d.doc_hash,
        }))),
        signataires: signataires.map(s => ({
            id: s.id,
            agent_id: s.agent_id,
            nom: s.nom,
            email: s.email,
            service: s.service,
            order_number: s.order_number,
            status: s.status,
            signature_mode: s.signature_mode,
            signed_at: s.signed_at,
            rejected_at: s.rejected_at,
            rejection_comment: s.rejection_comment,
            has_signature: !!s.signature_image_path,
            signed_by_name: (s.signed_by_name && s.signed_by_name !== s.nom) ? s.signed_by_name : null,
            signed_by_email: s.signed_by_email || null,
            signature_note: s.signature_note || null,
            technique_certificate: (() => {
                const t = techBySigner.get(s.id);
                return t ? { serial: t.serial, issuer: t.issuer, fingerprint: t.fingerprint, signing_time: t.signing_time } : null;
            })(),
            certificate: (() => {
                // Le certificat personnel n'est exposé que pour une signature
                // réellement sécurisée (P12), jamais pour une signature simple/SMS
                // (même si un certificat est enregistré par ailleurs pour l'agent).
                if (s.signature_mode !== 'securise') return null;
                const c = certByEmail.get(String(s.email || '').toLowerCase());
                if (!c) return null;
                return {
                    subject: c.subject || null,
                    issuer: c.issuer || null,
                    serial: c.serial || null,
                    valid_from: c.valid_from || null,
                    valid_to: c.valid_to || null,
                    filename: c.filename || null,
                };
            })(),
        })),
        signatures: signatures.map(s => ({
            signataire_id: s.signataire_id,
            document_id: s.document_id,
            page: s.page,
            x: Number(s.x_pct),
            y: Number(s.y_pct),
            w: s.w_pt,
            h: s.h_pt,
            applied: s.applied,
        })),
        audit: auditLog.map(a => ({ actor: a.actor, action: a.action, details: a.details, ip: a.ip, created_at: a.created_at })),
    };
}

async function getSignerByToken(token) {
    if (!token) return null;
    return pgDb.get(`SELECT * FROM hub_parapheur.signataires WHERE token = ?`, [token]);
}

async function getPublicInfo(token, req) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    if (!p) throw { status: 404, message: 'Parapheur introuvable.' };

    if (signataire.token_expires_at && new Date(signataire.token_expires_at) < new Date() && signataire.status === 'en_cours') {
        throw { status: 410, message: 'Ce lien de signature a expiré. Contactez le demandeur.' };
    }

    const documents = await pgDb.all(
        `SELECT id, original_name, mime_type, size, is_annexe, page_count FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`,
        [p.id]
    );
    const signatures = await pgDb.all(
        `SELECT document_id, page, x_pct, y_pct, w_pt, h_pt, applied FROM hub_parapheur.signatures WHERE signataire_id = ?`,
        [signataire.id]
    );

    // Délégation éventuelle : le délégataire agit pour le compte du délégant.
    const delegation = (req && req.delegation
        && String(req.delegation.delegant_email || '').toLowerCase() === String(signataire.email || '').toLowerCase())
        ? req.delegation : null;
    const actingAsDelegate = !!delegation;
    const signatureOwnerEmail = actingAsDelegate ? delegation.delegate_email : signataire.email;
    const memorized = await pgDb.get(
        `SELECT storage_path FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`,
        [signatureOwnerEmail]
    );

    // Détails des signatures déjà apposées (bandeau de type Acrobat dans la visionneuse).
    const signedRows = await pgDb.all(
        `SELECT id, nom, email, signature_mode, signed_at, signed_by_name, signature_note FROM hub_parapheur.signataires
         WHERE parapheur_id = ? AND status = 'a_signe' ORDER BY order_number, id`,
        [p.id]
    );
    const certRows = await pgDb.all(
        `SELECT LOWER(email) AS email, subject, issuer, serial, valid_from, valid_to FROM hub_parapheur.agent_certificates`
    );
    const certByEmail = new Map(certRows.map(c => [c.email, c]));
    const techCerts = await pgDb.all(
        `SELECT signataire_id, serial, issuer, fingerprint, signing_time FROM hub_parapheur.signature_certificates WHERE parapheur_id = ? ORDER BY id DESC`,
        [p.id]
    );
    const techBySigner = new Map();
    for (const t of techCerts) if (!techBySigner.has(t.signataire_id)) techBySigner.set(t.signataire_id, t);
    const signaturesSummary = signedRows.map(s => {
        const c = certByEmail.get(String(s.email || '').toLowerCase());
        const t = techBySigner.get(s.id);
        return {
            name: s.nom,
            mode: s.signature_mode,
            signed_at: s.signed_at,
            delegated_by: (s.signed_by_name && s.signed_by_name !== s.nom) ? s.signed_by_name : null,
            note: s.signature_note || null,
            technique_certificate: t ? { serial: t.serial, issuer: t.issuer, fingerprint: t.fingerprint, signing_time: t.signing_time } : null,
            certificate: s.signature_mode === 'securise' && c ? {
                subject: c.subject || null,
                issuer: c.issuer || null,
                serial: c.serial || null,
                valid_from: c.valid_from || null,
                valid_to: c.valid_to || null,
            } : null,
        };
    });

    return {
        parapheur: {
            id: p.id,
            title: p.title,
            reference: p.reference,
            message: p.message,
            mode: p.mode,
            status: p.status,
            deadline: p.deadline,
            requester: (await resolveAgentDisplayName(p.created_by_username, p.created_by_name)) || p.created_by_username,
            bulk_sign_mention: (await getParapheurSettings()).bulk_sign_mention,
            sealed_at: p.sealed_at || null,
            seal_serial: p.seal_serial || null,
        },
        seal: p.sealed_at ? { sealed_at: p.sealed_at, serial: p.seal_serial || null } : null,
        signataire: {
            nom: signataire.nom,
            email: signataire.email,
            status: signataire.status,
            signature_mode: signataire.signature_mode,
            has_memorized_signature: !!memorized,
        },
        delegation: actingAsDelegate ? {
            delegant_nom: signataire.nom,
            delegant_email: signataire.email,
            delegate_nom: delegation.delegate_name || delegation.delegate_email,
            delegate_email: delegation.delegate_email,
            date_start: delegation.date_start,
            date_end: delegation.date_end,
        } : null,
        documents: documents.filter(d => !d.is_annexe).map(d => ({ id: d.id, original_name: d.original_name, mime_type: d.mime_type, size: d.size, page_count: d.page_count })),
        annexes: documents.filter(d => d.is_annexe).map(d => ({ id: d.id, original_name: d.original_name, mime_type: d.mime_type, size: d.size, page_count: d.page_count })),
        signatures_summary: signaturesSummary,
        positions: signatures.map(s => ({
            document_id: s.document_id,
            page: s.page,
            x: Number(s.x_pct),
            y: Number(s.y_pct),
            w: s.w_pt,
            h: s.h_pt,
            applied: s.applied,
        })),
    };
}

// ─── Signature ───────────────────────────────────────────────────────────────

function formatSignedAt(iso) {
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

async function buildSignedPdf(originalPath, sigs, ctx = {}) {
    const originalBuf = await readStorageFile(originalPath);
    const pdfDoc = await PDFDocument.load(originalBuf, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // QR code de vérification — pointe vers une page PUBLIQUE (aucune
    // authentification) accessible à toute personne disposant du lien.
    let qrImage = null;
    const qrBase = ctx.verifyBaseUrl || ctx.appBaseUrl;
    if (qrBase && ctx.publicToken) {
        try {
            const url = `${String(qrBase).replace(/\/+$/, '')}${VERIFY_PATH}/${ctx.publicToken}`;
            const qrBuf = await QRCode.toBuffer(url, { type: 'png', width: 260, margin: 1 });
            qrImage = await pdfDoc.embedPng(qrBuf);
        } catch (e) {
            console.warn('[PARAPHEUR] génération QR échouée:', e.message);
        }
    }

    for (const s of sigs) {
        // Une image de signature manquante (fichier supprimé ou déplacé sur le
        // stockage) ne doit jamais bloquer tout le circuit : on appose alors la
        // mention (nom, date) sans le tracé, au lieu d'échouer la génération.
        let image = null;
        if (s.img) {
            try {
                const imgBuf = await readStorageFile(s.img);
                const lower = String(s.img).toLowerCase();
                try {
                    image = (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
                        ? await pdfDoc.embedJpg(imgBuf)
                        : await pdfDoc.embedPng(imgBuf);
                } catch {
                    image = await pdfDoc.embedPng(imgBuf);
                }
            } catch (e) {
                console.warn('[PARAPHEUR] image de signature introuvable, tracé ignoré:', s.img);
                image = null;
            }
        }
        const idx = Math.max(0, Math.min((parseInt(s.page, 10) || 1) - 1, pages.length - 1));
        const page = pages[idx];
        const { width, height } = page.getSize();
        const w = Number(s.w_pt) || 150;
        const h = Number(s.h_pt) || 60;
        const cx = (Number(s.x_pct) / 100) * width;
        const cy = height - (Number(s.y_pct) / 100) * height;
        const boxLeft = Math.max(0, cx - w / 2);
        const boxBottom = Math.max(0, cy - h / 2);
        const boxTop = Math.min(height, cy + h / 2);

        // Libellé « signé (électroniquement) par … le … » sous la signature.
        const nom = s.nom || '';
        const delegataire = (s.signed_by_name && s.signed_by_name !== s.nom) ? s.signed_by_name : null;
        const quand = formatSignedAt(s.signed_at);
        let label;
        if (delegataire) {
            const suffix = s.signature_mode === 'sms' ? ' (vérifié par SMS)' : '';
            label = `Signé ${delegataire} par délégation de ${nom}${suffix} le ${quand}`;
        } else if (s.signature_mode === 'securise') label = `Signé électroniquement par ${nom} le ${quand}`;
        else if (s.signature_mode === 'sms') label = `Signé électroniquement par ${nom} (vérifié par SMS) le ${quand}`;
        else label = `Signé par ${nom} le ${quand}`;

        const LABEL_SIZE = 9;
        const TITLE_SIZE = 8;
        const hasTitle = !!s.signature_title;

        // La signature (image) est réduite dans la partie haute du cadre afin que
        // le nom et la fonction restent DANS le rectangle de positionnement.
        if (image) {
            const textBlockH = LABEL_SIZE + 3 + (hasTitle ? TITLE_SIZE + 3 : 0);
            const imgAreaH = Math.max(10, h - textBlockH - 3);
            const imgAreaW = w * 0.96;
            const { width: nw, height: nh } = image.scale(1);
            const ratio = nw / nh;
            let dw = imgAreaW;
            let dh = dw / ratio;
            if (dh > imgAreaH) { dh = imgAreaH; dw = dh * ratio; }
            if (dw > imgAreaW) { dw = imgAreaW; dh = dw / ratio; }
            const imgX = boxLeft + (w - dw) / 2;
            const imgY = boxTop - dh; // signature ancrée en haut du cadre
            page.drawImage(image, { x: imgX, y: imgY, width: dw, height: dh });
        }

        // Base de la mention manuscrite = coin bas-gauche du cadre.
        const x = boxLeft;
        const y = boxBottom;

        const textMaxW = Math.max(w, 260);
        const labelY = boxBottom + (hasTitle ? TITLE_SIZE + 3 : 2);
        page.drawText(label, {
            x: Math.max(2, boxLeft),
            y: Math.max(2, labelY),
            size: LABEL_SIZE,
            font,
            color: rgb(0.2, 0.2, 0.2),
            maxWidth: textMaxW,
        });

        // Intitulé de poste du signataire, sous le nom, dans le cadre.
        if (hasTitle) {
            page.drawText(String(s.signature_title), {
                x: Math.max(2, boxLeft),
                y: Math.max(2, boxBottom + 1),
                size: TITLE_SIZE,
                font,
                color: rgb(0.3, 0.3, 0.4),
                maxWidth: textMaxW,
            });
        }

        // Mention manuscrite libre (ex. « Avis favorable »), positionnée par le
        // signataire : décalage (points) depuis le coin bas-gauche de la signature.
        if (s.note_img || s.signature_note) {
            try {
                const offX = Number.isFinite(Number(s.note_offset_x)) ? Number(s.note_offset_x) : 0;
                const offY = Number.isFinite(Number(s.note_offset_y)) ? Number(s.note_offset_y) : (h + 6);
                if (s.note_img) {
                    const noteBuf = await readStorageFile(s.note_img);
                    const lowerNote = String(s.note_img).toLowerCase();
                    let noteImage;
                    try {
                        noteImage = (lowerNote.endsWith('.jpg') || lowerNote.endsWith('.jpeg'))
                            ? await pdfDoc.embedJpg(noteBuf)
                            : await pdfDoc.embedPng(noteBuf);
                    } catch {
                        noteImage = await pdfDoc.embedPng(noteBuf);
                    }
                    const noteH = Number.isFinite(Number(s.note_size)) ? Math.max(6, Math.min(40, Number(s.note_size))) : 12;
                    const ns = noteImage.scale(1);
                    const maxNoteW = Math.max(w * 1.5, 240);
                    let nh = noteH;
                    let nw = ns.width * (nh / ns.height);
                    if (nw > maxNoteW) { nw = maxNoteW; nh = ns.height * (nw / ns.width); }
                    const nx = Math.max(2, Math.min(x + offX, width - nw - 2));
                    const ny = Math.max(2, Math.min(y + offY, height - nh - 2));
                    page.drawImage(noteImage, { x: nx, y: ny, width: nw, height: nh });
                } else {
                    const noteH = Number.isFinite(Number(s.note_size)) ? Math.max(6, Math.min(40, Number(s.note_size))) : 12;
                    page.drawText(String(s.signature_note), {
                        x: Math.max(2, Math.min(x + offX, width - 60)),
                        y: Math.max(2, Math.min(y + offY, height - 14)),
                        size: Math.max(8, noteH * 0.7),
                        font,
                        color: rgb(0.12, 0.12, 0.15),
                        maxWidth: Math.max(w, 220),
                    });
                }
            } catch (e) {
                console.warn('[PARAPHEUR] mention manuscrite non ajoutée:', e.message);
            }
        }

    }

    // QR code de vérification sur TOUTES les pages du document (bas gauche).
    if (qrImage) {
        const size = 68;
        const qx = 24;
        const qy = 24;
        for (const page of pages) {
            page.drawImage(qrImage, { x: qx, y: qy, width: size, height: size });
            page.drawText('Vérifier le document', {
                x: qx,
                y: qy + size + 3,
                size: 6,
                font,
                color: rgb(0.35, 0.35, 0.35),
            });
        }
    }
    return Buffer.from(await pdfDoc.save());
}

async function regenerateSignedDocs(parapheurId, secureContext) {
    const documents = await pgDb.all(`SELECT * FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [parapheurId]);
    const publicToken = await ensurePublicToken(parapheurId);
    const verifyBaseUrl = await getVerifyBaseUrl();
    for (const doc of documents) {
        // Ne jamais écraser un PDF déjà porteur d'une signature cryptographique.
        if (doc.has_pades) continue;

        const sigs = await pgDb.all(
            `SELECT s.page, s.x_pct, s.y_pct, s.w_pt, s.h_pt, s.signed_at,
                    sg.nom, sg.signature_mode, sg.signature_image_path AS img,
                    sg.signed_by_name, sg.signed_by_email, sg.signature_title,
                    sg.signature_note, sg.signature_note_path AS note_img,
                    sg.note_offset_x, sg.note_offset_y, sg.note_size
             FROM hub_parapheur.signatures s
             JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
             WHERE s.document_id = ? AND s.applied = TRUE
             ORDER BY sg.order_number, s.id`,
            [doc.id]
        );
        if (sigs.length === 0) continue;

        let buffer = await buildSignedPdf(doc.storage_path, sigs, { appBaseUrl: await getAppBaseUrl(), verifyBaseUrl, parapheurId, publicToken });
        let hasPades = false;
        if (secureContext) {
            try {
                buffer = await applyPadesToBuffer(buffer, secureContext.p12Buffer, secureContext.password, {
                    name: secureContext.name,
                    reason: secureContext.reason,
                    pos: secureContext.positions ? secureContext.positions[doc.id] : null,
                });
                hasPades = true;
                console.log(`[PARAPHEUR] signature PAdES (P12) appliquée au document ${doc.id} (parapheur ${parapheurId})`);
            } catch (e) {
                console.error('[PARAPHEUR] signature PAdES échouée:', e.message);
                throw { status: 400, message: `Signature sécurisée impossible (certificat ou mot de passe invalide) : ${e.message}` };
            }
        }

        const base = String(doc.original_name || 'document.pdf').replace(/\.pdf$/i, '');
        const saved = await storage.saveFile(MODULE, `${parapheurId}`, { buffer, originalname: `${base}_signe.pdf` });
        await pgDb.run(`UPDATE hub_parapheur.documents SET signed_path = ?, has_pades = ? WHERE id = ?`, [saved.dbPath, hasPades, doc.id]);
    }
}

async function notifyRequester(parapheur, signataireNom, done) {
    if (!parapheur.created_by_email) return;
    try {
        const base = await getAppBaseUrl();
        const counts = await pgDb.get(
            `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'a_signe') AS signed
             FROM hub_parapheur.signataires WHERE parapheur_id = ?`,
            [parapheur.id]
        );
        const tpl = emailTemplates.signatureProgress({
            requesterName: parapheur.created_by_name || parapheur.created_by_username || 'vous',
            signataireNom,
            title: parapheur.title,
            reference: parapheur.reference,
            signedCount: Number(counts.signed),
            totalCount: Number(counts.total),
            done: !!done,
            mode: parapheur.mode,
            link: `${base}/parapheur/${parapheur.id}`,
        });
        await sendParapheurEmail(parapheur.created_by_email, tpl);
    } catch (e) {
        console.warn('[PARAPHEUR] notification demandeur échouée:', e.message);
    }
}

async function advanceAfterSign(parapheur) {
    const all = await pgDb.all(`SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`, [parapheur.id]);
    const signed = all.filter(s => s.status === 'a_signe');
    // « ou » (alternative) : la signature d'un seul signataire suffit à clore le
    // circuit. « puis » (séquentiel) / « et » (parallèle) : tous doivent signer.
    const done = parapheur.mode === 'alternative'
        ? signed.length > 0
        : (all.length > 0 && all.every(s => s.status === 'a_signe'));

    if (done) {
        await pgDb.run(`UPDATE hub_parapheur.parapheurs SET status = 'termine', completed_at = NOW(), updated_at = NOW() WHERE id = ?`, [parapheur.id]);
        // En circuit « ou », les signataires devenus inutiles sont marqués
        // « sans objet » : le circuit est déjà validé par une signature.
        if (parapheur.mode === 'alternative') {
            await pgDb.run(
                `UPDATE hub_parapheur.signataires SET status = 'sans_objet'
                 WHERE parapheur_id = ? AND status IN ('en_attente', 'en_cours')`,
                [parapheur.id]
            );
        }
        // Sceau PAdES de fin de circuit (certificat éphémère de l'AC interne).
        try { await sealParapheur(parapheur.id); } catch (e) { console.error('[PARAPHEUR] sceau de fin de circuit:', e.message); }
        const lastSigned = signed.length ? signed[signed.length - 1].nom : (all[all.length - 1] || {}).nom;
        await notifyRequester(parapheur, lastSigned, true);
        await notifySignersCompleted(parapheur, signed);
        return { done: true };
    }

    let nextSigner = null;
    if (parapheur.mode === 'sequentiel') {
        const next = all.find(s => s.status === 'en_attente');
        if (next) {
            await activateSignataires(parapheur, [next], null);
            nextSigner = next.nom;
        }
    }
    await notifyRequester(parapheur, null, false);
    return { done: false, next: nextSigner };
}

async function notifySignersCompleted(parapheur, signataires) {
    try {
        const base = await getAppBaseUrl();
        // Les signataires extérieurs n'ont pas accès au Hub interne : on les
        // renvoie vers la page publique de vérification (même cible que le QR code).
        const verifyBase = await getVerifyBaseUrl();
        const publicToken = await ensurePublicToken(parapheur.id);
        const verifyLink = publicToken ? `${verifyBase}${VERIFY_PATH}/${publicToken}` : null;
        for (const s of signataires) {
            if (!s.email) continue;
            const link = (isExternalSigner(s) && verifyLink) ? verifyLink : `${base}/parapheur/${parapheur.id}`;
            const tpl = emailTemplates.signatureProgress({
                requesterName: s.nom,
                signataireNom: 'Tous les signataires',
                title: parapheur.title,
                reference: parapheur.reference,
                signedCount: signataires.length,
                totalCount: signataires.length,
                done: true,
                mode: parapheur.mode,
                link,
            });
            await sendParapheurEmail(s.email, { ...tpl, subject: tpl.subject.replace('Parapheur signé', 'Parapheur finalisé') });
        }
    } catch (e) {
        console.warn('[PARAPHEUR] notification signataires terminé échouée:', e.message);
    }
}

async function signWithToken(token, { signatureDataUrl, signatureNote, signatureNoteDataUrl, noteOffsetX, noteOffsetY, noteSize, memorize, certificatePassword, otpCode, documentIds, delegation, req }) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    if (signataire.status === 'refuse') throw { status: 400, message: 'Vous avez déjà refusé de signer.' };
    // La délégation n'est jamais admise pour la signature sécurisée P12.
    if (delegation && signataire.signature_mode === 'securise') {
        throw { status: 403, message: 'La signature sécurisée (certificat P12) ne peut pas être déléguée.' };
    }
    const delegating = !!delegation;
    const signatureOwnerEmail = delegating ? delegation.delegate_email : signataire.email;
    const signedByName = delegating ? (delegation.delegate_name || delegation.delegate_email) : null;
    const signedByEmail = delegating ? delegation.delegate_email : null;
    if (signataire.token_expires_at && new Date(signataire.token_expires_at) < new Date()) {
        throw { status: 410, message: 'Ce lien de signature a expiré.' };
    }

    const parapheur = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    if (!parapheur || parapheur.status !== 'en_cours') throw { status: 400, message: 'Ce parapheur n\'est plus ouvert.' };

    // Re-signature autorisée tant que le parapheur est ouvert : permet de
    // rattraper une signature visuelle restée sans signature cryptographique.
    const resigning = signataire.status === 'a_signe';
    if (!resigning && signataire.status !== 'en_cours') {
        throw { status: 409, message: "Ce n'est pas encore votre tour de signer." };
    }

    // Déterminer l'image de signature : fournie, sinon mémorisée.
    let signaturePath = signataire.signature_image_path || null;
    const provided = decodeDataUrl(signatureDataUrl);
    if (provided) {
        const saved = await storage.saveFile(SIGN_MODULE, signataire.id, {
            buffer: provided.buffer,
            originalname: 'signature.png',
        });
        signaturePath = saved.dbPath;
        if (memorize !== false) {
            try {
                const existing = await pgDb.get(`SELECT id FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [signatureOwnerEmail]);
                if (existing) {
                    await pgDb.run(`UPDATE hub_parapheur.agent_signatures SET storage_path = ?, agent_id = ?, updated_at = NOW() WHERE id = ?`, [saved.dbPath, signataire.agent_id, existing.id]);
                } else {
                    await pgDb.run(`INSERT INTO hub_parapheur.agent_signatures (email, agent_id, storage_path) VALUES (?, ?, ?)`, [signatureOwnerEmail, signataire.agent_id, saved.dbPath]);
                }
            } catch (e) {
                console.warn('[PARAPHEUR] mémorisation signature échouée:', e.message);
            }
        }
    } else if (!signaturePath) {
        const memorized = await pgDb.get(`SELECT storage_path FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [signatureOwnerEmail]);
        if (memorized) signaturePath = memorized.storage_path;
    }
    if (!signaturePath) throw { status: 400, message: 'Aucune signature fournie.' };

    // Mention manuscrite libre (ex. « Avis favorable ») : texte conservé pour le
    // dossier de preuves + image « manuscrite » rendue côté client pour le PDF.
    const noteValue = String(signatureNote || '').trim().slice(0, 120) || null;
    let notePath = null;
    const noteImg = decodeDataUrl(signatureNoteDataUrl);
    if (noteValue && noteImg) {
        try {
            const savedNote = await storage.saveFile(SIGN_MODULE, signataire.id, { buffer: noteImg.buffer, originalname: 'mention.png' });
            notePath = savedNote.dbPath;
        } catch (e) {
            console.warn('[PARAPHEUR] enregistrement mention échoué:', e.message);
        }
    }
    // Position de la mention, choisie par le signataire : décalage (en points)
    // par rapport au coin inférieur gauche de sa signature.
    const clampOffset = (v, def) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return def;
        return Math.max(-500, Math.min(500, Math.round(n * 100) / 100));
    };
    const noteOffsetXVal = noteValue ? clampOffset(noteOffsetX, 0) : null;
    const noteOffsetYVal = noteValue ? clampOffset(noteOffsetY, 72) : null;
    // Taille de la mention (hauteur en points), réglable par le signataire.
    const noteSizeNum = Number(noteSize);
    const noteSizeVal = noteValue ? Math.max(6, Math.min(40, Number.isFinite(noteSizeNum) ? Math.round(noteSizeNum) : 12)) : null;

    // Filet de sécurité : garantir une ligne de position pour chaque document.
    // (Sans elle, un parapheur créé avec un mapping de positions incomplet ne
    // produirait aucun PDF signé alors que la signature serait « acceptée ».)
    const allDocs = await pgDb.all(
        `SELECT id, page_count FROM hub_parapheur.documents WHERE parapheur_id = ? AND COALESCE(is_annexe, FALSE) = FALSE`,
        [parapheur.id]
    );
    const existingSigs = await pgDb.all(`SELECT document_id FROM hub_parapheur.signatures WHERE signataire_id = ?`, [signataire.id]);
    const haveSigs = new Set(existingSigs.map((r) => r.document_id));
    for (const d of allDocs) {
        if (!haveSigs.has(d.id)) {
            // Par défaut : dernière page du document.
            const defaultPage = Math.max(1, Number(d.page_count) || 1);
            await pgDb.run(
                `INSERT INTO hub_parapheur.signatures (signataire_id, document_id, page, x_pct, y_pct, w_pt, h_pt)
                 VALUES (?, ?, ?, 75, 85, 150, 60)`,
                [signataire.id, d.id, defaultPage]
            );
        }
    }

    // Signature partielle : le signataire peut ne signer qu'une partie des
    // documents. On ne marque « appliquées » que les signatures des documents
    // sélectionnés (tous par défaut si aucune sélection n'est transmise).
    const allDocIds = allDocs.map(d => Number(d.id));
    let selectedDocIds = Array.isArray(documentIds)
        ? documentIds.map(n => Number(n)).filter(n => allDocIds.includes(n))
        : [];
    if (!selectedDocIds.length) selectedDocIds = allDocIds;

    // Vérification du code SMS (OTP) pour les parapheurs sécurisés par SMS.
    if (signataire.signature_mode === 'sms') {
        if (!otpCode) throw { status: 400, message: 'Code SMS requis.' };
        if (!signataire.otp_code_hash) throw { status: 400, message: 'Aucun code SMS envoyé. Cliquez de nouveau sur Signer.' };
        // Expiration et compteur de tentatives évalués en base (même fuseau que
        // l'émission du code) pour ne pas déclarer expiré un code tout juste reçu.
        const otpCheck = await pgDb.get(
            `SELECT (otp_expires_at IS NULL OR otp_expires_at < NOW()) AS expired,
                    COALESCE(otp_attempts, 0) AS attempts
             FROM hub_parapheur.signataires WHERE id = ?`,
            [signataire.id]
        );
        if (otpCheck && otpCheck.expired) {
            throw { status: 400, message: 'Code SMS expiré. Demandez-en un nouveau.' };
        }
        if (Number(otpCheck?.attempts || 0) >= 5) {
            throw { status: 429, message: 'Trop de tentatives. Demandez un nouveau code.' };
        }
        const ok = signataire.otp_code_hash === sha256(Buffer.from(String(otpCode).trim(), 'utf8'));
        if (!ok) {
            await pgDb.run(`UPDATE hub_parapheur.signataires SET otp_attempts = otp_attempts + 1 WHERE id = ?`, [signataire.id]);
            const left = 4 - Number(signataire.otp_attempts || 0);
            throw { status: 400, message: `Code SMS incorrect.${left > 0 ? ` ${left} tentative(s) restante(s).` : ''}` };
        }
        await pgDb.run(`UPDATE hub_parapheur.signataires SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?`, [signataire.id]);
    }

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    const nowIso = new Date().toISOString();

    // Signature cryptographique (PAdES) : on prépare et valide le certificat
    // AVANT toute écriture en base, pour ne pas marquer le signataire comme
    // signé si la crypto échoue (mot de passe erroné, certificat illisible…).
    let secureContext = null;
    if (signataire.signature_mode === 'securise') {
        console.log(`[PARAPHEUR] signature sécurisée demandée par ${signataire.email}`);
        if (!certificatePassword) {
            throw { status: 400, message: 'Mot de passe du certificat P12 requis pour la signature sécurisée.' };
        }
        const p12Buffer = await readCertificateBuffer(signataire.email);
        if (!p12Buffer) {
            throw { status: 400, message: 'Aucun certificat P12 enregistré pour votre compte. Importez-le avant de signer.' };
        }
        const sigRows = await pgDb.all(
            `SELECT document_id, page, x_pct, y_pct, w_pt, h_pt FROM hub_parapheur.signatures WHERE signataire_id = ?`,
            [signataire.id]
        );
        const positions = {};
        for (const r of sigRows) {
            positions[r.document_id] = { page: r.page, xPct: Number(r.x_pct), yPct: Number(r.y_pct), w: Number(r.w_pt), h: Number(r.h_pt) };
        }
        secureContext = {
            p12Buffer,
            password: certificatePassword,
            name: signataire.nom,
            reason: `Parapheur ${parapheur.reference || ''} - ${parapheur.title || ''}`.trim(),
            positions,
        };
    }

    await pgDb.run(
        `UPDATE hub_parapheur.signataires
         SET status = 'a_signe', signed_at = ?, signature_image_path = ?, ip = ?, user_agent = ?,
             signed_by_email = ?, signed_by_name = ?, delegation_id = ?,
             signature_note = ?, signature_note_path = ?, note_offset_x = ?, note_offset_y = ?, note_size = ?
         WHERE id = ?`,
        [nowIso, signaturePath, ip, ua, signedByEmail, signedByName, delegating ? (delegation.id || null) : null, noteValue, notePath, noteOffsetXVal, noteOffsetYVal, noteSizeVal, signataire.id]
    );
    await pgDb.run(
        `UPDATE hub_parapheur.signatures SET applied = TRUE, signed_at = ?, ip = ?, user_agent = ? WHERE signataire_id = ? AND document_id IN (${selectedDocIds.map(() => '?').join(',')})`,
        [nowIso, ip, ua, signataire.id, ...selectedDocIds]
    );

    try {
        await regenerateSignedDocs(parapheur.id, secureContext);
    } catch (e) {
        // Rollback : le PDF signé n'a pas pu être produit → on remet le
        // signataire en état de signer (l'image mémorisée est conservée).
        console.error('[PARAPHEUR] génération du PDF signé échouée, rollback:', e && e.message);
        try {
            await pgDb.run(`UPDATE hub_parapheur.signatures SET applied = FALSE WHERE signataire_id = ? AND document_id IN (${selectedDocIds.map(() => '?').join(',')})`, [signataire.id, ...selectedDocIds]);
            await pgDb.run(`UPDATE hub_parapheur.signataires SET status = 'en_cours', signed_at = NULL, signature_image_path = NULL, signed_by_email = NULL, signed_by_name = NULL, delegation_id = NULL, signature_note = NULL, signature_note_path = NULL, note_offset_x = NULL, note_offset_y = NULL WHERE id = ?`, [signataire.id]);
        } catch (re) { console.error('[PARAPHEUR] rollback échoué:', re.message); }
        throw e;
    }

    // Le certificat a servi à signer → il est de fait valide : on rafraîchit ses
    // métadonnées (le mot de passe fourni valide la clé privée).
    if (secureContext) {
        await refreshCertificateMeta(signataire.email, secureContext.password);
    } else if (signataire.signature_mode === 'simple' || signataire.signature_mode === 'sms') {
        // Signature interne : émission d'un certificat technique lié à l'événement.
        await recordSignatureCertificate(parapheur.id, signataire, signataire.signature_mode, nowIso);
    }

    // Certificat « à usage unique » : si le signataire n'a pas demandé à le
    // mémoriser, on le supprime après la signature.
    if (secureContext) {
        try {
            const cert = await pgDb.get(`SELECT id, remember FROM hub_parapheur.agent_certificates WHERE LOWER(email) = LOWER(?)`, [signataire.email]);
            if (cert && cert.remember === false) {
                await deleteCertificate(signataire.email);
                console.log('[PARAPHEUR] certificat non mémorisé supprimé après signature');
            }
        } catch (e) { /* ignore */ }
    }

    await audit(
        parapheur.id,
        delegating ? (delegation.delegate_name || delegation.delegate_email) : signataire.nom,
        delegating ? 'signature_delegation' : 'signature',
        {
            signataire_id: signataire.id,
            mode: signataire.signature_mode,
            ...(signataire.signature_mode === 'sms' ? { telephone: signataire.sms_phone } : {}),
            ...(delegating ? { delegant: signataire.nom, delegataire: delegation.delegate_email } : {}),
            ip,
        },
        ip
    );

    const result = await advanceAfterSign(parapheur);
    return { success: true, done: result.done, next: result.next || null };
}

async function rejectWithToken(token, { comment, delegation, req }) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    if (signataire.status === 'a_signe') throw { status: 400, message: 'Document déjà signé.' };
    if (signataire.status === 'refuse') throw { status: 400, message: 'Refus déjà enregistré.' };
    if (signataire.status !== 'en_cours') throw { status: 409, message: "Ce n'est pas encore votre tour." };

    const parapheur = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [signataire.parapheur_id]);
    const ip = getClientIp(req);
    const cleanComment = String(comment || '').slice(0, 1000);

    await pgDb.run(
        `UPDATE hub_parapheur.signataires SET status = 'refuse', rejected_at = NOW(), rejection_comment = ?, ip = ?, user_agent = ? WHERE id = ?`,
        [cleanComment, ip, getUserAgent(req), signataire.id]
    );
    // Circuit « ou » : le refus d'un signataire n'interrompt pas le circuit tant
    // qu'un autre peut encore signer. Le parapheur n'est refusé que lorsque plus
    // personne n'est en mesure de le valider.
    let markRefused = true;
    if (parapheur.mode === 'alternative') {
        const remaining = await pgDb.get(
            `SELECT COUNT(*) AS n FROM hub_parapheur.signataires WHERE parapheur_id = ? AND status IN ('en_attente', 'en_cours')`,
            [parapheur.id]
        );
        markRefused = Number(remaining?.n || 0) === 0;
    }
    if (markRefused) {
        await pgDb.run(`UPDATE hub_parapheur.parapheurs SET status = 'refuse', updated_at = NOW() WHERE id = ?`, [parapheur.id]);
    } else {
        await pgDb.run(`UPDATE hub_parapheur.parapheurs SET updated_at = NOW() WHERE id = ?`, [parapheur.id]);
    }
    const rejectActor = delegation ? (delegation.delegate_name || delegation.delegate_email) : signataire.nom;
    await audit(
        parapheur.id,
        rejectActor,
        delegation ? 'refus_delegation' : 'refus',
        delegation
            ? { signataire_id: signataire.id, delegant: signataire.nom, delegataire: delegation.delegate_email, comment: cleanComment, ip }
            : { signataire_id: signataire.id, comment: cleanComment, ip },
        ip
    );

    if (parapheur.created_by_email) {
        try {
            const base = await getAppBaseUrl();
            const tpl = emailTemplates.signatureRejected({
                requesterName: parapheur.created_by_name || parapheur.created_by_username,
                signataireNom: signataire.nom,
                title: parapheur.title,
                reference: parapheur.reference,
                comment: cleanComment,
                link: `${base}/parapheur/${parapheur.id}`,
            });
            await sendParapheurEmail(parapheur.created_by_email, tpl);
        } catch (e) {
            console.warn('[PARAPHEUR] notification refus échouée:', e.message);
        }
    }
    return { success: true };
}

// ─── Gestion (demandeur) ─────────────────────────────────────────────────────

async function relance(parapheurId, { manual, req }) {
    const parapheur = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!parapheur) throw { status: 404, message: 'Parapheur introuvable' };
    if (parapheur.status !== 'en_cours') throw { status: 400, message: 'Ce parapheur n\'est plus en cours.' };

    const signataires = await pgDb.all(
        `SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? AND status = 'en_cours' ORDER BY order_number`,
        [parapheurId]
    );
    let sent = 0;
    for (const s of signataires) {
        if (!s.token || !s.email) continue;
        const docs = await pgDb.all(`SELECT original_name FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [parapheurId]);
        try {
            const base = await getSignatureBaseUrl();
            const tpl = emailTemplates.signatureReminder({
                signataireNom: s.nom,
                requesterName: parapheur.created_by_name || parapheur.created_by_username,
                title: parapheur.title,
                reference: parapheur.reference,
                documents: docs,
                link: `${base}/signature/${s.token}`,
                deadline: parapheur.deadline,
            });
            await sendParapheurEmail(s.email, tpl);
            await pgDb.run(`UPDATE hub_parapheur.signataires SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = ?`, [s.id]);
            sent++;
        } catch (e) {
            console.warn('[PARAPHEUR] relance échouée:', e.message);
        }
    }
    if (manual) await audit(parapheurId, req.user?.username, 'relance_manuelle', { sent }, getClientIp(req));
    return { sent };
}

async function cancel(parapheurId, username, req) {
    const parapheur = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!parapheur) throw { status: 404, message: 'Parapheur introuvable' };
    if (parapheur.status !== 'en_cours') throw { status: 400, message: 'Ce parapheur n\'est plus en cours.' };
    await pgDb.run(`UPDATE hub_parapheur.parapheurs SET status = 'annule', cancelled_at = NOW(), cancelled_by = ?, updated_at = NOW() WHERE id = ?`, [username, parapheurId]);
    await audit(parapheurId, username, 'annulation', null, getClientIp(req));
    return { success: true };
}

async function getCounts(username, email) {
    const created = await pgDb.get(
        `SELECT COUNT(*) AS n FROM hub_parapheur.parapheurs WHERE created_by_username = ? AND status = 'en_cours'`,
        [username]
    );
    const toSign = await pgDb.get(
        `SELECT COUNT(*) AS n FROM hub_parapheur.signataires s
         JOIN hub_parapheur.parapheurs p ON p.id = s.parapheur_id
         WHERE LOWER(s.email) = LOWER(?) AND s.status IN ('en_attente','en_cours') AND p.status = 'en_cours'`,
        [email]
    );
    const signed = await pgDb.get(
        `SELECT COUNT(*) AS n FROM hub_parapheur.signataires s WHERE LOWER(s.email) = LOWER(?) AND s.status IN ('a_signe','refuse')`,
        [email]
    );
    return {
        created: Number(created?.n || 0),
        toSign: Number(toSign?.n || 0),
        signed: Number(signed?.n || 0),
    };
}

async function getMySignerToken(parapheurId, email) {
    if (!email) return null;
    const row = await pgDb.get(
        `SELECT token, status FROM hub_parapheur.signataires
         WHERE parapheur_id = ? AND LOWER(email) = LOWER(?)
         ORDER BY order_number LIMIT 1`,
        [parapheurId, email]
    );
    return row || null;
}

/** Jeton public de vérification (QR code) : créé à la demande si absent. */
async function ensurePublicToken(parapheurId) {
    const row = await pgDb.get(`SELECT public_token FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!row) return null;
    if (row.public_token) return row.public_token;
    const token = generateToken();
    await pgDb.run(`UPDATE hub_parapheur.parapheurs SET public_token = ? WHERE id = ?`, [token, parapheurId]);
    return token;
}

/**
 * Informations de vérification publiques (aucune authentification) : expose le
 * contenu du parapheur et ses signatures à toute personne disposant du lien.
 * On n'y expose ni emails ni chemins de stockage.
 */
async function getVerificationInfo(token) {
    if (!token) return null;
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE public_token = ?`, [token]);
    if (!p) return null;
    const documents = await pgDb.all(
        `SELECT id, original_name, mime_type, size, signed_path, has_pades
         FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`,
        [p.id]
    );
    const signataires = await pgDb.all(
        `SELECT nom, email, service, order_number, status, signature_mode, signed_at, signed_by_name, signed_by_email, signature_note
         FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`,
        [p.id]
    );
    const certRows = await pgDb.all(
        `SELECT LOWER(email) AS email, subject, issuer, serial, valid_from, valid_to FROM hub_parapheur.agent_certificates`
    );
    const certByEmail = new Map(certRows.map(c => [c.email, c]));
    const techCerts = await pgDb.all(
        `SELECT signataire_id, serial, issuer, fingerprint, signing_time FROM hub_parapheur.signature_certificates WHERE parapheur_id = ? ORDER BY id DESC`,
        [p.id]
    );
    const techBySigner = new Map();
    for (const t of techCerts) if (!techBySigner.has(t.signataire_id)) techBySigner.set(t.signataire_id, t);
    const p12Rows = await pgDb.all(
        `SELECT DISTINCT s.document_id
         FROM hub_parapheur.signatures s
         JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
         WHERE sg.parapheur_id = ? AND sg.signature_mode = 'securise' AND sg.status = 'a_signe'`,
        [p.id]
    );
    const p12Docs = new Set(p12Rows.map(r => Number(r.document_id)));
    return {
        parapheur: {
            id: p.id,
            reference: p.reference,
            title: p.title,
            message: p.message,
            status: p.status,
            mode: p.mode,
            deadline: p.deadline,
            requester: (await resolveAgentDisplayName(p.created_by_username, p.created_by_name)) || p.created_by_username,
            created_at: p.created_at,
            completed_at: p.completed_at,
            sealed_at: p.sealed_at || null,
            seal_serial: p.seal_serial || null,
        },
        documents: await Promise.all(documents.map(async d => ({
            id: d.id,
            original_name: d.original_name,
            mime_type: d.mime_type,
            size: d.size,
            has_signed: !!d.signed_path,
            has_pades: !!d.has_pades,
            has_p12_signature: p12Docs.has(d.id),
            has_crypto_signature: d.signed_path ? await pdfHasSignature(d.signed_path) : false,
        }))),
        signataires: signataires.map(s => {
            const c = certByEmail.get(String(s.email || '').toLowerCase());
            return {
                nom: s.nom,
                service: s.service,
                order_number: s.order_number,
                status: s.status,
                signature_mode: s.signature_mode,
                signed_at: s.signed_at,
                signed_by_name: (s.signed_by_name && s.signed_by_name !== s.nom) ? s.signed_by_name : null,
                signature_note: s.signature_note || null,
                technique_certificate: (() => {
                    const t = techBySigner.get(s.id);
                    return t ? { serial: t.serial, issuer: t.issuer, fingerprint: t.fingerprint, signing_time: t.signing_time } : null;
                })(),
                certificate: s.signature_mode === 'securise' && c ? {
                    subject: c.subject || null,
                    issuer: c.issuer || null,
                    serial: c.serial || null,
                    valid_from: c.valid_from || null,
                    valid_to: c.valid_to || null,
                } : null,
            };
        }),
    };
}

/** Téléchargement public (jeton de vérification) d'un document signé. */
async function getVerificationDocument(token, documentId, { signed }) {
    if (!token) return null;
    const p = await pgDb.get(`SELECT id FROM hub_parapheur.parapheurs WHERE public_token = ?`, [token]);
    if (!p) return null;
    return getSignedDocument(p.id, documentId, { signed });
}

// ─── Dossier de preuves (PDF + pièces dans une archive ZIP) ──────────────────

function sanitizeFilename(name, fallback = 'document.pdf') {
    return String(name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 150) || fallback;
}

function fmtDateTime(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }); } catch { return String(v); }
}

function wrapText(text, font, size, maxWidth) {
    const out = [];
    for (const para of String(text).split('\n')) {
        const words = para.split(/\s+/).filter(w => w.length);
        if (!words.length) { out.push(''); continue; }
        let line = '';
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (font.widthOfTextAtSize(test, size) > maxWidth && line) { out.push(line); line = w; }
            else line = test;
        }
        out.push(line);
    }
    return out;
}

const SIGN_MODE_PROCESS = {
    simple: "Signature simple : le signataire s'authentifie auprès du Hub DSI avec son compte de l'annuaire Active Directory de la collectivité, puis appose sa signature manuscrite numérisée. L'opération est horodatée et journalisée (adresse IP, agent logiciel). Portée : documents dont la validité juridique est interne à la collectivité.",
    sms: "Signature vérifiée par SMS : le signataire s'authentifie avec son compte Active Directory, puis un code à 6 chiffres lui est adressé par SMS sur le numéro de téléphone enregistré (validité 10 minutes, tentatives limitées). La signature n'est apposée qu'après vérification du code. Portée : documents dont la validité juridique est interne à la collectivité.",
    securise: "Signature sécurisée (certificat P12) : le signataire utilise un certificat X.509 personnel. Une signature cryptographique détachée PKCS#7 (format PAdES-BES) est intégrée au PDF, garantissant l'authenticité du signataire et l'intégrité du document (toute modification ultérieure invalide la signature). À utiliser lorsque la signature doit avoir une valeur probante externe à la collectivité.",
};

async function buildEvidenceReport(ctx) {
    const { parapheur, documents, signataires, audit, verifyUrl, hashes, generatedAt, seal } = ctx;
    const A4 = [595.28, 841.89];
    const margin = 48;
    const doc = await PDFDocument.create();
    doc.setTitle(`Dossier de preuves ${parapheur.reference || ''}`.trim());
    doc.setProducer('DSI Hub — Parapheur électronique');
    doc.setCreator('DSI Hub — Parapheur électronique');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const mono = await doc.embedFont(StandardFonts.Courier);

    let page = doc.addPage(A4);
    let y = page.getHeight() - 56;
    const newPage = () => { page = doc.addPage(A4); y = page.getHeight() - 56; };
    const space = (h) => { if (y - h < 56) newPage(); };
    const text = (str, opts = {}) => {
        const size = opts.size || 9.5;
        const f = opts.font || font;
        const color = opts.color || rgb(0.12, 0.12, 0.15);
        const indent = opts.indent || 0;
        const gap = opts.gap == null ? 3 : opts.gap;
        const maxWidth = opts.maxWidth || (page.getWidth() - margin * 2 - indent);
        for (const ln of wrapText(str, f, size, maxWidth)) {
            space(size + gap);
            if (ln) page.drawText(ln, { x: margin + indent, y, size, font: f, color });
            y -= size + gap;
        }
    };
    const heading = (str) => {
        space(26); y -= 10;
        page.drawText(str, { x: margin, y, size: 12.5, font: bold, color: rgb(0.35, 0.13, 0.71) });
        y -= 18;
    };
    const rule = () => { space(8); page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) }); y -= 10; };
    const kv = (label, value) => text(`${label} : ${value == null || value === '' ? '—' : value}`, { size: 9.5 });

    // En-tête
    page.drawText('DOSSIER DE PREUVES', { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.12, 0.2) });
    y -= 22;
    page.drawText('Parapheur électronique', { x: margin, y, size: 11, font, color: rgb(0.35, 0.35, 0.4) });
    y -= 26;
    rule();

    heading('1. Informations générales');
    kv('Référence', parapheur.reference);
    kv('Titre', parapheur.title);
    kv('Statut', parapheur.status);
    kv('Circuit', parapheur.mode === 'sequentiel' ? 'Séquentiel (« puis »)' : parapheur.mode === 'alternative' ? 'Alternatif (« ou »)' : 'Parallèle (« et »)');
    kv('Demandeur', parapheur.created_by_name || parapheur.created_by_username);
    kv('Créé le', fmtDateTime(parapheur.created_at));
    if (parapheur.deadline) kv('Échéance', fmtDateTime(parapheur.deadline));
    if (parapheur.completed_at) kv('Terminé le', fmtDateTime(parapheur.completed_at));
    if (parapheur.cancelled_at) kv('Annulé le', fmtDateTime(parapheur.cancelled_at));
    kv('Lien de vérification', verifyUrl || '—');
    if (parapheur.message) text(`Message : ${parapheur.message}`, { size: 9 });

    heading('2. Processus de signature électronique');
    text("Les signatures recueillies dans ce parapheur reposent sur l'identification préalable de chaque signataire via l'annuaire Active Directory de la collectivité. Chaque opération (signature ou refus) fait l'objet d'un horodatage et d'une journalisation technique (adresse IP, agent logiciel).", { size: 9 });
    y -= 2;
    const modesUsed = new Set(signataires.map(s => s.signature_mode));
    for (const m of ['simple', 'sms', 'securise']) {
        if (modesUsed.has(m)) text(SIGN_MODE_PROCESS[m], { size: 9, indent: 6 });
    }
    if (modesUsed.has('simple') || modesUsed.has('sms')) {
        text("Périmètre des signatures sans certificat : la signature simple et la signature vérifiée par SMS s'adressent à des documents dont la validité juridique est interne à la collectivité. Si la signature doit avoir une valeur probante externe, le signataire doit disposer d'un certificat personnel et utiliser la signature sécurisée (certificat P12).", { size: 8.5, color: rgb(0.35, 0.35, 0.42) });
    }
    text("Chaque PDF signé comporte, sur toutes ses pages, une mention indiquant le signataire, la date et, le cas échéant, la mention « par délégation de … », ainsi qu'un code QR renvoyant vers la page de vérification publique.", { size: 9 });

    heading('3. Documents et empreintes (SHA-256)');
    text("L'empreinte SHA-256 atteste de l'intégrité de chaque fichier. Toute modification, même d'un seul octet, produit une empreinte différente.", { size: 8.5, color: rgb(0.4, 0.4, 0.45) });
    for (const h of hashes) {
        space(40);
        text(`• ${h.name}${h.is_annexe ? ' (annexe, non signée)' : ''} — ${h.page_count ? h.page_count + ' page(s)' : 'pages non renseignées'}`, { size: 9.5, font: bold, gap: 2 });
        text(`Original : ${h.orig_hash || '—'}`, { size: 7.5, font: mono, indent: 10, gap: 2, color: rgb(0.3, 0.3, 0.4) });
        if (h.signed_hash) {
            const cryptoLabel = h.has_p12 ? '  [signature P12 du signataire]' : (h.has_pades ? '  [sceau de la plateforme]' : '');
            text(`PDF signé : ${h.signed_hash}${cryptoLabel}`, { size: 7.5, font: mono, indent: 10, gap: 2, color: rgb(0.3, 0.3, 0.4) });
        }
        y -= 2;
    }

    heading('4. Signataires et signatures');
    for (const s of signataires) {
        space(59);
        rule();
        text(`${s.nom} — ${s.email}`, { size: 10, font: bold, gap: 2 });
        kv('Service', s.service);
        kv('Mode', s.signature_mode === 'securise' ? 'Signée électroniquement (certificat P12)' : s.signature_mode === 'sms' ? 'Vérifiée par SMS' : 'Signature simple');
        kv('Statut', s.status === 'a_signe' ? 'A signé' : s.status === 'refuse' ? 'A refusé' : s.status === 'en_cours' ? 'Doit signer' : 'En attente');
        if (s.signed_at) kv('Signé le', fmtDateTime(s.signed_at));
        if (s.signed_by_name && s.signed_by_name !== s.nom) kv('Délégation', `signé par ${s.signed_by_name} par délégation`);
        if (s.signature_note) kv('Mention manuscrite', `« ${s.signature_note} »`);
        if (s.signature_mode === 'sms' && s.sms_phone) kv('Téléphone (SMS)', maskPhone(s.sms_phone));
        if (s.ip) kv('Adresse IP', s.ip);
        if (s.user_agent) kv('Agent logiciel', s.user_agent);
        if (s.rejected_at) kv('Refusé le', fmtDateTime(s.rejected_at));
        if (s.rejection_comment) kv('Motif du refus', s.rejection_comment);
        if (s.technique_certificate) {
            kv('Certificat technique (plateforme)', `n° ${s.technique_certificate.serial} — émis par ${s.technique_certificate.issuer || 'AC interne'}`);
        }
        if (s.certificate) {
            kv('Certificat — titulaire', s.certificate.subject);
            kv('Certificat — émetteur', s.certificate.issuer);
            kv('Certificat — n° de série', s.certificate.serial);
            if (s.certificate.valid_to) kv('Certificat — valide jusqu\'au', fmtDateTime(s.certificate.valid_to));
        }
    }

    heading('5. Journal d\'audit');
    if (!audit.length) text('Aucun événement enregistré.', { size: 9 });
    for (const a of audit) {
        text(`${fmtDateTime(a.created_at)} — ${a.actor || 'système'} — ${a.action}${a.ip ? ` (IP ${a.ip})` : ''}`, { size: 8.5, gap: 1.5 });
    }

    heading('6. Sceau de la plateforme');
    if (seal) {
        kv('Sceau apposé le', fmtDateTime(seal.sealed_at));
        kv('N° de certificat de sceau', seal.serial);
        text("En fin de circuit, un sceau électronique PAdES (signature cryptographique) est apposé sur chaque document signé. Il garantit l'intégrité du document et l'authenticité de la plateforme émettrice. Ce sceau relève d'un usage interne et ne constitue pas une signature qualifiée au sens du règlement eIDAS.", { size: 9 });
    } else {
        text("Aucun sceau de plateforme n'a été apposé (option désactivée ou circuit non terminé).", { size: 9 });
    }

    heading('7. Vérification');
    text("Ce dossier peut être vérifié en ligne, sans authentification, à l'adresse suivante (également encodée dans le code QR apposé sur les documents) :", { size: 9 });
    text(verifyUrl || '—', { size: 9, font: mono, indent: 6, color: rgb(0.15, 0.15, 0.55) });
    try {
        if (verifyUrl) {
            const qrBuf = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 320, margin: 1 });
            const qr = await doc.embedPng(qrBuf);
            space(130); y -= 12;
            page.drawImage(qr, { x: margin, y: y - 110, width: 110, height: 110 });
            y -= 122;
        }
    } catch { /* QR optionnel */ }

    y -= 10;
    rule();
    text(`Dossier généré le ${fmtDateTime(generatedAt)} par le Hub DSI — Parapheur électronique.`, { size: 8, color: rgb(0.45, 0.45, 0.5) });
    text("Ce document récapitule les éléments techniques de la procédure de signature. Il est fourni à titre de preuve et ne se substitue pas aux originaux signés joints à l'archive.", { size: 8, color: rgb(0.45, 0.45, 0.5) });

    // Pied de page (numérotation)
    const pages = doc.getPages();
    pages.forEach((pg, i) => {
        pg.drawText(`Réf. ${parapheur.reference || ''} — page ${i + 1}/${pages.length}`, {
            x: margin, y: 28, size: 7.5, font, color: rgb(0.55, 0.55, 0.6),
        });
    });

    return Buffer.from(await doc.save());
}

/** Archive ZIP du dossier de preuves d'un parapheur (rapport PDF + pièces). */
async function getEvidenceArchive(parapheurId) {
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [parapheurId]);
    if (!p) throw { status: 404, message: 'Parapheur introuvable.' };
    const documents = await pgDb.all(`SELECT * FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [p.id]);
    const signataires = await pgDb.all(`SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`, [p.id]);
    const audit = await pgDb.all(`SELECT actor, action, details, ip, created_at FROM hub_parapheur.audit_log WHERE parapheur_id = ? ORDER BY created_at`, [p.id]);
    const certRows = await pgDb.all(`SELECT LOWER(email) AS email, subject, issuer, serial, valid_from, valid_to FROM hub_parapheur.agent_certificates`);
    const certByEmail = new Map(certRows.map(c => [c.email, c]));

    const p12Rows = await pgDb.all(
        `SELECT DISTINCT s.document_id
         FROM hub_parapheur.signatures s
         JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
         WHERE sg.parapheur_id = ? AND sg.signature_mode = 'securise' AND sg.status = 'a_signe'`,
        [p.id]
    );
    const p12Docs = new Set(p12Rows.map(r => Number(r.document_id)));

    const settings = await getParapheurSettings();
    const verifyUrl = p.public_token ? `${settings.effective_base_url}${VERIFY_PATH}/${p.public_token}` : '';

    const hashes = [];
    const filesToAdd = [];
    for (const d of documents) {
        let origHash = d.doc_hash || null;
        let signedHash = null;
        let orig = null, signed = null;
        try { orig = await readStorageFile(d.storage_path); if (!origHash && orig) origHash = sha256(orig); } catch { /* ignore */ }
        if (d.signed_path) { try { signed = await readStorageFile(d.signed_path); if (signed) signedHash = sha256(signed); } catch { /* ignore */ } }
        hashes.push({ name: d.original_name, is_annexe: !!d.is_annexe, page_count: d.page_count, orig_hash: origHash, signed_hash: signedHash, has_pades: !!d.has_pades, has_p12: p12Docs.has(d.id) });
        if (orig) filesToAdd.push({ name: `documents_originaux/${sanitizeFilename(d.original_name)}`, buffer: orig });
        if (signed) filesToAdd.push({ name: `documents_signes/${sanitizeFilename(String(d.original_name || 'document.pdf').replace(/\.pdf$/i, '') + '_signe.pdf')}`, buffer: signed });
    }

    const techCerts = await pgDb.all(
        `SELECT signataire_id, serial, issuer, fingerprint, signing_time FROM hub_parapheur.signature_certificates WHERE parapheur_id = ? ORDER BY id`,
        [p.id]
    );
    const techBySigner = new Map();
    for (const t of techCerts) if (!techBySigner.has(t.signataire_id)) techBySigner.set(t.signataire_id, t);

    const signatairesReport = signataires.map(s => {
        const c = certByEmail.get(String(s.email || '').toLowerCase());
        const t = techBySigner.get(s.id);
        return {
            ...s,
            technique_certificate: t ? { serial: t.serial, issuer: t.issuer, fingerprint: t.fingerprint, signing_time: t.signing_time } : null,
            certificate: s.signature_mode === 'securise' && c ? {
                subject: c.subject, issuer: c.issuer, serial: c.serial, valid_from: c.valid_from, valid_to: c.valid_to,
            } : null,
        };
    });

    const seal = p.sealed_at ? { sealed_at: p.sealed_at, serial: p.seal_serial || null } : null;
    const generatedAt = new Date().toISOString();
    const report = await buildEvidenceReport({
        parapheur: p,
        documents,
        signataires: signatairesReport,
        audit,
        verifyUrl,
        hashes,
        generatedAt,
        seal,
    });

    const hashesText = hashes
        .map(h => [
            `${h.name}${h.is_annexe ? ' (annexe)' : ''}`,
            `  pages      : ${h.page_count ?? '—'}`,
            `  SHA-256    : ${h.orig_hash || '—'}`,
            `  signé      : ${h.signed_hash || '—'}${h.has_p12 ? ' (signature P12)' : (h.has_pades ? ' (sceau plateforme)' : '')}`,
        ].join('\n'))
        .join('\n\n');

    const metadata = {
        reference: p.reference,
        title: p.title,
        status: p.status,
        mode: p.mode,
        created_by: p.created_by_name || p.created_by_username,
        created_at: p.created_at,
        completed_at: p.completed_at,
        verify_url: verifyUrl,
        generated_at: generatedAt,
        platform_seal: seal,
        signature_certificates: techCerts.map(t => ({ signataire_id: t.signataire_id, serial: t.serial, issuer: t.issuer, fingerprint: t.fingerprint, signing_time: t.signing_time })),
        documents: hashes,
        signataires: signatairesReport.map(s => ({
            nom: s.nom, email: s.email, service: s.service, mode: s.signature_mode, status: s.status,
            signed_at: s.signed_at, signed_by_name: s.signed_by_name, delegation_id: s.delegation_id,
            sms_phone: s.sms_phone ? maskPhone(s.sms_phone) : null,
            ip: s.ip, user_agent: s.user_agent, rejected_at: s.rejected_at, rejection_comment: s.rejection_comment,
            certificate: s.certificate,
        })),
        audit_log: audit,
    };

    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    const finished = new Promise((resolve, reject) => {
        archive.on('end', resolve);
        archive.on('error', reject);
    });
    archive.append(report, { name: 'dossier-de-preuves.pdf' });
    archive.append(Buffer.from(hashesText, 'utf8'), { name: 'empreintes-sha256.txt' });
    archive.append(Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'), { name: 'metadonnees.json' });
    archive.append(Buffer.from(JSON.stringify(audit, null, 2), 'utf8'), { name: 'journal-audit.json' });
    for (const f of filesToAdd) archive.append(f.buffer, { name: f.name });
    archive.finalize();
    await finished;

    const baseName = sanitizeFilename(`dossier-preuves-${p.reference || ('parapheur-' + p.id)}`).replace(/\.pdf$/i, '');
    return { buffer: Buffer.concat(chunks), filename: `${baseName}.zip` };
}

async function getEvidenceArchiveByToken(token) {
    if (!token) return null;
    const p = await pgDb.get(`SELECT id FROM hub_parapheur.parapheurs WHERE public_token = ?`, [token]);
    if (!p) return null;
    return getEvidenceArchive(p.id);
}

async function getSignedDocument(parapheurId, documentId, { signed }) {
    let doc = await pgDb.get(`SELECT * FROM hub_parapheur.documents WHERE id = ? AND parapheur_id = ?`, [documentId, parapheurId]);
    if (!doc) return null;

    // Filet de sécurité : si le PDF signé est demandé mais absent alors que des
    // signatures ont été apposées, on régénère à la volée.
    if (signed && !doc.signed_path) {
        const applied = await pgDb.get(
            `SELECT COUNT(*) AS n FROM hub_parapheur.signatures WHERE document_id = ? AND applied = TRUE`,
            [documentId]
        );
        if (Number(applied?.n || 0) > 0) {
            try {
                await regenerateSignedDocs(parapheurId);
                doc = await pgDb.get(`SELECT * FROM hub_parapheur.documents WHERE id = ?`, [documentId]);
            } catch (e) {
                console.warn('[PARAPHEUR] régénération à la volée échouée:', e.message);
            }
        }
    }

    const path = signed ? doc.signed_path : doc.storage_path;
    if (!path) return null;
    const f = await storage.getFileForServe(path);
    if (!f) return null;
    const name = signed ? String(doc.original_name || 'document.pdf').replace(/\.pdf$/i, '_signe.pdf') : doc.original_name;
    return { ...f, filename: name, mimetype: doc.mime_type || 'application/pdf' };
}

// ─── Ma signature (agent connecté) ───────────────────────────────────────────

async function getMySignature(email) {
    if (!email) return null;
    const row = await pgDb.get(`SELECT storage_path, updated_at FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [email]);
    return row || null;
}

async function saveMySignature(email, agentId, signatureDataUrl) {
    const provided = decodeDataUrl(signatureDataUrl);
    if (!provided) throw { status: 400, message: 'Signature invalide' };
    if (!email) throw { status: 400, message: 'Email utilisateur requis' };
    const saved = await storage.saveFile(SIGN_MODULE, Date.now(), { buffer: provided.buffer, originalname: 'signature.png' });
    const existing = await pgDb.get(`SELECT id FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [email]);
    if (existing) {
        await pgDb.run(`UPDATE hub_parapheur.agent_signatures SET storage_path = ?, agent_id = ?, updated_at = NOW() WHERE id = ?`, [saved.dbPath, agentId || null, existing.id]);
    } else {
        await pgDb.run(`INSERT INTO hub_parapheur.agent_signatures (email, agent_id, storage_path) VALUES (?, ?, ?)`, [email, agentId || null, saved.dbPath]);
    }
    return { success: true };
}

async function getSignatureImageByEmail(email) {
    const row = await pgDb.get(`SELECT storage_path FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [email]);
    if (!row) return null;
    return storage.getFileForServe(row.storage_path);
}

// ─── Relances automatiques (cron) ────────────────────────────────────────────

async function runReminders() {
    const rows = await pgDb.all(
        `SELECT sg.*, p.title, p.reference, p.mode, p.deadline, p.created_by_name, p.created_by_username, p.id AS p_id
         FROM hub_parapheur.signataires sg
         JOIN hub_parapheur.parapheurs p ON p.id = sg.parapheur_id
         WHERE sg.status = 'en_cours'
           AND p.status = 'en_cours'
           AND sg.token IS NOT NULL
           AND sg.reminder_count < ?
           AND sg.last_reminder_at IS NOT NULL
           AND sg.last_reminder_at < NOW() - (? || ' days')::interval`,
        [REMINDER_MAX, String(REMINDER_INTERVAL_DAYS)]
    );
    let sent = 0;
    for (const s of rows) {
        try {
            const base = await getSignatureBaseUrl();
            const docs = await pgDb.all(`SELECT original_name FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [s.p_id]);
            const tpl = emailTemplates.signatureReminder({
                signataireNom: s.nom,
                requesterName: s.created_by_name || s.created_by_username,
                title: s.title,
                reference: s.reference,
                documents: docs,
                link: `${base}/signature/${s.token}`,
                deadline: s.deadline,
            });
            await sendParapheurEmail(s.email, tpl);
            await pgDb.run(`UPDATE hub_parapheur.signataires SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = ?`, [s.id]);
            sent++;
        } catch (e) {
            console.warn('[PARAPHEUR] relance auto échouée:', e.message);
        }
    }
    if (sent > 0) console.log(`[PARAPHEUR] ${sent} relance(s) automatique(s) envoyée(s)`);
    return { sent };
}

/**
 * Digest périodique des parapheurs à signer.
 *
 * Regroupe, pour chaque signataire, tous les parapheurs activés depuis le
 * dernier envoi (`activation_notified_at IS NULL`), afin de n'envoyer qu'un
 * seul e-mail — utile quand plusieurs parapheurs sont lancés en même temps.
 * L'e-mail indique le nombre total de parapheurs en attente, un lien direct par
 * parapheur et, pour les agents internes, un lien vers le parapheur global.
 * L'intervalle est paramétrable (`parapheur.notify_interval_minutes`).
 */
let lastDigestAt = 0;
async function runSignatureDigest({ force } = {}) {
    const settings = await getParapheurSettings();
    const intervalMs = Math.max(1, Number(settings.notify_interval_minutes) || 2) * 60 * 1000;
    const now = Date.now();
    if (!force && now - lastDigestAt < intervalMs) return { sent: 0, skipped: true };
    lastDigestAt = now;

    let rows;
    try {
        rows = await pgDb.all(
            `SELECT sg.id, sg.parapheur_id, sg.nom, sg.email, sg.token, sg.is_external, sg.agent_id,
                    p.title, p.reference, p.deadline, p.created_by_name, p.created_by_username
             FROM hub_parapheur.signataires sg
             JOIN hub_parapheur.parapheurs p ON p.id = sg.parapheur_id
             WHERE sg.status = 'en_cours'
               AND p.status = 'en_cours'
               AND sg.token IS NOT NULL
               AND sg.activation_notified_at IS NULL
             ORDER BY p.created_at`
        );
    } catch (e) {
        console.error('[PARAPHEUR] digest: lecture échouée:', e.message);
        return { sent: 0 };
    }
    if (!rows.length) return { sent: 0 };

    const byEmail = new Map();
    for (const r of rows) {
        const email = String(r.email || '').toLowerCase();
        if (!email) continue;
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email).push(r);
    }

    const base = await getSignatureBaseUrl();
    const appBase = await getAppBaseUrl();
    let sent = 0;
    for (const [email, items] of byEmail) {
        // Nombre total de parapheurs en attente pour ce signataire.
        let totalPending = items.length;
        try {
            const t = await pgDb.get(
                `SELECT COUNT(DISTINCT sg.parapheur_id) AS n
                 FROM hub_parapheur.signataires sg
                 JOIN hub_parapheur.parapheurs p ON p.id = sg.parapheur_id
                 WHERE LOWER(sg.email) = LOWER(?) AND sg.status = 'en_cours' AND p.status = 'en_cours'`,
                [email]
            );
            totalPending = Number(t?.n || items.length);
        } catch { /* garde items.length */ }

        const isExternal = items[0].is_external === true || items[0].agent_id == null;
        try {
            const tpl = emailTemplates.signatureDigest({
                signataireNom: items[0].nom,
                requesterName: items[0].created_by_name || items[0].created_by_username || 'La DSI',
                totalPending,
                // Nombre de parapheurs et lien vers le parapheur global : réservés
                // aux agents internes (les extérieurs n'ont pas de compte).
                internal: !isExternal,
                globalLink: isExternal ? null : `${appBase}/parapheur`,
                parapheurs: items.map(i => ({
                    title: i.title,
                    reference: i.reference,
                    requester: i.created_by_name || i.created_by_username,
                    deadline: i.deadline,
                    link: `${base}/signature/${i.token}`,
                })),
            });
            await sendParapheurEmail(email, tpl);
            const ids = items.map(i => i.id);
            await pgDb.run(
                `UPDATE hub_parapheur.signataires SET activation_notified_at = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`,
                ids
            );
            sent++;
        } catch (e) {
            console.warn('[PARAPHEUR] digest: envoi échoué:', e.message);
        }
    }
    if (sent > 0) console.log(`[PARAPHEUR] digest: ${sent} e-mail(s) de signature envoyé(s)`);
    return { sent };
}

module.exports = {
    MODULE,
    setSendMail,
    createParapheur,
    listCreated,
    listAll,
    deleteParapheur,
    listForEmail,
    getDetail,
    resolveParapheurId,
    getSignerByToken,
    isExternalSigner,
    assertLinkValid,
    otpRequiredFor,
    linkValidityOf,
    LINK_VALIDITY_CHOICES,
    getSignerAccessInfo,
    requestEmailOtp,
    verifyEmailOtp,
    getPublicInfo,
    requestOtp,
    signWithToken,
    rejectWithToken,
    relance,
    cancel,
    getSignedDocument,
    getVerificationInfo,
    getVerificationDocument,
    ensurePublicToken,
    listDelegations,
    saveDelegation,
    deleteDelegation,
    getActiveDelegation,
    getCounts,
    getMySignerToken,
    getMySignature,
    saveMySignature,
    getSignatureImageByEmail,
    saveCertificate,
    getCertificateMeta,
    deleteCertificate,
    deleteCertificateById,
    listCertificates,
    listSignatureLogs,
    listSecurity,
    getEligibleEmails,
    getAgentTitre,
    getParapheurSettings,
    saveParapheurSettings,
    getEvidenceArchive,
    getEvidenceArchiveByToken,
    getPlatformCa,
    generatePlatformCa,
    verifyParapheurSeal,
    verifyParapheurSealByToken,
    runReminders,
    runSignatureDigest,
};
