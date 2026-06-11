const express = require('express');
const router = express.Router();
const glpiController = require('./glpi.controller');
const { authenticateAdmin, authenticateJWT, authenticateInternalOrAdmin, authenticateGLPIControl } = require('../../shared/middleware');

// Settings & Connection
router.get('/settings', authenticateGLPIControl, glpiController.getSettings);
router.post('/settings', authenticateGLPIControl, glpiController.saveSettings);
router.post('/test-connection', authenticateGLPIControl, glpiController.testConnection);
router.post('/test-connection-glpi10', authenticateGLPIControl, glpiController.testConnectionGlpi10);

// Status & Progress
router.get('/sync-status', authenticateGLPIControl, glpiController.getSyncStatus);
router.post('/sync-cancel', authenticateGLPIControl, glpiController.cancelSync);
router.get('/sync-observers-status', authenticateGLPIControl, glpiController.getObserversStatus);
router.post('/sync-observers-cancel', authenticateGLPIControl, glpiController.cancelObserversSync);
router.get('/sync-followups-status', authenticateGLPIControl, glpiController.getFollowupsStatus);
router.post('/sync-followups-cancel', authenticateGLPIControl, glpiController.cancelFollowupsSync);
router.get('/sync-descriptions-status', authenticateGLPIControl, glpiController.getDescriptionsStatus);
router.post('/sync-descriptions-cancel', authenticateGLPIControl, glpiController.cancelDescriptionsSync);
router.get('/sync-names-status', authenticateGLPIControl, glpiController.getNamesStatus);
router.post('/sync-names-cancel', authenticateGLPIControl, glpiController.cancelNamesSync);

// Tickets Operations
router.get('/tickets-count', authenticateGLPIControl, glpiController.getTicketsCount);
router.get('/tickets-recent', authenticateGLPIControl, glpiController.getRecentTickets);
router.get('/user-tickets/:username', authenticateJWT, glpiController.getUserTickets);
router.post('/tickets', authenticateJWT, glpiController.createTicket);
router.put('/tickets/:id/close', authenticateJWT, glpiController.closeTicket);

// Synchronization
router.post('/sync-user-names', authenticateGLPIControl, glpiController.syncUserNames);
router.post('/sync-recent', authenticateInternalOrAdmin, glpiController.syncRecent);
router.post('/sync-all-tickets', authenticateInternalOrAdmin, glpiController.syncAllTickets);
router.post('/sync-full', authenticateInternalOrAdmin, glpiController.syncFull);
router.post('/sync-observers', authenticateInternalOrAdmin, glpiController.syncObservers);
router.post('/sync-observers-recent', authenticateInternalOrAdmin, glpiController.syncObservers); // Reuse syncObservers or specific logic if needed
router.post('/sync-followups', authenticateInternalOrAdmin, glpiController.syncFollowups);
router.post('/sync-followups-recent', authenticateInternalOrAdmin, glpiController.syncFollowups); // Reuse syncFollowups
router.post('/sync-descriptions', authenticateInternalOrAdmin, glpiController.syncDescriptions);
router.post('/sync-groups', authenticateInternalOrAdmin, glpiController.fetchGlpiGroups);
router.get('/sync-groups-status', authenticateGLPIControl, glpiController.getGroupsStatus);
router.post('/sync-groups-cancel', authenticateGLPIControl, glpiController.cancelGroupsSync);

// Document proxy / cache local (images dans les descriptions de tickets)
router.get('/document/:docid', authenticateJWT, glpiController.getDocument);
// Documents GLPI liés à un ticket (images CID d'emails)
router.get('/ticket-docs/:glpi_id', authenticateJWT, glpiController.getTicketCidDocs);

// Import en masse des images GLPI (mise en cache locale pérenne)
router.post('/import-images', authenticateAdmin, glpiController.importImages);
router.get('/import-images-status', authenticateGLPIControl, glpiController.getImportImagesStatus);
router.post('/import-images-cancel', authenticateGLPIControl, glpiController.cancelImportImages);

// Profiles & Logs
router.get('/my-profile', authenticateGLPIControl, glpiController.getMyProfile);
router.get('/sync-logs', authenticateGLPIControl, glpiController.getSyncLogs);

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
