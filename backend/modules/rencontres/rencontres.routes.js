const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const rencontresCtrl = require('./rencontres.controller');
const reunionsCtrl = require('./reunions.controller');
const jwt = require('jsonwebtoken');
const { authenticateJWT, authenticateAdmin, authenticateAdminUI, authenticateAdminOrFinances } = require('../../shared/middleware');
const { SECRET_KEY } = require('../../shared/config');

// Accepte token en query OU header (utile pour <a href="...?token=..."> côté front).
const authJwtOrQuery = (req, res, next) => {
    const headerToken = (req.headers.authorization || '').split(' ')[1];
    const token = req.query.token || headerToken;
    if (!token) return res.status(401).json({ message: 'Token manquant' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token invalide' });
        req.user = user;
        next();
    });
};

// Multer: memory storage for CSV/Excel import
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Multer: memory storage for reunion attachments (sauvegarde via storage service)
const uploadReunion = multer({ storage: multer.memoryStorage() });

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
reunionRouter.post('/free-slots', authenticateJWT, reunionsCtrl.freeSlots);
reunionRouter.get('/', authenticateJWT, reunionsCtrl.getAll);
reunionRouter.post('/', authenticateJWT, reunionsCtrl.create);
reunionRouter.get('/:id', authenticateJWT, reunionsCtrl.getById);
reunionRouter.post('/:id/compte-rendu', authenticateJWT, reunionsCtrl.sendCompteRendu);
reunionRouter.post('/:id/outlook', authenticateJWT, reunionsCtrl.createOutlookEvent);
reunionRouter.put('/:id/reschedule', authenticateJWT, reunionsCtrl.reschedule);
reunionRouter.put('/:id', authenticateJWT, reunionsCtrl.update);
reunionRouter.delete('/:id', authenticateJWT, reunionsCtrl.deleteOne);
reunionRouter.delete('/', authenticateAdminUI, reunionsCtrl.deleteAll);

// Reunion participants
reunionRouter.post('/:id/participants', authenticateJWT, reunionsCtrl.addParticipant);
reunionRouter.delete('/participants/:id', authenticateJWT, reunionsCtrl.deleteParticipant);

// Reunion attachments
reunionRouter.post('/:id/attachments', authenticateJWT, uploadReunion.array('files', 10), reunionsCtrl.uploadAttachments);
reunionRouter.get('/:id/attachments', authenticateJWT, reunionsCtrl.getAttachments);
reunionRouter.get('/attachments/:id/file', authJwtOrQuery, reunionsCtrl.downloadAttachment);
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
