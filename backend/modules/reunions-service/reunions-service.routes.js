const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { SECRET_KEY } = require('../../shared/config');
const { authenticateJWT, isAdminLike, isModuleAdmin } = require('../../shared/middleware');
const ctrl = require('./reunions-service.controller');

const MODULE_KEY = 'reunions-service';

// Administrateur du module = admin global OU utilisateur ayant la tuile
// « Réunions de service » cochée dans les paramètres du Hub (ex. lrigoulat).
const requireModuleAdmin = async (req, res, next) => {
    if (isAdminLike(req.user) || await isModuleAdmin(req.user, MODULE_KEY)) {
        return next();
    }
    return res.status(403).json({ error: 'Réservé aux administrateurs du module.' });
};

// Pièces jointes (PDF, images, documents) en mémoire → écrites via la GED
// (shared/storage.js). 50 Mo max par fichier.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Token accepté en query OU header (pour afficher un PDF/image via une URL
// directe : <iframe src="...?token=...">, <a href="...?token=...">).
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

// ===== Templates (paramétrage) — création/gestion réservées aux admins du module =====
router.get('/access', authenticateJWT, async (req, res) => {
    res.json({ admin: isAdminLike(req.user) || await isModuleAdmin(req.user, MODULE_KEY) });
});
router.get('/templates', authenticateJWT, ctrl.listTemplates);
router.get('/templates/:id', authenticateJWT, ctrl.getTemplate);
router.post('/templates', authenticateJWT, requireModuleAdmin, ctrl.createTemplate);
router.put('/templates/:id', authenticateJWT, requireModuleAdmin, ctrl.updateTemplate);
router.delete('/templates/:id', authenticateJWT, requireModuleAdmin, ctrl.deleteTemplate);
router.post('/templates/:id/duplicate', authenticateJWT, requireModuleAdmin, ctrl.duplicateTemplate);

// ===== Occurrences (réunions concrètes) =====
router.get('/stats', authenticateJWT, ctrl.stats);
router.get('/stats/detailed', authenticateJWT, requireModuleAdmin, ctrl.detailedStats);
router.get('/exchange-meetings', authenticateJWT, ctrl.exchangeMeetings);
router.get('/search', authenticateJWT, ctrl.search);
router.get('/meetings', authenticateJWT, ctrl.listMeetings);
router.post('/meetings', authenticateJWT, ctrl.createMeeting);
router.get('/meetings/:id', authenticateJWT, ctrl.getMeeting);
router.put('/meetings/:id', authenticateJWT, ctrl.updateMeeting);
router.delete('/meetings/:id', authenticateJWT, requireModuleAdmin, ctrl.deleteMeeting);
router.post('/meetings/:id/start', authenticateJWT, ctrl.startMeeting);
// KPI de rubriques : catalogue du tableau de bord, aperçu, recalcul des valeurs figées.
router.get('/kpi-catalog', authenticateJWT, ctrl.kpiCatalog);
router.post('/kpis/preview', authenticateJWT, ctrl.previewKpi);
router.post('/meetings/:id/kpis/refresh', authenticateJWT, ctrl.refreshMeetingKpis);
router.post('/meetings/:id/time-master', authenticateJWT, ctrl.setTimeMaster);
router.post('/meetings/:id/presence/self', authenticateJWT, ctrl.markSelfPresent);
router.post('/meetings/:id/end', authenticateJWT, ctrl.endMeeting);
router.post('/meetings/:id/reopen', authenticateJWT, ctrl.reopenMeeting);

// Compte rendu / transcript associé
router.post('/meetings/:id/link-transcript', authenticateJWT, ctrl.linkTranscript);
router.delete('/meetings/:id/link-transcript', authenticateJWT, ctrl.unlinkTranscript);

// INTERACTs (sondages lancés depuis une réunion)
// Catalogue des formats Interact'Ivry (lecture seule — aucun stockage ici)
router.get('/interact/formats', authenticateJWT, ctrl.getInteractFormats);
router.post('/meetings/:id/polls', authenticateJWT, ctrl.createPoll);
router.get('/meetings/:id/polls/current', authenticateJWT, ctrl.getCurrentPoll);
router.post('/polls/:id/answers', authenticateJWT, ctrl.answerPoll);
router.get('/polls/:id/responses', authenticateJWT, ctrl.getPollResponses);
router.post('/polls/:id/close', authenticateJWT, ctrl.closePoll);
router.delete('/polls/:id', authenticateJWT, ctrl.deletePoll);

// Participants de la réunion (rubrique meta)
router.post('/meetings/:id/participants', authenticateJWT, ctrl.addParticipants);
router.patch('/meetings/:id/participants/:participantId', authenticateJWT, ctrl.toggleParticipantPresence);
router.delete('/meetings/:id/participants/:participantId', authenticateJWT, ctrl.removeParticipant);

// Rubriques : CRUD à la volée réservé au maître du temps / admins.
router.post('/meetings/:id/sections', authenticateJWT, ctrl.createSection);
router.patch('/meetings/:id/sections/order', authenticateJWT, ctrl.reorderSections);
router.patch('/sections/:id/completed', authenticateJWT, ctrl.setSectionCompleted);
router.put('/sections/:id', authenticateJWT, ctrl.updateSection);
router.delete('/sections/:id', authenticateJWT, ctrl.deleteSection);

// Items (contenu riche par rubrique)
router.post('/meetings/:id/sections/:sectionId/items', authenticateJWT, ctrl.createItem);
router.patch('/meetings/:id/sections/:sectionId/items/order', authenticateJWT, ctrl.reorderItems);
router.put('/items/:itemId', authenticateJWT, ctrl.updateItem);
router.patch('/items/:itemId/move', authenticateJWT, ctrl.moveItem);
router.delete('/items/:itemId', authenticateJWT, ctrl.deleteItem);

// Pièces jointes
router.post('/meetings/:id/attachments', authenticateJWT, upload.array('files', 10), ctrl.uploadAttachments);
router.get('/attachments/:id/file', authJwtOrQuery, ctrl.downloadAttachment);
router.delete('/attachments/:id', authenticateJWT, ctrl.deleteAttachment);

module.exports = router;
