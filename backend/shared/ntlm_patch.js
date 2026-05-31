/**
 * Patch runtime du module `ntlm` (utilisé par `smb2`).
 *
 * Le module `ntlm/lib/smbhash.js` utilise crypto.createCipheriv('DES-ECB', ...)
 * qui dépend du legacy provider OpenSSL 3 — non chargé par défaut depuis
 * Node 17+. Plutôt que de dépendre du flag `--openssl-legacy-provider`
 * (qui n'est pas toujours appliqué selon le mode de démarrage), on remplace
 * les fonctions `lmhashbuf` et `nthashbuf` par des implémentations basées sur
 * `des.js` (DES pur JS) + un MD4 manuel.
 *
 * À require UNE FOIS, le plus tôt possible, AVANT que `smb2` ne soit chargé.
 */
const DES = require('des.js');

let patched = false;

function lmhashbuf(inputstr) {
    // ASCII --> uppercase, padded to 14 bytes (null-padded)
    const x = String(inputstr || '').substring(0, 14).toUpperCase();
    const xl = Buffer.byteLength(x, 'ascii');
    const y = Buffer.alloc(14);
    y.write(x, 0, xl, 'ascii');

    // Récupération de oddpar/expandkey via ntlm/lib/common
    const $ = require('ntlm/lib/common');
    const halves = [
        $.oddpar($.expandkey(y.slice(0, 7))),
        $.oddpar($.expandkey(y.slice(7, 14))),
    ];

    // DES-ECB chaque moitié sur la constante "KGS!@#$%"
    const magic = Buffer.from('KGS!@#$%', 'binary');
    const buf = Buffer.alloc(16);
    halves.forEach((key, i) => {
        const des = DES.DES.create({ type: 'encrypt', key });
        const out = des.update(magic);
        Buffer.from(out).copy(buf, i * 8);
    });
    return buf;
}

