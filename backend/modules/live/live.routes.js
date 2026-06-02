const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const controller = require('./live.controller');

// ── Multer for live attachments (en memory, sauvegarde via storage service) ────
const uploadLive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Routes ─────────────────────────────────────────────────────────────
router.post('/guest-login',        (req, res) => controller.guestLogin(req, res));     // public
router.post('/auth/ad',            (req, res) => controller.adLogin(req, res));        // public
router.post('/auth/otp/request',   (req, res) => controller.otpRequest(req, res));     // public
router.post('/auth/otp/verify',    (req, res) => controller.otpVerify(req, res));      // public
router.post('/auth/sms-token',     (req, res) => controller.smsTokenAuth(req, res));   // public (short-lived token)
router.get('/public-config',       (req, res) => controller.getPublicConfig(req, res));// public
router.get('/config',              authenticateJWT, (req, res) => controller.getConfig(req, res));
router.put('/config',              authenticateJWT, (req, res) => controller.setConfig(req, res));
router.get('/calendars',           authenticateJWT, (req, res) => controller.getCalendars(req, res));
router.get('/count',               authenticateJWT, (req, res) => controller.getWaitingCount(req, res));
router.get('/stats',               authenticateJWT, (req, res) => controller.getStats(req, res));
router.get('/sessions',            authenticateJWT, (req, res) => controller.getSessions(req, res));
router.post('/sessions',           authenticateJWT, (req, res) => controller.createSession(req, res));
router.get('/sessions/:id',        authenticateJWT, (req, res) => controller.getSession(req, res));
router.get('/sessions/:id/messages', authenticateJWT, (req, res) => controller.getMessages(req, res));
router.post('/sessions/:id/claim',    authenticateJWT, (req, res) => controller.claimSession(req, res));
router.post('/sessions/:id/messages', authenticateJWT, (req, res) => controller.sendMessage(req, res));
router.post('/sessions/:id/close',  authenticateJWT, (req, res) => controller.closeSession(req, res));
router.post('/sessions/:id/reject', authenticateJWT, (req, res) => controller.rejectSession(req, res));
router.post('/sessions/:id/task',   authenticateJWT, (req, res) => controller.createTask(req, res));
router.patch('/sessions/:id/type',         authenticateJWT, (req, res) => controller.setTicketType(req, res));
router.patch('/sessions/:id/priority',     authenticateJWT, (req, res) => controller.setTicketPriority(req, res));
router.patch('/sessions/:id/category',     authenticateJWT, (req, res) => controller.setTicketCategory(req, res));
router.patch('/sessions/:id/app',          authenticateJWT, (req, res) => controller.setSessionApp(req, res));
router.post('/sessions/:id/satisfaction',  authenticateJWT, (req, res) => controller.submitSatisfaction(req, res));
router.post('/sessions/:id/emergency',     authenticateJWT, (req, res) => controller.sendEmergencyMessage(req, res));
router.post('/sessions/:id/upload',        authenticateJWT, uploadLive.single('file'), (req, res) => controller.uploadAttachment(req, res));
router.get('/satisfaction',                authenticateJWT, (req, res) => controller.getSatisfactionStats(req, res));

module.exports = router;
