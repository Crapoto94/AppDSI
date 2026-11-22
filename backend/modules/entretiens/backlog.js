'use strict';
/**
 * Backlog du module « Entretiens professionnels » : questions, propositions d'amélioration et bugs signalés par les utilisateur·rice·s
 * (bouton « ampoule »). Les administrateurs du module les traitent (acceptée, refusée avec motif, réalisée, ou réponse à une question) ;
 * chaque changement d'état est notifié par e-mail au demandeur.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');
const storage = require('../../shared/storage');

const MAX_PIECES = 5;
const MAX_OCTETS = 10 * 1048576;
const MIMES = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', log: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
};
const nomSur = (n) => Array.from(String(n || 'piece')).map((c) => ('\\/:*?"<>|'.includes(c) || c.charCodeAt(0) < 32 ? '_' : c)).join('').trim().slice(0, 120) || 'piece';

/** Contrôle les fichiers reçus (nombre, taille, type) ; renvoie la liste prête à enregistrer. */
function controler(files, max) {
    const list = (files || []).filter((f) => f && f.buffer && f.buffer.length);
    if (list.length > max) { const e = new Error(`Au plus ${max} pièce(s) jointe(s).`); e.status = 400; throw e; }
    return list.map((f) => {
        const nom = nomSur(f.originalname);
        const ext = (nom.split('.').pop() || '').toLowerCase();
        if (!MIMES[ext]) { const e = new Error(`Pièce jointe non acceptée (.${ext}) : image, PDF, texte, Word, Excel, PowerPoint ou OpenDocument.`); e.status = 400; throw e; }
        if (f.size > MAX_OCTETS || f.buffer.length > MAX_OCTETS) { const e = new Error(`« ${nom} » dépasse 10 Mo.`); e.status = 400; throw e; }
        return { f, nom, mime: MIMES[ext] };
    });
}

async function enregistrer(demandeId, commentaireId, liste) {
    for (const { f, nom, mime } of liste) {
        const saved = await storage.saveFile('entretiens-backlog', demandeId, { buffer: f.buffer, originalname: nom });
        await pgDb.run('INSERT INTO hub_entretiens.backlog_pieces (demande_id, commentaire_id, nom, mime, taille, path) VALUES (?, ?, ?, ?, ?, ?)',
            [demandeId, commentaireId || null, nom, mime, f.buffer.length, saved.dbPath]);
    }
}

