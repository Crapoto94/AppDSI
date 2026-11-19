const express = require('express');
const router = express.Router();
const multer = require('multer');
const MagAppController = require('./magapp.controller');
const PromotionController = require('./promotion.controller');
const NewsBannerController = require('./newsbanner.controller');
const ForumController = require('./forum.controller');
const { authenticateJWT, tryAuthenticateJWT, authenticateMagappControl, authenticateAdmin } = require('../../shared/middleware');
const { getSqlite } = require('../../shared/database');

// Upload en mémoire (sauvegarde via le service de stockage partagé).
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Routes mounted at /api/magapp
const magappBaseRouter = express.Router();

magappBaseRouter.get('/categories', MagAppController.getCategories);
magappBaseRouter.post('/categories', authenticateMagappControl, MagAppController.createCategory);
magappBaseRouter.put('/categories/:id', authenticateMagappControl, MagAppController.updateCategory);
magappBaseRouter.delete('/categories/:id', authenticateMagappControl, MagAppController.deleteCategory);
magappBaseRouter.get('/apps', tryAuthenticateJWT, MagAppController.getApps);
magappBaseRouter.get('/clicks-timeline', tryAuthenticateJWT, MagAppController.getClicksTimeline);
magappBaseRouter.post('/apps', authenticateMagappControl, MagAppController.createApp);
magappBaseRouter.put('/apps/:id', authenticateMagappControl, MagAppController.updateApp);
magappBaseRouter.delete('/apps/:id', authenticateMagappControl, MagAppController.deleteApp);
magappBaseRouter.get('/mercator-apps', MagAppController.getMercatorApps);
magappBaseRouter.post('/health-check', MagAppController.healthCheck);
magappBaseRouter.get('/favorites', MagAppController.getFavorites);
magappBaseRouter.post('/favorites', MagAppController.addFavorite);
magappBaseRouter.delete('/favorites', MagAppController.removeFavorite);
magappBaseRouter.post('/clicks', MagAppController.recordClick);
magappBaseRouter.post('/subscribe', MagAppController.subscribe);
magappBaseRouter.get('/user-subscriptions', MagAppController.getUserSubscriptions);
magappBaseRouter.delete('/user-subscriptions', MagAppController.unsubscribe);
magappBaseRouter.get('/my-subscriptions', authenticateJWT, MagAppController.getMySubscriptions);
magappBaseRouter.put('/subscriptions/:app_id/preferences', authenticateJWT, MagAppController.updateSubscriptionPrefs);
magappBaseRouter.get('/tickets', MagAppController.getUserTickets);
magappBaseRouter.get('/tickets-count', MagAppController.getTicketsCount);
magappBaseRouter.get('/high-priority-incidents', MagAppController.getHighPriorityIncidents);
magappBaseRouter.get('/observed-tickets', MagAppController.getObservedTickets);
magappBaseRouter.get('/icons', authenticateJWT, MagAppController.getIcons);
// BETA « Recherche d'agent » : annuaire RH Studio (lecture seule)
magappBaseRouter.get('/agent-search', authenticateJWT, MagAppController.searchRhAgents);
// BETA « Virement de crédits » (agents ayant un compte SEDIT Finances) : mêmes services que /budget, chaque agent ne voit que ses demandes.
const virements = require('../finance/virement-credits.controller');
const virementMine = (req, res, next) => { req.onlyMine = true; next(); };
magappBaseRouter.get('/virement-credits/access', authenticateJWT, virements.access);
magappBaseRouter.get('/virement-credits/lines', authenticateJWT, virements.requireSeditAccount, virements.liveLines);
magappBaseRouter.get('/virement-credits/signataires', authenticateJWT, virements.requireSeditAccount, virements.signataires);
magappBaseRouter.get('/virement-credits', authenticateJWT, virementMine, virements.list);
magappBaseRouter.post('/virement-credits', authenticateJWT, virementMine, virements.requireSeditAccount, virements.save);
magappBaseRouter.get('/virement-credits/:id/pdf', authenticateJWT, virementMine, virements.pdf);
magappBaseRouter.post('/virement-credits/:id/parapheur', authenticateJWT, virementMine, virements.requireSeditAccount, virements.sendToParapheurChain);
magappBaseRouter.post('/virement-credits/:id/send-budget', authenticateJWT, virementMine, virements.sendToBudget);
magappBaseRouter.delete('/virement-credits/:id', authenticateJWT, virementMine, virements.remove);
// BETA « Mes factures » : factures SEDIT visibles par l'agent (droits DROITSER) + partage d'accès entre agents
const mesFactures = require('../finance/mes-factures.service');
const mfFail = (res, e, msg) => { if (e && e.status) return res.status(e.status).json({ message: e.message }); console.error('[MesFactures]', msg, e); res.status(502).json({ message: `${msg} : ${e && e.message}` }); };
magappBaseRouter.get('/mes-factures/access', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.getAccess(req.user)); } catch (e) { mfFail(res, e, 'SEDIT indisponible'); }
});
magappBaseRouter.get('/mes-factures/shares', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.listShares(req.user)); } catch (e) { mfFail(res, e, 'Erreur lecture des partages'); }
});
magappBaseRouter.post('/mes-factures/shares', authenticateJWT, async (req, res) => {
    try { await mesFactures.addShare(req.user, req.body || {}); res.status(201).json(await mesFactures.listShares(req.user)); } catch (e) { mfFail(res, e, 'Erreur de partage'); }
});
magappBaseRouter.delete('/mes-factures/shares/:id', authenticateJWT, async (req, res) => {
    try { await mesFactures.removeShare(req.user, parseInt(req.params.id, 10)); res.json(await mesFactures.listShares(req.user)); } catch (e) { mfFail(res, e, 'Erreur de suppression du partage'); }
});
magappBaseRouter.get('/mes-factures/:num/documents', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.listDocuments(req.user, req.params.num)); } catch (e) { mfFail(res, e, 'Erreur de lecture des pièces jointes'); }
});
magappBaseRouter.get('/mes-factures/:num/documents/:docId', authenticateJWT, async (req, res) => {
    try { await mesFactures.streamDocument(req.user, req.params.num, req.params.docId, res); } catch (e) { if (!res.headersSent) mfFail(res, e, 'Erreur de lecture de la pièce jointe'); }
});
// ─── Validation d'un service fait depuis le lien reçu par mail (identification = session MagApp, aucun token dans le lien) ───
// Le lien du mail est `<URL MagApp>/?sf=<id>`. Le front MagApp l'ouvre après identification (login si l'appareil n'a pas de session) :
// ce point d'entrée vérifie que l'agent connecté EST le vérificateur désigné (ou le directeur pour un visa), renouvelle au besoin
// l'échéance du lien et renvoie le chemin de la page de validation, que MagApp ouvre sous son propre domaine.
magappBaseRouter.post('/service-fait/:id/open', authenticateJWT, async (req, res) => {
    try {
        const { pool } = require('../../shared/database');
        const id = parseInt(req.params.id, 10);
        const r = await pool.query('SELECT * FROM finance.service_fait_workflows WHERE id = $1', [id]);
        const wf = r.rows[0];
        if (!wf) return res.status(404).json({ message: 'Demande de validation introuvable' });
        // Identité de l'agent connecté : e-mail du jeton + e-mail du référentiel (par username) + login
        const username = String(req.user.username || '').trim().toLowerCase();
        const emails = new Set([String(req.user.email || '').trim().toLowerCase()].filter(Boolean));
        try {
            const u = await pool.query('SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = $1 LIMIT 1', [username]);
            if (u.rows[0] && u.rows[0].email) emails.add(String(u.rows[0].email).trim().toLowerCase());
        } catch { /* repli sur le jeton */ }
        const is = (mail, login) => (mail && emails.has(String(mail).trim().toLowerCase())) || (login && String(login).trim().toLowerCase() === username);
        const addDays = (n) => new Date(Date.now() + n * 86400000);
        if (['en_attente', 'en_cours', 'transfere', 'en_pause'].includes(wf.status)) {
            if (!is(wf.verifier_email, wf.verifier_username)) return res.status(403).json({ message: 'Cette demande de validation est destinée à ' + (wf.verifier_name || 'un autre agent') + ' : vous n’en êtes pas le vérificateur.' });
            if (!wf.token) return res.status(409).json({ message: 'Cette demande n’a plus de lien de validation actif.' });
            if (wf.token_expires_at && new Date(wf.token_expires_at) < new Date()) await pool.query('UPDATE finance.service_fait_workflows SET token_expires_at = $1 WHERE id = $2', [addDays(30), id]);
            return res.json({ url: `/service-fait-verifier/${wf.token}`, step: 'validation', invoice: wf.invoice_number || wf.invoice_ref });
        }
        if (wf.status === 'en_attente_visa') {
            if (!is(wf.director_email, wf.director_username)) return res.status(403).json({ message: 'Ce visa est destiné à ' + (wf.director_name || 'un autre agent') + ' : vous n’êtes pas le directeur désigné.' });
            if (!wf.director_token) return res.status(409).json({ message: 'Ce visa n’a plus de lien actif.' });
            if (wf.director_token_expires_at && new Date(wf.director_token_expires_at) < new Date()) await pool.query('UPDATE finance.service_fait_workflows SET director_token_expires_at = $1 WHERE id = $2', [addDays(30), id]);
            return res.json({ url: `/service-fait-visa/${wf.director_token}`, step: 'visa', invoice: wf.invoice_number || wf.invoice_ref });
        }
        const labels = { valide: 'déjà validée', non_valide: 'déjà refusée', ne_me_concerne_pas: 'déjà retournée', annule: 'annulée' };
        return res.status(409).json({ message: `Cette demande de validation est ${labels[wf.status] || 'clôturée'} (facture ${wf.invoice_number || wf.invoice_ref}).`, status: wf.status });
    } catch (e) { console.error('[SF open]', e.message); res.status(500).json({ message: 'Erreur d’ouverture de la validation' }); }
});

