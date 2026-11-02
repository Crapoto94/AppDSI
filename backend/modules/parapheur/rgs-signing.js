/**
 * Signature PAdES avec une clé matérielle (RGS** / carte à puce / clé USB) située sur le POSTE du signataire.
 *
 * La clé privée ne quitte jamais la clé matérielle. Le serveur construit la signature CMS (PKCS#7 détachée,
 * adbe.pkcs7.detached, SHA-256 + RSA PKCS#1 v1.5) mais délègue l'unique opération qui exige la clé privée,
 * la signature de l'empreinte des attributs signés, à l'agent local du poste, via le navigateur :
 *
 *   serveur  ──(empreinte à signer)──►  navigateur  ──►  agent local (127.0.0.1)  ──►  clé matérielle (code PIN)
 *   serveur  ◄──(signature RSA)───────  navigateur  ◄──  agent local
 *
 * Le flux de signature habituel (signWithToken) tourne en tâche de fond ; chaque document à signer pose un
 * « défi » (l'empreinte), le navigateur le récupère par interrogation longue (aucune requête HTTP longue :
 * compatible avec les délais des proxys) et renvoie la signature. En cas d'échec ou de refus, le flux
 * existant annule tout (le signataire reste « en cours »).
 */
const crypto = require('crypto');
const forge = require('node-forge');
const { Signer } = require('@signpdf/utils');

const JOB_TTL_MS = 15 * 60 * 1000;        // durée de vie d'une opération de signature
const SIGN_WAIT_MS = 3 * 60 * 1000;       // délai laissé à l'utilisateur pour saisir son code PIN
const POLL_MS = 20 * 1000;                // durée maximale d'une interrogation longue

const jobs = new Map();

function sweep() {
    const now = Date.now();
    for (const [id, j] of jobs) if (now - j.created > JOB_TTL_MS) jobs.delete(id);
}

function createJob(token) {
    sweep();
    const job = { id: crypto.randomBytes(18).toString('hex'), token, state: 'running', challenge: null, result: null, error: null, created: Date.now(), listeners: [], pending: null };
    jobs.set(job.id, job);
    return job;
}

function getJob(id, token) {
    const job = jobs.get(String(id || ''));
    if (!job || job.token !== token) return null;
    return job;
}

function notify(job) {
    const ls = job.listeners.splice(0);
    for (const fn of ls) fn();
}

function finishJob(job, result) { job.state = 'done'; job.result = result; notify(job); }
function failJob(job, err) { job.state = 'error'; job.error = (err && err.message) || String(err); notify(job); }

/** Interrogation longue : renvoie l'état dès qu'il change (défi, fin, erreur) ou « wait » après POLL_MS. */
function poll(job) {
    const snapshot = () => {
        if (job.state === 'challenge') return { state: 'challenge', challengeId: job.challenge.id, hash: job.challenge.hashB64, label: job.challenge.label };
        if (job.state === 'done') return { state: 'done', result: job.result };
        if (job.state === 'error') return { state: 'error', message: job.error };
        return null;
    };
    const now = snapshot();
    if (now) return Promise.resolve(now);
    return new Promise((resolve) => {
        const timer = setTimeout(() => { job.listeners = job.listeners.filter((f) => f !== onEvent); resolve({ state: 'wait' }); }, POLL_MS);
        const onEvent = () => { clearTimeout(timer); resolve(snapshot() || { state: 'wait' }); };
        job.listeners.push(onEvent);
    });
}

/** Réponse du navigateur à un défi : { challengeId, signature (base64) } ou { challengeId, error }. */
function answer(job, { challengeId, signature, error }) {
    const p = job.pending;
    if (!p || !job.challenge || job.challenge.id !== challengeId) throw { status: 409, message: 'Défi de signature inconnu ou expiré.' };
    job.pending = null;
    job.challenge = null;
    job.state = 'running';
    if (error) p.reject(new Error(String(error).slice(0, 300)));
    else p.resolve(Buffer.from(String(signature || ''), 'base64').toString('binary'));
}

