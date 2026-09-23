/**
 * Écriture dans Sedit Finances (Oracle, schéma FI) — PV de service fait.
 *
 * Deux écritures, toutes deux réversibles via `finance.sedit_write_log` :
 *   1. `updateServiceFaitDoneLogged` : passe l'étape FACSUIVI 'SERVICE_FAIT' à VALIDE
 *      (même logique que finance-share.controller.updateServiceFaitDone, mais on capture
 *      l'état AVANT pour pouvoir revenir en arrière).
 *   2. `attachServiceFaitPv` : insère le PV scellé comme pièce jointe de la facture
 *      (FI.PJ_PES + FI.FIPES_OBJ_PJ) et écrit le fichier sur le partage Sedit.
 *
 * Identifiant technique : `ROO_IMA_REF` est alloué par la séquence Oracle OFFICIELLE
 * `SM.SMSEQROO` (même compteur que Sedit — voir spike), au format
 * `'5301700000' || LPAD(nextval,10,'0') || '<suffixe exercice>'` (suffixe déduit d'une
 * PJ existante de la facture). Aucun risque de collision avec Sedit.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const oracledb = require('oracledb');
const { pool } = require('../../../shared/database');
const storage = require('../../../shared/storage');
const smb = require('../../../shared/smb_client');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const pdfTools = require('../../pdf-tools/pdf-tools.service');
const parapheurService = require('../../parapheur/parapheur.service');
const financeShare = require('../finance-share.controller');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const ROO_PREFIX_FALLBACK = '5301700000';
const ROO_SUFFIX_FALLBACK = '026';
const ID_UNIQUE_PREFIX_FALLBACK = '0940270350001';
const DEFAULT_PV_TYPE_ID = 80; // FI.TYPE_PIECE / GED_TYPE « PV » = Procès-verbal
const APP_USER = 'APPDSI';
const APP_USER_SHORT = 'APPDSI';

function sanitizeFilename(name) {
    return String(name || 'document.pdf')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'document.pdf';
}

function trimChar(v) {
    return v == null ? null : String(v).trim();
}

/** État de la transaction avant/après, pour le journal et l'undo. */
async function logWrite({ workflowId, invoiceRef, action, oraclePjRoo, oracleLnkRoo, filePath, before, after, actor, status }) {
    const res = await pool.query(
        `INSERT INTO finance.sedit_write_log
            (workflow_id, invoice_ref, action, oracle_pj_roo, oracle_lnk_roo, file_path,
             before_json, after_json, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)
         RETURNING id`,
        [
            workflowId || null,
            invoiceRef,
            action,
            oraclePjRoo || null,
            oracleLnkRoo || null,
            filePath || null,
            before ? JSON.stringify(before) : null,
            after ? JSON.stringify(after) : null,
            status || 'applied',
            actor || APP_USER,
        ]
    );
    return res.rows[0].id;
}

async function setLogStatus(id, status) {
    try { await pool.query(`UPDATE finance.sedit_write_log SET status = $1 WHERE id = $2`, [status, id]); }
    catch (e) { console.warn('[SeditPJ] setLogStatus échoué:', e.message); }
}

// ─── Allocation des identifiants Sedit ───────────────────────────────────────

async function nextRooNumber(conn) {
    const r = await conn.execute(`SELECT SMSEQROO.NEXTVAL AS N FROM DUAL`);
    return Number(r.rows[0].N);
}

async function nextChrono(conn) {
    const r = await conn.execute(`SELECT FI.PJ_CHRONO_SEQ.NEXTVAL AS N FROM DUAL`);
    return Number(r.rows[0].N);
}

/** Modèle { prefix, suffix, mid } déduit d'un ROO_IMA_REF existant (ex. '5301700000...026'). */
function deriveRooTemplate(sampleTrimmed) {
    const s = String(sampleTrimmed || '');
    if (s.length >= 15) {
        return { prefix: s.slice(0, 10), suffix: s.slice(-3), mid: s.length - 13 };
    }
    return { prefix: ROO_PREFIX_FALLBACK, suffix: ROO_SUFFIX_FALLBACK, mid: 10 };
}

