/**
 * Vérification d'une signature PDF (CMS / PAdES) et de son jeton d'horodatage RFC 3161, pour le visualiseur interne du parapheur.
 * Contrôle : intégrité (empreinte des octets signés), signature (RSA ou ECDSA), certificat du signataire, jeton d'horodatage
 * (empreinte = signature, signature de l'autorité) et confiance de chaque chaîne de certificats vis-à-vis des autorités racines
 * connues du serveur (magasin de Node, équivalent à celui de Mozilla).
 */
const forge = require('node-forge');
const crypto = require('crypto');
const tls = require('tls');

const asn1 = forge.asn1;
const U = asn1.Class.UNIVERSAL;
const T = asn1.Type;
const CTX = asn1.Class.CONTEXT_SPECIFIC;
const HASHES = { '2.16.840.1.101.3.4.2.1': 'sha256', '1.3.14.3.2.26': 'sha1', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512' };
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_TS_TOKEN_ATTR = '1.2.840.113549.1.9.16.2.14';

const bin = (s) => Buffer.from(s, 'binary');
const oneLine = (x509Text) => String(x509Text).split('\n').filter(Boolean).join(', ');

let ROOTS = null;
const roots = () => ROOTS || (ROOTS = tls.rootCertificates.map(p => { try { return new crypto.X509Certificate(p); } catch { return null; } }).filter(Boolean));

const certInfo = (c) => ({
    subject: oneLine(c.subject),
    issuer: oneLine(c.issuer),
    not_before: new Date(c.validFrom).toISOString(),
    not_after: new Date(c.validTo).toISOString(),
    self_signed: c.checkIssued(c) && c.verify(c.publicKey),
    fingerprint_sha256: c.fingerprint256.replace(/:/g, '').toLowerCase(),
});

function certsOf(signedData) {
    const n = signedData.value.find(e => e.tagClass === CTX && e.type === 0);
    return n ? n.value.map(c => { try { return new crypto.X509Certificate(bin(asn1.toDer(c).getBytes())); } catch { return null; } }).filter(Boolean) : [];
}

function parseSignerInfo(si) {
    const v = si.value;
    let k = 3, signedAttrs = null;
    if (v[k].tagClass === CTX && v[k].type === 0) { signedAttrs = v[k]; k++; }
    const sid = v[1];
    const serialHex = sid.tagClass === U && sid.value[1] ? forge.util.bytesToHex(sid.value[1].value) : null;
    const attrs = {};
    if (signedAttrs) for (const a of signedAttrs.value) attrs[asn1.derToOid(a.value[0].value)] = a.value[1].value[0];
    return { digest: HASHES[asn1.derToOid(v[2].value[0].value)], signedAttrs, attrs, signature: bin(v[k + 1].value), serialHex };
}

const trimZeros = (h) => String(h || '').replace(/^0+/, '').toLowerCase();
const pickCert = (certs, serialHex) => certs.find(c => serialHex && trimZeros(c.serialNumber) === trimZeros(serialHex)) || certs[0];

/** Intégrité (empreinte signée) et signature d'un SignerInfo CMS ; content = octets signés. */
function checkSignerInfo(pi, content, cert) {
    if (!pi.digest || !pi.signedAttrs || !cert) return { integrity_ok: false, signature_ok: false };
    const md = pi.attrs[OID_MESSAGE_DIGEST];
    const integrity_ok = !!md && bin(md.value).equals(crypto.createHash(pi.digest).update(content).digest());
    let signature_ok = false;
    try {
        const set = bin(asn1.toDer(asn1.create(U, T.SET, true, pi.signedAttrs.value)).getBytes());   // attributs signés, ré-étiquetés en SET
        signature_ok = crypto.verify(pi.digest, set, cert.publicKey, pi.signature);
    } catch { signature_ok = false; }
    return { integrity_ok, signature_ok };
}

/** Confiance de la chaîne : signatures successives, puis racine (ou certificat émis par une racine) connue du magasin du serveur. */
function chainTrust(leaf, others) {
    const chain = [leaf];
    let cur = leaf;
    while (!(cur.checkIssued(cur) && cur.verify(cur.publicKey))) {
        const next = others.find(c => !chain.includes(c) && cur.checkIssued(c) && cur.verify(c.publicKey));
        if (!next) break;
        chain.push(next); cur = next;
    }
    const top = chain[chain.length - 1];
    const info = certInfo(top);
    // Racine connue : même certificat, certificat émis par une racine connue, ou version « croisée » d'une racine connue (même nom, même clé publique)
    const spki = (c) => c.publicKey.export({ type: 'spki', format: 'der' });
    const topKey = spki(top);
    const known = roots().some(r => r.fingerprint256 === top.fingerprint256 || (top.checkIssued(r) && top.verify(r.publicKey)) || (r.subject === top.subject && spki(r).equals(topKey)));
    return known
        ? { trusted: true, root: info.subject }
        : { trusted: false, root: info.subject, root_fingerprint_sha256: info.fingerprint_sha256, reason: 'Autorité racine inconnue du magasin de confiance du serveur (Acrobat et les lecteurs PDF ont leurs propres listes).' };
}

const parseGenTime = (g) => {
    const m = String(g).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString() : String(g);
};

/** Vérifie la première signature d'un PDF : intégrité, certificat signataire, et jeton d'horodatage s'il existe. */
function verifyPdfSignature(pdf) {
    const raw = pdf.toString('latin1');
    const br = raw.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    const ct = raw.match(/\/Contents\s*<([0-9A-Fa-f]+)>/);
    if (!br || !ct) return { signed: false };
    const [a, b, c, d] = br.slice(1).map(Number);
    const content = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
    const root = asn1.fromDer(forge.util.createBuffer(Buffer.from(ct[1], 'hex').toString('binary')), { parseAllBytes: false });
    const signedData = root.value[1].value[0];
    const certs = certsOf(signedData);
    const si = signedData.value[signedData.value.length - 1].value[0];
    const pi = parseSignerInfo(si);
    const cert = pickCert(certs, pi.serialHex);
    const out = { signed: true, ...checkSignerInfo(pi, content, cert) };
    if (cert) { out.signer = certInfo(cert); out.signer_trust = chainTrust(cert, certs); }

    // Jeton d'horodatage : attribut non signé de la signature
    const last = si.value[si.value.length - 1];
    const tsAttr = last.tagClass === CTX && last.type === 1 ? last.value.find(x => asn1.derToOid(x.value[0].value) === OID_TS_TOKEN_ATTR) : null;
    if (!tsAttr) { out.timestamp = { present: false }; return out; }
    try {
        const tsd = tsAttr.value[1].value[0].value[1].value[0];
        const tcerts = certsOf(tsd);
        const tpi = parseSignerInfo(tsd.value[tsd.value.length - 1].value[0]);
        const tcert = pickCert(tcerts, tpi.serialHex);
        const tstOctets = tsd.value[2].value[1].value[0].value;
        const tst = asn1.fromDer(forge.util.createBuffer(tstOctets));
        const imprint = bin(tst.value[2].value[1].value);
        const hashName = HASHES[asn1.derToOid(tst.value[2].value[0].value[0].value)] || 'sha256';
        const chk = checkSignerInfo(tpi, bin(tstOctets), tcert);
        out.timestamp = {
            present: true,
            gen_time: parseGenTime(tst.value[4].value),
            imprint_matches_signature: imprint.equals(crypto.createHash(hashName).update(pi.signature).digest()),
            token_integrity_ok: chk.integrity_ok,
            token_signature_ok: chk.signature_ok,
            ...(tcert ? { tsa: certInfo(tcert), tsa_trust: chainTrust(tcert, tcerts) } : {}),
        };
    } catch (e) { out.timestamp = { present: true, error: 'Jeton illisible : ' + e.message }; }
    return out;
}

module.exports = { verifyPdfSignature };
