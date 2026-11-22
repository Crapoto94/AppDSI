/**
 * Horodatage RFC 3161 des signatures PAdES du parapheur (niveau PAdES-T).
 *
 * Principe : après la signature CMS du document, on envoie l'empreinte SHA-256 de la valeur de signature à une autorité
 * d'horodatage (TSA) ; elle renvoie un jeton signé (TimeStampToken) qu'on ajoute à la signature comme attribut non signé
 * `id-aa-signatureTimeStampToken` (1.2.840.113549.1.9.16.2.14). Le document PDF lui-même n'est pas modifié et
 * seule l'empreinte quitte le serveur.
 *
 * La TSA est paramétrable (URL, identifiants éventuels, caractère obligatoire) dans /admin/parapheur-certificats.
 */
const forge = require('node-forge');
const crypto = require('crypto');
const { Signer } = require('@signpdf/utils');

const asn1 = forge.asn1;
const U = asn1.Class.UNIVERSAL;
const T = asn1.Type;
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_TS_TOKEN_ATTR = '1.2.840.113549.1.9.16.2.14';
const oid = (o) => asn1.create(U, T.OID, false, asn1.oidToDer(o).getBytes());

class TsaError extends Error {}

/** TimeStampReq (RFC 3161) : version 1, empreinte SHA-256, nonce, certReq = vrai (le jeton embarque la chaîne de la TSA). */
function buildRequest(hash, nonce, policyOid) {
    const items = [
        asn1.create(U, T.INTEGER, false, String.fromCharCode(1)),
        asn1.create(U, T.SEQUENCE, true, [
            asn1.create(U, T.SEQUENCE, true, [oid(OID_SHA256), asn1.create(U, T.NULL, false, '')]),
            asn1.create(U, T.OCTETSTRING, false, hash.toString('binary')),
        ]),
    ];
    if (policyOid) items.push(oid(policyOid));
    items.push(asn1.create(U, T.INTEGER, false, nonce.toString('binary')));
    items.push(asn1.create(U, T.BOOLEAN, false, String.fromCharCode(0xff)));
    return Buffer.from(asn1.toDer(asn1.create(U, T.SEQUENCE, true, items)).getBytes(), 'binary');
}

const parseDer = (buf) => asn1.fromDer(forge.util.createBuffer(Buffer.from(buf).toString('binary')));

/** Extrait et contrôle le TSTInfo du jeton : empreinte et nonce identiques à la demande. Renvoie la date d'horodatage. */
function checkToken(token, hash, nonce) {
    // ContentInfo → [0] → SignedData → encapContentInfo → [0] → OCTET STRING (TSTInfo)
    const signedData = token.value[1].value[0];
    const encap = signedData.value[2];
    const tstOctets = encap.value[1].value[0].value;
    const tst = asn1.fromDer(forge.util.createBuffer(tstOctets));
    const imprint = tst.value[2].value[1].value;
    if (Buffer.from(imprint, 'binary').compare(hash) !== 0) throw new TsaError('Le jeton ne correspond pas à l’empreinte envoyée.');
    const genTime = tst.value[4].value;
    const nonceEl = tst.value.slice(5).find(e => e.tagClass === U && e.type === T.INTEGER);
    if (nonceEl && Buffer.from(nonceEl.value, 'binary').compare(nonce) !== 0) throw new TsaError('Le jeton ne reprend pas le nonce de la demande.');
    return String(genTime);
}

/** Interroge la TSA et renvoie { token (ASN.1), genTime }. */
async function requestToken(hash, cfg) {
    if (!cfg || !cfg.url) throw new TsaError('Aucune autorité d’horodatage configurée.');
    const nonce = crypto.randomBytes(8); nonce[0] &= 0x7f; if (nonce[0] === 0) nonce[0] = 1;   // entier positif
    const body = buildRequest(hash, nonce, cfg.policy_oid);
    const headers = { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' };
    if (cfg.login) headers.Authorization = 'Basic ' + Buffer.from(`${cfg.login}:${cfg.password || ''}`).toString('base64');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), (cfg.timeout_s || 15) * 1000);
    let resp;
    try { resp = await fetch(cfg.url, { method: 'POST', headers, body, signal: ctl.signal }); }
    catch (e) { throw new TsaError(e.name === 'AbortError' ? 'Délai dépassé en interrogeant l’autorité d’horodatage.' : `Autorité d’horodatage injoignable (${e.cause?.code || e.message}).`); }
    finally { clearTimeout(timer); }
    if (!resp.ok) throw new TsaError(`L’autorité d’horodatage a répondu HTTP ${resp.status}.`);
    const raw = Buffer.from(await resp.arrayBuffer());
    let root;
    try { root = parseDer(raw); } catch { throw new TsaError('Réponse de l’autorité d’horodatage illisible.'); }
    const status = root.value[0].value[0].value.charCodeAt(0);   // 0 = accordé, 1 = accordé avec réserves
    if (status > 1) throw new TsaError(`Horodatage refusé par l’autorité (statut ${status}).`);
    const token = root.value[1];
    if (!token) throw new TsaError('La réponse ne contient pas de jeton d’horodatage.');
    const genTime = checkToken(token, hash, nonce);
    return { token, genTime };
}