// URL publique de MagApp (liens des mails) : paramétrable — SQLite app_settings.magapp_base_url (défaut https://magapp.ivry.local)
magappBaseRouter.get('/base-url', authenticateMagappControl, async (req, res) => {
    try { res.json({ url: await require('../../shared/app_url').getMagappBaseUrl() }); } catch (e) { res.status(500).json({ message: e.message }); }
});
magappBaseRouter.put('/base-url', authenticateMagappControl, async (req, res) => {
    try {
        const { normalizeAppBaseUrl, getMagappBaseUrl } = require('../../shared/app_url');
        const url = normalizeAppBaseUrl(req.body && req.body.url);
        if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return res.status(400).json({ message: 'URL invalide (ex. https://magapp.ivry.local)' });
        const db = getSqlite();
        await db.run(`INSERT INTO app_settings (setting_key, setting_value, description) VALUES ('magapp_base_url', ?, 'URL publique de MagApp (liens des mails de validation de service fait)')
                      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`, [url]);
        res.json({ url: await getMagappBaseUrl() });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

magappBaseRouter.get('/mes-factures/dgp-weekly', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.getDgpWeeklyForUser(req.user, req.query)); } catch (e) { mfFail(res, e, 'Erreur DGP hebdomadaire'); }
});
magappBaseRouter.get('/mes-factures/verifiers', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.searchVerifiers(req.user, req.query.q)); } catch (e) { mfFail(res, e, 'Erreur de recherche'); }
});
magappBaseRouter.get('/mes-factures/director', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.getMyDirector(req.user)); } catch (e) { mfFail(res, e, 'Erreur de lecture du directeur'); }
});
// Service fait PAR LOT : plusieurs factures d'un même fournisseur, même vérificateur / même déclaration
magappBaseRouter.post('/mes-factures/service-fait/batch', authenticateJWT, uploadMemory.array('files', 10), async (req, res) => {
    try {
        const b = req.body || {};
        const mode = b.mode === 'self' ? 'self' : 'circuit';
        let nums = b.nums;
        if (typeof nums === 'string') { try { nums = JSON.parse(nums); } catch { nums = []; } }
        const items = await mesFactures.prepareBatch(req.user, nums);
        const common = { service_fait_date: mode === 'self' ? String(b.service_fait_date || '') : '', comment: String(b.comment || ''), demande_pj_ids: '[]' };
        if (mode === 'self') {
            if (!common.comment.trim() && !(req.files && req.files.length)) return res.status(400).json({ message: 'Un commentaire ou une pièce justificative est requis' });
        } else {
            const email = String(b.verifier_email || '').trim().toLowerCase();
            if (!b.verifier_username || !/^[^@\s]+@ivry94\.fr$/.test(email)) return res.status(400).json({ message: 'Choisissez un vérificateur' });
            await mesFactures.assertVerifierInDirection(req.user, email);
            req.magappVerifier = { email, name: String(b.verifier_name || '').slice(0, 120) };
            common.verifier_username = String(b.verifier_username);
            common.director_mode = null;
            if (['informe', 'visa'].includes(b.director_mode)) {
                const d = await mesFactures.getMyDirector(req.user);
                if (!d) return res.status(400).json({ message: 'Directeur de votre direction introuvable' });
                common.director_mode = b.director_mode; common.entity_code = d.direction_code;
            }
        }
        res.json({ results: await sfController.runBatch(req, items, mode, common) });
    } catch (e) { mfFail(res, e, 'Erreur service fait par lot'); }
});
magappBaseRouter.get('/mes-factures/:num/mandatement', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.getMandatement(req.user, req.params.num)); } catch (e) { mfFail(res, e, 'Erreur lecture mandatement'); }
});
// Service fait depuis « Mes factures » : mêmes workflows que le DSI Hub (service-fait.controller), ouverts aux agents ayant un droit de
// MODIFICATION SEDIT sur le service de la facture. Les données de la facture sont relues dans SEDIT (jamais celles du client).
const sfController = require('../finance/service-fait/service-fait.controller');
const sfBody = async (req, res, extra) => {
    const inv = await mesFactures.getInvoiceForAction(req.user, req.params.num);
    req.body = { ...inv, service_fait_date: (req.body || {}).service_fait_date || '', ...extra };
    return inv;
};
magappBaseRouter.post('/mes-factures/:num/service-fait', authenticateJWT, async (req, res) => {
    try {
        const b = req.body || {};
        const email = String(b.verifier_email || '').trim().toLowerCase();
        if (!b.verifier_username || !/^[^@\s]+@ivry94\.fr$/.test(email)) return res.status(400).json({ message: 'Choisissez un vérificateur (agent de la Ville avec une adresse @ivry94.fr)' });
        await mesFactures.assertVerifierInDirection(req.user, email);
        // Directeur de MA direction : « informé » (mail de l'issue) ou « avec visa » (doit viser après le vérificateur)
        let dirExtra = { director_mode: null };
        if (['informe', 'visa'].includes(b.director_mode)) {
            const d = await mesFactures.getMyDirector(req.user);
            if (!d) return res.status(400).json({ message: 'Directeur de votre direction introuvable (administration Ville › encadrants)' });
            dirExtra = { director_mode: b.director_mode, entity_code: d.direction_code };
        }
        await sfBody(req, res, { verifier_username: String(b.verifier_username), ...dirExtra });
        req.magappVerifier = { email, name: String(b.verifier_name || '').slice(0, 120) };
        return sfController.createWorkflow(req, res);
    } catch (e) { mfFail(res, e, 'Erreur service fait'); }
});
magappBaseRouter.post('/mes-factures/:num/service-fait/cancel', authenticateJWT, async (req, res) => {
    try {
        req.params.id = await mesFactures.getCancellableWorkflowId(req.user, req.params.num);
        return sfController.cancelWorkflow(req, res);
    } catch (e) { mfFail(res, e, 'Erreur d’annulation'); }
});
magappBaseRouter.post('/mes-factures/:num/service-fait/self', authenticateJWT, uploadMemory.array('files', 10), async (req, res) => {
    try {
        const comment = String((req.body || {}).comment || '');
        await sfBody(req, res, { comment, demande_pj_ids: '[]' });
        return sfController.createSelfWorkflow(req, res);
    } catch (e) { mfFail(res, e, 'Erreur service fait'); }
});
magappBaseRouter.get('/mes-factures', authenticateJWT, async (req, res) => {
    try { res.json(await mesFactures.listFactures(req.user, req.query)); } catch (e) { mfFail(res, e, 'SEDIT indisponible'); }
});
magappBaseRouter.get('/versions', MagAppController.getVersions);
magappBaseRouter.get('/user-version', authenticateJWT, MagAppController.getUserVersion);
magappBaseRouter.post('/user-version', authenticateJWT, MagAppController.recordUserVersionSeen);
magappBaseRouter.get('/apps/:id/docs', tryAuthenticateJWT, MagAppController.getAppDocs);
magappBaseRouter.get('/apps/:id/orders', tryAuthenticateJWT, MagAppController.getAppOrders);
magappBaseRouter.post('/docs/:id/interaction', authenticateJWT, MagAppController.recordDocInteraction);

