const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const ctrl = require('./projets.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { SECRET_KEY } = require('../../shared/config');

const DOCUMENTS_DIR = path.join(__dirname, '..', '..', 'file_projets');
const uploadDoc = multer({ dest: DOCUMENTS_DIR, limits: { fileSize: 100 * 1024 * 1024 } });

// Middleware that accepts token from query param or Authorization header
const authenticateJWTQuery = (req, res, next) => {
    const token = req.query.token || (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token manquant' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token invalide' });
        req.user = user;
        next();
    });
};

// ============================================
// CRUD
// ============================================
router.get('/', authenticateJWT, ctrl.getAll);
router.get('/mes-projets', authenticateJWT, ctrl.getMesProjets);
router.get('/stats', authenticateJWT, ctrl.getStats);
router.get('/favoris', authenticateJWT, ctrl.getFavoris);
router.get('/admin/scoring-config', authenticateAdmin, ctrl.getScoringConfig);
router.get('/admin/types-documentaires', authenticateAdmin, ctrl.getTypesDocumentaires);
router.put('/admin/scoring-config', authenticateAdmin, ctrl.updateScoringConfig);
router.put('/admin/types-documentaires', authenticateAdmin, ctrl.updateTypesDocumentaires);
router.get('/:id', authenticateJWT, ctrl.getById);
router.post('/', authenticateJWT, ctrl.create);
router.put('/:id', authenticateJWT, ctrl.update);
router.delete('/:id', authenticateJWT, ctrl.remove);
router.post('/:id/favoris', authenticateJWT, ctrl.ajouterFavori);
router.delete('/:id/favoris', authenticateJWT, ctrl.supprimerFavori);

// ============================================
// WORKFLOW
// ============================================
router.get('/:id/transitions', authenticateJWT, ctrl.getTransitionsPossibles);
router.post('/:id/transition', authenticateJWT, ctrl.effectuerTransition);
router.get('/:id/controles', authenticateJWT, ctrl.getControles);

// ============================================
// ROLES
// ============================================
router.post('/:id/roles', authenticateJWT, ctrl.ajouterRole);
router.delete('/:id/roles/:roleId', authenticateJWT, ctrl.supprimerRole);

// ============================================
// VISIBILITÉ
// ============================================
router.post('/:id/visibilite', authenticateJWT, ctrl.ajouterVisibilite);
router.delete('/:id/visibilite/:vid', authenticateJWT, ctrl.supprimerVisibilite);

// ============================================
// DOCUMENTS
// ============================================
router.post('/:id/documents', authenticateJWT, ctrl.creerDocument);
router.put('/:id/documents/:did/type', authenticateJWT, ctrl.updateDocumentType);
router.post('/:id/documents/versions/vrac', authenticateJWT, uploadDoc.array('files', 20), ctrl.uploadVersionsVrac);
router.get('/:id/documents', authenticateJWT, ctrl.getDocuments);
router.get('/:id/documents/controles', authenticateJWT, ctrl.getControlesDocuments);
router.get('/:id/documents/:did', authenticateJWT, ctrl.getDocumentDetail);
router.post('/:id/documents/:did/versions', authenticateJWT, uploadDoc.single('file'), ctrl.uploadVersion);
router.get('/:id/documents/:did/versions/:vid/telecharger', authenticateJWT, ctrl.telechargerVersion);
router.get('/:id/documents/:did/versions/:vid/view', authenticateJWTQuery, ctrl.telechargerVersion);

// ============================================
// SCORING
// ============================================
router.post('/:id/scores', authenticateJWT, ctrl.enregistrerScore);
router.get('/:id/scores', authenticateJWT, ctrl.getScores);
router.get('/:id/score-calcule', authenticateJWT, ctrl.getScoreCalcule);

// ============================================
// RÉUNIONS LIÉES
// ============================================
router.get('/:id/reunions', authenticateJWT, ctrl.getReunionsLiees);
router.post('/:id/reunions', authenticateJWT, ctrl.lierReunion);
router.delete('/:id/reunions/:rid', authenticateJWT, ctrl.delierReunion);