function md4(buffer) {
    // Implémentation manuelle de MD4 (RFC 1320) — nécessaire car OpenSSL 3
    // retire MD4 même avec le legacy provider sur certaines plateformes.
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    const f = (x, y, z) => (x & y) | ((~x) & z);
    const g = (x, y, z) => (x & y) | (x & z) | (y & z);
    const h = (x, y, z) => x ^ y ^ z;
    const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

    // Padding : append 0x80, then zeros, then 64-bit length
    const len = buffer.length;
    const bits = len * 8;
    const padLen = (len % 64 < 56) ? (56 - (len % 64)) : (120 - (len % 64));
    const padded = Buffer.alloc(len + padLen + 8);
    buffer.copy(padded, 0);
    padded[len] = 0x80;
    padded.writeUInt32LE(bits >>> 0, padded.length - 8);
    padded.writeUInt32LE(Math.floor(bits / 0x100000000) >>> 0, padded.length - 4);

    for (let i = 0; i < padded.length; i += 64) {
        const X = new Array(16);
        for (let j = 0; j < 16; j++) X[j] = padded.readUInt32LE(i + j * 4);

        const aa = a, bb = b, cc = c, dd = d;

        // Round 1
        const r1 = (a0, b0, c0, d0, k, s) => rotl((a0 + f(b0, c0, d0) + X[k]) >>> 0, s);
        a = r1(a, b, c, d, 0, 3);  d = r1(d, a, b, c, 1, 7);  c = r1(c, d, a, b, 2, 11); b = r1(b, c, d, a, 3, 19);
        a = r1(a, b, c, d, 4, 3);  d = r1(d, a, b, c, 5, 7);  c = r1(c, d, a, b, 6, 11); b = r1(b, c, d, a, 7, 19);
        a = r1(a, b, c, d, 8, 3);  d = r1(d, a, b, c, 9, 7);  c = r1(c, d, a, b, 10, 11); b = r1(b, c, d, a, 11, 19);
        a = r1(a, b, c, d, 12, 3); d = r1(d, a, b, c, 13, 7); c = r1(c, d, a, b, 14, 11); b = r1(b, c, d, a, 15, 19);

        // Round 2
        const r2 = (a0, b0, c0, d0, k, s) => rotl((a0 + g(b0, c0, d0) + X[k] + 0x5a827999) >>> 0, s);
        a = r2(a, b, c, d, 0, 3);  d = r2(d, a, b, c, 4, 5);  c = r2(c, d, a, b, 8, 9);  b = r2(b, c, d, a, 12, 13);
        a = r2(a, b, c, d, 1, 3);  d = r2(d, a, b, c, 5, 5);  c = r2(c, d, a, b, 9, 9);  b = r2(b, c, d, a, 13, 13);
        a = r2(a, b, c, d, 2, 3);  d = r2(d, a, b, c, 6, 5);  c = r2(c, d, a, b, 10, 9); b = r2(b, c, d, a, 14, 13);
        a = r2(a, b, c, d, 3, 3);  d = r2(d, a, b, c, 7, 5);  c = r2(c, d, a, b, 11, 9); b = r2(b, c, d, a, 15, 13);

        // Round 3
        const r3 = (a0, b0, c0, d0, k, s) => rotl((a0 + h(b0, c0, d0) + X[k] + 0x6ed9eba1) >>> 0, s);
        a = r3(a, b, c, d, 0, 3);  d = r3(d, a, b, c, 8, 9);  c = r3(c, d, a, b, 4, 11); b = r3(b, c, d, a, 12, 15);
        a = r3(a, b, c, d, 2, 3);  d = r3(d, a, b, c, 10, 9); c = r3(c, d, a, b, 6, 11); b = r3(b, c, d, a, 14, 15);
        a = r3(a, b, c, d, 1, 3);  d = r3(d, a, b, c, 9, 9);  c = r3(c, d, a, b, 5, 11); b = r3(b, c, d, a, 13, 15);
        a = r3(a, b, c, d, 3, 3);  d = r3(d, a, b, c, 11, 9); c = r3(c, d, a, b, 7, 11); b = r3(b, c, d, a, 15, 15);

        a = (a + aa) >>> 0;
        b = (b + bb) >>> 0;
        c = (c + cc) >>> 0;
        d = (d + dd) >>> 0;
    }

    const out = Buffer.alloc(16);
    out.writeUInt32LE(a >>> 0, 0);
    out.writeUInt32LE(b >>> 0, 4);
    out.writeUInt32LE(c >>> 0, 8);
    out.writeUInt32LE(d >>> 0, 12);
    return out;
}

function nthashbuf(str) {
    // MD4 du mot de passe encodé en UCS-2 LE
    const ucs2 = Buffer.from(String(str || ''), 'ucs2');
    return md4(ucs2);
}

/** Pure-JS DES-ECB encryption (équivalent crypto.createCipheriv('DES-ECB', key, '').update(nonce)). */
function desEcbEncrypt(key, plaintext) {
    const des = DES.DES.create({ type: 'encrypt', key });
    return Buffer.from(des.update(plaintext));
}

/** Reproduit ntlm.makeResponse en pur JS (3 blocs DES-ECB sur le nonce). */
function makeResponse($, hash, nonce) {
    const out = Buffer.alloc(24);
    for (let i = 0; i < 3; i++) {
        const keybuf = $.oddpar($.expandkey(hash.slice(i * 7, i * 7 + 7)));
        const ct = desEcbEncrypt(keybuf, nonce);
        ct.copy(out, i * 8, 0, 8);
    }
    return out;
}