function formatRoo(n, tpl) {
    return `${tpl.prefix}${String(n).padStart(tpl.mid, '0')}${tpl.suffix}`;
}

/** Contexte facture : son ROO_IMA_REF + une PJ existante servant de gabarit. */
async function getFactureContext(conn, numero) {
    const f = await conn.execute(
        `SELECT TRIM(ROO_IMA_REF) AS ROO FROM FI.FACTURE WHERE TRIM(FACTURE) = :numero`,
        { numero }
    );
    if (!f.rows.length) throw new Error(`Facture « ${numero} » introuvable dans Sedit.`);
    const factureRoo = f.rows[0].ROO;
    const pj = await conn.execute(
        `SELECT TRIM(pj.ROO_IMA_REF) AS PJ_ROO, pj.BUDGET, pj.BUDANNU, pj.DOMAINE, pj.SUPPORT,
                pj.TYPEPJ, pj.ID_UNIQUE, pj.CHEMIN_FICHIER, lnk.PRINCIPAL
         FROM FI.FIPES_OBJ_PJ lnk
         JOIN FI.PJ_PES pj ON pj.ROO_IMA_REF = lnk.PJPES_ROO
         WHERE TRIM(lnk.OBJECT_ROO) = :roo AND lnk.OBJECT_TYPE = 'FACTURE'
         ORDER BY lnk.PRINCIPAL DESC, pj.DATE_CREAT DESC`,
        { roo: factureRoo }
    );
    return { factureRoo, pjs: pj.rows };
}

/**
 * Résout le code utilisateur Sedit (référentiel FI/SM.SMUTILISAT : UTILISAT=code,
 * NOM=nom, MAIL=email) à partir de l'email, du username ou du nom de l'agent AppDSI.
 * Le champ FACSUIVI.UTILISATEUR attend bien ce code Sedit (ex. « MCHEVALIER ») —
 * un login AppDSI non reconnu rend l'étape « service fait » comme non validée dans l'UI.
 */
async function resolveSeditUser(conn, { username, name, email } = {}) {
    const COLS = `TRIM(UTILISAT) AS CODE, TRIM(ROO_IMA_REF) AS SMGF`;
    const tryQuery = async (sql, binds) => {
        try {
            const r = await conn.execute(sql, binds);
            if (r.rows.length) return { code: trimChar(r.rows[0].CODE), smgf: trimChar(r.rows[0].SMGF) };
        } catch (e) { /* référentiel indisponible : on laisse le fallback */ }
        return null;
    };
    if (email) {
        const u = await tryQuery(
            `SELECT ${COLS} FROM SM.SMUTILISAT WHERE LOWER(TRIM(MAIL)) = LOWER(:e) FETCH FIRST 1 ROW ONLY`,
            { e: String(email).trim() });
        if (u) return u;
    }
    if (username) {
        const u = await tryQuery(
            `SELECT ${COLS} FROM SM.SMUTILISAT WHERE UPPER(TRIM(UTILISAT)) = UPPER(:u) FETCH FIRST 1 ROW ONLY`,
            { u: String(username).trim() });
        if (u) return u;
    }
    if (name) {
        const tokens = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 4);
        for (const t of tokens) {
            const u = await tryQuery(
                `SELECT ${COLS} FROM SM.SMUTILISAT WHERE UPPER(TRIM(NOM)) = UPPER(:n) FETCH FIRST 1 ROW ONLY`,
                { n: t });
            if (u) return u;
        }
    }
    return null;
}

// ─── Écriture FACSUIVI (service fait) avec capture de l'état précédent ───────

/**
 * Passe l'étape SERVICE_FAIT de la facture à VALIDE, en journalisant l'état AVANT
 * pour permettre l'undo. Idempotent : ne réécrase pas une étape déjà VALIDE.
 */
