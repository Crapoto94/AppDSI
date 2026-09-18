/**
 * Contrôleurs HTTP des outils PDF. Toutes les opérations sont sans état :
 * fichier(s) en entrée -> fichier en sortie (PDF, image ou zip), renvoyé
 * directement dans la réponse. Rien n'est persisté tant que l'utilisateur
 * n'appelle pas /save (voir sendToGed) pour pousser le résultat dans son
 * dossier GED personnel.
 */
const storage = require('../../shared/storage');
const svc = require('./pdf-tools.service');

const MODULE = 'pdf-tools';

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
        const result = await svc.getThumbnails(req.file.buffer, { scale: 0.35 });
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
        const scale = Math.min(4, Math.max(0.5, parseFloat(req.body.scale) || 2));
        const images = await svc.pdfToImages(req.file.buffer, { format, scale });
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

// ─── Sauvegarde vers la GED (dossier personnel de l'agent) ──────────────────
async function saveToGed(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni.' });
        const username = req.user && req.user.username;
        if (!username) return res.status(401).json({ message: 'Utilisateur non identifié.' });

        const file = { buffer: req.file.buffer, originalname: storage.fixUploadName(req.body.filename || req.file.originalname || 'document.pdf') };
        const saved = await storage.saveFile(MODULE, username, file);

        try {
            const docsService = require('../../shared/documents.service');
            await docsService.registerExternalUpload({
                module: MODULE,
                entityType: 'pdf-tools-output',
                entityId: username,
                title: file.originalname,
                filename: saved.filename,
                originalName: file.originalname,
                mimetype: req.file.mimetype || 'application/pdf',
                size: req.file.size,
                storageRef: saved.dbPath,
                uploadedBy: username,
            });
        } catch (e) { console.warn('[DOCS] register failed:', e.message); }

        res.json({ dbPath: saved.dbPath, filename: saved.filename, url: `/api/storage/${saved.relativePath}` });
    } catch (e) { handleError(res, e, 'Échec de la sauvegarde dans la GED.'); }
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
    saveToGed,
};
