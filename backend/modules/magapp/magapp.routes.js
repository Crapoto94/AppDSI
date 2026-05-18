const express = require('express');
const router = express.Router();
const MagAppController = require('./magapp.controller');
const { authenticateJWT, tryAuthenticateJWT, authenticateMagappControl, authenticateAdmin } = require('../../shared/middleware');
const { getSqlite } = require('../../shared/database');

// Routes mounted at /api/magapp
const magappBaseRouter = express.Router();

magappBaseRouter.get('/categories', MagAppController.getCategories);
magappBaseRouter.get('/apps', MagAppController.getApps);
magappBaseRouter.put('/apps/:id', authenticateMagappControl, MagAppController.updateApp);
magappBaseRouter.get('/mercator-apps', MagAppController.getMercatorApps);
magappBaseRouter.post('/health-check', MagAppController.healthCheck);
magappBaseRouter.get('/favorites', MagAppController.getFavorites);
magappBaseRouter.post('/favorites', MagAppController.addFavorite);
magappBaseRouter.delete('/favorites', MagAppController.removeFavorite);
magappBaseRouter.post('/clicks', MagAppController.recordClick);
magappBaseRouter.post('/subscribe', MagAppController.subscribe);
magappBaseRouter.get('/user-subscriptions', MagAppController.getUserSubscriptions);
magappBaseRouter.delete('/user-subscriptions', MagAppController.unsubscribe);
magappBaseRouter.get('/tickets', MagAppController.getUserTickets);
magappBaseRouter.get('/tickets-count', MagAppController.getTicketsCount);
magappBaseRouter.get('/high-priority-incidents', MagAppController.getHighPriorityIncidents);
magappBaseRouter.get('/observed-tickets', MagAppController.getObservedTickets);
magappBaseRouter.get('/icons', authenticateJWT, MagAppController.getIcons);
magappBaseRouter.get('/versions', MagAppController.getVersions);
magappBaseRouter.get('/user-version', authenticateJWT, MagAppController.getUserVersion);
magappBaseRouter.post('/user-version', authenticateJWT, MagAppController.recordUserVersionSeen);
magappBaseRouter.get('/apps/:id/docs', tryAuthenticateJWT, MagAppController.getAppDocs);
magappBaseRouter.post('/docs/:id/interaction', authenticateJWT, MagAppController.recordDocInteraction);

// Admin routes under /api/magapp
magappBaseRouter.get('/settings', tryAuthenticateJWT, MagAppController.getSettings);
magappBaseRouter.post('/settings', authenticateMagappControl, MagAppController.updateSettings);
magappBaseRouter.get('/apps/:id/users', authenticateMagappControl, MagAppController.getAppUsers);
magappBaseRouter.post('/apps/:id/users', authenticateMagappControl, MagAppController.addAppUser);
magappBaseRouter.delete('/apps/:id/users/:username', authenticateMagappControl, MagAppController.removeAppUser);
magappBaseRouter.post('/ad/search', authenticateMagappControl, MagAppController.searchADUsers);
magappBaseRouter.get('/subscriptions', authenticateMagappControl, MagAppController.getAllSubscriptions);
magappBaseRouter.get('/stats', authenticateMagappControl, MagAppController.getStats);

// Routes mounted at /api/admin/magapp
const magappAdminRouter = express.Router();
magappAdminRouter.post('/versions', authenticateMagappControl, MagAppController.createVersion);
magappAdminRouter.put('/versions/:id', authenticateMagappControl, MagAppController.updateVersion);
magappAdminRouter.delete('/versions/:id', authenticateMagappControl, MagAppController.deleteVersion);
magappAdminRouter.put('/versions/:id/activate', authenticateMagappControl, MagAppController.activateVersion);
magappAdminRouter.get('/docs', authenticateMagappControl, MagAppController.getAllDocs);
magappAdminRouter.post('/docs', authenticateMagappControl, MagAppController.createDoc);
magappAdminRouter.put('/docs/:id', authenticateMagappControl, MagAppController.updateDoc);
magappAdminRouter.delete('/docs/:id', authenticateMagappControl, MagAppController.deleteDoc);
magappAdminRouter.get('/docs/stats', authenticateMagappControl, MagAppController.getDocStats);

// Exporting both or a main router that handles both
const mainRouter = express.Router();

// Move postgres settings to magapp control as well
mainRouter.get('/postgres-settings', authenticateMagappControl, async (req, res) => {
    try {
        const db = getSqlite();
        const settings = await db.get('SELECT * FROM postgres_settings WHERE id = 1');
        if (settings && settings.password) {
            settings.password = Buffer.from(settings.password, 'base64').toString('utf8');
        }
        res.json(settings || {});
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

mainRouter.post('/postgres-settings', authenticateMagappControl, async (req, res) => {
    try {
        const db = getSqlite();
        const { host, port, database, username, password, is_enabled } = req.body;
        const b64Password = password ? Buffer.from(password).toString('base64') : null;
        
        await db.run(`
            UPDATE postgres_settings 
            SET host = ?, port = ?, database = ?, username = ?, password = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [host, port || 5432, database, username, b64Password, is_enabled ? 1 : 0]);
        
        res.json({ message: 'Configuration PostgreSQL mise à jour' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

mainRouter.use('/magapp', magappBaseRouter);
mainRouter.use('/admin/magapp', magappAdminRouter);

// Some extra routes that were in server.js but might be legacy or slightly different
mainRouter.delete('/magapp/subscriptions/:id', authenticateAdmin, MagAppController.deleteSubscription);

module.exports = mainRouter;