async function updateServiceFaitDoneLogged({ invoiceRef, actorUsername, actorEmail, actorName, fallback, comment, workflowId }) {
    const rawActor = String(actorUsername || APP_USER).slice(0, 10);
    const commentValue = comment == null ? null : String(comment).slice(0, 2000);
    return financeShare.withFinanceOracle(async (conn) => {
        try {
            // Utilisateur Sedit (référentiel SM.SMUTILISAT) : le code (UTILISAT) ET
            // l'identifiant objet (ROO_IMA_REF) sont indispensables — Sedit utilise le
            // premier pour UTILISATEUR et le second pour USER_SMGF, faute de quoi l'UI
            // affiche « Utilisateur » vide et laisse l'étape « service fait » en attente.
            // On privilégie le demandeur ; s'il n'a pas de compte Sedit (ex. compte
            // technique « admin »), on retombe sur le valideur pour ne pas bloquer.
            let seditUser = await resolveSeditUser(conn, {
                username: actorUsername, name: actorName, email: actorEmail,
            });
            if (!seditUser && fallback) {
                seditUser = await resolveSeditUser(conn, {
                    username: fallback.username, name: fallback.name, email: fallback.email,
                });
            }
            const actor = (seditUser?.code || rawActor).slice(0, 10);
            const userSmgf = seditUser?.smgf || null;

            const before = await conn.execute(
                `SELECT fs.ETAT, fs.DATE_SERVICE_FAIT, fs.UTILISATEUR, fs.USER_MODIF, fs.DATE_MODIF, fs.DATDEST, fs.USER_SMGF, fs.COMMENTAIRE, fs.UPDATOKEN,
                        TRIM(f.ROO_IMA_REF) AS FACTURE_ROO
                 FROM FI.FACSUIVI fs
                 JOIN FI.FACTURE f ON f.ROO_IMA_REF = fs.FACTURE
                 WHERE fs.AVANCEMENT = 'SERVICE_FAIT' AND TRIM(f.FACTURE) = :numero`,
                { numero: invoiceRef }
            );
            if (!before.rows.length) return { updated: 0, reason: 'etape_absente' };
            const b = before.rows[0];
            if (trimChar(b.ETAT) === 'VALIDE') return { updated: 0, reason: 'deja_valide' };

            // UTILISATEUR (et non seulement USER_MODIF) est le champ lu par Sedit pour
            // considérer le service fait comme réalisé — vérifié : 62450/62451 lignes
            // VALIDE de production ont UTILISATEUR renseigné.
            const upd = await conn.execute(
                `UPDATE FI.FACSUIVI fs
                 SET fs.ETAT = 'VALIDE',
                     fs.DATE_SERVICE_FAIT = SYSDATE,
                     fs.UTILISATEUR = :actor,
                     fs.USER_MODIF = :actor,
                     fs.USER_SMGF = :smgf,
                     fs.COMMENTAIRE = :commentaire,
                     fs.DATDEST = SYSDATE,
                     fs.DATE_MODIF = SYSDATE,
                     fs.UPDATOKEN = fs.UPDATOKEN + 1
                 WHERE fs.AVANCEMENT = 'SERVICE_FAIT'
                   AND fs.FACTURE = (SELECT f.ROO_IMA_REF FROM FI.FACTURE f WHERE TRIM(f.FACTURE) = :numero)`,
                { actor, smgf: userSmgf, commentaire: commentValue, numero: invoiceRef }
            );
            await conn.commit();

            const beforeJson = {
                ETAT: trimChar(b.ETAT),
                DATE_SERVICE_FAIT: b.DATE_SERVICE_FAIT || null,
                UTILISATEUR: trimChar(b.UTILISATEUR),
                USER_MODIF: trimChar(b.USER_MODIF),
                USER_SMGF: trimChar(b.USER_SMGF),
                COMMENTAIRE: b.COMMENTAIRE || null,
                DATE_MODIF: b.DATE_MODIF || null,
                DATDEST: b.DATDEST || null,
                UPDATOKEN: Number(b.UPDATOKEN) || 0,
                FACTURE_ROO: b.FACTURE_ROO,
            };
            const afterJson = {
                ETAT: 'VALIDE',
                DATE_SERVICE_FAIT: new Date().toISOString(),
                UTILISATEUR: actor,
                USER_MODIF: actor,
                USER_SMGF: userSmgf,
                COMMENTAIRE: commentValue,
                DATDEST: new Date().toISOString(),
                UPDATOKEN: (Number(b.UPDATOKEN) || 0) + 1,
                FACTURE_ROO: b.FACTURE_ROO,
            };
            const logId = await logWrite({
                workflowId, invoiceRef, action: 'facsuivi_service_fait',
                before: beforeJson, after: afterJson, actor, status: 'applied',
            });
            return { updated: upd.rowsAffected || 0, logId };
        } catch (e) {
            try { await conn.rollback(); } catch (e2) { /* ignore */ }
            throw e;
        }
    });
}

