const fs = require('fs');
const { pool, getSqlite } = require('../../shared/database');
const apmMail = require('../../shared/apm_mail');
const { buildVirementCreditsPdf, avisPosition, avisIndexFromY } = require('./virement-credits-pdf.service');
const seditDroits = require('./sedit-droits.service');
const perimetre = require('./virement-credits-perimetre.service');
const traitement = require('./virement-credits-traitement');

const KEY_TO = 'finance.virement_budget_to';
const KEY_CC = 'finance.virement_budget_cc';
const DEFAULT_TO = 'budget@ivry94.fr';

let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await pool.query('CREATE SCHEMA IF NOT EXISTS finance');
    await pool.query(`CREATE TABLE IF NOT EXISTS finance.virements_credits (
        id SERIAL PRIMARY KEY,
        created_by_username TEXT NOT NULL,
        created_by_name TEXT,
        created_by_email TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        direction TEXT, service TEXT, contact TEXT,
        date_demande DATE,
        section TEXT, sens TEXT, compense BOOLEAN DEFAULT TRUE,
        montant NUMERIC DEFAULT 0,
        motivation TEXT,
        payload JSONB NOT NULL,
        parapheur_id INTEGER,
        parapheur_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        sent_by TEXT,
        sent_to TEXT,
        sent_cc TEXT
    )`);
    // Notification du demandeur (signée / refusée / annulée) : dernier état notifié. Lignes existantes = état courant (pas de rafale au 1er démarrage).
    const col = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='finance' AND table_name='virements_credits' AND column_name='notified_etat'");
    if (!col.rows.length) {
        await pool.query('ALTER TABLE finance.virements_credits ADD COLUMN notified_etat TEXT');
        await pool.query(`UPDATE finance.virements_credits v SET notified_etat = p.status
                            FROM hub_parapheur.parapheurs p WHERE p.id = v.parapheur_id AND p.status IN ('termine','refuse','annule')`);
    }
    // Journal des actions (qui a fait quoi, quand)
    await pool.query(`CREATE TABLE IF NOT EXISTS finance.virements_credits_log (
        id SERIAL PRIMARY KEY, virement_id INTEGER NOT NULL, at TIMESTAMPTZ DEFAULT now(), username TEXT, action TEXT NOT NULL, detail JSONB)`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_virements_log_virement ON finance.virements_credits_log(virement_id)');
    // Suivi par service / direction (codes RH du demandeur) et traitement par la direction des finances
    for (const c of ['service_code TEXT', 'direction_code TEXT', 'sent_channel TEXT', 'treatment_status TEXT', 'treatment_comment TEXT', 'treated_at TIMESTAMPTZ', 'treated_by TEXT']) {
        await pool.query(`ALTER TABLE finance.virements_credits ADD COLUMN IF NOT EXISTS ${c}`);
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS finance.virements_traitants (
        username TEXT PRIMARY KEY, display_name TEXT, email TEXT, added_by TEXT, added_at TIMESTAMPTZ DEFAULT now())`);
    tableReady = true;
}

// Journal : ne doit jamais faire échouer l'action journalisée
async function logAction(virementId, username, action, detail) {
    try {
        await ensureTable();
        await pool.query('INSERT INTO finance.virements_credits_log (virement_id, username, action, detail) VALUES ($1,$2,$3,$4)',
            [virementId, username || null, action, detail ? JSON.stringify(detail) : null]);
    } catch (e) { console.warn('[VirementCredits] journal:', e.message); }
}

const isManager = (u) => u && ['superadmin', 'admin', 'finances', 'compta'].includes(u.role);
// Dans MagApp (req.onlyMine), chaque agent ne voit que ses propres demandes, même administrateur.
const seesAll = (req) => isManager(req.user) && !req.onlyMine;
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const splitEmails = (v) => String(v || '').split(/[;,\s]+/).map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+$/.test(e));

async function readSetting(key) {
    try {
        const db = getSqlite();
        if (!db) return '';
        const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        return row && row.setting_value ? String(row.setting_value) : '';
    } catch { return ''; }
}
async function writeSetting(key, value, description) {
    const db = getSqlite();
    if (!db) throw new Error('Base de paramètres indisponible');
    await db.run(
        `INSERT INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
        [key, value, description]
    );
}
async function loadSettings() {
    return {
        to: (await readSetting(KEY_TO)) || DEFAULT_TO,
        cc: await readSetting(KEY_CC),
    };
}

