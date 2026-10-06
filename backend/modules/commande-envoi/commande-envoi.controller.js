const { pool } = require('../../shared/database');
const svc = require('./commande-envoi.service');
const apmMail = require('../../shared/apm_mail');

let sendMail = null;
const setSendMail = (fn) => { sendMail = fn; };

const DEFAULT_SUBJECT = 'Bon de commande {{commande_numero}} - Ville d\'Ivry-sur-Seine';
// Structure du mail : corps paramétrable → message libre (saisi à l'envoi) → formule de politesse → signature.
const DEFAULT_BODY = `Bonjour,

Veuillez trouver ci-joint le bon de commande {{commande_numero}} ({{commande_libelle}}) d'un montant de {{montant_ttc}} TTC.`;
const DEFAULT_CLOSING = 'Cordialement,';
// Signature (logo Ivry à gauche). Mise en forme par préfixe de ligne : 1re ligne = nom (rouge, gras),
// « ** » = bleu gras, « ~ » = petit, sinon texte normal. Une ligne dont une variable est vide est omise.
const DEFAULT_SIGNATURE = `{{emetteur}}
**{{emetteur_poste}}
DSI, Direction des Systèmes d'Informations
**Mairie d'Ivry-sur-Seine
~Esplanade Georges Marrane - 94205 Ivry-sur-Seine Cedex
~Tél. : 01 49 60 25 08 (Poste {{emetteur_tel}})`;

const VARIABLES = [
    ['commande_numero', 'N° de commande'],
    ['commande_date', 'Date de la commande'],
    ['commande_libelle', 'Libellé de la commande'],
    ['reference', 'Référence'],
    ['montant_ttc', 'Montant TTC'],
    ['montant_ht', 'Montant HT'],
    ['fournisseur', 'Nom du tiers / fournisseur'],
    ['service', 'Service de la commande'],
    ['correspondant', 'Correspondant de la commande dans Sedit'],
    ['emetteur', 'Nom de l\'émetteur (personne connectée)'],
    ['emetteur_email', 'E-mail de l\'émetteur'],
    ['emetteur_poste', 'Poste de l\'émetteur (référentiel RH)'],
    ['emetteur_service', 'Service de l\'émetteur (référentiel RH)'],
    ['emetteur_tel', 'Poste téléphonique de l\'émetteur (Active Directory, « 22 07 » → « 22-07 »)'],
    ['destinataires', 'Noms des destinataires'],
].map(([name, label]) => ({ name, label }));

const isManager = (user) => ['superadmin', 'admin', 'finances'].includes(user?.role);

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => (n == null ? '' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/[  ]/g, ' '));
const render = (tpl, vars) => String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
const nl2br = (t) => String(t).replace(/\n/g, '<br>');

async function loadSettings() {
    const r = await pool.query('SELECT subject_template, body_template, closing_template, signature_template FROM finance.commande_mail_settings WHERE id = 1');
    const s = r.rows[0] || {};
    return {
        subject_template: s.subject_template || DEFAULT_SUBJECT,
        body_template: s.body_template || DEFAULT_BODY,
        closing_template: s.closing_template || DEFAULT_CLOSING,
        signature_template: s.signature_template || DEFAULT_SIGNATURE,
    };
}

// hub.users stocke « NOM Prénom » : on affiche « Prénom NOM » (partie en majuscules = nom).
function displayName(raw) {
    const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts.join(' ');
    let i = 0;
    while (i < parts.length - 1 && parts[i] === parts[i].toUpperCase()) i++;
    if (i === 0) return parts.join(' ');
    return [...parts.slice(i), ...parts.slice(0, i)].join(' ');
}

/**
 * Émetteur du mail = la PERSONNE CONNECTÉE : nom/e-mail depuis hub.users (jointure par
 * username — l'id du JWT ne correspond pas à hub.users.id), poste et service depuis le
 * référentiel RH (meilleur effort : vides si l'agent n'est pas retrouvé).
 */
