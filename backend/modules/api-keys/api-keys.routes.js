const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../shared/middleware');
const controller = require('./api-keys.controller');

/**
 * @openapi
 * /api/admin/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: Liste toutes les clés API (sans la clé brute)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tableau des clés
 *   post:
 *     tags: [API Keys]
 *     summary: Crée une nouvelle clé API (la clé brute n'est retournée qu'une fois)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:        { type: string, example: "CI/CD Pipeline" }
 *               scope:       { type: string, example: "tickets" }
 *               expires_at:  { type: string, format: date-time, example: "2027-01-01T00:00:00Z" }
 *     responses:
 *       201:
 *         description: Clé créée – api_key n'est retourné qu'ici
 */
router.get('/', authenticateAdmin, controller.list);
router.post('/', authenticateAdmin, controller.create);

/**
 * @openapi
 * /api/admin/api-keys/{id}:
 *   patch:
 *     tags: [API Keys]
 *     summary: Met à jour name / scope / expires_at / is_active d'une clé
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:       { type: string }
 *               scope:      { type: string }
 *               expires_at: { type: string, format: date-time }
 *               is_active:  { type: boolean }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     tags: [API Keys]
 *     summary: Supprime (révoque) définitivement une clé
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 */
router.patch('/:id', authenticateAdmin, controller.update);
router.delete('/:id', authenticateAdmin, controller.remove);

module.exports = router;