// Admin routes under /api/magapp
// Application mise en avant (bannière du magasin) — lecture publique, écriture admin
magappBaseRouter.get('/promotion', PromotionController.get);
magappBaseRouter.get('/promotion/logo', PromotionController.logo);
magappBaseRouter.post('/promotion', authenticateMagappControl, uploadMemory.single('logo'), PromotionController.save);
// Bandeau d'actualité permanent — lecture publique, écriture admin
magappBaseRouter.get('/news-banner', NewsBannerController.get);
magappBaseRouter.post('/news-banner', authenticateMagappControl, NewsBannerController.save);
// Forum de crise (associé au bandeau) — lecture et écriture pour tout utilisateur connecté, modération admin
magappBaseRouter.get('/forum', authenticateJWT, ForumController.list);
magappBaseRouter.post('/forum/posts', authenticateJWT, ForumController.post);
magappBaseRouter.post('/forum/posts/:id/resolve', authenticateJWT, ForumController.resolve);
magappBaseRouter.post('/forum/posts/:id/hide', authenticateMagappControl, ForumController.toggleHidden);
magappBaseRouter.post('/forum/new', authenticateMagappControl, ForumController.startNew);
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
magappAdminRouter.post('/versions/:id/notify', authenticateMagappControl, MagAppController.notifyVersion);
magappAdminRouter.post('/versions/:id/document', authenticateMagappControl, uploadMemory.single('file'), MagAppController.uploadVersionDocument);
magappAdminRouter.get('/docs', authenticateMagappControl, MagAppController.getAllDocs);
magappAdminRouter.post('/docs', authenticateMagappControl, MagAppController.createDoc);
magappAdminRouter.put('/docs/:id', authenticateMagappControl, MagAppController.updateDoc);
magappAdminRouter.delete('/docs/:id', authenticateMagappControl, MagAppController.deleteDoc);
magappAdminRouter.get('/docs/stats', authenticateMagappControl, MagAppController.getDocStats);
magappAdminRouter.get('/maintenances', authenticateMagappControl, MagAppController.getMaintenances);
magappAdminRouter.get('/maintenances/app/:appId', authenticateMagappControl, MagAppController.getAppMaintenances);
magappAdminRouter.post('/maintenances', authenticateMagappControl, MagAppController.createMaintenance);
magappAdminRouter.put('/maintenances/:id', authenticateMagappControl, MagAppController.updateMaintenance);
magappAdminRouter.delete('/maintenances/:id', authenticateMagappControl, MagAppController.deleteMaintenance);
magappAdminRouter.get('/maintenances/:maintenanceId/attachments', authenticateMagappControl, MagAppController.getMaintenanceAttachments);
magappAdminRouter.post('/migrate-uploads', authenticateMagappControl, MagAppController.migrateUploads);