/** Remplace `ntlm.encodeType3` en pur JS, pour éviter tout createCipheriv DES. */
function encodeType3PureJs(username, hostname, ntdomain, nonce, password) {
    const $ = require('ntlm/lib/common');
    hostname = String(hostname || '').toUpperCase();
    ntdomain = String(ntdomain || '').toUpperCase();

    const lmh = Buffer.alloc(21);
    lmhashbuf(password).copy(lmh);
    const nth = Buffer.alloc(21);
    nthashbuf(password).copy(nth);

    const lmr = makeResponse($, lmh, nonce);
    const ntr = makeResponse($, nth, nonce);

    const usernamelen = Buffer.byteLength(username, 'ucs2');
    const hostnamelen = Buffer.byteLength(hostname, 'ucs2');
    const ntdomainlen = Buffer.byteLength(ntdomain, 'ucs2');
    const lmrlen = 0x18;
    const ntrlen = 0x18;

    const ntdomainoff = 0x40;
    const usernameoff = ntdomainoff + ntdomainlen;
    const hostnameoff = usernameoff + usernamelen;
    const lmroff = hostnameoff + hostnamelen;
    const ntroff = lmroff + lmrlen;

    const msg_len = 64 + ntdomainlen + usernamelen + hostnamelen + lmrlen + ntrlen;
    const buf = Buffer.alloc(msg_len);
    let pos = 0;

    buf.write('NTLMSSP', pos, 7, 'ascii'); pos += 7;
    buf.writeUInt8(0, pos); pos++;
    buf.writeUInt8(0x03, pos); pos++;
    pos += 3; // zero[3]

    buf.writeUInt16LE(lmrlen, pos); pos += 2;
    buf.writeUInt16LE(lmrlen, pos); pos += 2;
    buf.writeUInt16LE(lmroff, pos); pos += 2;
    pos += 2;

    buf.writeUInt16LE(ntrlen, pos); pos += 2;
    buf.writeUInt16LE(ntrlen, pos); pos += 2;
    buf.writeUInt16LE(ntroff, pos); pos += 2;
    pos += 2;

    buf.writeUInt16LE(ntdomainlen, pos); pos += 2;
    buf.writeUInt16LE(ntdomainlen, pos); pos += 2;
    buf.writeUInt16LE(ntdomainoff, pos); pos += 2;
    pos += 2;

    buf.writeUInt16LE(usernamelen, pos); pos += 2;
    buf.writeUInt16LE(usernamelen, pos); pos += 2;
    buf.writeUInt16LE(usernameoff, pos); pos += 2;
    pos += 2;

    buf.writeUInt16LE(hostnamelen, pos); pos += 2;
    buf.writeUInt16LE(hostnamelen, pos); pos += 2;
    buf.writeUInt16LE(hostnameoff, pos); pos += 2;
    pos += 6; // zero[6]

    buf.writeUInt16LE(msg_len, pos); pos += 2;
    pos += 2;
    buf.writeUInt16LE(0x8201, pos); pos += 2;
    pos += 2;

    buf.write(ntdomain, ntdomainoff, ntdomainlen, 'ucs2');
    buf.write(username, usernameoff, usernamelen, 'ucs2');
    buf.write(hostname, hostnameoff, hostnamelen, 'ucs2');
    lmr.copy(buf, lmroff, 0, lmrlen);
    ntr.copy(buf, ntroff, 0, ntrlen);

    return buf;
}

function applyPatch() {
    if (patched) return;
    try {
        const smbhash = require('ntlm/lib/smbhash');
        const ntlm = require('ntlm/lib/ntlm');
        const $ = require('ntlm/lib/common');
        smbhash.lmhashbuf = lmhashbuf;
        smbhash.nthashbuf = nthashbuf;
        smbhash.lmhash = (is) => $.bintohex(lmhashbuf(is));
        smbhash.nthash = (is) => $.bintohex(nthashbuf(is));
        // Remplace aussi encodeType3 (qui contient un appel DES interne via makeResponse)
        ntlm.encodeType3 = encodeType3PureJs;
        patched = true;
        console.log('[NTLM PATCH] DES/MD4 pure-JS appliqué (smbhash + ntlm.encodeType3)');
    } catch (e) {
        console.warn('[NTLM PATCH] échec application:', e.message);
    }
}

module.exports = { applyPatch, lmhashbuf, nthashbuf, md4 };
