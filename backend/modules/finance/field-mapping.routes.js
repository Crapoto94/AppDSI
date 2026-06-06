const express = require('express');
const router = express.Router();
const fieldMappingController = require('./field-mapping.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');

router.get('/rubriques', authenticateJWT, fieldMappingController.getRubriques);
router.post('/rubriques', authenticateAdmin, fieldMappingController.createRubrique);
router.put('/rubriques/:id', authenticateAdmin, fieldMappingController.updateRubrique);
router.delete('/rubriques/:id', authenticateAdmin, fieldMappingController.deleteRubrique);

router.post('/rubriques/:id/variables', authenticateAdmin, fieldMappingController.createVariable);
router.put('/variables/:id', authenticateAdmin, fieldMappingController.updateVariable);
router.delete('/variables/:id', authenticateAdmin, fieldMappingController.deleteVariable);

router.get('/pg-schemas', authenticateJWT, fieldMappingController.getPgSchemas);
router.get('/pg-tables', authenticateJWT, fieldMappingController.getPgTables);
router.get('/pg-columns/:schema/:table', authenticateJWT, fieldMappingController.getPgColumns);

router.get('/preview/:id', authenticateJWT, fieldMappingController.previewMapping);
router.get('/resolve/:name', authenticateJWT, fieldMappingController.resolveMapping);
router.get('/resolve/:name/children/:parentValue', authenticateJWT, fieldMappingController.getChildren);
router.get('/years/:name', authenticateJWT, fieldMappingController.getAvailableYears);

router.post('/assign-operation', authenticateJWT, fieldMappingController.assignOperation);
router.post('/assign-app', authenticateJWT, fieldMappingController.assignApp);
router.get('/operations', authenticateJWT, fieldMappingController.getOperations);

module.exports = router;