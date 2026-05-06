const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const rencontresCtrl = require('./rencontres.controller');
const reunionsCtrl = require('./reunions.controller');
const { authenticateJWT, authenticateAdmin, authenticateAdminOrFinances } = require('../../shared/middleware');

// Multer: memory storage for CSV/Excel import
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Multer: disk storage for reunion attachments
const uploadReunion = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'file_reunions')),
        filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
    })
});

// ===== RENCONTRES BUDGÉTAIRES =====
router.get('/', authenticateJWT, rencontresCtrl.getAll);
router.get('/stats/directions', authenticateJWT, rencontresCtrl.statsDirections);
router.get('/stats/annees', authenticateJWT, rencontresCtrl.statsAnnees);
router.get('/:id', authenticateJWT, rencontresCtrl.getById);
router.post('/import', authenticateAdminOrFinances, uploadMemory.single('file'), rencontresCtrl.importFile);
router.post('/from-reunion', authenticateJWT, rencontresCtrl.createFromReunion);
router.post('/', authenticateAdminOrFinances, rencontresCtrl.create);
router.put('/:id', authenticateAdminOrFinances, rencontresCtrl.update);
router.delete('/delete-all', authenticateAdmin, rencontresCtrl.deleteAll);
router.delete('/:id', authenticateAdmin, rencontresCtrl.deleteOne);

// Participants
router.post('/:id/participants', authenticateJWT, rencontresCtrl.addParticipant);
router.delete('/participants/:id', authenticateJWT, rencontresCtrl.deleteParticipant);

// GLPI Link
router.get('/:id/glpi-link', authenticateJWT, rencontresCtrl.glpiLink);

// Suivi
router.post('/:id/suivi', authenticateJWT, rencontresCtrl.addSuivi);
router.put('/suivi/:id', authenticateJWT, rencontresCtrl.updateSuivi);
router.delete('/suivi/:id', authenticateJWT, rencontresCtrl.deleteSuivi);

// ===== RÉUNIONS =====
const reunionRouter = express.Router();

reunionRouter.post('/generate', authenticateJWT, reunionsCtrl.generate);
reunionRouter.get('/', authenticateJWT, reunionsCtrl.getAll);
reunionRouter.post('/', authenticateJWT, reunionsCtrl.create);
reunionRouter.get('/:id', authenticateJWT, reunionsCtrl.getById);
reunionRouter.post('/:id/compte-rendu', authenticateJWT, reunionsCtrl.sendCompteRendu);
reunionRouter.put('/:id', authenticateJWT, reunionsCtrl.update);
reunionRouter.delete('/:id', authenticateJWT, reunionsCtrl.deleteOne);
reunionRouter.delete('/', authenticateJWT, reunionsCtrl.deleteAll);

// Reunion participants
reunionRouter.post('/:id/participants', authenticateJWT, reunionsCtrl.addParticipant);
reunionRouter.delete('/participants/:id', authenticateJWT, reunionsCtrl.deleteParticipant);

// Reunion attachments
reunionRouter.post('/:id/attachments', authenticateJWT, uploadReunion.array('files', 10), reunionsCtrl.uploadAttachments);
reunionRouter.get('/:id/attachments', authenticateJWT, reunionsCtrl.getAttachments);
reunionRouter.delete('/attachments/:id', authenticateJWT, reunionsCtrl.deleteAttachment);

// ===== DIRECTIONS & SERVICES =====
const directionsRouter = express.Router();
directionsRouter.get('/', authenticateJWT, rencontresCtrl.getDirectionsServices);

// ===== DIRECTION EMAILS =====
const dirEmailsRouter = express.Router();
dirEmailsRouter.get('/', authenticateJWT, rencontresCtrl.getDirectionEmails);
dirEmailsRouter.get('/:direction', authenticateJWT, rencontresCtrl.getDirectionEmailsByDirection);
dirEmailsRouter.post('/', authenticateAdminOrFinances, rencontresCtrl.addDirectionEmail);
dirEmailsRouter.post('/batch/:direction', authenticateAdminOrFinances, rencontresCtrl.batchDirectionEmails);
dirEmailsRouter.delete('/:id', authenticateAdminOrFinances, rencontresCtrl.deleteDirectionEmail);

module.exports = { rencontresRouter: router, reunionRouter, directionsRouter, dirEmailsRouter };
