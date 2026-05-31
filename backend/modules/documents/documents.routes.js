const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { authenticateJWT } = require('../../shared/middleware');
const { SECRET_KEY } = require('../../shared/config');
const ctrl = require('./documents.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Auth via header OU query (?token=...) pour permettre l'usage en iframe/img/PDF viewer.
const authJwtOrQuery = (req, res, next) => {
    const headerToken = (req.headers.authorization || '').split(' ')[1];
    const token = req.query.token || headerToken;
    if (!token) return res.status(401).json({ message: 'Token manquant' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token invalide' });
        req.user = user;
        next();
    });
};

// ─── Lecture méta ────────────────────────────────────────────────────────────
router.get('/by-entity', authenticateJWT, ctrl.listByEntity);
router.get('/by-module', authenticateJWT, ctrl.listByModule);
router.get('/:id', authenticateJWT, ctrl.getDocument);

// ─── Lecture contenu (auth header OU query token) ────────────────────────────
router.get('/:id/content', authJwtOrQuery, ctrl.getCurrentContent);
router.get('/:id/versions/:v/content', authJwtOrQuery, ctrl.getVersionContent);

// ─── Écriture ────────────────────────────────────────────────────────────────
router.post('/', authenticateJWT, upload.single('file'), ctrl.upload);
router.post('/:id/versions', authenticateJWT, upload.single('file'), ctrl.addVersion);

// ─── Suppression ─────────────────────────────────────────────────────────────
router.delete('/:id', authenticateJWT, ctrl.softDelete);
router.delete('/:id/purge', authenticateJWT, ctrl.purge);
router.delete('/:id/versions/:v', authenticateJWT, ctrl.deleteVersion);

module.exports = router;
