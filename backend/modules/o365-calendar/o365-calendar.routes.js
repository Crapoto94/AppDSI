const express = require('express');
const router = express.Router();
const controller = require('./o365-calendar.controller');
const { authenticateAdmin } = require('../../shared/middleware');

router.get('/', authenticateAdmin, controller.getCalendars);
router.post('/', authenticateAdmin, controller.addCalendar);
router.put('/:id', authenticateAdmin, controller.updateCalendar);
router.delete('/:id', authenticateAdmin, controller.deleteCalendar);

router.get('/available', authenticateAdmin, controller.listAvailableCalendars);
router.post('/:id/sync', authenticateAdmin, controller.syncCalendar);
router.get('/status', authenticateAdmin, controller.getSyncStatus);

module.exports = router;