/** Pièces jointes de plusieurs demandes (une requête) : { demande_id: [{id, nom, mime, taille, commentaire_id}] }. */
async function piecesDe(ids) {
    const out = {};
    if (!ids.length) return out;
    const rows = await pgDb.all(`SELECT id, demande_id, commentaire_id, nom, mime, taille FROM hub_entretiens.backlog_pieces WHERE demande_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids.map(Number));
    for (const r of rows) (out[r.demande_id] = out[r.demande_id] || []).push({ id: r.id, nom: r.nom, mime: r.mime, taille: r.taille, commentaire_id: r.commentaire_id });
    return out;
}

const TYPES = { question: 'Question', amelioration: 'Amélioration', bug: 'Bug' };
const STATUTS = ['demandee', 'acceptee', 'refusee', 'realisee', 'repondue'];

let ready = null;
function ensureTable() {
    if (!ready) {
        ready = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.backlog_demandes (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                titre TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                page TEXT DEFAULT '',
                statut TEXT NOT NULL DEFAULT 'demandee',
                motif TEXT DEFAULT '',
                demandeur TEXT DEFAULT '',
                demandeur_nom TEXT DEFAULT '',
                demandeur_email TEXT DEFAULT '',
                traite_par TEXT DEFAULT '',
                traite_le TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.backlog_commentaires (
                id SERIAL PRIMARY KEY,
                demande_id INTEGER NOT NULL,
                auteur TEXT DEFAULT '',
                auteur_nom TEXT DEFAULT '',
                est_admin BOOLEAN NOT NULL DEFAULT FALSE,
                texte TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_backlog_comm_dem ON hub_entretiens.backlog_commentaires (demande_id, id)');
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.backlog_pieces (
                id SERIAL PRIMARY KEY,
                demande_id INTEGER NOT NULL,
                commentaire_id INTEGER,
                nom TEXT NOT NULL,
                mime TEXT DEFAULT '',
                taille INTEGER DEFAULT 0,
                path TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_backlog_pieces_dem ON hub_entretiens.backlog_pieces (demande_id)');
        })().catch((e) => { ready = null; throw e; });
    }
    return ready;
}

const fail = (res, status, message) => res.status(status).json({ message });
const clean = (v) => String(v == null ? '' : v).replace(/\r/g, '').trim();

const shape = (r) => ({
    id: r.id, type: r.type, type_label: TYPES[r.type] || r.type, titre: r.titre, description: r.description, page: r.page, statut: r.statut, motif: r.motif,
    demandeur: r.demandeur_nom || r.demandeur, demandeur_email: r.demandeur_email, traite_par: r.traite_par, traite_le: r.traite_le, created_at: r.created_at,
});

async function adminEmails() {
    try { return await require('./reopen').adminEmails(); } catch (e) { return []; }
}

const shapeComment = (c) => ({ id: c.id, demande_id: c.demande_id, auteur: c.auteur_nom || c.auteur, est_admin: !!c.est_admin, texte: c.texte, created_at: c.created_at });

module.exports = {
    // GET /api/entretiens/backlog/all — toutes les demandes, visibles de tous les utilisateur·rice·s du module (adresses e-mail réservées aux administrateurs)
    all: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            const admin = await svc.isEpAdmin(actor);
            const rows = await pgDb.all(
                `SELECT d.*, (SELECT COUNT(*) FROM hub_entretiens.backlog_commentaires c WHERE c.demande_id = d.id) AS nb_commentaires
                 FROM hub_entretiens.backlog_demandes d ORDER BY d.id DESC LIMIT 500`);
            const pj = await piecesDe(rows.map(r => r.id));
            res.json({ demandes: rows.map(r => {
                const d = shape(r);
                if (!admin) delete d.demandeur_email;
                return { ...d, pieces: (pj[r.id] || []).filter(p => !p.commentaire_id), nb_commentaires: Number(r.nb_commentaires || 0), mienne: String(r.demandeur || '').toLowerCase() === String(actor.username || '').toLowerCase() };
            }) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/backlog/:id/comments
    comments: async (req, res) => {
        try {
            await ensureTable();
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.backlog_commentaires WHERE demande_id = ? ORDER BY id', [Number(req.params.id)]);
            const pj = await piecesDe([Number(req.params.id)]);
            res.json({ commentaires: rows.map(c => ({ ...shapeComment(c), pieces: (pj[Number(req.params.id)] || []).filter(p => p.commentaire_id === c.id) })) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/backlog/:id/comments { texte }
    comment: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const d = await pgDb.get('SELECT * FROM hub_entretiens.backlog_demandes WHERE id = ?', [id]);
            if (!d) return fail(res, 404, 'Demande introuvable.');
            const texte = clean(req.body?.texte);
            const liste = controler(req.files, 3);
            if ((texte.length < 2 && !liste.length) || texte.length > 2000) return fail(res, 400, 'Le commentaire doit faire de 2 à 2000 caractères (ou joindre un fichier).');
            const row = await pgDb.get(
                'INSERT INTO hub_entretiens.backlog_commentaires (demande_id, auteur, auteur_nom, est_admin, texte) VALUES (?, ?, ?, ?, ?) RETURNING *',
                [id, actor.username || '', actor.displayName || actor.username || '', !!(await svc.isEpAdmin(actor)), texte || '(pièce jointe)']);
            await enregistrer(id, row.id, liste);
            res.status(201).json({ ok: true, commentaire: shapeComment(row) });
        } catch (err) { if (err && err.status) return fail(res, err.status, err.message); console.error('[ENTRETIENS] backlog comment:', err.message); fail(res, 500, err.message); }
    },

    // DELETE /api/entretiens/backlog/:id — supprime une demande (« fausse » demande), ses commentaires et ses pièces jointes (administrateurs)
    remove: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Réservé aux administrateurs du module.');
            const id = Number(req.params.id);
            const d = await pgDb.get('SELECT * FROM hub_entretiens.backlog_demandes WHERE id = ?', [id]);
            if (!d) return fail(res, 404, 'Demande introuvable.');
            const pieces = await pgDb.all('SELECT path FROM hub_entretiens.backlog_pieces WHERE demande_id = ?', [id]);
            for (const p of pieces) { try { await storage.deleteFile(p.path); } catch (e) { /* fichier déjà absent */ } }
            await pgDb.run('DELETE FROM hub_entretiens.backlog_pieces WHERE demande_id = ?', [id]);
            await pgDb.run('DELETE FROM hub_entretiens.backlog_commentaires WHERE demande_id = ?', [id]);
            await pgDb.run('DELETE FROM hub_entretiens.backlog_demandes WHERE id = ?', [id]);
            await svc.logAudit({ actor, action: 'backlog_supprime', entretien: null, details: { demande: id, type: d.type, titre: d.titre, demandeur: d.demandeur } });
            res.json({ ok: true });
        } catch (err) { console.error('[ENTRETIENS] backlog remove:', err.message); fail(res, 500, err.message); }
    },

    // GET /api/entretiens/backlog/pieces/:id — télécharge / affiche une pièce jointe (visible de tous les utilisateur·rice·s du module)
    piece: async (req, res) => {
        try {
            await ensureTable();
            const p = await pgDb.get('SELECT * FROM hub_entretiens.backlog_pieces WHERE id = ?', [Number(req.params.id)]);
            if (!p) return fail(res, 404, 'Pièce introuvable.');
            const f = await storage.getFileForServe(p.path);
            if (!f) return fail(res, 404, 'Fichier introuvable.');
            res.setHeader('Content-Type', p.mime || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${String(p.nom).replace(/[^\w.\-]+/g, '_')}"`);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            res.send(f.buffer);
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/backlog { type, titre, description, page? }
    create: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            const type = clean(req.body?.type);
            if (!TYPES[type]) return fail(res, 400, 'Type de demande inconnu.');
            const titre = clean(req.body?.titre).replace(/\s+/g, ' ');
            const description = clean(req.body?.description);
            if (titre.length < 3 || titre.length > 200) return fail(res, 400, 'Le titre doit faire de 3 à 200 caractères.');
            if (description.length < 3 || description.length > 5000) return fail(res, 400, 'La description doit faire de 3 à 5000 caractères.');
            const liste = controler(req.files, MAX_PIECES);
            const row = await pgDb.get(
                `INSERT INTO hub_entretiens.backlog_demandes (type, titre, description, page, demandeur, demandeur_nom, demandeur_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
                [type, titre, description, clean(req.body?.page).slice(0, 120), actor.username || '', actor.displayName || actor.username || '', actor.email || '']);
            await enregistrer(row.id, null, liste);
            // Prévient les administrateurs (ne bloque jamais la demande)
            try {
                const emailTpl = require('./entretiens-email');
                const { sendParapheurEmail } = require('../parapheur/parapheur.service');
                const tpl = emailTpl.backlogNouvelle({ type: TYPES[type], titre, description, demandeur: actor.displayName || actor.username, link: await emailTpl.entretiensUrl('backlog') });
                for (const to of await adminEmails()) { try { await sendParapheurEmail(to, tpl); } catch (e) { console.warn('[ENTRETIENS] mail backlog:', e.message); } }
            } catch (e) { console.warn('[ENTRETIENS] mail backlog:', e.message); }
            res.status(201).json({ ok: true, demande: { ...shape(row), pieces: (await piecesDe([row.id]))[row.id] || [] } });
        } catch (err) { if (err && err.status) return fail(res, err.status, err.message); console.error('[ENTRETIENS] backlog create:', err.message); fail(res, 500, err.message); }
    },

    // GET /api/entretiens/backlog/mine — mes demandes
    mine: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.backlog_demandes WHERE LOWER(demandeur) = LOWER(?) ORDER BY id DESC LIMIT 100', [actor.username || '']);
            const pj = await piecesDe(rows.map(r => r.id));
            res.json({ demandes: rows.map(r => ({ ...shape(r), pieces: (pj[r.id] || []).filter(p => !p.commentaire_id) })) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/backlog — backlog de traitement (administrateurs)
    list: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Réservé aux administrateurs du module.');
            const rows = await pgDb.all("SELECT * FROM hub_entretiens.backlog_demandes ORDER BY (statut = 'demandee') DESC, id DESC LIMIT 1000");
            const pj = await piecesDe(rows.map(r => r.id));
            res.json({ demandes: rows.map(r => ({ ...shape(r), pieces: (pj[r.id] || []).filter(p => !p.commentaire_id) })) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/backlog/:id/decide { statut, motif }
    decide: async (req, res) => {
        try {
            await ensureTable();
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Réservé aux administrateurs du module.');
            const id = Number(req.params.id);
            const statut = clean(req.body?.statut);
            const motif = clean(req.body?.motif);
            if (!STATUTS.includes(statut)) return fail(res, 400, 'État inconnu.');
            if (['refusee', 'repondue'].includes(statut) && motif.length < 3) return fail(res, 400, statut === 'refusee' ? 'Indiquez le motif du refus.' : 'Indiquez la réponse.');
            const cur = await pgDb.get('SELECT * FROM hub_entretiens.backlog_demandes WHERE id = ?', [id]);
            if (!cur) return fail(res, 404, 'Demande introuvable.');
            const par = actor.displayName || actor.username || actor.email || '';
            const row = await pgDb.get(
                'UPDATE hub_entretiens.backlog_demandes SET statut = ?, motif = ?, traite_par = ?, traite_le = NOW() WHERE id = ? RETURNING *',
                [statut, motif, par, id]);
            let mail = 'sans_adresse';
            if (row.demandeur_email && statut !== 'demandee') {
                try {
                    const emailTpl = require('./entretiens-email');
                    const { sendParapheurEmail } = require('../parapheur/parapheur.service');
                    await sendParapheurEmail(row.demandeur_email, emailTpl.backlogDecision({ demandeur: row.demandeur_nom || row.demandeur, id: row.id, type: TYPES[row.type], titre: row.titre, statut, motif, par, link: await emailTpl.entretiensUrl('moi') }));
                    mail = 'envoye';
                } catch (e) { console.warn('[ENTRETIENS] mail décision backlog:', e.message); mail = 'echec'; }
            }
            await svc.logAudit({ actor, action: 'backlog_traite', entretien: null, details: { demande: id, statut } });
            res.json({ ok: true, demande: shape(row), mail });
        } catch (err) { console.error('[ENTRETIENS] backlog decide:', err.message); fail(res, 500, err.message); }
    },
};
