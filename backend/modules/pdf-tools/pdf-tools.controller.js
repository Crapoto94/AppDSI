/**
 * Contrôleurs HTTP des outils PDF. Toutes les opérations sont sans état :
 * fichier(s) en entrée -> fichier en sortie (PDF, image ou zip), renvoyé
 * directement dans la réponse. Rien n'est persisté tant que l'utilisateur
 * n'appelle pas /save (voir sendToGed) pour pousser le résultat dans son
 * dossier GED personnel.
 */
const storage = require('../../shared/storage');
const { pgDb } = require('../../shared/database');
const docsService = require('../../shared/documents.service');
const svc = require('./pdf-tools.service');
const editSvc = require('./pdf-edit.service');
const apmMail = require('../../shared/apm_mail');
const fs = require('fs');

let sendMailFn = null;
function setSendMail(fn) { sendMailFn = fn; }

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildLibraryMailHtml(message) {
    const safe = escapeHtml(message).replace(/\n/g, '<br>');
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;line-height:1.6">
  <p>${safe}</p>
  <p style="color:#64748b;font-size:12px;margin-top:20px">Document transmis depuis la PDFothèque des outils PDF.</p>
</div>`;
}

const MODULE = 'pdf-tools';
const LIBRARY_ENTITY = 'pdf-tools-output';

/** URL publique (mount /api/storage) d'un chemin BD "storage/...". */
function publicStorageUrl(storageRef) {
    const rel = String(storageRef || '').replace(/\\/g, '/');
    return rel.startsWith('storage/') ? `/api/storage/${rel.slice('storage/'.length)}` : null;
}

function mapLibraryDoc(doc) {
    const cv = doc.current_version_row || {};
    return {
        id: doc.id,
        title: doc.title,
        filename: cv.filename || null,
        originalName: cv.original_name || doc.title,
        mimetype: cv.mimetype || 'application/pdf',
        size: cv.size || null,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        uploaded_by: cv.uploaded_by || doc.created_by || null,
        version: doc.current_version,
        url: publicStorageUrl(cv.storage_ref),
    };
}

function sendPdf(res, buffer, filename) {
    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': buffer.length,
    });
    res.send(buffer);
}

function sendZip(res, buffer, filename) {
    res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': buffer.length,
    });
    res.send(buffer);
}

function sendImage(res, buffer, filename, mimetype) {
    res.set({
        'Content-Type': mimetype,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': buffer.length,
    });
    res.send(buffer);
}

function handleError(res, e, fallbackMessage) {
    console.error('[PDF-TOOLS]', e);
    res.status(400).json({ message: e.message || fallbackMessage || 'Erreur lors du traitement du PDF.' });
}

// ─── 1. Fusion ───────────────────────────────────────────────────────────────
async function merge(req, res) {
    try {
        const files = req.files || [];
        if (files.length < 2) return res.status(400).json({ message: 'Sélectionnez au moins deux fichiers à fusionner.' });
        const buffer = await svc.mergeFiles(files.map((f) => ({
            buffer: f.buffer,
            mimetype: f.mimetype,
            originalname: storage.fixUploadName(f.originalname),
        })));
        sendPdf(res, buffer, 'fusion.pdf');
    } catch (e) { handleError(res, e, 'Échec de la fusion des PDF.'); }
}

// ─── 2. Miniatures ───────────────────────────────────────────────────────────
async function thumbnails(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const maxPages = req.body.maxPages ? parseInt(req.body.maxPages, 10) : undefined;
        const result = await svc.getThumbnails(req.file.buffer, { scale: 0.35, maxPages });
        res.json(result);
    } catch (e) { handleError(res, e, 'Impossible de générer les aperçus de pages.'); }
}

// ─── 3. Éditeur de pages ─────────────────────────────────────────────────────
async function applyPages(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        let plan;
        try { plan = JSON.parse(req.body.plan); } catch (e) { return res.status(400).json({ message: 'Plan de pages invalide.' }); }
        const outputs = await svc.applyPagePlan(req.file.buffer, plan);
        if (outputs.length === 1) {
            sendPdf(res, outputs[0], 'document.pdf');
        } else {
            const zip = await svc.zipBuffers(outputs.map((buf, i) => ({ name: `document-${i + 1}.pdf`, buffer: buf })));
            sendZip(res, zip, 'documents.zip');
        }
    } catch (e) { handleError(res, e, "Échec de l'application des modifications de pages."); }
}

// ─── 4. Compression ──────────────────────────────────────────────────────────
async function compress(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const level = ['low', 'medium', 'high'].includes(req.body.level) ? req.body.level : 'medium';
        const originalSize = req.file.buffer.length;
        const { buffer, imagesTouched } = await svc.compressPdf(req.file.buffer, level);
        res.set({
            'Access-Control-Expose-Headers': 'X-Original-Size, X-Compressed-Size, X-Images-Touched',
            'X-Original-Size': String(originalSize),
            'X-Compressed-Size': String(buffer.length),
            'X-Images-Touched': String(imagesTouched),
        });
        sendPdf(res, buffer, 'compresse.pdf');
    } catch (e) { handleError(res, e, 'Échec de la compression du PDF.'); }
}

// ─── 5. Export en images ─────────────────────────────────────────────────────
async function toImages(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const format = req.body.format === 'jpeg' ? 'jpeg' : 'png';
        // Résolution : DPI (défaut 300) ; repli sur l'ancien paramètre `scale`.
        const dpi = parseInt(req.body.dpi, 10) || (req.body.scale ? Math.round(parseFloat(req.body.scale) * 72) : 300);
        const scale = Math.min(8, Math.max(0.5, dpi / 72));
        const transparent = format === 'png' && req.body.transparent === 'true';
        const images = await svc.pdfToImages(req.file.buffer, { format, scale, transparent });
        if (images.length === 1) {
            sendImage(res, images[0].buffer, `page-1.${images[0].ext}`, format === 'jpeg' ? 'image/jpeg' : 'image/png');
        } else {
            const zip = await svc.zipBuffers(images.map((img) => ({ name: `page-${img.index + 1}.${img.ext}`, buffer: img.buffer })));
            sendZip(res, zip, 'pages.zip');
        }
    } catch (e) { handleError(res, e, "Échec de l'export en images."); }
}

// ─── 6. Filigrane ────────────────────────────────────────────────────────────
async function watermark(req, res) {
    try {
        const file = req.files && req.files.file && req.files.file[0];
        if (!file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const imageFile = req.files && req.files.image && req.files.image[0];
        const buffer = await svc.addWatermark(file.buffer, {
            text: req.body.text,
            opacity: req.body.opacity ? parseFloat(req.body.opacity) : undefined,
            fontSize: req.body.fontSize ? parseFloat(req.body.fontSize) : undefined,
            colorHex: req.body.colorHex,
            rotate: req.body.rotate ? parseFloat(req.body.rotate) : undefined,
            imageBuffer: imageFile ? imageFile.buffer : null,
            imageMimetype: imageFile ? imageFile.mimetype : null,
        });
        sendPdf(res, buffer, 'filigrane.pdf');
    } catch (e) { handleError(res, e, "Échec de l'ajout du filigrane."); }
}

// ─── 7. Numérotation ─────────────────────────────────────────────────────────
async function pageNumbers(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const buffer = await svc.addPageNumbers(req.file.buffer, {
            position: req.body.position,
            startAt: req.body.startAt ? parseInt(req.body.startAt, 10) : undefined,
            format: req.body.format,
        });
        sendPdf(res, buffer, 'numerote.pdf');
    } catch (e) { handleError(res, e, 'Échec de la numérotation des pages.'); }
}

// ─── 8. OCR ──────────────────────────────────────────────────────────────────
async function ocr(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const { buffer, pagesProcessed, totalPages, wasAlreadySearchable } = await svc.makeSearchable(req.file.buffer, {
            lang: req.body.lang || 'fra',
        });
        res.set({
            'Access-Control-Expose-Headers': 'X-Pages-Processed, X-Total-Pages, X-Was-Already-Searchable',
            'X-Pages-Processed': String(pagesProcessed),
            'X-Total-Pages': String(totalPages),
            'X-Was-Already-Searchable': String(wasAlreadySearchable),
        });
        sendPdf(res, buffer, 'ocr.pdf');
    } catch (e) { handleError(res, e, "Échec de la reconnaissance de texte (OCR)."); }
}

// ─── 9. Comparaison ──────────────────────────────────────────────────────────
async function compare(req, res) {
    try {
        const fileA = req.files && req.files.fileA && req.files.fileA[0];
        const fileB = req.files && req.files.fileB && req.files.fileB[0];
        if (!fileA || !fileB) return res.status(400).json({ message: 'Deux fichiers sont nécessaires pour la comparaison.' });
        const result = await svc.comparePdfs(fileA.buffer, fileB.buffer);
        res.json(result);
    } catch (e) { handleError(res, e, 'Échec de la comparaison des PDF.'); }
}

// ─── 10. Réparation ──────────────────────────────────────────────────────────
async function repair(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const buffer = await svc.repairPdf(req.file.buffer);
        sendPdf(res, buffer, 'repare.pdf');
    } catch (e) { handleError(res, e, 'Échec de la réparation du PDF.'); }
}

// ─── Protection par mot de passe (chiffrement AES-256) ──────────────────────
async function protect(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const userPassword = String(req.body.userPassword || '').trim();
        const ownerPassword = String(req.body.ownerPassword || '').trim();
        if (!userPassword && !ownerPassword) {
            return res.status(400).json({ message: 'Saisissez un mot de passe pour protéger le document.' });
        }
        const buffer = await svc.protectPdf(req.file.buffer, {
            userPassword,
            ownerPassword,
            currentPassword: req.body.currentPassword,
        });
        sendPdf(res, buffer, 'protege.pdf');
    } catch (e) { handleError(res, e, 'Échec de la protection du PDF.'); }
}

// ─── Éditeur PDF (contenu) : analyse des objets + application des modifs ────
async function editObjects(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const data = await editSvc.listObjects(req.file.buffer);
        res.json(data);
    } catch (e) { handleError(res, e, "Échec de l'analyse du PDF."); }
}

async function editApply(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        let plan;
        try { plan = JSON.parse(req.body.plan); } catch (e) { return res.status(400).json({ message: 'Plan de modification invalide.' }); }
        const buffer = await editSvc.editPdf(req.file.buffer, plan);
        sendPdf(res, buffer, 'modifie.pdf');
    } catch (e) { handleError(res, e, "Échec de l'application des modifications."); }
}

// ─── Sauvegarde dans la PDFothèque (dossier personnel de l'agent) ───────────
async function saveToGed(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const username = req.user && req.user.username;
        if (!username) return res.status(401).json({ message: 'Utilisateur non identifié.' });

        const title = storage.fixUploadName(req.body.filename || req.file.originalname || 'document.pdf');
        const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

        // Un document du même nom existe-t-il déjà ? (sinon on écraserait silencieusement)
        const existing = await docsService.findByTitle(MODULE, LIBRARY_ENTITY, username, title).catch(() => null);
        if (existing && !overwrite) {
            return res.status(409).json({
                code: 'DUPLICATE',
                message: `Un document nommé « ${title} » existe déjà dans votre PDFothèque.`,
                existing: { id: existing.id, title },
            });
        }

        const file = { buffer: req.file.buffer, originalname: title };
        const saved = await storage.saveFile(MODULE, username, file);

        let documentId = null;
        try {
            // registerExternalUpload crée un nouveau document, ou ajoute une
            // nouvelle version si le titre existe déjà (comportement « écraser »).
            const result = await docsService.registerExternalUpload({
                module: MODULE,
                entityType: LIBRARY_ENTITY,
                entityId: username,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: req.file.mimetype || 'application/pdf',
                size: req.file.size,
                storageRef: saved.dbPath,
                uploadedBy: username,
            });
            documentId = result && result.document ? result.document.id : null;
        } catch (e) { console.warn('[DOCS] register failed:', e.message); }

        res.json({
            documentId,
            overwritten: !!(existing && overwrite),
            dbPath: saved.dbPath,
            filename: saved.filename,
            name: file.originalname,
            url: `/api/storage/${saved.relativePath}`,
        });
    } catch (e) { handleError(res, e, 'Échec de la sauvegarde dans la PDFothèque.'); }
}

// ─── PDFothèque : liste, téléchargement, suppression ────────────────────────
async function listLibrary(req, res) {
    try {
        const username = req.user && req.user.username;
        if (!username) return res.status(401).json({ message: 'Utilisateur non identifié.' });
        const docs = await docsService.listByEntity(MODULE, LIBRARY_ENTITY, username);
        res.json(docs.map(mapLibraryDoc));
    } catch (e) { handleError(res, e, 'Échec du chargement de la PDFothèque.'); }
}

async function downloadLibrary(req, res) {
    try {
        const username = req.user && req.user.username;
        const id = parseInt(req.params.id, 10);
        const doc = await docsService.getDocument(id);
        if (!doc || doc.module !== MODULE || String(doc.entity_id) !== String(username)) {
            return res.status(404).json({ message: 'Document introuvable.' });
        }
        const v = await docsService.readVersion(id);
        if (!v) return res.status(404).json({ message: 'Fichier introuvable sur le stockage.' });
        const name = v.originalName || doc.title || 'document.pdf';
        const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
        res.type(v.mimetype || 'application/pdf');
        if (v.absolutePath) return res.sendFile(v.absolutePath);
        return res.send(v.buffer);
    } catch (e) { handleError(res, e, 'Échec du téléchargement.'); }
}

async function deleteLibrary(req, res) {
    try {
        const username = req.user && req.user.username;
        const id = parseInt(req.params.id, 10);
        const doc = await docsService.getDocument(id);
        if (!doc || doc.module !== MODULE || String(doc.entity_id) !== String(username)) {
            return res.status(404).json({ message: 'Document introuvable.' });
        }
        await docsService.purgeDocument(id);
        res.json({ ok: true });
    } catch (e) { handleError(res, e, 'Échec de la suppression.'); }
}

// ─── PDFothèque : envoi d'un document par e-mail ────────────────────────────
async function sendLibraryMail(req, res) {
    try {
        const username = req.user && req.user.username;
        const id = parseInt(req.params.id, 10);
        const doc = await docsService.getDocument(id);
        if (!doc || doc.module !== MODULE || String(doc.entity_id) !== String(username)) {
            return res.status(404).json({ message: 'Document introuvable.' });
        }
        const rawTo = req.body.to;
        const to = (Array.isArray(rawTo) ? rawTo : String(rawTo || '').split(/[;,]/))
            .map((s) => String(s).trim())
            .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
        if (!to.length) return res.status(400).json({ message: 'Indiquez au moins un destinataire valide.' });

        const v = await docsService.readVersion(id);
        if (!v) return res.status(404).json({ message: 'Fichier introuvable sur le stockage.' });
        const buffer = v.absolutePath ? fs.readFileSync(v.absolutePath) : v.buffer;
        const attName = v.originalName || doc.title || 'document.pdf';

        const subject = String(req.body.subject || '').trim() || `Document : ${doc.title || attName}`;
        const message = String(req.body.message || '').trim()
            || `Bonjour,\n\nVous trouverez ci-joint le document « ${doc.title || attName} ».\n\nCordialement,`;
        const content = buildLibraryMailHtml(message);

        const attachment = { filename: attName, content: Buffer.from(buffer).toString('base64') };
        let sent = 0;
        let usedFallback = false;
        for (const email of to) {
            try {
                // API Ville (APM) : elle applique SON template général au `content`.
                await apmMail.sendMail({ to: email, subject, content, attachments: [attachment] });
            } catch (apiErr) {
                if (!sendMailFn) throw apiErr;
                console.warn('[PDF-TOOLS] API Ville mail indisponible, repli mailer local:', apiErr.message);
                await sendMailFn(email, subject, content, [attachment], 'pdf-library', { rawHtml: true });
                usedFallback = true;
            }
            sent++;
        }
        res.json({ ok: true, sent, via: usedFallback ? 'local' : 'apm' });
    } catch (e) { handleError(res, e, "Échec de l'envoi du document par mail."); }
}

// ─── Rétention PDFothèque : suppression automatique après 6 mois ─────────────
const RETENTION_MONTHS = 6;

async function cleanupExpiredLibrary() {
    const rows = await pgDb.all(
        `SELECT id FROM hub_docs.documents
         WHERE module = $1 AND entity_type = $2
           AND created_at < NOW() - INTERVAL '${RETENTION_MONTHS} months'`,
        [MODULE, LIBRARY_ENTITY]
    );
    let removed = 0;
    for (const r of rows) {
        try { await docsService.purgeDocument(r.id); removed++; }
        catch (e) { console.warn('[PDF-TOOLS] purge échouée', r.id, e.message); }
    }
    if (removed) console.log(`[PDF-TOOLS] PDFothèque : ${removed} document(s) supprimé(s) (rétention ${RETENTION_MONTHS} mois)`);
    return removed;
}

// ─── 11. Publipostage : analyse du modèle + du fichier Excel ────────────────
async function mailMergeAnalyze(req, res) {
    try {
        const pdf = req.files && req.files.pdf && req.files.pdf[0];
        const excel = req.files && req.files.excel && req.files.excel[0];
        if (!pdf) return res.status(400).json({ message: 'Aucun PDF modèle fourni.' });
        if (!excel) return res.status(400).json({ message: 'Aucun fichier Excel fourni.' });

        const data = svc.parseExcel(excel.buffer, req.body.sheet);
        if (!data.records.length) return res.status(400).json({ message: 'Le fichier Excel ne contient aucune donnée.' });
        const { records, ...meta } = data;
        const info = await svc.getPagesInfo(pdf.buffer, { scale: 1, maxPages: 20 });

        res.json({
            ...meta,
            rowCount: records.length,
            firstRecord: records[0],
            sample: records.slice(0, 3),
            ...info,
        });
    } catch (e) { handleError(res, e, "Échec de l'analyse du publipostage."); }
}

// ─── 12. Publipostage : génération ──────────────────────────────────────────
async function mailMergeGenerate(req, res) {
    try {
        const pdf = req.files && req.files.pdf && req.files.pdf[0];
        const excel = req.files && req.files.excel && req.files.excel[0];
        if (!pdf) return res.status(400).json({ message: 'Aucun PDF modèle fourni.' });
        if (!excel) return res.status(400).json({ message: 'Aucun fichier Excel fourni.' });

        let plan;
        try { plan = JSON.parse(req.body.plan); } catch (e) { return res.status(400).json({ message: 'Plan de publipostage invalide.' }); }
        const fields = (plan && Array.isArray(plan.fields)) ? plan.fields : [];
        if (!fields.length) return res.status(400).json({ message: 'Placez au moins une variable sur le document.' });

        const mode = req.body.mode === 'separate' ? 'separate' : 'single';
        const { records } = svc.parseExcel(excel.buffer, plan.sheet);
        if (!records.length) return res.status(400).json({ message: 'Le fichier Excel ne contient aucune donnée.' });

        const result = await svc.generateMailMerge(pdf.buffer, records, fields, {
            mode,
            baseName: (plan.baseName || 'publipostage').replace(/[\\/:*?"<>|]/g, '_'),
        });

        if (result.zip) {
            sendZip(res, result.zip, `${plan.baseName || 'publipostage'}.zip`);
        } else {
            sendPdf(res, result.buffer, `${plan.baseName || 'publipostage'}.pdf`);
        }
    } catch (e) { handleError(res, e, 'Échec de la génération du publipostage.'); }
}

module.exports = {
    merge,
    thumbnails,
    applyPages,
    compress,
    toImages,
    watermark,
    pageNumbers,
    ocr,
    compare,
    repair,
    protect,
    editObjects,
    editApply,
    saveToGed,
    mailMergeAnalyze,
    mailMergeGenerate,
    listLibrary,
    downloadLibrary,
    deleteLibrary,
    sendLibraryMail,
    setSendMail,
    cleanupExpiredLibrary,
    RETENTION_MONTHS,
};
