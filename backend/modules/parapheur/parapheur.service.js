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
const { pgDb, getSqlite } = require('../../shared/database');
const storage = require('../../shared/storage');
const docsService = require('../../shared/documents.service');
const { SECRET_KEY } = require('../../shared/config');
const forge = require('node-forge');
const axios = require('axios');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { P12Signer } = require('@signpdf/signer-p12');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const emailTemplates = require('./parapheur-email');

const MODULE = 'parapheur';
const SIGN_MODULE = 'parapheur-signatures';
const CERT_MODULE = 'parapheur-certificats';
const TOKEN_EXPIRY_DAYS = 30;
const REMINDER_MAX = 3;
const REMINDER_INTERVAL_DAYS = 2;

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

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
    if (signataire.otp_code_hash && signataire.otp_expires_at && new Date(signataire.otp_expires_at).getTime() > Date.now() + 9.5 * 60 * 1000) {
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
        `SELECT sg.nom, sg.email, sg.status, sg.signature_mode, sg.signed_at, sg.rejected_at,
                sg.rejection_comment, sg.ip, sg.user_agent,
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
        ip: r.ip,
        user_agent: r.user_agent,
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
            ready_to_sign: decryptable && r.has_private_key === true && validity !== 'expired' && validity !== 'not_yet' && r.is_verified === true,
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

// ─── Création ────────────────────────────────────────────────────────────────

async function activateSignataires(parapheur, signataires, ip) {
    const now = new Date();
    const expires = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 24 * 3600 * 1000);
    for (const s of signataires) {
        const token = s.token || generateToken();
        await pgDb.run(
            `UPDATE hub_parapheur.signataires
             SET status = 'en_cours', token = ?, token_expires_at = ?, last_reminder_at = ?
             WHERE id = ?`,
            [token, expires.toISOString(), now.toISOString(), s.id]
        );
        s.token = token;
        s.status = 'en_cours';
        await sendSignerMail(parapheur, s);
    }
    await audit(parapheur.id, 'système', 'activation', { signataires: signataires.map(s => s.id) }, ip);
}

async function sendSignerMail(parapheur, signataire) {
    if (!sendMailFn || !signataire.email) return;
    try {
        const base = await getAppBaseUrl();
        const link = `${base}/signature/${signataire.token}`;
        const docs = await pgDb.all(
            `SELECT original_name FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`,
            [parapheur.id]
        );
        const { subject, html } = emailTemplates.signatureRequest({
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
        await sendMailFn(signataire.email, subject, html, [], 'parapheur');
    } catch (e) {
        console.warn('[PARAPHEUR] envoi mail signataire échoué:', e.message);
    }
}

async function createParapheur({ files, payload, user, req }) {
    const title = String(payload.title || '').trim();
    if (!title) throw { status: 400, message: 'Titre requis' };
    if (!files || files.length === 0) throw { status: 400, message: 'Au moins un document PDF est requis' };
    for (const f of files) {
        const ok = (f.mimetype === 'application/pdf') || /\.pdf$/i.test(f.originalname || '');
        if (!ok) throw { status: 400, message: `Seuls les PDF sont acceptés (${f.originalname})` };
    }
    const signataires = Array.isArray(payload.signataires) ? payload.signataires : [];
    if (signataires.length === 0) throw { status: 400, message: 'Au moins un signataire est requis' };
    for (const s of signataires) {
        if (!s.email) throw { status: 400, message: 'Chaque signataire doit avoir un email' };
    }
    const mode = payload.mode === 'sequentiel' ? 'sequentiel' : 'parallele';
    const ip = getClientIp(req);
    const year = new Date().getFullYear();

    const pRes = await pgDb.run(
        `INSERT INTO hub_parapheur.parapheurs
            (title, message, status, mode, deadline, created_by_username, created_by_name, created_by_email)
         VALUES (?, ?, 'en_cours', ?, ?, ?, ?, ?)`,
        [
            title,
            payload.message || '',
            mode,
            payload.deadline || null,
            user.username || null,
            user.displayName || user.username || null,
            user.email || null,
        ]
    );
    const parapheurId = pRes.lastID;
    const reference = `PARA-${year}-${String(parapheurId).padStart(4, '0')}`;
    await pgDb.run(`UPDATE hub_parapheur.parapheurs SET reference = ? WHERE id = ?`, [reference, parapheurId]);

    // Documents
    const docIds = [];
    let order = 0;
    for (const file of files) {
        if (file.originalname) file.originalname = storage.fixUploadName(file.originalname);
        const saved = await storage.saveFile(MODULE, parapheurId, file);
        const hash = sha256(file.buffer);
        const dRes = await pgDb.run(
            `INSERT INTO hub_parapheur.documents
                (parapheur_id, original_name, storage_path, mime_type, size, doc_hash, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [parapheurId, file.originalname || 'document.pdf', saved.dbPath, file.mimetype || 'application/pdf', file.size || null, hash, order++]
        );
        const docId = dRes.lastID;
        docIds.push(docId);
        try {
            await docsService.registerExternalUpload({
                module: 'parapheur',
                entityType: 'document',
                entityId: docId,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: file.mimetype || 'application/pdf',
                size: file.size,
                storageRef: saved.dbPath,
                uploadedBy: user.username || null,
                metadata: { parapheur_id: parapheurId, reference },
            });
        } catch (e) {
            console.warn('[PARAPHEUR] register GED échoué:', e.message);
        }
    }

    // Signataires + positions
    const inserted = [];
    let idx = 0;
    for (const s of signataires) {
        const sRes = await pgDb.run(
            `INSERT INTO hub_parapheur.signataires
                (parapheur_id, agent_id, nom, email, service, order_number, status, signature_mode, sms_phone)
             VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)`,
            [
                parapheurId,
                Number.isFinite(Number(s.agentId)) ? Number(s.agentId) : null,
                s.nom || s.email,
                String(s.email).toLowerCase(),
                s.service || null,
                idx,
                ['securise', 'sms'].includes(s.signatureMode) ? s.signatureMode : 'simple',
                s.smsPhone ? String(s.smsPhone).replace(/\s/g, '') : null,
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
        inserted.push({ id: sid, nom: s.nom || s.email, email: String(s.email).toLowerCase(), token: null, status: 'en_attente' });
        idx++;
    }

    const parapheur = { id: parapheurId, title, reference, mode, deadline: payload.deadline || null, created_by_name: user.displayName || user.username, created_by_username: user.username };

    // Activation initiale
    let initial;
    if (mode === 'parallele') {
        initial = inserted;
    } else {
        initial = inserted.length ? [inserted[0]] : [];
    }
    if (initial.length) await activateSignataires(parapheur, initial, ip);

    await audit(parapheurId, user.username, 'creation', { documents: files.length, signataires: inserted.length, mode }, ip);

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
    };
}

