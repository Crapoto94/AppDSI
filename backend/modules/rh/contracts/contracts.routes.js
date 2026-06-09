const express = require('express');
const router = express.Router();
const ctrl = require('./contracts.controller');
const { authenticateJWT, authenticateAdmin } = require('../../../shared/middleware');

router.use(authenticateJWT);

router.get('/stats', authenticateAdmin, ctrl.stats);
router.get('/echeances', authenticateAdmin, ctrl.prochainesEcheances);
router.get('/', authenticateAdmin, ctrl.list);
router.get('/:id', authenticateAdmin, ctrl.get);
router.post('/', authenticateAdmin, ctrl.create);
router.put('/:id', authenticateAdmin, ctrl.update);
router.delete('/:id', authenticateAdmin, ctrl.remove);
router.patch('/:id/toggle-fait', authenticateJWT, ctrl.toggleFait);
router.post('/:id/send-alert', authenticateAdmin, ctrl.sendAlert);
router.post('/import', authenticateAdmin, ctrl.importExcel);

module.exports = router;
