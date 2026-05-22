const express = require('express');
const router = express.Router();
const rhController = require('./rh.controller');
const { authenticateAdmin } = require('../../shared/middleware');

// Stats and Hierarchy
router.get('/stats', authenticateAdmin, rhController.getStats);
router.get('/hierarchy', authenticateAdmin, rhController.getHierarchy);
router.get('/organisation-chart', authenticateAdmin, rhController.getOrganisationChart);
router.get('/onboarding', authenticateAdmin, rhController.getOnboarding);

// Agents Management
router.get('/agents', authenticateAdmin, rhController.getAgents);
router.delete('/agents/:matricule/ad-link', authenticateAdmin, rhController.deleteADLink);

// Positions
router.get('/positions', authenticateAdmin, rhController.getPositions);
router.get('/active-positions', authenticateAdmin, rhController.getActivePositions);
router.post('/active-positions', authenticateAdmin, rhController.setActivePositions);

// AD Alignments
router.get('/alignments', authenticateAdmin, rhController.getAlignments);
router.post('/align-to-ad', authenticateAdmin, rhController.alignToAD);
router.get('/align-mappings', authenticateAdmin, rhController.getAlignMappings);
router.post('/align-mappings', authenticateAdmin, rhController.setAlignMappings);

// Synchronization
router.post('/sync', authenticateAdmin, rhController.syncRH); // Oracle Sync
router.get('/sync-ad/progress', authenticateAdmin, rhController.getADSyncProgress);
router.post('/sync-ad', authenticateAdmin, rhController.syncAD);
router.get('/sync-azure/progress', authenticateAdmin, rhController.getAzureSyncProgress);
router.post('/sync-azure', authenticateAdmin, rhController.syncAzure);
router.get('/logs', authenticateAdmin, rhController.getLogs);

// AD Matching & Proposals
router.get('/ad-proposals', authenticateAdmin, rhController.getADProposals);
router.post('/ad-proposals/action', authenticateAdmin, rhController.handleADProposal);
router.get('/unlinked-ad', authenticateAdmin, rhController.getUnlinkedAD);
router.post('/associate', authenticateAdmin, rhController.associateManual);
router.get('/ad-search', authenticateAdmin, rhController.searchADManual);
router.get('/agent-details/:matricule', authenticateAdmin, rhController.getAgentDetails);

module.exports = router;
