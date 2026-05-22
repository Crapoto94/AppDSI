const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const controller = require('./tasks.controller');

router.get('/count',             authenticateJWT, (req, res) => controller.getMyTasksCount(req, res));
router.get('/',                  authenticateJWT, (req, res) => controller.getMyTasks(req, res));
router.post('/',                 authenticateJWT, (req, res) => controller.createTask(req, res));
router.patch('/:source/:id',     authenticateJWT, (req, res) => controller.updateTaskStatus(req, res));
router.delete('/personal/:id',   authenticateJWT, (req, res) => controller.deleteTask(req, res));

module.exports = router;