// ─── Construction du PV (page 1 lisible + PDF source en pages suivantes) ─────

function fmtDateFr(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Remplace les espaces fines/insécables non encodables en WinAnsi par une espace normale. */
function normalizeForPdf(value) {
    return String(value == null ? '' : value)
        .normalize('NFC')
        .replace(/[\u202F\u2009\u2007\u00A0]/g, ' ');
}

function fmtMontant(v) {
    if (v == null || v === '') return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return normalizeForPdf(v);
    return normalizeForPdf(n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €';
}

async function buildCoverPage({ workflow, decisionLabel, comment, verifierName, verifierEmail, decisionAt, sourceFiles }) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595.28, 841.89]);
    const W = 595.28;
    const M = 50;
    let y = 800;

    // NFC (recompose les accents saisis en forme décomposée) + espaces fines → espace
    // normale, puis nettoyage WinAnsi : garantit des accents corrects dans le PDF.
    const safe = (t) => pdfTools.sanitizeForWinAnsi(normalizeForPdf(t));

    function text(str, { size = 11, boldFont = false, color = rgb(0.1, 0.1, 0.12), x = M, maxWidth = W - M * 2, lineHeight = 1.35 } = {}) {
        const f = boldFont ? bold : font;
        const value = safe(str == null ? '' : String(str));
        const words = value.split(/\s+/).filter(Boolean);
        let line = '';
        const lines = [];
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (f.widthOfTextAtSize(test, size) <= maxWidth || !line) line = test;
            else { lines.push(line); line = w; }
        }
        if (line) lines.push(line);
        if (!lines.length) lines.push('');
        for (const l of lines) {
            page.drawText(l, { x, y: y - size, size, font: f, color });
            y -= size * lineHeight;
        }
    }

    function spacer(h = 8) { y -= h; }
    function rule() {
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.8, 0.82, 0.86) });
        y -= 14;
    }

    // En-tête
    text("Ville d'Ivry-sur-Seine", { size: 10, color: rgb(0.35, 0.35, 0.4) });
    text('Direction des Systèmes d\'Information', { size: 10, color: rgb(0.35, 0.35, 0.4) });
    spacer(16);
    text('PROCÈS-VERBAL DE VALIDATION DU SERVICE FAIT', { size: 16, boldFont: true });
    spacer(6);
    text(`Référence : SF-${workflow.id}`, { size: 10, color: rgb(0.45, 0.45, 0.5) });
    spacer(6);
    rule();

    text(`Décision : ${decisionLabel}`, { size: 14, boldFont: true, color: rgb(0.09, 0.4, 0.2) });
    spacer(14);

    text('Facture concernée', { size: 11, boldFont: true });
    text(`N° facture : ${workflow.invoice_number || workflow.invoice_ref || '-'}`);
    text(`Fournisseur : ${workflow.invoice_supplier || '-'}`);
    text(`Libellé : ${workflow.invoice_label || '-'}`);
    text(`Montant TTC : ${fmtMontant(workflow.invoice_amount)}`);
    spacer(14);

    text('Validateur', { size: 11, boldFont: true });
    text(`${verifierName || '-'}${verifierEmail ? ` <${verifierEmail}>` : ''}`);
    text(`Date de validation : ${fmtDateFr(decisionAt)}`);
    spacer(14);

    text('Commentaire / motif', { size: 11, boldFont: true });
    text(comment && String(comment).trim() ? comment : '(aucun)');
    spacer(14);

    text('Document(s) source', { size: 11, boldFont: true });
    if (!sourceFiles.length) {
        text('(aucune pièce jointe — validation sur la base du commentaire ci-dessus)');
    } else {
        for (const f of sourceFiles) {
            const hash = f.sha256 || '';
            text(`• ${f.originalname}`, { size: 10 });
            if (hash) text(`  SHA-256 : ${hash}`, { size: 8, color: rgb(0.4, 0.4, 0.45) });
        }
    }
    spacer(20);
    rule();
    text('Document scellé électroniquement par l\'autorité de certification interne de la Ville d\'Ivry-sur-Seine (signature PAdES). Toute modification postérieure invalide le sceau.', {
        size: 8, color: rgb(0.45, 0.45, 0.5),
    });

    return Buffer.from(await pdf.save());
}