async function resolveEmetteur(user) {
    let name = user?.username || '';
    let email = user?.email || '';
    try {
        const u = await pool.query('SELECT displayname, email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [user?.username || '']);
        if (u.rows[0]) {
            if (u.rows[0].displayname) name = displayName(u.rows[0].displayname);
            if (u.rows[0].email) email = u.rows[0].email;
        }
    } catch { /* repli sur le JWT */ }

    let poste = '';
    let service = '';
    // Poste court (≤ 5 chiffres) affiché « 22-07 » ; un numéro complet est laissé tel quel.
    let tel = String(await svc.getAdPhone(user?.username) || '').trim();
    if (tel && tel.replace(/\D/g, '').length <= 5) tel = tel.replace(/\s+/g, '-');
    try {
        const raw = String((await pool.query('SELECT displayname FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1', [user?.username || ''])).rows[0]?.displayname || '').trim().split(/\s+/);
        let i = 0;
        while (i < raw.length - 1 && raw[i] === raw[i].toUpperCase()) i++;
        const nom = raw.slice(0, Math.max(i, 1)).join(' ');
        const prenom = raw.slice(Math.max(i, 1)).join(' ');
        if (nom && prenom) {
            const rh = await pool.query(
                `SELECT "POSTE_L", "SERVICE_L" FROM oracle.rh_v_extract_dsi
                  WHERE UPPER("NOM") = UPPER($1) AND UPPER("PRENOM") = UPPER($2)
                    AND ("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%') LIMIT 1`,
                [nom, prenom]
            );
            if (rh.rows[0]) { poste = (rh.rows[0].POSTE_L || '').trim(); service = (rh.rows[0].SERVICE_L || '').trim(); }
        }
    } catch { /* optionnel */ }
    return { name, email, poste, service, tel };
}

function buildVars(cmd, emetteur, destinataires) {
    return {
        commande_numero: cmd.NUMERO || '',
        commande_date: cmd.DATE_COMMANDE || '',
        commande_libelle: (cmd.LIBELLE || '').trim(),
        reference: cmd.REFERENCE || '',
        montant_ttc: money(cmd.MONTANT_TTC),
        montant_ht: money(cmd.MONTANT_HT),
        fournisseur: cmd.TIERS_NOM || '',
        service: cmd.SERVICE_LIBELLE || '',
        correspondant: cmd.CORRESP ? String(cmd.CORRESP).trim() : '',
        emetteur: emetteur.name,
        emetteur_email: emetteur.email,
        emetteur_poste: emetteur.poste,
        emetteur_service: emetteur.service,
        emetteur_tel: emetteur.tel,
        destinataires,
    };
}

/**
 * Signature : tableau logo (Ivry.png, intégré en CID par sendMail) + lignes de texte.
 * Une ligne contenant une variable vide est omise (ex. « Tél. : » sans téléphone).
 */
function buildSignature(template, vars, logoSrc) {
    const lines = String(template || '').split('\n').map(l => l.trim()).filter(Boolean).filter((l) => {
        const names = [...l.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
        return names.every(n => String(vars[n] ?? '').trim() !== '');
    });
    const font = 'font-family:Arial,Helvetica,sans-serif;';
    const rows = lines.map((raw, i) => {
        let style = 'font-size:13px;color:#333333;';
        let text = raw;
        if (i === 0) style = 'font-size:14px;font-weight:bold;color:#e30613;';
        else if (text.startsWith('**')) { text = text.slice(2).trim(); style = 'font-size:13px;font-weight:bold;color:#1d4f91;'; }
        else if (text.startsWith('~')) { text = text.slice(1).trim(); style = 'font-size:12px;color:#444444;'; }
        const html = render(esc(text), Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)])));
        return `<div style="${font}${style}line-height:1.35;">${html}</div>`;
    });
    if (!rows.length) return '';
    return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>`
        + `<td style="vertical-align:middle;padding-right:14px;"><img src="${logoSrc}" alt="Ivry-sur-Seine" width="96" style="display:block;border:0;"></td>`
        + `<td style="vertical-align:middle;">${rows.join('')}</td></tr></table>`;
}

/** HTML du mail : corps → message libre → formule de politesse → signature (lignes vides supprimées). */
function buildHtml(settings, vars, message, logoSrc) {
    const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
    const block = (tpl) => render(esc(tpl), safe).replace(/\n{3,}/g, '\n\n').trim();
    const parts = [`<p>${nl2br(block(settings.body_template))}</p>`];
    if (message) parts.push(`<p>${nl2br(esc(message))}</p>`);
    parts.push(`<p>${nl2br(block(settings.closing_template))}</p>`);
    const sig = buildSignature(settings.signature_template, vars, logoSrc);
    if (sig) parts.push(sig);
    return parts.join('\n');
}

async function loadContacts(tierCode) {
    if (!tierCode) return [];
    const r = await pool.query(
        'SELECT id, nom, prenom, role, telephone, email, is_order_recipient FROM hub.contacts WHERE tier_code = $1 ORDER BY nom, prenom',
        [String(tierCode).trim()]
    );
    return r.rows;
}

const hasEmail = (c) => !!(c.email && c.email.includes('@'));

module.exports = {
    setSendMail,
    _internal: { buildHtml, loadSettings, resolveEmetteur, buildVars },

    async getSettings(req, res) {
        try {
            const s = await loadSettings();
            res.json({ ...s, variables: VARIABLES, can_edit: isManager(req.user) });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    async saveSettings(req, res) {
        try {
            const subject = String(req.body.subject_template || '').trim();
            const body = String(req.body.body_template || '').trim();
            const closing = String(req.body.closing_template || '').trim();
            const signature = String(req.body.signature_template || '').trim();
            if (!subject || !body) return res.status(400).json({ message: 'Titre et corps du mail obligatoires' });
            await pool.query(
                `INSERT INTO finance.commande_mail_settings (id, subject_template, body_template, closing_template, signature_template, updated_by, updated_at)
                 VALUES (1, $1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (id) DO UPDATE SET subject_template = EXCLUDED.subject_template,
                   body_template = EXCLUDED.body_template, closing_template = EXCLUDED.closing_template,
                   signature_template = EXCLUDED.signature_template, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
                [subject, body, closing || DEFAULT_CLOSING, signature || DEFAULT_SIGNATURE, req.user.username]
            );
            res.json({ message: 'Modèle enregistré' });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // État d'envoi (dernier envoi + nombre) pour une liste de commandes (ROO Sedit) : bouton « Envoyée ».
    async statuses(req, res) {
        try {
            const roos = Array.isArray(req.body.roos) ? req.body.roos.map(r => String(r).trim()).filter(Boolean).slice(0, 500) : [];
            if (!roos.length) return res.json({});
            const r = await pool.query(
                `SELECT DISTINCT ON (commande_roo) commande_roo, sent_at, sent_by, destinataires,
                        COUNT(*) OVER (PARTITION BY commande_roo) AS nb
                   FROM finance.commande_envois WHERE commande_roo = ANY($1::text[])
                  ORDER BY commande_roo, sent_at DESC`,
                [roos]
            );
            res.json(Object.fromEntries(r.rows.map(x => [x.commande_roo, { sent_at: x.sent_at, sent_by: x.sent_by, to: x.destinataires, count: Number(x.nb) }])));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // Tiers (codes) disposant d'au moins un contact « destinataire commande » : le bouton
    // « Envoyer » n'est proposé que pour ceux-là.
    async recipients(req, res) {
        try {
            const codes = Array.isArray(req.body.tier_codes) ? req.body.tier_codes.map(c => String(c).trim()).filter(Boolean).slice(0, 500) : [];
            if (!codes.length) return res.json({});
            const r = await pool.query(
                `SELECT TRIM(tier_code) AS code, COUNT(*) AS nb FROM hub.contacts
                  WHERE TRIM(tier_code) = ANY($1::text[]) AND is_order_recipient = TRUE GROUP BY TRIM(tier_code)`,
                [codes]
            );
            res.json(Object.fromEntries(r.rows.map(x => [x.code, Number(x.nb)])));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // Données du dialogue « Envoyer la commande » : contacts, copies, état du bon de commande.
    async prepare(req, res) {
        try {
            const cmd = await svc.getCommande(req.params.roo);
            if (!cmd) return res.status(404).json({ message: 'Commande introuvable dans Sedit' });
            const [bon, devis, contacts, cc, settings, emetteur, sent] = await Promise.all([
                svc.getSignedBonDeCommande(cmd.ROO),
                svc.getDevis(cmd.ROO),
                loadContacts(cmd.TIERS_CODE),
                svc.resolveCc(cmd.SERVICE_CODE),
                loadSettings(),
                resolveEmetteur(req.user),
                pool.query('SELECT sent_at, sent_by, destinataires FROM finance.commande_envois WHERE commande_roo = $1 ORDER BY sent_at DESC', [cmd.ROO]),
            ]);
            res.json({
                commande: {
                    roo: cmd.ROO, numero: cmd.NUMERO, date: cmd.DATE_COMMANDE, libelle: (cmd.LIBELLE || '').trim(),
                    montant_ttc: cmd.MONTANT_TTC, tiers_code: cmd.TIERS_CODE, tiers_nom: cmd.TIERS_NOM,
                    service: cmd.SERVICE_LIBELLE, service_code: cmd.SERVICE_CODE,
                },
                emetteur,
                cc,
                signed: !!bon,
                bon_commande: bon ? svc.attachmentName(bon) : null,
                devis: devis.map(d => svc.attachmentName(d)),
                contacts: contacts.map(c => ({ ...c, default_selected: !!c.is_order_recipient && hasEmail(c) })),
                subject: render(settings.subject_template, buildVars(cmd, emetteur, '')),
                already_sent: sent.rows.length ? { count: sent.rows.length, last_at: sent.rows[0].sent_at, last_by: sent.rows[0].sent_by, to: sent.rows[0].destinataires } : null,
            });
        } catch (e) {
            res.status(500).json({ message: 'Erreur de préparation de l\'envoi', error: e.message });
        }
    },

    async send(req, res) {
        try {
            const ids = Array.isArray(req.body.contact_ids) ? req.body.contact_ids.map(Number).filter(Number.isInteger) : [];
            const message = String(req.body.message || '').trim();
            if (!ids.length) return res.status(400).json({ message: 'Sélectionnez au moins un destinataire' });

            const cmd = await svc.getCommande(req.params.roo);
            if (!cmd) return res.status(404).json({ message: 'Commande introuvable dans Sedit' });

            // Règle métier : seules les commandes dont le bon de commande est SIGNÉ dans Sedit sont envoyables.
            const bon = await svc.getSignedBonDeCommande(cmd.ROO);
            if (!bon) return res.status(409).json({ message: 'Le bon de commande n\'est pas signé dans Sedit : envoi impossible' });
            const buffer = await svc.readDocument(bon);
            if (!buffer) return res.status(502).json({ message: 'Bon de commande introuvable sur le partage Sedit' });

            // Pièces jointes : bon de commande signé + devis. Un devis illisible n'empêche pas l'envoi
            // mais est signalé dans la réponse.
            const attachments = [{ filename: svc.attachmentName(bon), content: buffer.toString('base64') }];
            const warnings = [];
            for (const d of await svc.getDevis(cmd.ROO)) {
                try {
                    const buf = await svc.readDocument(d);
                    if (buf) attachments.push({ filename: svc.attachmentName(d), content: buf.toString('base64') });
                    else warnings.push(`Devis introuvable sur le partage : ${svc.attachmentName(d)}`);
                } catch (e) { warnings.push(`Devis illisible (${svc.attachmentName(d)}) : ${e.message}`); }
            }

            // Destinataires : uniquement des contacts de CE tiers (jamais d'adresse libre venue du client).
            const contacts = (await loadContacts(cmd.TIERS_CODE)).filter(c => ids.includes(c.id) && hasEmail(c));
            if (!contacts.length) return res.status(400).json({ message: 'Aucun destinataire valide (contact du tiers avec adresse e-mail)' });
            const to = contacts.map(c => c.email.trim());

            const emetteur = await resolveEmetteur(req.user);
            const toLower = new Set(to.map(e => e.toLowerCase()));
            const ccList = (await svc.resolveCc(cmd.SERVICE_CODE)).map(c => c.email).filter(e => !toLower.has(e.toLowerCase()));
            // Option « Me mettre en copie » (décochée par défaut) : l'émetteur (personne connectée) en Cc.
            if (req.body.copy_me === true && emetteur.email
                && !toLower.has(emetteur.email.toLowerCase())
                && !ccList.some(e => e.toLowerCase() === emetteur.email.toLowerCase())) {
                ccList.push(emetteur.email);
            }

            const settings = await loadSettings();
            const names = contacts.map(c => [c.prenom, c.nom].filter(Boolean).join(' ')).join(', ');
            const vars = buildVars(cmd, emetteur, names);
            const subject = render(settings.subject_template, vars);
            const content = buildHtml(settings, vars, message, await svc.getLogoDataUri());

            // Envoi par l'API Ville (APM) : son modèle HTML s'applique (et non celui du DSI Hub).
            // Expéditeur = la personne connectée ; un seul mail pour tous les destinataires, avec les
            // vraies copies (champ `cc` de l'APM : directeur, responsable de service, et vous si coché).
            try {
                await apmMail.sendMail({
                    to, cc: ccList, subject, content, attachments,
                    fromName: emetteur.name || undefined, fromEmail: emetteur.email || undefined,
                });
            } catch (e) {
                return res.status(502).json({ message: `Envoi impossible via l'API Ville : ${e.message}` });
            }
            const delivered = to;
            const ccDelivered = ccList;

            await pool.query(
                `INSERT INTO finance.commande_envois (commande_roo, commande_numero, sent_by, emetteur_email, destinataires, cc, subject, message, bon_commande)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [cmd.ROO, cmd.NUMERO, req.user.username, emetteur.email, delivered.join(', '), ccDelivered.join(', '), subject, message, attachments.map(a => a.filename).join(' | ')]
            );
            res.json({ message: `Commande ${cmd.NUMERO} envoyée à ${delivered.length} destinataire(s) (${attachments.length} pièce(s) jointe(s))`, to: delivered, cc: ccDelivered, warnings });
        } catch (e) {
            res.status(500).json({ message: `Erreur lors de l'envoi : ${e.message}` });
        }
    },
};
