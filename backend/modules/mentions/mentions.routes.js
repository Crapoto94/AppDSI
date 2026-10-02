const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const ctrl = require('./mentions.controller');

router.get('/users', authenticateJWT, ctrl.searchUsers);
router.get('/', authenticateJWT, ctrl.list);
router.get('/unread-count', authenticateJWT, ctrl.unreadCount);
router.post('/read-all', authenticateJWT, ctrl.markAllRead);
router.post('/digest/run', authenticateJWT, authenticateAdmin, ctrl.runDigest);
router.post('/:id/read', authenticateJWT, ctrl.markRead);

module.exports = router;
