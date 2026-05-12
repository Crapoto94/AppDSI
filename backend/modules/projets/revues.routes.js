const express = require('express');
const router = express.Router();
const ctrl = require('./revues.controller');
const { authenticateJWT } = require('../../shared/middleware');

router.get('/', authenticateJWT, ctrl.getAll);
router.post('/', authenticateJWT, ctrl.create);
router.get('/:id', authenticateJWT, ctrl.getById);
router.post('/previous-commentaires', authenticateJWT, ctrl.getPreviousCommentaires);
router.post('/:id/projets', authenticateJWT, ctrl.addProjets);
router.put('/:id/projets/:projetId/commentaire', authenticateJWT, ctrl.updateProjetCommentaire);
router.post('/:id/taches', authenticateJWT, ctrl.addTache);
router.delete('/:id/taches/:tacheId', authenticateJWT, ctrl.deleteTache);
router.delete('/:id', authenticateJWT, ctrl.deleteOne);

module.exports = router;