// Placement RH de l'agent connecté (service / direction), pour le suivi des demandes. null si indisponible.
async function placementOf(user) {
    try { return await require('./virement-credits-signataires.service').rhPlacement(user); }
    catch (e) { console.warn('[VirementCredits] placement RH:', e.message); return null; }
}

// Demande rattachée au service / à la direction de l'agent (anciennes demandes sans code : comparaison des libellés)
function sameUnit(row, placement, unit) {
    if (!placement) return false;
    const code = placement[`${unit}_code`], label = placement[`${unit}_label`];
    const rowCode = row[`${unit}_code`];
    if (rowCode) return !!code && String(rowCode).trim().toUpperCase() === code;
    return !!label && String(row[unit] || '').trim() === label;
}

// opts.read (consultation seule) : ouvre aussi la demande aux collègues du service / de la direction et aux finances
async function loadOwned(req, id, opts = {}) {
    await ensureTable();
    const r = await pool.query('SELECT * FROM finance.virements_credits WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) return { error: { status: 404, message: 'Demande introuvable' } };
    if (seesAll(req) || row.created_by_username === req.user.username) return { row };
    if (opts.read) {
        if (row.sent_at && (await traitement.rights(req.user)).traitant) return { row };
        const placement = await placementOf(req.user);
        if (sameUnit(row, placement, 'service') || sameUnit(row, placement, 'direction')) return { row };
    }
    return { error: { status: 403, message: 'Accès refusé' } };
}

// État dérivé : traitement par les finances > transmission > état du parapheur > brouillon
function computeEtat(row) {
    if (row.treatment_status === 'fait') return 'faite';
    if (row.treatment_status === 'en_cours') return 'en_traitement';
    if (row.treatment_status === 'refuse') return 'rejetee';
    if (row.sent_at) return 'envoyee';
    if (row.parapheur_id) {
        if (row.para_status === 'termine') return 'signee';
        if (row.para_status === 'refuse') return 'refusee';
        if (row.para_status === 'annule') return 'annulee';
        return 'en_signature';
    }
    return 'brouillon';
}

function sanitizePayload(b) {
    const line = (l) => ({
        chapitre: String(l.chapitre || ''), fonction: String(l.fonction || ''), nature: String(l.nature || ''),
        equipement: String(l.equipement || ''), operation: String(l.operation || ''), activite: String(l.activite || ''),
        code: String(l.code || ''), montant: num(l.montant), avant: l.avant == null ? null : num(l.avant), apres: l.apres == null ? null : num(l.apres),
    });
    return {
        direction: String(b.direction || ''), service: String(b.service || ''), contact: String(b.contact || ''),
        budget: String(b.budget || '').slice(0, 80),
        collectivite: perimetre.COLLECTIVITES.includes(b.collectivite) ? b.collectivite : '',
        date: String(b.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        section: b.section === 'F' ? 'F' : 'I', sens: b.sens === 'R' ? 'R' : 'D',
        compense: b.compense !== false, activite: String(b.activite || ''), motivation: String(b.motivation || '').trim(),
        majorer: (Array.isArray(b.majorer) ? b.majorer : []).map(line),
        minorer: (Array.isArray(b.minorer) ? b.minorer : []).map(line),
    };
}

async function senderOf(user) {
    let name = user.displayName || user.username;
    let email = user.email || '';
    try {
        const u = await pool.query('SELECT displayname, email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [user.username || '']);
        if (u.rows[0]) { name = u.rows[0].displayname || name; email = u.rows[0].email || email; }
    } catch { /* repli JWT */ }
    return { name, email };
}

async function currentPdfBuffer(row, preferSigned, opts) {
    if (preferSigned && row.parapheur_id && row.para_status === 'termine') {
        try {
            const parapheur = require('../parapheur/parapheur.service');
            const doc = await pool.query('SELECT id FROM hub_parapheur.documents WHERE parapheur_id = $1 AND COALESCE(is_annexe, FALSE) = FALSE ORDER BY sort_order LIMIT 1', [row.parapheur_id]);
            if (doc.rows[0]) {
                const f = await parapheur.getSignedDocument(row.parapheur_id, doc.rows[0].id, { signed: true });
                if (f) return { buffer: f.buffer || await fs.promises.readFile(f.absolutePath), signed: true };
            }
        } catch (e) { console.warn('[VirementCredits] PDF signé indisponible:', e.message); }
    }
    return { buffer: await buildVirementCreditsPdf(row.payload, opts), signed: false };
}

// Le virement de crédits est réservé aux agents ayant un compte SEDIT Finances actif (y compris admin/finances).
async function requireSeditAccount(req, res, next) {
    try {
        const access = await seditDroits.getAccess(req.user);
        if (!access) return res.status(403).json({ message: 'Fonction réservée aux agents disposant d’un compte SEDIT Finances' });
        // Budgets clos écartés (ex. SSID) et collectivité (Ville / CCAS) précisée
        req.seditAccess = { ...access, services: await perimetre.openRights(access.services) };
        next();
    } catch (e) {
        console.error('[VirementCredits] droits SEDIT:', e.message);
        res.status(502).json({ message: `SEDIT indisponible : ${e.message}` });
    }
}

// Contrôles communs avant toute transmission aux finances. Renvoie un message de refus, ou null.
async function transmissionRefusee(row) {
    if (!String(row.motivation || '').trim()) return 'Motivation de la demande absente : dupliquez la demande et renseignez-la.';
    if (!row.parapheur_id) return 'La demande doit être signée avant d’être transmise : envoyez-la d’abord pour signature.';
    const p = await pool.query('SELECT status FROM hub_parapheur.parapheurs WHERE id = $1', [row.parapheur_id]);
    row.para_status = p.rows[0] && p.rows[0].status;
    if (row.para_status !== 'termine') return 'La demande ne peut être transmise qu’une fois toutes les signatures faites.';
    return null;
}

const motivationRequise = 'La motivation de la demande est obligatoire';

const fail = (res, e, msg) => {
    if (e && e.status) return res.status(e.status).json({ message: e.message });
    console.error('[VirementCredits]', msg, e);
    res.status(500).json({ message: msg, error: e && e.message });
};

async function selectRows(where, params) {
    const r = await pool.query(
        `SELECT v.id, v.created_by_username, v.created_by_name, v.created_at, v.direction, v.service, v.contact,
                v.date_demande, v.section, v.sens, v.compense, v.montant, v.motivation, v.payload,
                v.parapheur_id, v.sent_at, v.sent_by, v.sent_to, v.sent_cc, v.sent_channel,
                v.treatment_status, v.treatment_comment, v.treated_at, v.treated_by,
                p.status AS para_status, p.reference AS para_reference
           FROM finance.virements_credits v
           LEFT JOIN hub_parapheur.parapheurs p ON p.id = v.parapheur_id
           ${where} ORDER BY v.created_at DESC LIMIT 500`, params);
    return r.rows.map(row => ({ ...row, etat: computeEtat(row) }));
}

module.exports = {
    requireSeditAccount,
    logAction,
    ensureTable,

    // Accès de l'agent connecté : compte SEDIT + services sur lesquels il peut modifier le budget
    async access(req, res) {
        try {
            await ensureTable();
            // Droits « finances » indépendants de SEDIT : un traitant garde son accès même sans compte ou si SEDIT est indisponible
            const droits = await traitement.rights(req.user);
            let access = null;
            try { access = await seditDroits.getAccess(req.user); }
            catch (e) { if (!droits.canManage) throw e; console.warn('[VirementCredits] accès SEDIT:', e.message); }
            const services = access ? await perimetre.openRights(access.services) : [];
            res.json({
                allowed: services.length > 0 || droits.canManage,
                canCreate: services.length > 0,
                traitement: droits,
                sedit: access ? { code: access.sedit.code, nom: access.sedit.nom } : null,
                services: services.map(s => ({ collectivite: s.collectivite, budget: s.budget, service: s.service, libelle: s.libelle })),
            });
        } catch (e) {
            console.error('[VirementCredits] accès SEDIT:', e.message);
            res.status(502).json({ message: `SEDIT indisponible : ${e.message}` });
        }
    },

    // Lignes d'exécution + disponible lus en direct dans SEDIT (schéma FI)
    async liveLines(req, res) {
        try {
            const { getLiveLines } = require('./virement-credits-lines.service');
            res.json(await getLiveLines({ fiscalYear: req.query.fiscalYear, collectivite: req.query.collectivite, budget: req.query.budget, allBudgets: req.query.allBudgets === '1', services: req.seditAccess.services, actor: req.user, clientApp: 'DSIHUB' }));
        } catch (e) {
            console.error('[VirementCredits] lignes SEDIT:', e.message);
            res.status(502).json({ message: `SEDIT indisponible : ${e.message}` });
        }
    },

    async list(req, res) {
        try {
            await ensureTable();
            // scope : mes demandes (défaut), celles de mon service ou de ma direction (consultation)
            const scope = ['service', 'direction'].includes(req.query.scope) ? req.query.scope : 'mine';
            let where = 'WHERE v.created_by_username = $1', params = [req.user.username];
            if (scope !== 'mine') {
                const placement = await placementOf(req.user);
                const code = placement && placement[`${scope}_code`], label = placement && placement[`${scope}_label`];
                if (!code && !label) return res.json([]);
                where = `WHERE (v.${scope}_code = $1 OR (v.${scope}_code IS NULL AND v.${scope} = $2))`;
                params = [code || null, label || null];
            } else if (seesAll(req)) { where = ''; params = []; }
            const rows = await selectRows(where, params);
            res.json(rows.map(row => ({ ...row, mine: row.created_by_username === req.user.username })));
        } catch (e) { fail(res, e, 'Erreur lecture historique'); }
    },

    async save(req, res) {
        try {
            await ensureTable();
            const p = sanitizePayload(req.body || {});
            if (!p.majorer.length && !p.minorer.length) return res.status(400).json({ message: 'Aucune imputation' });
            if (!p.motivation) return res.status(400).json({ message: motivationRequise });
            // Contrôle serveur : chaque ligne doit relever d'un service que l'agent peut modifier dans SEDIT, sur ce budget
            const droitsBudget = req.seditAccess.services.filter(s => (!p.collectivite || s.collectivite === p.collectivite)
                && (!p.budget || perimetre.norm(s.budget) === perimetre.norm(p.budget)));
            if (!droitsBudget.length) return res.status(403).json({ message: 'Budget clos ou non autorisé pour votre compte SEDIT' });
            const okServices = new Set(droitsBudget.map(s => s.service.toUpperCase()));
            const hors = [...p.majorer, ...p.minorer].find(l => !okServices.has(String(l.activite).trim().toUpperCase()));
            if (hors) return res.status(403).json({ message: `Ligne non autorisée pour votre compte SEDIT (service ${hors.activite || '?'})` });
            const montant = p.majorer.reduce((a, l) => a + l.montant, 0);
            const { name, email } = await senderOf(req.user);
            // Direction / service du demandeur : référentiel RH (repli sur la saisie si indisponible)
            const placement = await placementOf(req.user);
            if (placement) { p.direction = placement.direction_label || p.direction; p.service = placement.service_label || p.service; }
            const id = req.body && req.body.id ? parseInt(req.body.id, 10) : null;
            if (id) {
                const { row, error } = await loadOwned(req, id);
                if (error) return res.status(error.status).json({ message: error.message });
                if (row.parapheur_id || row.sent_at) return res.status(409).json({ message: 'Demande déjà transmise : modification impossible' });
                await pool.query(
                    `UPDATE finance.virements_credits SET direction=$1, service=$2, contact=$3, date_demande=$4, section=$5, sens=$6,
                        compense=$7, montant=$8, motivation=$9, payload=$10, updated_at=now() WHERE id=$11`,
                    [p.direction, p.service, p.contact, p.date, p.section, p.sens, p.compense, montant, p.motivation, JSON.stringify(p), id]
                );
                await logAction(id, req.user.username, 'modification', { montant, lignes: p.majorer.length + p.minorer.length });
                return res.json({ id });
            }
            const r = await pool.query(
                `INSERT INTO finance.virements_credits
                    (created_by_username, created_by_name, created_by_email, direction, service, contact, date_demande,
                     section, sens, compense, montant, motivation, payload, service_code, direction_code)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
                [req.user.username, name, email, p.direction, p.service, p.contact, p.date, p.section, p.sens, p.compense, montant, p.motivation, JSON.stringify(p),
                    (placement && placement.service_code) || null, (placement && placement.direction_code) || null]
            );
            await logAction(r.rows[0].id, req.user.username, 'creation', { montant, lignes: p.majorer.length + p.minorer.length });
            res.status(201).json({ id: r.rows[0].id });
        } catch (e) { fail(res, e, 'Erreur enregistrement'); }
    },

    async pdf(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10), { read: true });
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id) {
                const p = await pool.query('SELECT status FROM hub_parapheur.parapheurs WHERE id = $1', [row.parapheur_id]);
                row.para_status = p.rows[0] && p.rows[0].status;
            }
            // Aperçu MagApp (?hints=1) : repères d'emplacement des signatures dans les cadres « Avis » 1 et 2 (jamais dans le PDF transmis)
            let opts;
            if (req.query.hints === '1' && !row.parapheur_id && !row.sent_at) {
                const nm = (v) => String(v || '').replace(/[^\p{L}\p{N} '’.,-]/gu, '').trim().slice(0, 60);
                const hints = {};
                if (nm(req.query.resp)) hints[0] = { title: 'Signature du responsable de service', name: nm(req.query.resp) };
                if (nm(req.query.dir)) hints[1] = { title: 'Signature du directeur', name: nm(req.query.dir) };
                opts = { hints };
            }
            const { buffer, signed } = await currentPdfBuffer(row, req.query.signed !== '0', opts);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('X-Pdf-Signed', signed ? '1' : '0');
            res.setHeader('Content-Disposition', 'inline; filename="demande-modification-budgetaire.pdf"');
            res.send(buffer);
        } catch (e) { fail(res, e, 'Erreur génération PDF'); }
    },

    async remove(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id || row.sent_at) return res.status(409).json({ message: 'Demande déjà transmise : suppression impossible' });
            await pool.query('DELETE FROM finance.virements_credits WHERE id = $1', [row.id]);
            await logAction(row.id, req.user.username, 'suppression', { montant: row.montant });
            res.json({ ok: true });
        } catch (e) { fail(res, e, 'Erreur suppression'); }
    },

    async sendToParapheur(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id) return res.status(409).json({ message: 'Déjà envoyée au parapheur' });
            const sig = (req.body && req.body.signataire) || {};
            if (!sig.email) return res.status(400).json({ message: 'Signataire requis' });
            if (!String(row.motivation || '').trim()) return res.status(400).json({ message: motivationRequise });
            const pos = (req.body && req.body.position) || {};
            // Cadre « Avis » visé (d'après l'ordonnée choisie) : signature, mention et date placées sur cette ligne
            const avisIdx = avisIndexFromY(pos.y || 72.7);
            const buffer = await buildVirementCreditsPdf(row.payload);
            const [y, m, d] = String(row.payload.date).split('-');
            const parapheur = require('../parapheur/parapheur.service');
            const result = await parapheur.createParapheur({
                files: [{ buffer, originalname: 'demande-modification-budgetaire.pdf', mimetype: 'application/pdf', size: buffer.length }],
                annexes: [],
                payload: {
                    title: `Demande de modification budgétaire${row.payload.service ? ' - ' + row.payload.service : ''} - ${d}/${m}/${y}`,
                    message: String((req.body && req.body.message) || ''),
                    mode: 'parallele',
                    signataires: [{
                        nom: sig.nom || sig.email, email: sig.email, service: sig.service, signatureMode: 'simple',
                        positions: [avisPosition(avisIdx)],
                    }],
                },
                user: req.user,
                req,
            });
            await pool.query('UPDATE finance.virements_credits SET parapheur_id = $1, parapheur_at = now(), updated_at = now() WHERE id = $2', [result.id, row.id]);
            await logAction(row.id, req.user.username, 'envoi_parapheur', { parapheur_id: result.id, reference: result.reference });
            res.json({ parapheur_id: result.id, reference: result.reference });
        } catch (e) { fail(res, e, "Erreur d'envoi au parapheur"); }
    },

    // MagApp : signataires proposés (défaut = chaîne hiérarchique de l'agent ; choix limité aux services/directions autorisés dans SEDIT)
    async signataires(req, res) {
        try {
            const { getSignataires } = require('./virement-credits-signataires.service');
            res.json(await getSignataires(req.user, req.seditAccess.services));
        } catch (e) { fail(res, e, 'Erreur lecture des signataires'); }
    },

    // MagApp : parapheur à deux signatures successives — responsable de service puis directeur (cadres « Avis » du PDF).
    async sendToParapheurChain(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id) return res.status(409).json({ message: 'Déjà envoyée au parapheur' });
            if (!String(row.motivation || '').trim()) return res.status(400).json({ message: motivationRequise });
            const { getSignataires } = require('./virement-credits-signataires.service');
            const allowed = await getSignataires(req.user, req.seditAccess.services);
            const body = req.body || {};
            const resolve = (wanted, list) => {
                const email = String(wanted && wanted.email || '').trim().toLowerCase();
                if (!email) return null;
                return list.find(e => String(e.email).toLowerCase() === email) || false;
            };
            const resp = resolve(body.responsable, allowed.responsables);
            const dir = resolve(body.directeur, allowed.directeurs);
            // false = signataire demandé mais hors du périmètre autorisé de l'agent
            if (resp === false || dir === false) return res.status(403).json({ message: 'Signataire non autorisé pour votre périmètre budgétaire SEDIT' });
            if (!resp && !dir) return res.status(400).json({ message: 'Choisissez au moins un signataire' });
            const buffer = await buildVirementCreditsPdf(row.payload);
            const [y, m, d] = String(row.payload.date).split('-');
            const parapheur = require('../parapheur/parapheur.service');
            // Ligne 0 = « Avis du responsable de service », ligne 1 = « Avis de la direction »
            const sg = (e, avisIdx) => ({
                nom: `${e.prenom || ''} ${e.nom || ''}`.trim() || e.email, email: e.email,
                service: e.role === 'directeur' ? e.direction_label : e.service_label, signatureMode: 'simple',
                positions: [avisPosition(avisIdx)],
            });
            const signataires = [resp && sg(resp, 0), dir && sg(dir, 1)].filter(Boolean);
            const result = await parapheur.createParapheur({
                files: [{ buffer, originalname: 'demande-modification-budgetaire.pdf', mimetype: 'application/pdf', size: buffer.length }],
                annexes: [],
                payload: {
                    title: `Demande de modification budgétaire${row.payload.service ? ' - ' + row.payload.service : ''} - ${d}/${m}/${y}`,
                    message: String(body.message || ''),
                    mode: 'sequentiel',
                    signataires,
                },
                user: req.user,
                req,
            });
            await pool.query('UPDATE finance.virements_credits SET parapheur_id = $1, parapheur_at = now(), updated_at = now() WHERE id = $2', [result.id, row.id]);
            await logAction(row.id, req.user.username, 'envoi_parapheur', { parapheur_id: result.id, reference: result.reference });
            res.json({ parapheur_id: result.id, reference: result.reference });
        } catch (e) { fail(res, e, "Erreur d'envoi au parapheur"); }
    },

    async sendToBudget(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            const refus = await transmissionRefusee(row);
            if (refus) return res.status(409).json({ message: refus });
            const settings = await loadSettings();
            const to = splitEmails(settings.to);
            const cc = splitEmails(settings.cc);
            if (!to.length) return res.status(400).json({ message: 'Destinataire non configuré' });
            const { buffer, signed } = await currentPdfBuffer(row, true);
            if (!signed) return res.status(502).json({ message: 'Document signé momentanément indisponible : réessayez plus tard.' });
            const sender = await senderOf(req.user);
            const message = String((req.body && req.body.message) || '').trim();
            const p = row.payload;
            const total = Number(row.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const content = `<p>${esc(message || 'Bonjour,\n\nVeuillez trouver ci-joint une demande de modification budgétaire.\n\nMerci d\'avance et belle journée !').replace(/\n/g, '<br>')}</p>`
                + `<p style="color:#64748b;font-size:12px">Virement de crédits n°${row.id} de ${esc(total)} € — ${esc(p.service || '')} — document signé.</p>`;
            await apmMail.sendMail({
                to, cc, subject: `Demande de modification budgétaire - ${p.service || p.direction || ''} - ${total} €`.replace(/\s+-\s+-/g, ' -'),
                content,
                attachments: [{ filename: 'demande-modification-budgetaire_signee.pdf', content: buffer.toString('base64') }],
                fromName: sender.name || undefined, fromEmail: sender.email || undefined,
            });
            await pool.query(
                `UPDATE finance.virements_credits SET sent_at = now(), sent_by = $1, sent_to = $2, sent_cc = $3, sent_channel = 'mail', updated_at = now() WHERE id = $4`,
                [req.user.username, to.join(', '), cc.join(', '), row.id]
            );
            await logAction(row.id, req.user.username, 'envoi_budget', { to, cc, signed });
            res.json({ to, cc, signed });
        } catch (e) {
            if (!e.status) return res.status(502).json({ message: `Envoi impossible : ${e.message}` });
            fail(res, e, "Erreur d'envoi");
        }
    },

    // ── Espace de traitement de la direction des finances ──

    // Transmission dans l'application, à la place du mail au service budget
    async transmettre(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.sent_at) return res.status(409).json({ message: 'Demande déjà transmise' });
            const refus = await transmissionRefusee(row);
            if (refus) return res.status(409).json({ message: refus });
            if (!(await traitement.listTraitants()).length) return res.status(409).json({ message: 'L’espace de traitement n’a pas encore d’agent désigné : envoyez la demande par mail.' });
            await pool.query(
                `UPDATE finance.virements_credits SET sent_at = now(), sent_by = $1, sent_to = 'Espace de traitement des finances', sent_channel = 'espace', updated_at = now() WHERE id = $2`,
                [req.user.username, row.id]);
            await logAction(row.id, req.user.username, 'transmission_espace', null);
            res.json({ ok: true });
        } catch (e) { fail(res, e, 'Erreur de transmission'); }
    },

    // La transmission dans l'application n'est proposée que si au moins un agent des finances est désigné
    async espace(req, res) {
        try { await ensureTable(); res.json({ ouvert: (await traitement.listTraitants()).length > 0 }); }
        catch (e) { fail(res, e, 'Erreur espace de traitement'); }
    },

    // Demandes transmises (par mail ou dans l'application)
    async traitementList(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).traitant) return res.status(403).json({ message: 'Réservé à la direction des finances' });
            res.json(await selectRows('WHERE v.sent_at IS NOT NULL', []));
        } catch (e) { fail(res, e, 'Erreur lecture des demandes à traiter'); }
    },

    async acquitter(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).traitant) return res.status(403).json({ message: 'Réservé à la direction des finances' });
            const statut = String((req.body && req.body.statut) || '');
            const comment = String((req.body && req.body.commentaire) || '').trim().slice(0, 2000);
            if (!Object.prototype.hasOwnProperty.call(traitement.STATUTS, statut)) return res.status(400).json({ message: 'Statut inconnu' });
            if (statut === 'refuse' && !comment) return res.status(400).json({ message: 'La raison du refus est obligatoire' });
            const id = parseInt(req.params.id, 10);
            const r = await pool.query('SELECT * FROM finance.virements_credits WHERE id = $1 AND sent_at IS NOT NULL', [id]);
            const row = r.rows[0];
            if (!row) return res.status(404).json({ message: 'Demande introuvable ou non transmise' });
            await pool.query(
                'UPDATE finance.virements_credits SET treatment_status = $1, treatment_comment = $2, treated_at = now(), treated_by = $3, updated_at = now() WHERE id = $4',
                [statut, comment || null, req.user.username, id]);
            await logAction(id, req.user.username, `traitement_${statut}`, { commentaire: comment || null });
            // L'acquittement reste acquis si le mail échoue : on le signale à l'agent
            let mail = null, mailError = null;
            try { mail = await traitement.notifyRequester(row, statut, comment); if (!mail) mailError = 'aucune adresse e-mail pour le demandeur'; }
            catch (e) { mailError = e.message; console.warn(`[VirementCredits] mail de traitement #${id}:`, e.message); }
            await logAction(id, req.user.username, mail ? 'mail_traitement' : 'mail_traitement_echec', { to: mail, erreur: mailError });
            res.json({ ok: true, mail, mailError });
        } catch (e) { fail(res, e, "Erreur d'enregistrement du traitement"); }
    },

    async traitants(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).canManage) return res.status(403).json({ message: 'Accès refusé' });
            res.json(await traitement.listTraitants());
        } catch (e) { fail(res, e, 'Erreur lecture des accès'); }
    },

    async traitantsSearch(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).canManage) return res.status(403).json({ message: 'Accès refusé' });
            res.json(await traitement.searchUsers(req.query.q));
        } catch (e) { fail(res, e, 'Erreur de recherche'); }
    },

    async addTraitant(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).canManage) return res.status(403).json({ message: 'Accès refusé' });
            await traitement.addTraitant(req.body && req.body.username, req.user.username);
            await logAction(0, req.user.username, 'acces_ajout', { agent: req.body.username });
            res.json(await traitement.listTraitants());
        } catch (e) { fail(res, e, "Erreur d'ajout"); }
    },

    async removeTraitant(req, res) {
        try {
            await ensureTable();
            if (!(await traitement.rights(req.user)).canManage) return res.status(403).json({ message: 'Accès refusé' });
            await traitement.removeTraitant(req.params.username);
            await logAction(0, req.user.username, 'acces_retrait', { agent: req.params.username });
            res.json(await traitement.listTraitants());
        } catch (e) { fail(res, e, 'Erreur de retrait'); }
    },

    async getSettings(req, res) {
        try { res.json(await loadSettings()); } catch (e) { fail(res, e, 'Erreur paramètres'); }
    },

    async saveSettings(req, res) {
        try {
            if (!isManager(req.user)) return res.status(403).json({ message: 'Réservé aux administrateurs / finances' });
            const to = splitEmails(req.body && req.body.to);
            const cc = splitEmails(req.body && req.body.cc);
            await writeSetting(KEY_TO, (to.length ? to : [DEFAULT_TO]).join(', '), 'Virements de crédits : destinataire du mail');
            await writeSetting(KEY_CC, cc.join(', '), 'Virements de crédits : copie du mail');
            res.json(await loadSettings());
        } catch (e) { fail(res, e, 'Erreur enregistrement paramètres'); }
    },
};