/** Décode les certificats envoyés par l'agent (DER en base64) ; le premier est le certificat du signataire. */
function parseCertificates(certB64, chainB64) {
    const decode = (b64) => forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(String(b64), 'base64').toString('binary'))));
    const cert = decode(certB64);
    const chain = (Array.isArray(chainB64) ? chainB64 : []).slice(0, 6).map(decode)
        .filter((c) => c.serialNumber !== cert.serialNumber || c.issuer.hash !== cert.issuer.hash);
    return { cert, chain };
}

function certSummary(cert) {
    const attr = (subject, n) => (subject.getField(n) || {}).value || '';
    const san = (cert.getExtension('subjectAltName') || { altNames: [] }).altNames.find((a) => a.type === 1);
    const pem = forge.pki.certificateToPem(cert);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return {
        subject: attr(cert.subject, 'CN') || cert.subject.attributes.map((a) => a.value).join(' '),
        email: (san && san.value) || attr(cert.subject, 'E') || '',
        issuer: attr(cert.issuer, 'CN') || attr(cert.issuer, 'O'),
        serial: cert.serialNumber,
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter,
        fingerprint: crypto.createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex'),
        pem,
    };
}

/**
 * Signataire @signpdf dont la signature RSA est fournie par le poste du signataire.
 * sign() est appelé par SignPdf pour chaque document : il pose un défi puis attend la réponse du navigateur.
 */
class RemoteSigner extends Signer {
    constructor({ job, cert, chain, label }) {
        super();
        this.job = job;
        this.cert = cert;
        this.chain = chain || [];
        this.label = label || 'document';
    }

    buildSignedData(pdfBuffer, signingTime, signRsa) {
        const p7 = forge.pkcs7.createSignedData();
        p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
        for (const c of [this.cert, ...this.chain]) p7.addCertificate(c);
        p7.addSigner({
            key: { sign: (md) => signRsa(md.digest().getBytes()) },
            certificate: this.cert,
            digestAlgorithm: forge.pki.oids.sha256,
            // Même ordre d'attributs que le signataire P12 (validation européenne)
            authenticatedAttributes: [
                { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
                { type: forge.pki.oids.signingTime, value: signingTime },
                { type: forge.pki.oids.messageDigest },
            ],
        });
        p7.sign({ detached: true });
        return p7;
    }

    async sign(pdfBuffer, signingTime = new Date()) {
        // Passe 1 : empreinte (SHA-256) des attributs signés, avec une signature factice
        let toSign = null;
        this.buildSignedData(pdfBuffer, signingTime, (digest) => { toSign = digest; return crypto.randomBytes(256).toString('binary'); });

        // Défi : le navigateur la fait signer par la clé matérielle (code PIN saisi sur le poste)
        const signature = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.job.pending = null; this.job.challenge = null; reject(new Error("Délai dépassé : la signature n'a pas été confirmée sur le poste.")); }, SIGN_WAIT_MS);
            this.job.pending = { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } };
            this.job.challenge = { id: crypto.randomBytes(12).toString('hex'), hashB64: Buffer.from(toSign, 'binary').toString('base64'), label: this.label };
            this.job.state = 'challenge';
            notify(this.job);
        });

        // La signature doit être valide pour la clé publique du certificat annoncé (sinon : mauvais certificat, clé ou algorithme)
        let valid = false;
        try { valid = this.cert.publicKey.verify(toSign, signature, 'RSASSA-PKCS1-V1_5'); } catch { valid = false; }
        if (!valid) throw new Error("La signature reçue ne correspond pas au certificat sélectionné (clé RSA et SHA-256 attendus).");

        // Passe 2 : même contenu et même date de signature → mêmes attributs signés, avec la vraie signature
        const p7 = this.buildSignedData(pdfBuffer, signingTime, (digest) => {
            if (digest !== toSign) throw new Error('Empreinte incohérente entre les deux passes de signature.');
            return signature;
        });
        return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
    }
}

module.exports = { createJob, getJob, poll, answer, finishJob, failJob, parseCertificates, certSummary, RemoteSigner };