/**
 * Assemble le PV : page de garde + documents source, puis scelle avec l'AC interne.
 * @param {{ workflow:object, decisionLabel:string, comment:string, verifierName:string,
 *           verifierEmail:string, decisionAt:Date|string, sourceFiles:Array<{buffer,originalname,mimetype}> }} p
 * @returns {Promise<{ buffer:Buffer, sourceHashes:Array<{name,sha256}>, seal:object }>}
 */
async function buildSealedServiceFaitPv({ workflow, decisionLabel, comment, verifierName, verifierEmail, decisionAt, sourceFiles }) {
    const files = [];
    for (const f of (sourceFiles || [])) {
        const buf = Buffer.isBuffer(f.buffer) ? f.buffer : Buffer.from(f.buffer);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        f.sha256 = sha256;
        f.mimetype = f.mimetype || guessMimeFromName(f.originalname);
        files.push({ buffer: buf, originalname: f.originalname, mimetype: f.mimetype, sha256 });
    }

    const cover = await buildCoverPage({ workflow, decisionLabel, comment, verifierName, verifierEmail, decisionAt, sourceFiles: files });
    // Seules les pièces affichables (PDF/images) sont fusionnées : un format bureautique
    // exotique serait listé sur la page de garde mais ne doit pas casser la génération.
    const renderable = files.filter((f) => /^application\/pdf$|^image\//.test(f.mimetype || ''));
    const merged = await pdfTools.mergeFiles([
        { buffer: cover, originalname: 'pv-garde.pdf', mimetype: 'application/pdf' },
        ...renderable.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype })),
    ]);

    const seal = await parapheurService.sealPdfBuffer(merged, {
        name: `PV service fait SF-${workflow.id}`,
        reason: `Validation du service fait - facture ${workflow.invoice_number || workflow.invoice_ref || ''}`.trim(),
        pos: { page: 1, xPct: 88, yPct: 97, w: 70, h: 20 },
    });

    return { buffer: seal.buffer, sourceHashes: files.map((f) => ({ name: f.originalname, sha256: f.sha256 })), seal: { serial: seal.serial, caSubject: seal.caSubject } };
}

function guessMimeFromName(name) {
    const ext = path.extname(String(name || '')).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.bmp') return 'image/bmp';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
    return 'application/octet-stream';
}

// ─── Insertion de la PJ scellée + écriture du fichier sur le partage ─────────

/**
 * Insère le PV comme pièce jointe FACTURE dans Sedit et écrit le fichier sur le
 * partage. Écriture réversible (DELETE des 2 lignes + suppression du fichier).
 */