/** Ajoute le jeton d'horodatage à une signature CMS (DER) : attribut non signé du premier SignerInfo. */
async function addTimestampToCms(cmsDer, cfg) {
    const root = parseDer(cmsDer);
    const signedData = root.value[1].value[0];
    const signerInfo = signedData.value[signedData.value.length - 1].value[0];
    const sigEl = [...signerInfo.value].reverse().find(e => e.tagClass === U && e.type === T.OCTETSTRING);
    if (!sigEl) throw new TsaError('Signature CMS inattendue : valeur de signature introuvable.');
    const hash = crypto.createHash('sha256').update(Buffer.from(sigEl.value, 'binary')).digest();
    const { token, genTime } = await requestToken(hash, cfg);
    const attr = asn1.create(U, T.SEQUENCE, true, [oid(OID_TS_TOKEN_ATTR), asn1.create(U, T.SET, true, [token])]);
    const last = signerInfo.value[signerInfo.value.length - 1];
    if (last.tagClass === asn1.Class.CONTEXT_SPECIFIC && last.type === 1) last.value.push(attr);
    else signerInfo.value.push(asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [attr]));
    return { der: Buffer.from(asn1.toDer(root).getBytes(), 'binary'), genTime };
}

/** Enveloppe un signeur @signpdf : signature d'origine, puis horodatage. Si la TSA échoue : erreur si « obligatoire », sinon signature sans horodatage. */
class TimestampingSigner extends Signer {
    constructor(inner, cfg, onResult) { super(); this.inner = inner; this.cfg = cfg; this.onResult = onResult; }
    async sign(pdfBuffer, signingTime) {
        const sig = await this.inner.sign(pdfBuffer, signingTime);
        try {
            const out = await addTimestampToCms(Buffer.from(sig), this.cfg);
            if (this.onResult) this.onResult({ ok: true, genTime: out.genTime });
            return out.der;
        } catch (e) {
            if (this.onResult) this.onResult({ ok: false, error: e.message });
            if (this.cfg.required) throw new TsaError(`Horodatage impossible : ${e.message}`);
            console.warn('[PARAPHEUR] horodatage ignoré (non obligatoire) :', e.message);
            return sig;
        }
    }
}

/** Test d'une configuration : demande un jeton pour une empreinte factice. */
async function testTsa(cfg) {
    const t0 = Date.now();
    const { genTime } = await requestToken(crypto.createHash('sha256').update('test-horodatage-parapheur').digest(), cfg);
    return { ok: true, genTime, ms: Date.now() - t0 };
}

/**
 * Test complet : signe un PDF de test (certificat jetable) avec horodatage OBLIGATOIRE, puis relit la signature pour contrôler
 * la présence du jeton. Aucun document réel n'est utilisé ; seule l'empreinte de la signature de test part chez l'autorité.
 * @returns {{ ok, genTime, ms, signature_bytes, placeholder_bytes, pdf (Buffer) }}
 */
async function testSignedPdf(cfg) {
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const { SignPdf } = require('@signpdf/signpdf');
    const { P12Signer } = require('@signpdf/signer-p12');
    const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
    const t0 = Date.now();
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date(Date.now() - 60000); cert.validity.notAfter = new Date(Date.now() + 86400000);
    const attrs = [{ name: 'commonName', value: 'Test horodatage parapheur' }];
    cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = Buffer.from(asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'test')).getBytes(), 'binary');

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([420, 200]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Document de test - horodatage des signatures', { x: 20, y: 150, size: 13, font });
    page.drawText('Genere par le parapheur DSI Hub. Aucune donnee reelle.', { x: 20, y: 130, size: 10, font });
    const placeholderLen = 32768;
    pdflibAddPlaceholder({ pdfDoc: pdf, pdfPage: page, reason: 'Test horodatage', contactInfo: '', name: 'Test', location: '', signatureLength: placeholderLen, widgetRect: [20, 20, 220, 80], appName: 'DSI Hub - Parapheur electronique' });
    const withPh = Buffer.from(await pdf.save({ useObjectStreams: false }));
    let result = null;
    const signer = new TimestampingSigner(new P12Signer(p12, { passphrase: 'test' }), { ...cfg, required: true }, (r) => { result = r; });
    const signed = Buffer.from(await new SignPdf().sign(withPh, signer));

    // Relecture : le jeton doit figurer dans les attributs non signés de la signature
    const m = signed.toString('latin1').match(/\/Contents\s*<([0-9A-Fa-f]+)>/);
    if (!m) throw new TsaError('Signature de test introuvable dans le PDF.');
    const cms = Buffer.from(m[1].replace(/(00)+$/, ''), 'hex');
    const root = parseDer(cms);
    const signerInfo = root.value[1].value[0].value.slice(-1)[0].value[0];
    const last = signerInfo.value[signerInfo.value.length - 1];
    const hasToken = last.tagClass === asn1.Class.CONTEXT_SPECIFIC && last.type === 1
        && last.value.some(a => asn1.derToOid(a.value[0].value) === OID_TS_TOKEN_ATTR);
    if (!hasToken) throw new TsaError('La signature de test ne contient pas de jeton d’horodatage.');
    return { ok: true, genTime: result && result.genTime, ms: Date.now() - t0, signature_bytes: cms.length, placeholder_bytes: placeholderLen, pdf: signed };
}

module.exports = { TimestampingSigner, addTimestampToCms, testTsa, testSignedPdf, TsaError };
