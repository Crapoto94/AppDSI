const express = require('express');
const router = express.Router();
const ctrl = require('./vols.controller');
const { authenticateJWT } = require('../../shared/middleware');
const multer = require('multer');
const upload = multer({ dest: require('os').tmpdir() });

router.get('/count', authenticateJWT, ctrl.count);
router.get('/', authenticateJWT, ctrl.list);
router.get('/:id', authenticateJWT, ctrl.getOne);
router.post('/', authenticateJWT, ctrl.create);
router.put('/:id', authenticateJWT, ctrl.update);
router.delete('/:id', authenticateJWT, ctrl.remove);
router.post('/:id/documents', authenticateJWT, upload.single('file'), ctrl.uploadDoc);
router.delete('/:id/documents/:docId', authenticateJWT, ctrl.deleteDoc);
router.get('/:id/documents/:docId', ctrl.downloadDoc);
router.post('/:id/comments', authenticateJWT, ctrl.addComment);

module.exports = router;
