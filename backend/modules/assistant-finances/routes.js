const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { authenticateJWT } = require('../../shared/middleware');
const service = require('./service');
const ai = require('./ai');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

const handle = (label, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (e) {
        if (res.headersSent) return;
        if (e.status) return res.status(e.status).json({ message: e.message });
        console.error(`[AssistantFinances] ${label}`, e);
        res.status(502).json({ message: `${label} : service indisponible, réessayez dans un instant.` });
    }
};

router.use(authenticateJWT);

// Numéro de version (historique généré par scripts/gen-module-changelog.js) ; détail réservé aux administrateurs
router.get('/version', (req, res) => {
    let h = { version: '0.1.0', date: '', releases: [] };
    try { h = JSON.parse(fs.readFileSync(path.join(__dirname, 'version-history.json'), 'utf8')); } catch { /* pas encore généré */ }
    const admin = ['admin', 'superadmin'].includes(req.user.role);
    res.json({ version: h.version, date: h.date, admin, releases: admin ? h.releases : [] });
});

router.get('/access', handle('Vérification des droits', async (req, res) => res.json(await service.getAccess(req.user))));

router.get('/filtres', handle('Lecture des listes de filtres', async (req, res) => res.json(await service.getFilterOptions(req.user))));

router.post('/ask', handle('Interrogation de Sedit', async (req, res) => res.json(await service.ask(req.user, req.body || {}))));

// « Éduquer l'IA » : consignes de l'agent (et communes, réservées aux administrateurs)
const allowed = async (req) => {
    if (!(await service.getAccess(req.user)).allowed) { const e = new Error('Accès non autorisé'); e.status = 403; throw e; }
};
router.get('/regles', handle('Lecture des consignes', async (req, res) => { await allowed(req); res.json(await service.regles.lister(req.user)); }));
router.post('/regles', handle('Enregistrement de la consigne', async (req, res) => { await allowed(req); res.status(201).json(await service.regles.ajouter(req.user, req.body || {})); }));
router.delete('/regles/:id', handle('Suppression de la consigne', async (req, res) => { await allowed(req); res.json(await service.regles.supprimer(req.user, req.params.id)); }));

router.post('/page', handle('Lecture de la page', async (req, res) => res.json(await service.getPage(req.user, req.body || {}))));

router.post('/export', handle('Export', async (req, res) => {
    const file = await service.exportTable(req.user, req.body || {});
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.nom}"`);
    res.send(file.buffer);
}));

// Dictée : l'audio n'est ni enregistré ni journalisé
router.post('/transcribe', upload.single('audio'), handle('Dictée vocale', async (req, res) => {
    if (!(await service.getAccess(req.user)).allowed) return res.status(403).json({ message: 'Accès non autorisé' });
    if (!req.file || !req.file.size) return res.status(400).json({ message: 'Aucun son reçu.' });
    const ext = /ogg/.test(req.file.mimetype) ? 'ogg' : /mp4|m4a/.test(req.file.mimetype) ? 'm4a' : 'webm';
    res.json({ text: await ai.transcribe(req.file.buffer, `question.${ext}`) });
}));

router.get('/pj/:type/:id', handle('Lecture des pièces jointes', async (req, res) => res.json(await service.listDocuments(req.user, req.params.type, req.params.id))));
router.get('/pj/:type/:id/documents/:docId', handle('Lecture de la pièce jointe', async (req, res) => service.streamDocument(req.user, req.params.type, req.params.id, req.params.docId, res)));

module.exports = router;