async function attachServiceFaitPv({ invoiceRef, workflowId, buffer, originalName, actor, typePieceId }) {
    // Idempotence : un seul PV par workflow (évite un doublon en cas de reprise/retry).
    if (workflowId) {
        const existing = await pool.query(
            `SELECT id, oracle_pj_roo AS "pjRoo", oracle_lnk_roo AS "lnkRoo", file_path AS "filePath"
             FROM finance.sedit_write_log
             WHERE workflow_id = $1 AND action = 'facture_pj' AND status IN ('applied', 'pending')
             ORDER BY id DESC LIMIT 1`,
            [workflowId]
        );
        if (existing.rowCount > 0) {
            return { ...existing.rows[0], alreadyAttached: true };
        }
    }

    const config = await financeShare.resolveShareConfig();
    if (!config.login || !config.password) {
        throw new Error("Aucun compte disponible pour écrire sur le partage Sedit (finance.share_login / storage.login).");
    }

    const result = await financeShare.withFinanceOracle(async (conn) => {
        let written = null;
        let logId = null;
        try {
            const { factureRoo, pjs } = await getFactureContext(conn, invoiceRef);
            const sample = pjs[0] || null;

            const tpl = deriveRooTemplate(sample && sample.PJ_ROO);
            const pjRoo = formatRoo(await nextRooNumber(conn), tpl);
            const lnkRoo = formatRoo(await nextRooNumber(conn), tpl);
            const chrono = await nextChrono(conn);
            const year = new Date().getFullYear();

            const idPrefix = (sample && sample.ID_UNIQUE && String(sample.ID_UNIQUE).length > 12)
                ? String(sample.ID_UNIQUE).slice(0, String(sample.ID_UNIQUE).length - 12)
                : ID_UNIQUE_PREFIX_FALLBACK;
            const idUnique = `${idPrefix}${year}${String(chrono).padStart(8, '0')}`;

            const budget = sample ? sample.BUDGET : null;
            const budannu = sample ? sample.BUDANNU : null;
            const domaine = (sample && trimChar(sample.DOMAINE)) || '01';
            const support = (sample && trimChar(sample.SUPPORT)) || '01';
            const typepj = (sample && trimChar(sample.TYPEPJ)) || '003';

            // Dossier cible : on réutilise le dossier de la facture (celui d'une PJ existante).
            const samplePath = sample && sample.CHEMIN_FICHIER ? String(sample.CHEMIN_FICHIER) : '';
            if (!samplePath) throw new Error("Impossible de déterminer le dossier Sedit de la facture (aucune PJ existante).");
            const dir = path.win32.dirname(samplePath);
            const filename = sanitizeFilename(originalName || `PV_ServiceFait_${invoiceRef}.pdf`);
            const targetPath = `${dir}\\${filename}`;

            const rel = financeShare.toRelativePath(config, targetPath);

            const nomPj = filename.slice(0, 100);
            const chemin = targetPath.slice(0, 300);
            const taille = Math.max(1, Math.round(buffer.length / 1024));
            const pobjExtract = `PV service fait - facture ${invoiceRef}`.slice(0, 255);

            // Journal AVANT commit : garantit qu'une ligne d'undo existe dès que l'écriture passe.
            logId = await logWrite({
                workflowId, invoiceRef, action: 'facture_pj',
                oraclePjRoo: pjRoo, oracleLnkRoo: lnkRoo, filePath: targetPath,
                before: null,
                after: { pjRoo, lnkRoo, filePath: targetPath, filename: nomPj, typePieceId: typePieceId || DEFAULT_PV_TYPE_ID },
                actor, status: 'pending',
            });

            await conn.execute(
                `INSERT INTO FI.PJ_PES
                    (ROO_IMA_REF, DATE_CREAT, USER_CREAT, DATE_MODIF, USER_MODIF, UPDATOKEN,
                     ID_UNIQUE, NOM_PJ, CHEMIN_FICHIER, DOMAINE, SUPPORT, TYPEPJ, FORMAT, TAILLE,
                     TYPE_PIECE_ID, USAGE, BUDGET, BUDANNU, CHRONO, SIGNED, POBJ_EXTRACT)
                 VALUES
                    (:roo, SYSDATE, :uc, SYSDATE, :um, 0,
                     :idUnique, :nomPj, :chemin, :domaine, :support, :typepj, '06', :taille,
                     :typePieceId, 'P', :budget, :budannu, :chrono, 1, :pobj)`,
                {
                    roo: pjRoo, uc: APP_USER_SHORT, um: APP_USER_SHORT,
                    idUnique, nomPj, chemin,
                    domaine, support, typepj, taille,
                    typePieceId: typePieceId || DEFAULT_PV_TYPE_ID,
                    budget, budannu, chrono, pobj: pobjExtract,
                }
            );

            await conn.execute(
                `INSERT INTO FI.FIPES_OBJ_PJ
                    (ROO_IMA_REF, DATE_CREAT, USER_CREAT, DATE_MODIF, USER_MODIF, UPDATOKEN,
                     OBJECT_ROO, PJPES_ROO, OBJECT_TYPE, ORIGINE, PRINCIPAL)
                 VALUES
                    (:lnk, SYSDATE, :uc, SYSDATE, :um, 0,
                     :objectRoo, :pjRoo, 'FACTURE', 'A', 0)`,
                { lnk: lnkRoo, uc: APP_USER_SHORT, um: APP_USER_SHORT, objectRoo: factureRoo, pjRoo }
            );

            // Fichier écrit avant le commit : en cas d'échec du commit, on le supprime.
            await smb.writeFileRel(config, rel, buffer);
            written = { rel, targetPath };

            await conn.commit();
            await setLogStatus(logId, 'applied');

            return { pjRoo, lnkRoo, filePath: targetPath, filename: nomPj, logId, factureRoo };
        } catch (e) {
            try { await conn.rollback(); } catch (e2) { /* ignore */ }
            if (written) {
                try { await smb.deleteRel(config, written.rel); } catch (e3) { /* ignore */ }
            }
            if (logId) await setLogStatus(logId, 'failed');
            throw e;
        }
    });

    return result;
}