// Agents BETA (accès anticipé)
magappAdminRouter.get('/beta-users', authenticateMagappControl, MagAppController.listBetaUsers);
magappAdminRouter.post('/beta-users', authenticateMagappControl, MagAppController.addBetaUser);
magappAdminRouter.delete('/beta-users/:id', authenticateMagappControl, MagAppController.removeBetaUser);
// Accès par fonctionnalité (agents nommés)
magappAdminRouter.get('/feature-users', authenticateMagappControl, MagAppController.listFeatureUsers);
magappAdminRouter.post('/feature-users', authenticateMagappControl, MagAppController.addFeatureUser);
magappAdminRouter.delete('/feature-users/:id', authenticateMagappControl, MagAppController.removeFeatureUser);

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
        const { host, port, database, username, password, is_enabled, ssl_mode, connect_timeout, application_name, schema_name } = req.body;
        const b64Password = password ? Buffer.from(password).toString('base64') : null;

        await db.run(`
            UPDATE postgres_settings
            SET host = ?, port = ?, database = ?, username = ?, password = ?, is_enabled = ?,
                ssl_mode = ?, connect_timeout = ?, application_name = ?, schema_name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [host, port || 5432, database, username, b64Password, is_enabled ? 1 : 0,
            ssl_mode || 'disable', connect_timeout || 10, application_name || 'DSIHub', schema_name || 'public']);

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
