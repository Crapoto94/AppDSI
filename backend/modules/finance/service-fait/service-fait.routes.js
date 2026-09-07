const express = require('express');
const router = express.Router();
const controller = require('./service-fait.controller');
const { authenticateJWT } = require('../../../shared/middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Internal API (requires JWT)
router.post('/', authenticateJWT, upload.single('file'), controller.createWorkflow);
router.post('/statuses', authenticateJWT, controller.getStatuses);
router.get('/:id', authenticateJWT, controller.getWorkflow);
router.post('/:id/pieces-jointes', authenticateJWT, upload.array('files', 10), controller.addPiecesJointes);
router.delete('/pieces-jointes/:pjId', authenticateJWT, controller.deletePieceJointe);

// Public API (no JWT — token-based)
router.get('/public/:token', controller.getPublicByToken);
router.post('/public/:token/decision', controller.submitDecision);

module.exports = router;