/** Supprime la PJ insérée et le fichier écrit (undo de attachServiceFaitPv). */
async function detachServiceFaitPv({ pjRoo, lnkRoo, filePath }) {
    const config = await financeShare.resolveShareConfig();
    await financeShare.withFinanceOracle(async (conn) => {
        try {
            if (lnkRoo) {
                await conn.execute(`DELETE FROM FI.FIPES_OBJ_PJ WHERE TRIM(ROO_IMA_REF) = :roo`, { roo: lnkRoo });
            }
            if (pjRoo) {
                await conn.execute(`DELETE FROM FI.PJ_PES WHERE TRIM(ROO_IMA_REF) = :roo`, { roo: pjRoo });
            }
            await conn.commit();
        } catch (e) {
            try { await conn.rollback(); } catch (e2) { /* ignore */ }
            throw e;
        }
    });
    if (filePath && config.login && config.password) {
        try {
            const rel = financeShare.toRelativePath(config, filePath);
            await smb.deleteRel(config, rel);
        } catch (e) {
            console.warn('[SeditPJ] suppression fichier échouée:', e.message);
        }
    }
}

/** Restaure l'étape FACSUIVI SERVICE_FAIT à son état précédent (undo). */
async function restoreFacsuivi({ before }) {
    const b = before || {};
    if (!b.FACTURE_ROO) throw new Error('Journal incomplet : FACTURE_ROO manquant.');
    await financeShare.withFinanceOracle(async (conn) => {
        try {
            const upd = await conn.execute(
                `UPDATE FI.FACSUIVI fs
                 SET fs.ETAT = :etat,
                     fs.DATE_SERVICE_FAIT = :dsf,
                     fs.UTILISATEUR = :util,
                     fs.USER_MODIF = :um,
                     fs.USER_SMGF = :smgf,
                     fs.COMMENTAIRE = :commentaire,
                     fs.DATDEST = :dd,
                     fs.DATE_MODIF = :dm,
                     fs.UPDATOKEN = :ut
                 WHERE fs.AVANCEMENT = 'SERVICE_FAIT' AND TRIM(fs.FACTURE) = :roo`,
                {
                    etat: b.ETAT || null,
                    dsf: b.DATE_SERVICE_FAIT ? new Date(b.DATE_SERVICE_FAIT) : null,
                    util: b.UTILISATEUR || null,
                    um: b.USER_MODIF || APP_USER_SHORT,
                    smgf: b.USER_SMGF || null,
                    commentaire: b.COMMENTAIRE || null,
                    dd: b.DATDEST ? new Date(b.DATDEST) : null,
                    dm: b.DATE_MODIF ? new Date(b.DATE_MODIF) : null,
                    ut: Number(b.UPDATOKEN) || 0,
                    roo: b.FACTURE_ROO,
                }
            );
            await conn.commit();
            if (!upd.rowsAffected) throw new Error("Restauration FACSUIVI : aucune ligne mise à jour.");
        } catch (e) {
            try { await conn.rollback(); } catch (e2) { /* ignore */ }
            throw e;
        }
    });
}

