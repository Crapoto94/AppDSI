const express = require('express');
const router = express.Router();
const { authenticateJWT, isAdminLike } = require('../../shared/middleware');
const { getSqlite } = require('../../shared/database');
const controller = require('./bpmn.controller');

// Accès réservé aux admins et aux utilisateurs disposant de la tuile /bpmn
// (même logique que authenticateVibecodingControl).
const authenticateBpmn = (req, res, next) => {
    authenticateJWT(req, res, async () => {
        if (isAdminLike(req.user)) return next();
        try {
            const db = getSqlite();
            if (req.user && req.user.id && db) {
                const authorized = await db.get(`
                    SELECT 1 FROM user_tiles ut
                    JOIN tile_links tl ON ut.tile_id = tl.tile_id
                    WHERE ut.user_id = ? AND tl.url = '/bpmn'
                `, [req.user.id]);
                if (authorized) return next();
            }
        } catch (error) {
            console.error('[AUTH BPMN] Error checking tile access:', error);
        }
        res.status(403).json({ message: 'Accès refusé : administrateur ou accès Modélisation BPMN requis' });
    });
};

// Routes mounted at /api/bpmn
router.post('/ai', authenticateBpmn, controller.generate);

// Bibliothèque de diagrammes
router.get('/diagrams', authenticateBpmn, controller.listDiagrams);
router.post('/diagrams', authenticateBpmn, controller.createDiagram);
router.get('/diagrams/:id', authenticateBpmn, controller.getDiagram);
router.put('/diagrams/:id', authenticateBpmn, controller.updateDiagram);
router.delete('/diagrams/:id', authenticateBpmn, controller.deleteDiagram);

module.exports = router;
