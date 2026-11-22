const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const svc = require('./ep-base.service');
const ent = require('../entretiens/entretiens.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

/** Administrateur de l'application ou administrateur délégué des entretiens. */
async function requireAdmin(req, res, next) {
    try {
        const actor = await ent.getActor(req);
        if (!(await ent.isEpAdmin(actor))) return res.status(403).json({ message: 'Réservé aux administrateurs des entretiens.' });
        req.actor = actor;
        next();
    } catch (e) { next(e); }
}
/** Pilotage : administrateurs, ou agents du rôle « pilotage » (lecture seule, jamais les CREP). */
async function requireAdminOrPilotage(req, res, next) {
    try {
        const actor = await ent.getActor(req);
        if (!(await ent.isEpAdmin(actor)) && !(await ent.isEpPilotage(actor))) return res.status(403).json({ message: 'Réservé aux administrateurs et au rôle pilotage.' });
        req.actor = actor;
        next();
    } catch (e) { next(e); }
}
const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
        if (!e.status) console.error('[ep-base]', e);
        res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur : ' + e.message });
    }
};

// Tout agent connecté : suis-je valideur d'agents de la base ? (affichage de la tuile « Entretiens pro » dans MagApp)
router.get('/me', authenticateJWT, wrap(async (req, res) => res.json(await svc.meValideur(await ent.getActor(req)))));
router.get('/equipe', authenticateJWT, wrap(async (req, res) => res.json(await svc.equipeEntretiens(await ent.getActor(req)))));
router.get('/pilotage', authenticateJWT, requireAdminOrPilotage, wrap(async (req, res) => res.json(await svc.pilotageEntretiens())));
router.get('/delegations', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json(await svc.listDelegations())));
router.post('/delegations', authenticateJWT, requireAdmin, wrap(async (req, res) => { await svc.addDelegation(String(req.body?.secretaire_matricule || ''), String(req.body?.directeur_matricule || ''), req.actor); res.json({ ok: true }); }));
router.delete('/delegations/:id', authenticateJWT, requireAdmin, wrap(async (req, res) => { await svc.removeDelegation(req.params.id); res.json({ ok: true }); }));
router.get('/stats', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json(await svc.stats())));
router.get('/tree', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ nodes: await svc.tree() })));
router.get('/templates', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ templates: await svc.listTemplates() })));
router.get('/agents', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ agents: await svc.listAgents(req.query) })));
router.get('/valideurs/search', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ valideurs: await svc.searchValideurs(req.query.q) })));
router.post('/import', authenticateJWT, requireAdmin, upload.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const out = await svc.importWorkbook(req.file.buffer, req.file.originalname, req.actor.username);
    // Création automatique des entretiens des agents qui ont un valideur (sans bloquer l'import si aucune campagne n'existe).
    out.entretiens = await svc.syncEntretiens({ actor: req.actor }).catch(e => ({ erreur: e.message }));
    res.json(out);
}));
router.put('/agents/:matricule/valideur', authenticateJWT, requireAdmin, wrap(async (req, res) => {
    await svc.setValideur(req.params.matricule, String((req.body && req.body.valideur_matricule) || ''));
    res.json({ ok: true });
}));
router.get('/ad/search', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ users: await svc.searchAd(req.query.q) })));
router.put('/agents/:matricule/ad', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json(await svc.linkAd(req.params.matricule, String((req.body && req.body.username) || '')))));
router.post('/entretiens/sync', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json(await svc.syncEntretiens({ actor: req.actor }))));
router.post('/entretiens/purge', authenticateJWT, requireAdmin, wrap(async (req, res) => {
    if (!req.body || req.body.confirm !== 'SUPPRIMER') return res.status(400).json({ message: 'Confirmation requise.' });
    res.json(await svc.purgeLegacyEntretiens(req.actor));
}));
router.post('/ad-refresh', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json(await svc.startAdRefresh({ all: !!(req.body && req.body.all) }))));
router.get('/ad-refresh', authenticateJWT, requireAdmin, wrap(async (req, res) => res.json({ ...svc.adJob })));

module.exports = router;