async function listCreated(username) {
    const rows = await pgDb.all(
        `SELECT p.*,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS nb_signataires,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id AND s.status = 'a_signe') AS nb_signes,
            (SELECT COUNT(*) FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS nb_documents
         FROM hub_parapheur.parapheurs p
         WHERE p.created_by_username = ?
         ORDER BY p.created_at DESC`,
        [username]
    );
    return rows.map(r => ({ ...mapParapheur(r), nb_signataires: Number(r.nb_signataires), nb_signes: Number(r.nb_signes), nb_documents: Number(r.nb_documents) }));
}

async function listAll() {
    const rows = await pgDb.all(
        `SELECT p.*,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id) AS nb_signataires,
            (SELECT COUNT(*) FROM hub_parapheur.signataires s WHERE s.parapheur_id = p.id AND s.status = 'a_signe') AS nb_signes,
            (SELECT COUNT(*) FROM hub_parapheur.documents d WHERE d.parapheur_id = p.id) AS nb_documents
         FROM hub_parapheur.parapheurs p
         ORDER BY p.created_at DESC`
    );
    return rows.map(r => ({ ...mapParapheur(r), nb_signataires: Number(r.nb_signataires), nb_signes: Number(r.nb_signes), nb_documents: Number(r.nb_documents) }));
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
                (SELECT COUNT(*) FROM hub_parapheur.signataires x WHERE x.parapheur_id = p.id AND x.status = 'a_signe') AS nb_signes
         FROM hub_parapheur.signataires s
         JOIN hub_parapheur.parapheurs p ON p.id = s.parapheur_id
         WHERE LOWER(s.email) = LOWER(?)
           AND s.status IN (${statuses.map(() => '?').join(',')})
           ${signed ? '' : "AND p.status = 'en_cours'"}
         ORDER BY p.created_at DESC`,
        [email, ...statuses]
    );
    return rows.map(r => ({
        ...mapParapheur(r),
        signataire_id: r.signataire_id,
        signataire_status: r.signataire_status,
        order_number: r.order_number,
        nb_signataires: Number(r.nb_signataires),
        nb_signes: Number(r.nb_signes),
    }));
}

async function getDetail(id) {
    const p = await pgDb.get(`SELECT * FROM hub_parapheur.parapheurs WHERE id = ?`, [id]);
    if (!p) return null;
    const documents = await pgDb.all(`SELECT * FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [id]);
    const signataires = await pgDb.all(`SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`, [id]);
    const signatures = await pgDb.all(
        `SELECT s.* FROM hub_parapheur.signatures s
         JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
         WHERE sg.parapheur_id = ?`,
        [id]
    );
    const auditLog = await pgDb.all(
        `SELECT * FROM hub_parapheur.audit_log WHERE parapheur_id = ? ORDER BY created_at DESC LIMIT 100`,
        [id]
    );
    return {
        ...mapParapheur(p),
        documents: await Promise.all(documents.map(async d => ({
            id: d.id,
            original_name: d.original_name,
            mime_type: d.mime_type,
            size: d.size,
            sort_order: d.sort_order,
            has_signed: !!d.signed_path,
            has_pades: !!d.has_pades,
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

    const documents = await pgDb.all(`SELECT id, original_name, mime_type, size FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [p.id]);
    const signatures = await pgDb.all(
        `SELECT document_id, page, x_pct, y_pct, w_pt, h_pt, applied FROM hub_parapheur.signatures WHERE signataire_id = ?`,
        [signataire.id]
    );
    const memorized = await pgDb.get(`SELECT storage_path FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [signataire.email]);

    return {
        parapheur: {
            id: p.id,
            title: p.title,
            reference: p.reference,
            message: p.message,
            mode: p.mode,
            status: p.status,
            deadline: p.deadline,
            requester: p.created_by_name || p.created_by_username,
        },
        signataire: {
            nom: signataire.nom,
            email: signataire.email,
            status: signataire.status,
            signature_mode: signataire.signature_mode,
            has_memorized_signature: !!memorized,
        },
        documents: documents.map(d => ({ id: d.id, original_name: d.original_name, mime_type: d.mime_type, size: d.size })),
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

    // QR code « vérifier sur le Hub » (généré une fois) — bas gauche de la page.
    let qrImage = null;
    if (ctx.appBaseUrl && ctx.parapheurId) {
        try {
            const url = `${String(ctx.appBaseUrl).replace(/\/$/, '')}/parapheur/${ctx.parapheurId}`;
            const qrBuf = await QRCode.toBuffer(url, { type: 'png', width: 260, margin: 1 });
            qrImage = await pdfDoc.embedPng(qrBuf);
        } catch (e) {
            console.warn('[PARAPHEUR] génération QR échouée:', e.message);
        }
    }
    const qrPages = new Set();

    for (const s of sigs) {
        if (!s.img) continue;
        const imgBuf = await readStorageFile(s.img);
        let image;
        const lower = String(s.img).toLowerCase();
        try {
            if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) image = await pdfDoc.embedJpg(imgBuf);
            else image = await pdfDoc.embedPng(imgBuf);
        } catch (e) {
            try { image = await pdfDoc.embedPng(imgBuf); } catch { continue; }
        }
        const idx = Math.max(0, Math.min((parseInt(s.page, 10) || 1) - 1, pages.length - 1));
        const page = pages[idx];
        const { width, height } = page.getSize();
        const w = Number(s.w_pt) || 150;
        const h = Number(s.h_pt) || 60;
        const cx = (Number(s.x_pct) / 100) * width;
        const cy = height - (Number(s.y_pct) / 100) * height;
        const { width: nw, height: nh } = image.scale(1);
        const ratio = nw / nh;
        const boxRatio = w / h;
        let dw = w, dh = h;
        if (ratio > boxRatio) dh = w / ratio; else dw = h * ratio;
        const x = Math.max(0, cx - dw / 2);
        const y = Math.max(0, cy - dh / 2);
        page.drawImage(image, { x, y, width: dw, height: dh });

        // Libellé « signé (électroniquement) par … le … » sous la signature.
        const nom = s.nom || '';
        const quand = formatSignedAt(s.signed_at);
        let label;
        if (s.signature_mode === 'securise') label = `Signé électroniquement par ${nom} le ${quand}`;
        else if (s.signature_mode === 'sms') label = `Signé électroniquement par ${nom} (vérifié par SMS) le ${quand}`;
        else label = `Signé par ${nom} le ${quand}`;
        page.drawText(label, {
            x: Math.max(2, x),
            y: Math.max(2, y - 10),
            size: 6.5,
            font,
            color: rgb(0.25, 0.25, 0.25),
            maxWidth: Math.max(w, 180),
        });

        // QR code en bas à gauche (une fois par page).
        if (qrImage && !qrPages.has(idx)) {
            qrPages.add(idx);
            const size = 68;
            const qx = 24;
            const qy = 24;
            page.drawImage(qrImage, { x: qx, y: qy, width: size, height: size });
            page.drawText('Vérifier sur le Hub DSI', {
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
    for (const doc of documents) {
        // Ne jamais écraser un PDF déjà porteur d'une signature cryptographique.
        if (doc.has_pades) continue;

        const sigs = await pgDb.all(
            `SELECT s.page, s.x_pct, s.y_pct, s.w_pt, s.h_pt, s.signed_at,
                    sg.nom, sg.signature_mode, sg.signature_image_path AS img
             FROM hub_parapheur.signatures s
             JOIN hub_parapheur.signataires sg ON sg.id = s.signataire_id
             WHERE s.document_id = ? AND s.applied = TRUE
             ORDER BY sg.order_number, s.id`,
            [doc.id]
        );
        if (sigs.length === 0) continue;

        let buffer = await buildSignedPdf(doc.storage_path, sigs, { appBaseUrl: await getAppBaseUrl(), parapheurId });
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
    if (!sendMailFn || !parapheur.created_by_email) return;
    try {
        const base = await getAppBaseUrl();
        const counts = await pgDb.get(
            `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'a_signe') AS signed
             FROM hub_parapheur.signataires WHERE parapheur_id = ?`,
            [parapheur.id]
        );
        const { subject, html } = emailTemplates.signatureProgress({
            requesterName: parapheur.created_by_name || parapheur.created_by_username || 'vous',
            signataireNom,
            title: parapheur.title,
            reference: parapheur.reference,
            signedCount: Number(counts.signed),
            totalCount: Number(counts.total),
            done: !!done,
            link: `${base}/parapheur/${parapheur.id}`,
        });
        await sendMailFn(parapheur.created_by_email, subject, html, [], 'parapheur');
    } catch (e) {
        console.warn('[PARAPHEUR] notification demandeur échouée:', e.message);
    }
}

async function advanceAfterSign(parapheur) {
    const all = await pgDb.all(`SELECT * FROM hub_parapheur.signataires WHERE parapheur_id = ? ORDER BY order_number, id`, [parapheur.id]);
    const done = all.length > 0 && all.every(s => s.status === 'a_signe');

    if (done) {
        await pgDb.run(`UPDATE hub_parapheur.parapheurs SET status = 'termine', completed_at = NOW(), updated_at = NOW() WHERE id = ?`, [parapheur.id]);
        await notifyRequester(parapheur, all[all.length - 1].nom, true);
        await notifySignersCompleted(parapheur, all);
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
    if (!sendMailFn) return;
    try {
        const base = await getAppBaseUrl();
        for (const s of signataires) {
            if (!s.email) continue;
            const { subject, html } = emailTemplates.signatureProgress({
                requesterName: s.nom,
                signataireNom: 'Tous les signataires',
                title: parapheur.title,
                reference: parapheur.reference,
                signedCount: signataires.length,
                totalCount: signataires.length,
                done: true,
                link: `${base}/parapheur/${parapheur.id}`,
            });
            await sendMailFn(s.email, subject.replace('Parapheur signé', 'Parapheur finalisé'), html, [], 'parapheur');
        }
    } catch (e) {
        console.warn('[PARAPHEUR] notification signataires terminé échouée:', e.message);
    }
}

async function signWithToken(token, { signatureDataUrl, memorize, certificatePassword, otpCode, req }) {
    const signataire = await getSignerByToken(token);
    if (!signataire) throw { status: 404, message: 'Lien de signature introuvable.' };
    if (signataire.status === 'refuse') throw { status: 400, message: 'Vous avez déjà refusé de signer.' };
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
                const existing = await pgDb.get(`SELECT id FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [signataire.email]);
                if (existing) {
                    await pgDb.run(`UPDATE hub_parapheur.agent_signatures SET storage_path = ?, agent_id = ?, updated_at = NOW() WHERE id = ?`, [saved.dbPath, signataire.agent_id, existing.id]);
                } else {
                    await pgDb.run(`INSERT INTO hub_parapheur.agent_signatures (email, agent_id, storage_path) VALUES (?, ?, ?)`, [signataire.email, signataire.agent_id, saved.dbPath]);
                }
            } catch (e) {
                console.warn('[PARAPHEUR] mémorisation signature échouée:', e.message);
            }
        }
    } else if (!signaturePath) {
        const memorized = await pgDb.get(`SELECT storage_path FROM hub_parapheur.agent_signatures WHERE LOWER(email) = LOWER(?)`, [signataire.email]);
        if (memorized) signaturePath = memorized.storage_path;
    }
    if (!signaturePath) throw { status: 400, message: 'Aucune signature fournie.' };

    // Filet de sécurité : garantir une ligne de position pour chaque document.
    // (Sans elle, un parapheur créé avec un mapping de positions incomplet ne
    // produirait aucun PDF signé alors que la signature serait « acceptée ».)
    const allDocs = await pgDb.all(`SELECT id FROM hub_parapheur.documents WHERE parapheur_id = ?`, [parapheur.id]);
    const existingSigs = await pgDb.all(`SELECT document_id FROM hub_parapheur.signatures WHERE signataire_id = ?`, [signataire.id]);
    const haveSigs = new Set(existingSigs.map((r) => r.document_id));
    for (const d of allDocs) {
        if (!haveSigs.has(d.id)) {
            await pgDb.run(
                `INSERT INTO hub_parapheur.signatures (signataire_id, document_id, page, x_pct, y_pct, w_pt, h_pt)
                 VALUES (?, ?, 1, 75, 85, 150, 60)`,
                [signataire.id, d.id]
            );
        }
    }

    // Vérification du code SMS (OTP) pour les parapheurs sécurisés par SMS.
    if (signataire.signature_mode === 'sms') {
        if (!otpCode) throw { status: 400, message: 'Code SMS requis.' };
        if (!signataire.otp_code_hash) throw { status: 400, message: 'Aucun code SMS envoyé. Cliquez de nouveau sur Signer.' };
        if (signataire.otp_expires_at && new Date(signataire.otp_expires_at) < new Date()) {
            throw { status: 400, message: 'Code SMS expiré. Demandez-en un nouveau.' };
        }
        if (Number(signataire.otp_attempts || 0) >= 5) {
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
         SET status = 'a_signe', signed_at = ?, signature_image_path = ?, ip = ?, user_agent = ?
         WHERE id = ?`,
        [nowIso, signaturePath, ip, ua, signataire.id]
    );
    await pgDb.run(
        `UPDATE hub_parapheur.signatures SET applied = TRUE, signed_at = ?, ip = ?, user_agent = ? WHERE signataire_id = ?`,
        [nowIso, ip, ua, signataire.id]
    );

    try {
        await regenerateSignedDocs(parapheur.id, secureContext);
    } catch (e) {
        // Rollback : le PDF signé n'a pas pu être produit → on remet le
        // signataire en état de signer (l'image mémorisée est conservée).
        console.error('[PARAPHEUR] génération du PDF signé échouée, rollback:', e && e.message);
        try {
            await pgDb.run(`UPDATE hub_parapheur.signatures SET applied = FALSE WHERE signataire_id = ?`, [signataire.id]);
            await pgDb.run(`UPDATE hub_parapheur.signataires SET status = 'en_cours', signed_at = NULL, signature_image_path = NULL WHERE id = ?`, [signataire.id]);
        } catch (re) { console.error('[PARAPHEUR] rollback échoué:', re.message); }
        throw e;
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

    await audit(parapheur.id, signataire.nom, 'signature', { signataire_id: signataire.id, mode: signataire.signature_mode, ip }, ip);

    const result = await advanceAfterSign(parapheur);
    return { success: true, done: result.done, next: result.next || null };
}

async function rejectWithToken(token, { comment, req }) {
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
    await pgDb.run(`UPDATE hub_parapheur.parapheurs SET status = 'refuse', updated_at = NOW() WHERE id = ?`, [parapheur.id]);
    await audit(parapheur.id, signataire.nom, 'refus', { signataire_id: signataire.id, comment: cleanComment, ip }, ip);

    if (sendMailFn && parapheur.created_by_email) {
        try {
            const base = await getAppBaseUrl();
            const { subject, html } = emailTemplates.signatureRejected({
                requesterName: parapheur.created_by_name || parapheur.created_by_username,
                signataireNom: signataire.nom,
                title: parapheur.title,
                reference: parapheur.reference,
                comment: cleanComment,
                link: `${base}/parapheur/${parapheur.id}`,
            });
            await sendMailFn(parapheur.created_by_email, subject, html, [], 'parapheur');
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
            const base = await getAppBaseUrl();
            const { subject, html } = emailTemplates.signatureReminder({
                signataireNom: s.nom,
                requesterName: parapheur.created_by_name || parapheur.created_by_username,
                title: parapheur.title,
                reference: parapheur.reference,
                documents: docs,
                link: `${base}/signature/${s.token}`,
                deadline: parapheur.deadline,
            });
            if (sendMailFn) await sendMailFn(s.email, subject, html, [], 'parapheur');
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
            const base = await getAppBaseUrl();
            const docs = await pgDb.all(`SELECT original_name FROM hub_parapheur.documents WHERE parapheur_id = ? ORDER BY sort_order, id`, [s.p_id]);
            const { subject, html } = emailTemplates.signatureReminder({
                signataireNom: s.nom,
                requesterName: s.created_by_name || s.created_by_username,
                title: s.title,
                reference: s.reference,
                documents: docs,
                link: `${base}/signature/${s.token}`,
                deadline: s.deadline,
            });
            if (sendMailFn) await sendMailFn(s.email, subject, html, [], 'parapheur');
            await pgDb.run(`UPDATE hub_parapheur.signataires SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = ?`, [s.id]);
            sent++;
        } catch (e) {
            console.warn('[PARAPHEUR] relance auto échouée:', e.message);
        }
    }
    if (sent > 0) console.log(`[PARAPHEUR] ${sent} relance(s) automatique(s) envoyée(s)`);
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
    getSignerByToken,
    getPublicInfo,
    requestOtp,
    signWithToken,
    rejectWithToken,
    relance,
    cancel,
    getSignedDocument,
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
    runReminders,
};
