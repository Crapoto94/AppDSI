const express = require('express');
const router = express.Router();
const glpiController = require('./glpi.controller');
const { authenticateAdmin, authenticateJWT, authenticateInternalOrAdmin } = require('../../shared/middleware');

// Settings & Connection
router.get('/settings', authenticateAdmin, glpiController.getSettings);
router.post('/settings', authenticateAdmin, glpiController.saveSettings);
router.post('/test-connection', authenticateAdmin, glpiController.testConnection);

// Status & Progress
router.get('/sync-status', authenticateAdmin, glpiController.getSyncStatus);
router.post('/sync-cancel', authenticateAdmin, glpiController.cancelSync);
router.get('/sync-observers-status', authenticateAdmin, glpiController.getObserversStatus);
router.post('/sync-observers-cancel', authenticateAdmin, glpiController.cancelObserversSync);
router.get('/sync-followups-status', authenticateAdmin, glpiController.getFollowupsStatus);
router.post('/sync-followups-cancel', authenticateAdmin, glpiController.cancelFollowupsSync);

// Tickets Operations
router.get('/tickets-count', authenticateAdmin, glpiController.getTicketsCount);
router.get('/tickets-recent', authenticateAdmin, glpiController.getRecentTickets);
router.get('/user-tickets/:username', authenticateJWT, glpiController.getUserTickets);
router.post('/tickets', authenticateJWT, glpiController.createTicket);
router.put('/tickets/:id/close', authenticateJWT, glpiController.closeTicket);

// Synchronization
router.post('/sync-recent', authenticateInternalOrAdmin, glpiController.syncRecent);
router.post('/sync-all-tickets', authenticateInternalOrAdmin, glpiController.syncAllTickets);
router.post('/sync-observers', authenticateInternalOrAdmin, glpiController.syncObservers);
router.post('/sync-observers-recent', authenticateInternalOrAdmin, glpiController.syncObservers); // Reuse syncObservers or specific logic if needed
router.post('/sync-followups', authenticateInternalOrAdmin, glpiController.syncFollowups);
router.post('/sync-followups-recent', authenticateInternalOrAdmin, glpiController.syncFollowups); // Reuse syncFollowups

// Profiles & Logs
router.get('/my-profile', authenticateAdmin, glpiController.getMyProfile);
router.get('/sync-logs', authenticateAdmin, glpiController.getSyncLogs);

// Scheduled Syncs
router.post('/cron-test', authenticateAdmin, (req, res) => {
    glpiController.processScheduledSyncs();
    res.json({ message: 'Cron déclenché, voir logs serveur' });
});
router.get('/scheduled-syncs', authenticateAdmin, glpiController.getScheduledSyncs);
router.get('/sync-status-global', authenticateAdmin, glpiController.getSyncStatusGlobal);
router.post('/scheduled-syncs', authenticateAdmin, glpiController.createScheduledSync);
router.put('/scheduled-syncs/:id', authenticateAdmin, glpiController.updateScheduledSync);
router.delete('/scheduled-syncs/:id', authenticateAdmin, glpiController.deleteScheduledSync);
router.post('/scheduled-syncs/:id/run', authenticateAdmin, glpiController.runScheduledSyncManually);

module.exports = router;
