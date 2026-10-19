const fs = require('fs');
const { pool, getSqlite } = require('../../shared/database');
const apmMail = require('../../shared/apm_mail');
const { buildVirementCreditsPdf } = require('./virement-credits-pdf.service');

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
    tableReady = true;
}

const isManager = (u) => u && ['superadmin', 'admin', 'finances', 'compta'].includes(u.role);
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

async function loadOwned(req, id) {
    await ensureTable();
    const r = await pool.query('SELECT * FROM finance.virements_credits WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) return { error: { status: 404, message: 'Demande introuvable' } };
    if (!isManager(req.user) && row.created_by_username !== req.user.username) {
        return { error: { status: 403, message: 'Accès refusé' } };
    }
    return { row };
}

// État dérivé : envoi budget > état du parapheur > brouillon
function computeEtat(row) {
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
        date: String(b.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        section: b.section === 'F' ? 'F' : 'I', sens: b.sens === 'R' ? 'R' : 'D',
        compense: b.compense !== false, activite: String(b.activite || ''), motivation: String(b.motivation || ''),
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

async function currentPdfBuffer(row, preferSigned) {
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
    return { buffer: await buildVirementCreditsPdf(row.payload), signed: false };
}

const fail = (res, e, msg) => {
    if (e && e.status) return res.status(e.status).json({ message: e.message });
    console.error('[VirementCredits]', msg, e);
    res.status(500).json({ message: msg, error: e && e.message });
};

module.exports = {
    // Lignes d'exécution + disponible lus en direct dans SEDIT (schéma FI)
    async liveLines(req, res) {
        try {
            const { getLiveLines } = require('./virement-credits-lines.service');
            res.json(await getLiveLines({ fiscalYear: req.query.fiscalYear, allBudgets: req.query.allBudgets === '1' }));
        } catch (e) {
            console.error('[VirementCredits] lignes SEDIT:', e.message);
            res.status(502).json({ message: `SEDIT indisponible : ${e.message}` });
        }
    },

    async list(req, res) {
        try {
            await ensureTable();
            const where = isManager(req.user) ? '' : 'WHERE v.created_by_username = $1';
            const r = await pool.query(
                `SELECT v.id, v.created_by_username, v.created_by_name, v.created_at, v.direction, v.service, v.contact,
                        v.date_demande, v.section, v.sens, v.compense, v.montant, v.motivation, v.payload,
                        v.parapheur_id, v.sent_at, v.sent_by, v.sent_to, v.sent_cc,
                        p.status AS para_status, p.reference AS para_reference
                   FROM finance.virements_credits v
                   LEFT JOIN hub_parapheur.parapheurs p ON p.id = v.parapheur_id
                   ${where} ORDER BY v.created_at DESC LIMIT 500`,
                where ? [req.user.username] : []
            );
            res.json(r.rows.map(row => ({ ...row, etat: computeEtat(row) })));
        } catch (e) { fail(res, e, 'Erreur lecture historique'); }
    },

    async save(req, res) {
        try {
            await ensureTable();
            const p = sanitizePayload(req.body || {});
            if (!p.majorer.length && !p.minorer.length) return res.status(400).json({ message: 'Aucune imputation' });
            const montant = p.majorer.reduce((a, l) => a + l.montant, 0);
            const { name, email } = await senderOf(req.user);
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
                return res.json({ id });
            }
            const r = await pool.query(
                `INSERT INTO finance.virements_credits
                    (created_by_username, created_by_name, created_by_email, direction, service, contact, date_demande,
                     section, sens, compense, montant, motivation, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
                [req.user.username, name, email, p.direction, p.service, p.contact, p.date, p.section, p.sens, p.compense, montant, p.motivation, JSON.stringify(p)]
            );
            res.status(201).json({ id: r.rows[0].id });
        } catch (e) { fail(res, e, 'Erreur enregistrement'); }
    },

    async pdf(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id) {
                const p = await pool.query('SELECT status FROM hub_parapheur.parapheurs WHERE id = $1', [row.parapheur_id]);
                row.para_status = p.rows[0] && p.rows[0].status;
            }
            const { buffer, signed } = await currentPdfBuffer(row, req.query.signed !== '0');
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
            const pos = (req.body && req.body.position) || {};
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
                        positions: [{ documentIndex: 0, page: pos.page || 1, x: pos.x || 73.6, y: pos.y || 72.7, w: 150, h: 55 }],
                    }],
                },
                user: req.user,
                req,
            });
            await pool.query('UPDATE finance.virements_credits SET parapheur_id = $1, parapheur_at = now(), updated_at = now() WHERE id = $2', [result.id, row.id]);
            res.json({ parapheur_id: result.id, reference: result.reference });
        } catch (e) { fail(res, e, "Erreur d'envoi au parapheur"); }
    },

    async sendToBudget(req, res) {
        try {
            const { row, error } = await loadOwned(req, parseInt(req.params.id, 10));
            if (error) return res.status(error.status).json({ message: error.message });
            if (row.parapheur_id) {
                const p = await pool.query('SELECT status FROM hub_parapheur.parapheurs WHERE id = $1', [row.parapheur_id]);
                row.para_status = p.rows[0] && p.rows[0].status;
            }
            const settings = await loadSettings();
            const to = splitEmails(settings.to);
            const cc = splitEmails(settings.cc);
            if (!to.length) return res.status(400).json({ message: 'Destinataire non configuré' });
            const { buffer, signed } = await currentPdfBuffer(row, true);
            const sender = await senderOf(req.user);
            const message = String((req.body && req.body.message) || '').trim();
            const p = row.payload;
            const total = Number(row.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const content = `<p>${esc(message || 'Bonjour,\n\nVeuillez trouver ci-joint une demande de modification budgétaire.\n\nMerci d\'avance et belle journée !').replace(/\n/g, '<br>')}</p>`
                + `<p style="color:#64748b;font-size:12px">Virement de crédits de ${esc(total)} € — ${esc(p.service || '')} — ${signed ? 'document signé' : 'document non signé'}.</p>`;
            await apmMail.sendMail({
                to, cc, subject: `Demande de modification budgétaire - ${p.service || p.direction || ''} - ${total} €`.replace(/\s+-\s+-/g, ' -'),
                content,
                attachments: [{ filename: signed ? 'demande-modification-budgetaire_signee.pdf' : 'demande-modification-budgetaire.pdf', content: buffer.toString('base64') }],
                fromName: sender.name || undefined, fromEmail: sender.email || undefined,
            });
            await pool.query(
                'UPDATE finance.virements_credits SET sent_at = now(), sent_by = $1, sent_to = $2, sent_cc = $3, updated_at = now() WHERE id = $4',
                [req.user.username, to.join(', '), cc.join(', '), row.id]
            );
            res.json({ to, cc, signed });
        } catch (e) {
            if (!e.status) return res.status(502).json({ message: `Envoi impossible : ${e.message}` });
            fail(res, e, "Erreur d'envoi");
        }
    },

    async getSettings(req, res) {
        try { res.json(await loadSettings()); } catch (e) { fail(res, e, 'Erreur paramètres'); }
    },

    async saveSettings(req, res) {
        try {
            const to = splitEmails(req.body && req.body.to);
            const cc = splitEmails(req.body && req.body.cc);
            await writeSetting(KEY_TO, (to.length ? to : [DEFAULT_TO]).join(', '), 'Virements de crédits : destinataire du mail');
            await writeSetting(KEY_CC, cc.join(', '), 'Virements de crédits : copie du mail');
            res.json(await loadSettings());
        } catch (e) { fail(res, e, 'Erreur enregistrement paramètres'); }
    },
};