/** Undo d'une écriture Sedit journalisée. */
async function undoSeditWrite(logId, actor) {
    const res = await pool.query(`SELECT * FROM finance.sedit_write_log WHERE id = $1`, [logId]);
    if (res.rowCount === 0) { const e = new Error('Écriture introuvable'); e.status = 404; throw e; }
    const row = res.rows[0];
    if (row.status === 'undone') { const e = new Error('Écriture déjà annulée'); e.status = 400; throw e; }
    // 'pending' est autorisé : le commit Oracle a pu passer avant l'échec de la mise à jour du
    // statut — l'inverse (DELETE de lignes éventuellement absentes) est idempotent et sûr.
    if (!['applied', 'pending'].includes(row.status)) { const e = new Error(`Écriture non annulable (statut « ${row.status} »)`); e.status = 400; throw e; }

    if (row.action === 'facture_pj') {
        await detachServiceFaitPv({ pjRoo: row.oracle_pj_roo, lnkRoo: row.oracle_lnk_roo, filePath: row.file_path });
    } else if (row.action === 'facsuivi_service_fait') {
        await restoreFacsuivi({ before: row.before_json });
    } else {
        const e = new Error(`Action inconnue : ${row.action}`); e.status = 400; throw e;
    }

    await pool.query(
        `UPDATE finance.sedit_write_log SET status = 'undone', undone_at = CURRENT_TIMESTAMP, undone_by = $1 WHERE id = $2`,
        [actor || APP_USER, logId]
    );
    return { success: true, id: logId, action: row.action };
}

/** Journal des écritures Sedit (filtrable par facture ou workflow). */
async function listSeditWrites({ invoiceRef, workflowId, limit = 50 } = {}) {
    const where = [];
    const values = [];
    if (invoiceRef) { values.push(invoiceRef); where.push(`invoice_ref = $${values.length}`); }
    if (workflowId) { values.push(workflowId); where.push(`workflow_id = $${values.length}`); }
    values.push(Math.min(Number(limit) || 50, 200));
    const sql = `SELECT id, workflow_id, invoice_ref, action, oracle_pj_roo, oracle_lnk_roo, file_path,
                        status, created_by, created_at, undone_at, undone_by
                 FROM finance.sedit_write_log
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY id DESC LIMIT $${values.length}`;
    const res = await pool.query(sql, values);
    return res.rows;
}

/** Lit un buffer stocké par AppDSI (backend filesystem ou SMB). */
async function readStorageBuffer(dbPath) {
    const f = await storage.getFileForServe(dbPath);
    if (!f) throw new Error(`Fichier introuvable : ${dbPath}`);
    if (f.buffer) return f.buffer;
    return fs.readFileSync(f.absolutePath);
}

module.exports = {
    updateServiceFaitDoneLogged,
    buildSealedServiceFaitPv,
    attachServiceFaitPv,
    detachServiceFaitPv,
    undoSeditWrite,
    listSeditWrites,
    readStorageBuffer,
    guessMimeFromName,
    DEFAULT_PV_TYPE_ID,
};
