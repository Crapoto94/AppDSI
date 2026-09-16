const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./parapheur.controller');
const { authenticateJWT } = require('../../shared/middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── API signature (jeton + identité vérifiée via le mécanisme magapp) ────────
router.get('/public/:token', controller.requireSigner, controller.getPublic);
router.get('/public/:token/signature-image', controller.requireSigner, controller.getPublicSignatureImage);
router.get('/public/:token/certificate', controller.requireSigner, controller.getPublicCertificate);
router.post('/public/:token/certificate', controller.requireSigner, upload.single('file'), controller.savePublicCertificate);
router.get('/public/:token/doc/:docId', controller.requireSigner, controller.getPublicDocument);
router.post('/public/:token/otp/request', controller.requireSigner, controller.requestOtp);
router.post('/public/:token/sign', controller.requireSigner, controller.sign);
router.post('/public/:token/reject', controller.requireSigner, controller.reject);

// ─── Vérification publique (QR code intégré aux PDF signés, sans auth) ────────
router.get('/verify/:token', controller.verifyPublic);
router.get('/verify/:token/doc/:docId', controller.verifyPublicDocument);
router.get('/verify/:token/preuves', controller.verifyEvidence);

// ─── API interne (JWT) ────────────────────────────────────────────────────────
// Routes spécifiques déclarées AVANT /:id
router.get('/all', authenticateJWT, controller.listAll);
router.get('/counts', authenticateJWT, controller.counts);
router.get('/a-signer', authenticateJWT, controller.listToSign);
router.get('/signes', authenticateJWT, controller.listSigned);
router.get('/eligible-secure', authenticateJWT, controller.eligibleSecure);
router.get('/agent-titre', authenticateJWT, controller.agentTitre);
router.get('/my-signature', authenticateJWT, controller.getMySignature);
router.get('/my-signature/image', authenticateJWT, controller.getMySignatureImage);
router.put('/my-signature', authenticateJWT, controller.saveMySignature);

router.get('/delegations', authenticateJWT, controller.listDelegations);
router.post('/delegations', authenticateJWT, controller.saveDelegation);
router.delete('/delegations/:id', authenticateJWT, controller.deleteDelegation);

router.get('/my-certificate', authenticateJWT, controller.getMyCertificate);
router.post('/my-certificate', authenticateJWT, upload.single('file'), controller.saveMyCertificate);
router.delete('/my-certificate', authenticateJWT, controller.deleteMyCertificate);

// Administration des certificats P12
router.get('/certificates', authenticateJWT, controller.listCertificates);
router.delete('/certificates/:id', authenticateJWT, controller.deleteCertificateAdmin);
router.get('/admin/settings', authenticateJWT, controller.getSettings);
router.put('/admin/settings', authenticateJWT, controller.saveSettings);
router.get('/signature-logs', authenticateJWT, controller.signatureLogs);
router.get('/security', authenticateJWT, controller.security);

router.get('/', authenticateJWT, controller.listCreated);
router.post('/', authenticateJWT, upload.fields([
    { name: 'documents', maxCount: 20 },
    { name: 'annexes', maxCount: 20 },
]), controller.create);

router.get('/:id', authenticateJWT, controller.detail);
router.get('/:id/my-token', authenticateJWT, controller.myToken);
router.get('/:id/doc/:docId', authenticateJWT, controller.getDocument);
router.get('/:id/preuves', authenticateJWT, controller.evidence);
router.post('/:id/relance', authenticateJWT, controller.relance);
router.post('/:id/annuler', authenticateJWT, controller.cancel);
router.delete('/:id', authenticateJWT, controller.remove);

module.exports = router;
