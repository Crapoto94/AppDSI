const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const ctrl = require('./mailboxes.controller');

router.get('/', authenticateJWT, ctrl.list);

module.exports = router;