// ============================================
// JOURNAL
// ============================================
router.get('/:id/journal', authenticateJWT, ctrl.getJournal);
router.post('/:id/journal', authenticateJWT, ctrl.ajouterEntreeJournal);

// ============================================
// INDICATEURS
// ============================================
router.get('/:id/indicateurs', authenticateJWT, ctrl.getIndicateurs);
router.post('/:id/indicateurs', authenticateJWT, ctrl.ajouterIndicateur);

// ============================================
// NOTIFICATIONS
// ============================================
router.get('/:id/notifications', authenticateJWT, ctrl.getNotifications);

// ============================================
// PLANNING / TÂCHES
// ============================================
router.get('/:id/taches', authenticateJWT, ctrl.getTaches);
router.post('/:id/taches', authenticateJWT, ctrl.ajouterTache);
router.put('/:id/taches/:tacheId', authenticateJWT, ctrl.updateTache);
router.delete('/:id/taches/:tacheId', authenticateJWT, ctrl.supprimerTache);

// ============================================
// PLANNING / JALONS
// ============================================
router.get('/:id/jalons', authenticateJWT, ctrl.getJalons);
router.post('/:id/jalons', authenticateJWT, ctrl.ajouterJalon);
router.put('/:id/jalons/:jalonId', authenticateJWT, ctrl.updateJalon);
router.delete('/:id/jalons/:jalonId', authenticateJWT, ctrl.supprimerJalon);

// ============================================
// PLANNING / GROUPES
// ============================================
router.get('/:id/groupes-taches', authenticateJWT, ctrl.getGroupesTaches);
router.post('/:id/groupes-taches', authenticateJWT, ctrl.ajouterGroupeTaches);
router.delete('/:id/groupes-taches/:groupeId', authenticateJWT, ctrl.supprimerGroupeTaches);

// ============================================
// DÉPENDANCES
// ============================================
router.get('/:id/dependances', authenticateJWT, ctrl.getDependances);
router.post('/:id/dependances', authenticateJWT, ctrl.ajouterDependance);
router.delete('/:id/dependances/:depId', authenticateJWT, ctrl.supprimerDependance);
router.get('/:id/verifier-dependances', authenticateJWT, ctrl.verifierDependances);

// ============================================
// ATTENDUS DOCUMENTAIRES PAR PROJET
// ============================================
router.get('/:id/attendus', authenticateJWT, ctrl.getAttendus);
router.put('/:id/attendus', authenticateJWT, ctrl.setAttendus);

// ============================================
// COMITÉS
// ============================================
router.get('/:id/comites', authenticateJWT, ctrl.getComites);
router.post('/:id/comites', authenticateJWT, ctrl.ajouterComite);
router.put('/:id/comites/:comiteId', authenticateJWT, ctrl.updateComite);
router.delete('/:id/comites/:comiteId', authenticateJWT, ctrl.supprimerComite);
router.post('/:id/comites/:comiteId/membres', authenticateJWT, ctrl.ajouterMembreComite);
router.delete('/:id/comites/:comiteId/membres/:membreId', authenticateJWT, ctrl.supprimerMembreComite);

// ============================================
// ÉTAPES PROJET
// ============================================
router.get('/:id/etapes', authenticateJWT, ctrl.getEtapes);
router.put('/:id/etapes', authenticateJWT, ctrl.toggleEtape);

// ============================================
// APPLICATIONS
// ============================================
router.get('/admin/apps/search', authenticateJWT, ctrl.searchApps);
router.get('/:id/applications', authenticateJWT, ctrl.getApplications);
router.post('/:id/applications', authenticateJWT, ctrl.ajouterApplication);
router.delete('/:id/applications/:appId', authenticateJWT, ctrl.supprimerApplication);

module.exports = router;
