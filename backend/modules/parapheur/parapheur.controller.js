const service = require('./parapheur.service');
const { authenticateJWT, isSuperAdmin, isAdminLike } = require('../../shared/middleware');
const path = require('path');

function sendError(res, err, fallback) {
    const status = err && err.status ? err.status : 500;
    const message = (err && err.message) || fallback || 'Erreur serveur';
    if (status >= 500) console.error('[PARAPHEUR]', err);
    res.status(status).json({ message });
}

function serveFile(res, f, { inline = true, filename } = {}) {
    const name = filename || f.filename || 'document.pdf';
    const ext = path.extname(name).toLowerCase();
    const type = f.mimetype || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"`);
    if (f.absolutePath) return res.sendFile(f.absolutePath);
    return res.send(f.buffer);
}

const controller = {
    setSendMail: service.setSendMail,

    /**
     * Vérifie l'identité du signataire avant d'accéder aux routes « publiques ».
     * Le lien email contient le jeton de signature ; on exige en plus une
     * authentification AD via le mécanisme du magasin d'applications
     * (POST /api/auth/magapp-login → JWT), et l'identité du JWT doit
     * correspondre au signataire (email, ou login = partie locale de l'email).
     */
    requireSigner: (req, res, next) => {
        authenticateJWT(req, res, async () => {
            try {
                const signataire = await service.getSignerByToken(req.params.token);
                if (!signataire) return res.status(404).json({ message: 'Lien de signature introuvable.' });
                try { service.assertLinkValid(signataire); }
                catch (e) { return res.status(e.status || 410).json({ message: e.message }); }
                const jwtEmail = String((req.user && req.user.email) || '').toLowerCase().trim();
                const jwtUser = String((req.user && req.user.username) || '').toLowerCase().trim();
                const sigEmail = String(signataire.email || '').toLowerCase().trim();
                const sigLogin = sigEmail.split('@')[0];
                const jwtLogin = jwtEmail.split('@')[0];
                const match = (jwtEmail && jwtEmail === sigEmail)
                    || (jwtUser && (jwtUser === sigLogin || jwtUser === sigEmail))
                    || (jwtLogin && sigLogin && jwtLogin === sigLogin);
                if (match) {
                    req.signataire = signataire;
                    return next();
                }
                // Signataire extérieur : jeton restreint délivré après vérification
                // du code envoyé par e-mail (aucun compte AD requis).
                if (req.user && req.user.scope === 'parapheur_external'
                    && Number(req.user.signataire_id) === Number(signataire.id)
                    && service.isExternalSigner(signataire)) {
                    req.signataire = signataire;
                    return next();
                }
                // Pas le signataire lui-même : on autorise un délégataire disposant
                // d'une délégation active de sa part. Jamais pour la signature
                // sécurisée P12 (le certificat appartient en propre au signataire).
                if (signataire.signature_mode !== 'securise' && jwtEmail) {
                    const delegation = await service.getActiveDelegation(signataire.email, jwtEmail);
                    if (delegation) {
                        req.signataire = signataire;
                        req.delegation = delegation;
                        return next();
                    }
                }
                return res.status(403).json({ message: "Votre identité ne correspond pas au signataire attendu pour ce document." });
            } catch (e) {
                console.error('[PARAPHEUR] vérification signataire:', e);
                res.status(500).json({ message: 'Erreur de vérification de l\'identité' });
            }
        });
    },

    // ─── Public (jeton + identité vérifiée) ───────────────────────────────────
    getPublic: async (req, res) => {
        try {
            const info = await service.getPublicInfo(req.params.token, req);
            res.json(info);
        } catch (e) { sendError(res, e, 'Parapheur introuvable'); }
    },

    getPublicDocument: async (req, res) => {
        try {
            const signed = req.query.signed === '1' || req.query.signed === 'true';
            const download = req.query.download === '1';
            const f = await service.getSignedDocument(req.signataire.parapheur_id, req.params.docId, { signed });
            if (!f) return res.status(404).send('Document introuvable');
            serveFile(res, f, { inline: !download });
        } catch (e) { sendError(res, e, 'Document introuvable'); }
    },

    getPublicSignatureImage: async (req, res) => {
        try {
            const email = req.delegation ? req.delegation.delegate_email : req.signataire.email;
            const f = await service.getSignatureImageByEmail(email);
            if (!f) return res.status(404).send('Pas de signature');
            serveFile(res, { ...f, mimetype: 'image/png' }, { inline: true, filename: 'signature.png' });
        } catch (e) { sendError(res, e, 'Signature introuvable'); }
    },

    // ─── Certificat P12 (signature sécurisée) ────────────────────────────────
    getPublicCertificate: async (req, res) => {
        try {
            const m = await service.getCertificateMeta(req.signataire.email);
            res.json({ has_certificate: !!m, filename: m ? m.filename : null });
        } catch (e) { sendError(res, e, 'Erreur certificat'); }
    },

    savePublicCertificate: async (req, res) => {
        try {
            const r = await service.saveCertificate(req.signataire.email, req.signataire.agent_id, req.file, {
                password: req.body && req.body.certificatePassword,
                name: req.signataire.nom,
                remember: !(req.body && (req.body.remember === 'false' || req.body.remember === false)),
            });
            res.json(r);
        } catch (e) { sendError(res, e, 'Import du certificat impossible'); }
    },

    getMyCertificate: async (req, res) => {
        try {
            const m = await service.getCertificateMeta(req.user.email);
            res.json({ has_certificate: !!m, filename: m ? m.filename : null, updated_at: m ? m.updated_at : null });
        } catch (e) { sendError(res, e, 'Erreur certificat'); }
    },

    saveMyCertificate: async (req, res) => {
        try {
            const r = await service.saveCertificate(req.user.email, req.user.id, req.file, {
                password: req.body && req.body.certificatePassword,
                name: req.user.displayName,
                remember: !(req.body && (req.body.remember === 'false' || req.body.remember === false)),
            });
            res.json(r);
        } catch (e) { sendError(res, e, 'Import du certificat impossible'); }
    },

    deleteMyCertificate: async (req, res) => {
        try {
            res.json(await service.deleteCertificate(req.user.email));
        } catch (e) { sendError(res, e, 'Suppression impossible'); }
    },

    // ─── Administration des certificats ──────────────────────────────────────
    listCertificates: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            res.json(await service.listCertificates());
        } catch (e) { sendError(res, e, 'Erreur liste certificats'); }
    },

    deleteCertificateAdmin: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            res.json(await service.deleteCertificateById(parseInt(req.params.id, 10)));
        } catch (e) { sendError(res, e, 'Suppression impossible'); }
    },

    signatureLogs: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            res.json(await service.listSignatureLogs());
        } catch (e) { sendError(res, e, 'Erreur journal'); }
    },

    getSettings: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            res.json(await service.getParapheurSettings());
        } catch (e) { sendError(res, e, 'Erreur paramètres'); }
    },

    saveSettings: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            const result = await service.saveParapheurSettings({
                publicBaseUrl: req.body && req.body.public_base_url,
                bulkSignMention: req.body && req.body.bulk_sign_mention,
                notifyIntervalMinutes: req.body && req.body.notify_interval_minutes,
            });
            res.json(result);
        } catch (e) { sendError(res, e, 'Enregistrement impossible'); }
    },

    getCa: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            const ca = await service.getPlatformCa();
            if (!ca) return res.json({ exists: false });
            res.json({
                exists: true,
                subject: ca.subject,
                serial: ca.serial,
                fingerprint: ca.fingerprint,
                valid_from: ca.valid_from,
                valid_to: ca.valid_to,
                cert_pem: ca.certPem,
            });
        } catch (e) { sendError(res, e, 'Erreur autorité de certification'); }
    },

    generateCa: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            const ca = await service.generatePlatformCa();
            res.json({ exists: true, subject: ca.subject, serial: ca.serial, fingerprint: ca.fingerprint, valid_to: ca.valid_to });
        } catch (e) { sendError(res, e, 'Génération impossible'); }
    },

    downloadCa: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            const ca = await service.getPlatformCa();
            if (!ca || !ca.certPem) return res.status(404).send('Aucune autorité de certification');
            res.setHeader('Content-Type', 'application/x-pem-file');
            res.setHeader('Content-Disposition', 'attachment; filename="ac-parapheur.pem"');
            res.send(ca.certPem);
        } catch (e) { sendError(res, e, 'Téléchargement impossible'); }
    },

    security: async (req, res) => {
        try {
            if (!isAdminLike(req.user)) return res.status(403).json({ message: 'Accès administrateur requis.' });
            res.json(await service.listSecurity());
        } catch (e) { sendError(res, e, 'Erreur sécurité'); }
    },

    sign: async (req, res) => {
        try {
            const result = await service.signWithToken(req.params.token, {
                signatureDataUrl: req.body && req.body.signatureDataUrl,
                signatureNote: req.body && req.body.signatureNote,
                signatureNoteDataUrl: req.body && req.body.signatureNoteDataUrl,
                noteOffsetX: req.body && req.body.noteOffsetX,
                noteOffsetY: req.body && req.body.noteOffsetY,
                noteSize: req.body && req.body.noteSize,
                memorize: req.body && req.body.memorize,
                certificatePassword: req.body && req.body.certificatePassword,
                otpCode: req.body && req.body.otpCode,
                documentIds: req.body && req.body.documentIds,
                delegation: req.delegation || null,
                req,
            });
            res.json(result);
        } catch (e) { sendError(res, e, 'Signature impossible'); }
    },

    requestOtp: async (req, res) => {
        try {
            const r = await service.requestOtp(req.params.token);
            res.json(r);
        } catch (e) { sendError(res, e, 'Envoi du code SMS impossible'); }
    },

    // ─── Signataires extérieurs (sans compte AD) : code par e-mail ───────────
    accessInfo: async (req, res) => {
        try {
            const info = await service.getSignerAccessInfo(req.params.token);
            if (!info) return res.status(404).json({ message: 'Lien de signature introuvable.' });
            res.json(info);
        } catch (e) { sendError(res, e, 'Lien de signature introuvable'); }
    },

    requestEmailOtp: async (req, res) => {
        try {
            const r = await service.requestEmailOtp(req.params.token);
            res.json(r);
        } catch (e) { sendError(res, e, "Envoi du code par e-mail impossible"); }
    },

    verifyEmailOtp: async (req, res) => {
        try {
            const r = await service.verifyEmailOtp(req.params.token, req.body && req.body.code);
            res.json(r);
        } catch (e) { sendError(res, e, 'Vérification impossible'); }
    },

    reject: async (req, res) => {
        try {
            const result = await service.rejectWithToken(req.params.token, {
                comment: req.body && req.body.comment,
                delegation: req.delegation || null,
                req,
            });
            res.json(result);
        } catch (e) { sendError(res, e, 'Refus impossible'); }
    },

    // ─── Vérification publique (QR code, sans authentification) ──────────────
    verifyPublic: async (req, res) => {
        try {
            const info = await service.getVerificationInfo(req.params.token);
            if (!info) return res.status(404).json({ message: 'Page de vérification introuvable.' });
            res.json(info);
        } catch (e) { sendError(res, e, 'Vérification impossible'); }
    },

    verifyPublicDocument: async (req, res) => {
        try {
            const signed = req.query.signed === '1' || req.query.signed === 'true';
            const download = req.query.download === '1';
            const f = await service.getVerificationDocument(req.params.token, parseInt(req.params.docId, 10), { signed });
            if (!f) return res.status(404).send('Document introuvable');
            serveFile(res, f, { inline: !download });
        } catch (e) { sendError(res, e, 'Document introuvable'); }
    },

    // ─── Délégations (agent connecté) ────────────────────────────────────────
    listDelegations: async (req, res) => {
        try {
            res.json(await service.listDelegations(req.user.email));
        } catch (e) { sendError(res, e, 'Erreur délégations'); }
    },

    saveDelegation: async (req, res) => {
        try {
            const b = req.body || {};
            const result = await service.saveDelegation(req.user.email, req.user.displayName || req.user.username, {
                delegateEmail: b.delegateEmail,
                delegateName: b.delegateName,
                delegateAgentId: b.delegateAgentId,
                dateStart: b.dateStart,
                dateEnd: b.dateEnd,
            });
            res.json(result);
        } catch (e) { sendError(res, e, 'Enregistrement impossible'); }
    },

    deleteDelegation: async (req, res) => {
        try {
            const result = await service.deleteDelegation(
                parseInt(req.params.id, 10),
                req.user.email,
                isAdminLike(req.user)
            );
            res.json(result);
        } catch (e) { sendError(res, e, 'Suppression impossible'); }
    },

    // ─── Authentifié ─────────────────────────────────────────────────────────
    create: async (req, res) => {
        try {
            let payload = {};
            try { payload = req.body && req.body.payload ? JSON.parse(req.body.payload) : (req.body || {}); } catch { payload = {}; }
            const uploaded = req.files || {};
            const result = await service.createParapheur({
                files: Array.isArray(uploaded) ? uploaded : (uploaded.documents || []),
                annexes: Array.isArray(uploaded) ? [] : (uploaded.annexes || []),
                payload,
                user: req.user || {},
                req,
            });
            res.status(201).json(result);
        } catch (e) { sendError(res, e, 'Création impossible'); }
    },

    listCreated: async (req, res) => {
        try {
            const rows = await service.listCreated(req.user.username);
            res.json(rows);
        } catch (e) { sendError(res, e, 'Erreur liste'); }
    },

    listAll: async (req, res) => {
        try {
            if (!isSuperAdmin(req.user)) return res.status(403).json({ message: 'Réservé au super administrateur.' });
            res.json(await service.listAll());
        } catch (e) { sendError(res, e, 'Erreur liste'); }
    },

    remove: async (req, res) => {
        try {
            if (!isSuperAdmin(req.user)) return res.status(403).json({ message: 'Réservé au super administrateur.' });
            const result = await service.deleteParapheur(await service.resolveParapheurId(req.params.id));
            res.json(result);
        } catch (e) { sendError(res, e, 'Suppression impossible'); }
    },

    listToSign: async (req, res) => {
        try {
            const rows = await service.listForEmail(req.user.email, { signed: false });
            res.json(rows);
        } catch (e) { sendError(res, e, 'Erreur liste'); }
    },

    listSigned: async (req, res) => {
        try {
            const rows = await service.listForEmail(req.user.email, { signed: true });
            res.json(rows);
        } catch (e) { sendError(res, e, 'Erreur liste'); }
    },

    counts: async (req, res) => {
        try {
            const data = await service.getCounts(req.user.username, req.user.email);
            res.json(data);
        } catch (e) { sendError(res, e, 'Erreur comptes'); }
    },

    eligibleSecure: async (req, res) => {
        try {
            const rows = await service.getEligibleEmails();
            res.json(rows);
        } catch (e) { sendError(res, e, 'Erreur éligibilité'); }
    },

    agentTitre: async (req, res) => {
        try {
            const result = await service.getAgentTitre({ matricule: req.query.matricule });
            res.json(result);
        } catch (e) { sendError(res, e, 'Titre indisponible'); }
    },

    getMySignature: async (req, res) => {
        try {
            const row = await service.getMySignature(req.user.email);
            res.json({ has_signature: !!row, updated_at: row ? row.updated_at : null });
        } catch (e) { sendError(res, e, 'Erreur signature'); }
    },

    getMySignatureImage: async (req, res) => {
        try {
            const f = await service.getSignatureImageByEmail(req.user.email);
            if (!f) return res.status(404).send('Pas de signature');
            serveFile(res, { ...f, mimetype: 'image/png' }, { inline: true, filename: 'signature.png' });
        } catch (e) { sendError(res, e, 'Signature introuvable'); }
    },

    saveMySignature: async (req, res) => {
        try {
            const result = await service.saveMySignature(req.user.email, req.user.id, req.body && req.body.signatureDataUrl);
            res.json(result);
        } catch (e) { sendError(res, e, 'Enregistrement impossible'); }
    },

    detail: async (req, res) => {
        try {
            const detail = await service.getDetail(await service.resolveParapheurId(req.params.id));
            if (!detail) return res.status(404).json({ message: 'Parapheur introuvable' });
            res.json(detail);
        } catch (e) { sendError(res, e, 'Erreur détail'); }
    },

    myToken: async (req, res) => {
        try {
            const row = await service.getMySignerToken(await service.resolveParapheurId(req.params.id), req.user.email);
            if (!row || !row.token) return res.status(404).json({ message: 'Vous n\'êtes pas signataire de ce parapheur.' });
            res.json({ token: row.token, status: row.status });
        } catch (e) { sendError(res, e, 'Erreur jeton'); }
    },

    getDocument: async (req, res) => {
        try {
            const signed = req.query.signed === '1' || req.query.signed === 'true';
            const f = await service.getSignedDocument(await service.resolveParapheurId(req.params.id), parseInt(req.params.docId, 10), { signed });
            if (!f) return res.status(404).send('Document introuvable');
            const download = req.query.download === '1';
            serveFile(res, f, { inline: !download });
        } catch (e) { sendError(res, e, 'Document introuvable'); }
    },

    evidence: async (req, res) => {
        try {
            const id = await service.resolveParapheurId(req.params.id);
            const detail = await service.getDetail(id);
            if (!detail) return res.status(404).json({ message: 'Parapheur introuvable' });
            const owner = String(detail.created_by_username || '').toLowerCase() === String(req.user.username || '').toLowerCase();
            if (!owner && !isAdminLike(req.user)) {
                return res.status(403).json({ message: "Seul le demandeur (ou un administrateur) peut générer le dossier de preuves." });
            }
            const { buffer, filename } = await service.getEvidenceArchive(id);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.send(buffer);
        } catch (e) { sendError(res, e, 'Dossier de preuves indisponible'); }
    },

    verifySeal: async (req, res) => {
        try {
            const r = await service.verifyParapheurSeal(await service.resolveParapheurId(req.params.id));
            if (!r) return res.status(404).json({ message: 'Parapheur introuvable' });
            res.json(r);
        } catch (e) { sendError(res, e, 'Vérification du sceau impossible'); }
    },

    verifyPublicSeal: async (req, res) => {
        try {
            const r = await service.verifyParapheurSealByToken(req.params.token);
            if (!r) return res.status(404).json({ message: 'Parapheur introuvable' });
            res.json(r);
        } catch (e) { sendError(res, e, 'Vérification du sceau impossible'); }
    },

    verifyEvidence: async (req, res) => {
        try {
            const r = await service.getEvidenceArchiveByToken(req.params.token);
            if (!r) return res.status(404).send('Dossier de preuves introuvable');
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(r.filename)}"`);
            res.send(r.buffer);
        } catch (e) { sendError(res, e, 'Dossier de preuves indisponible'); }
    },

    relance: async (req, res) => {
        try {
            const result = await service.relance(await service.resolveParapheurId(req.params.id), { manual: true, req });
            res.json(result);
        } catch (e) { sendError(res, e, 'Relance impossible'); }
    },

    cancel: async (req, res) => {
        try {
            const result = await service.cancel(await service.resolveParapheurId(req.params.id), req.user.username, req);
            res.json(result);
        } catch (e) { sendError(res, e, 'Annulation impossible'); }
    },
};

module.exports = controller;
