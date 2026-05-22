const express = require('express');
const router = express.Router();
const consommablesController = require('./consommables.controller');
const designationImagesController = require('./designation-images.controller');
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const multer = require('multer');
const path = require('path');

// Configuration multer pour les images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/temp'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez PNG, JPEG ou WebP.'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Admin: Import des données depuis Excel
router.post('/import', authenticateAdmin, consommablesController.importFromExcel);

// Test route sans authentification
router.get('/test', (req, res) => {
  res.json({ message: 'Consommables API is working' });
});

// Route de diagnostic du token
router.get('/debug/token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  console.log('[Debug] Token present:', !!token);
  console.log('[Debug] Auth header:', req.headers.authorization?.substring(0, 50));

  if (!token) {
    return res.json({
      status: 'error',
      message: 'Token manquant dans le header Authorization',
      expected_format: 'Authorization: Bearer YOUR_TOKEN'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const { SECRET_KEY } = require('../../shared/config');
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({
      status: 'valid',
      message: 'Token valide ✅',
      user: decoded,
      expiry: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.json({
      status: 'invalid',
      message: 'Token invalide ou expiré ❌',
      error: error.message,
      suggestion: 'Reconnectez-vous pour obtenir un nouveau token'
    });
  }
});

// Routes authentifiées
router.get('/pending-count', consommablesController.getPendingCount);
router.get('/org-directions', authenticateJWT, consommablesController.getOrgDirections);
router.get('/org-services/:directionCode', authenticateJWT, consommablesController.getOrgServices);
router.get('/ecoles', authenticateJWT, consommablesController.getEcoles);
router.get('/types', authenticateJWT, consommablesController.getTypes);
router.get('/designations/:typeId', authenticateJWT, consommablesController.getDesignations);
router.get('/articles/:typeId', authenticateJWT, consommablesController.getArticles);
router.get('/requests', authenticateJWT, consommablesController.getRequests);
router.get('/requests/all', authenticateJWT, consommablesController.getAllRequestsForUsers);
router.post('/requests', authenticateJWT, consommablesController.createRequest);

// Routes admin - Gestion des demandes
router.get('/admin/all', authenticateJWT, consommablesController.getAllRequests);
router.put('/admin/:requestId/status', authenticateAdmin, consommablesController.updateRequestStatus);
router.delete('/admin/:requestId', authenticateAdmin, consommablesController.deleteRequest);
router.put('/admin/:requestId', authenticateAdmin, consommablesController.updateRequest);
router.post('/admin/:requestId/archive', authenticateAdmin, consommablesController.archiveRequest);
router.get('/requests/to-order', authenticateAdmin, consommablesController.getRequestsToOrder);

// Routes admin - Gestion du catalogue
router.get('/admin/catalog/all', authenticateAdmin, consommablesController.getAllArticles);
router.get('/admin/catalog/:typeId', authenticateAdmin, consommablesController.getArticlesByType);
router.post('/admin/catalog/add', authenticateAdmin, consommablesController.addArticle);
router.put('/admin/catalog/:articleId', authenticateAdmin, consommablesController.updateArticle);
router.delete('/admin/catalog/:articleId', authenticateAdmin, consommablesController.deleteArticle);
router.post('/admin/catalog/bulk-add', authenticateAdmin, consommablesController.bulkAddArticles);

// Routes pour les images des désignations
router.get('/images/:designation', authenticateJWT, designationImagesController.getDesignationImage);
router.get('/admin/images/all', authenticateAdmin, designationImagesController.getAllImages);
router.post('/admin/images/upload', authenticateAdmin, upload.single('image'), designationImagesController.uploadImage);
router.delete('/admin/images/:imageId', authenticateAdmin, designationImagesController.deleteImage);

module.exports = router;
