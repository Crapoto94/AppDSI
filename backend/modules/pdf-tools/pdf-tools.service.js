/**
 * Cœur métier des outils PDF (fusion, pages, compression, export images,
 * filigrane, numérotation, OCR, comparaison, réparation).
 *
 * Toutes les fonctions travaillent en mémoire (Buffer in / Buffer out) : rien
 * n'est écrit sur disque tant que l'utilisateur ne demande pas la sauvegarde
 * GED (voir pdf-tools.controller.js / storage.saveFile).
 *
 * pdfjs-dist (>=4.x) est distribué en ESM uniquement -> import() dynamique
 * depuis ce module CommonJS (même pattern que shared/ocr.js).
 */
const path = require('path');
const archiver = require('archiver');
const {
    PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFArray, PDFRawStream,
} = require('pdf-lib');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const A4 = { width: 595.28, height: 841.89 };
const IMAGE_MIME_RE = /^image\//;

// ─── Rendu PDF -> image (pdfjs-dist + @napi-rs/canvas, sans dépendance système) ─

let _pdfjsPromise = null;
function loadPdfjs() {
    if (!_pdfjsPromise) _pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
    return _pdfjsPromise;
}

async function getPdfjsDocument(buffer) {
    const pdfjsLib = await loadPdfjs();
    const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
    return pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        // false : force l'usage des polices standard embarquées dans pdfjs-dist
        // (standardFontDataUrl) plutôt que la substitution par police système,
        // qui produit des pages blanches avec @napi-rs/canvas (police jamais
        // résolue avant le rendu -> "getPathGenerator ... isn't resolved yet").
        useSystemFonts: false,
        isEvalSupported: false,
        standardFontDataUrl,
    }).promise;
}

async function renderPageToPng(pdfjsDoc, pageNumber /* 1-based */, scale) {
    const page = await pdfjsDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { buffer: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height };
}

function zipBuffers(entries) {
    // entries: [{ name, buffer }]
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];
        archive.on('data', (c) => chunks.push(c));
        archive.on('error', reject);
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        for (const e of entries) archive.append(e.buffer, { name: e.name });
        archive.finalize();
    });
}

function hexToRgbFractions(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '94a3b8');
    if (!m) return { r: 0.58, g: 0.64, b: 0.72 };
    return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

async function getPageCount(buffer) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
}

// ─── Conversion image -> page A4 (pour la fusion) ───────────────────────────

async function imageToPdfPage(pdfDoc, imageBuffer, mimetype) {
    let embedded;
    const mt = (mimetype || '').toLowerCase();
    if (mt === 'image/png') {
        embedded = await pdfDoc.embedPng(imageBuffer);
    } else if (mt === 'image/jpeg' || mt === 'image/jpg') {
        embedded = await pdfDoc.embedJpg(imageBuffer);
    } else {
        // Formats non natifs à pdf-lib (gif, bmp, webp...) : on repasse par un
        // canvas pour ré-encoder en PNG avant embarquement.
        const img = await loadImage(imageBuffer);
        const canvas = createCanvas(img.width, img.height);
        canvas.getContext('2d').drawImage(img, 0, 0);
        embedded = await pdfDoc.embedPng(canvas.toBuffer('image/png'));
    }

    const { width: imgWidth, height: imgHeight } = embedded;
    const landscape = imgWidth > imgHeight;
    const pageWidth = landscape ? A4.height : A4.width;
    const pageHeight = landscape ? A4.width : A4.height;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const margin = 20;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;
    const ratio = Math.min(maxW / imgWidth, maxH / imgHeight);
    const drawW = imgWidth * ratio;
    const drawH = imgHeight * ratio;
    page.drawImage(embedded, {
        x: (pageWidth - drawW) / 2,
        y: (pageHeight - drawH) / 2,
        width: drawW,
        height: drawH,
    });
    return page;
}

// ─── 1. Fusion ───────────────────────────────────────────────────────────────
// files: [{ buffer, mimetype, originalname }] dans l'ordre voulu (images
// converties en page A4 portrait/paysage selon leur orientation).
async function mergeFiles(files) {
    const out = await PDFDocument.create();
    for (const file of files) {
        if (IMAGE_MIME_RE.test(file.mimetype)) {
            await imageToPdfPage(out, file.buffer, file.mimetype);
        } else {
            const src = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
            const pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach((p) => out.addPage(p));
        }
    }
    return Buffer.from(await out.save());
}

// ─── 2. Miniatures (pour l'éditeur de pages, et l'aperçu de fusion) ─────────
// maxPages limite le nombre de pages rendues (ex: 1 pour un simple aperçu de
// couverture) sans changer pageCount, qui reste le nombre réel de pages.
async function getThumbnails(buffer, { scale = 0.35, maxPages } = {}) {
    const doc = await getPdfjsDocument(buffer);
    const total = doc.numPages;
    const limit = maxPages ? Math.min(maxPages, total) : total;
    const pages = [];
    try {
        for (let i = 1; i <= limit; i++) {
            const { buffer: png, width, height } = await renderPageToPng(doc, i, scale);
            pages.push({ index: i - 1, width, height, dataUrl: `data:image/png;base64,${png.toString('base64')}` });
        }
    } finally {
        try { await doc.destroy(); } catch (e) { /* ignore */ }
    }
    return { pageCount: total, pages };
}

// ─── 3. Éditeur de pages : découpe / réorganisation / suppression / rotation ─
// plan.pages : ordre final voulu, un item par page conservée dans le train
//   { originalIndex, rotate (delta additionnel, degrés), included }
// plan.cuts  : positions (index dans plan.pages, 0 < i < pages.length) où
//   insérer une coupure -> un fichier de sortie par segment non vide.
async function applyPagePlan(buffer, plan) {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const order = Array.isArray(plan && plan.pages) ? plan.pages : [];
    if (!order.length) throw new Error('Aucune page à traiter.');
    const cuts = new Set((plan.cuts || []).filter((c) => Number.isInteger(c) && c > 0 && c < order.length));

    const segments = [];
    let current = [];
    order.forEach((entry, idx) => {
        if (cuts.has(idx) && current.length) { segments.push(current); current = []; }
        current.push(entry);
    });
    if (current.length) segments.push(current);

    const outputs = [];
    for (const segment of segments) {
        const kept = segment.filter((e) => e.included !== false);
        if (!kept.length) continue;
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, kept.map((e) => e.originalIndex));
        copied.forEach((p, i) => {
            const rot = kept[i].rotate || 0;
            if (rot) p.setRotation(degrees((p.getRotation().angle + rot + 360) % 360));
            out.addPage(p);
        });
        outputs.push(Buffer.from(await out.save()));
    }
    if (!outputs.length) throw new Error('Toutes les pages ont été exclues : aucun fichier à produire.');
    return outputs;
}

// ─── 4. Compression (recompresse les images JPEG intégrées) ────────────────
// Ne cible que les images filtrées en DCTDecode (JPEG), sans SMask (alpha) et
// en DeviceRGB/DeviceGray/CalRGB/CalGray : ce sont, de loin, le cas dominant
// des PDF alourdis par des scans/photos. Les autres formats d'image (Flate
// raster, CMYK, indexée...) sont laissés tels quels par prudence (un mauvais
// décodage produirait une image visuellement corrompue).
const COMPRESS_LEVELS = {
    low: { maxDim: 2000, quality: 85 },
    medium: { maxDim: 1400, quality: 65 },
    high: { maxDim: 900, quality: 40 },
};
const SAFE_COLORSPACES = ['DeviceRGB', 'DeviceGray', 'CalRGB', 'CalGray'];

async function compressPdf(buffer, level) {
    const cfg = COMPRESS_LEVELS[level] || COMPRESS_LEVELS.medium;
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    let imagesTouched = 0;

    for (const [, obj] of context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of('Subtype'));
        if (subtype !== PDFName.of('Image')) continue;
        if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) continue;

        const filter = dict.get(PDFName.of('Filter'));
        if (filter instanceof PDFArray || filter !== PDFName.of('DCTDecode')) continue;

        const colorSpace = dict.get(PDFName.of('ColorSpace'));
        const csName = colorSpace ? colorSpace.asString?.().replace(/^\//, '') : 'DeviceRGB';
        if (!SAFE_COLORSPACES.includes(csName)) continue;

        try {
            const img = await loadImage(Buffer.from(obj.getContents()));
            if (img.width <= cfg.maxDim && img.height <= cfg.maxDim) {
                // Déjà sous la résolution cible : seule la qualité JPEG change (ré-encodage).
            }
            const ratio = Math.min(1, cfg.maxDim / Math.max(img.width, img.height));
            const targetW = Math.max(1, Math.round(img.width * ratio));
            const targetH = Math.max(1, Math.round(img.height * ratio));
            const canvas = createCanvas(targetW, targetH);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const newJpeg = canvas.toBuffer('image/jpeg', cfg.quality / 100);
            if (newJpeg.length >= obj.getContents().length) continue; // pas d'intérêt à remplacer

            obj.contents = new Uint8Array(newJpeg);
            dict.set(PDFName.of('Width'), context.obj(targetW));
            dict.set(PDFName.of('Height'), context.obj(targetH));
            dict.set(PDFName.of('BitsPerComponent'), context.obj(8));
            dict.delete(PDFName.of('DecodeParms'));
            dict.delete(PDFName.of('Decode'));
            imagesTouched++;
        } catch (e) {
            // Image illisible par le décodeur JPEG (marqueurs exotiques, JPEG2000
            // mal étiqueté...) : on la laisse inchangée plutôt que de planter.
        }
    }

    const outBuffer = Buffer.from(await pdfDoc.save());
    return { buffer: outBuffer, imagesTouched };
}

// ─── 5. Export PDF -> images ─────────────────────────────────────────────────
async function pdfToImages(buffer, { format = 'png', scale = 2 } = {}) {
    const doc = await getPdfjsDocument(buffer);
    const total = doc.numPages;
    const images = [];
    try {
        for (let i = 1; i <= total; i++) {
            const { buffer: png } = await renderPageToPng(doc, i, scale);
            if (format === 'jpeg') {
                const img = await loadImage(png);
                const canvas = createCanvas(img.width, img.height);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                images.push({ index: i - 1, buffer: canvas.toBuffer('image/jpeg', 0.9), ext: 'jpg' });
            } else {
                images.push({ index: i - 1, buffer: png, ext: 'png' });
            }
        }
    } finally {
        try { await doc.destroy(); } catch (e) { /* ignore */ }
    }
    return images;
}

// ─── 6. Filigrane ────────────────────────────────────────────────────────────
async function addWatermark(buffer, opts = {}) {
    const {
        text, opacity = 0.3, fontSize = 48, colorHex = '#94a3b8', rotate = 45,
        imageBuffer, imageMimetype,
    } = opts;
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    let embeddedImage = null;
    let font = null;
    if (imageBuffer) {
        embeddedImage = (imageMimetype || '').toLowerCase() === 'image/png'
            ? await pdfDoc.embedPng(imageBuffer)
            : await pdfDoc.embedJpg(imageBuffer);
    } else {
        font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
    const color = hexToRgbFractions(colorHex);

    for (const page of pdfDoc.getPages()) {
        const { width, height } = page.getSize();
        if (embeddedImage) {
            const scale = (Math.min(width, height) * 0.4) / Math.max(embeddedImage.width, embeddedImage.height);
            const w = embeddedImage.width * scale;
            const h = embeddedImage.height * scale;
            page.drawImage(embeddedImage, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h, opacity });
        } else if (text) {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            page.drawText(text, {
                x: (width - textWidth) / 2,
                y: height / 2,
                size: fontSize,
                font,
                color: rgb(color.r, color.g, color.b),
                opacity,
                rotate: degrees(rotate),
            });
        }
    }
    return Buffer.from(await pdfDoc.save());
}

// ─── 7. Numérotation de pages ────────────────────────────────────────────────
async function addPageNumbers(buffer, { position = 'bottom-center', startAt = 1, format = '{page}' } = {}) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    pages.forEach((page, idx) => {
        const n = startAt + idx;
        const label = format.replace('{page}', String(n)).replace('{total}', String(pages.length));
        const { width, height } = page.getSize();
        const fontSize = 10;
        const textWidth = font.widthOfTextAtSize(label, fontSize);
        let x;
        if (position.endsWith('left')) x = 30;
        else if (position.endsWith('right')) x = width - textWidth - 30;
        else x = (width - textWidth) / 2;
        const y = position.startsWith('top') ? height - 30 : 20;
        page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
    });
    return Buffer.from(await pdfDoc.save());
}

// ─── 8. OCR : rendre un PDF scanné cherchable ───────────────────────────────
// Superpose une couche de texte invisible (issue de tesseract.js) sans altérer
// le rendu visuel des pages d'origine.
async function makeSearchable(buffer, { lang = 'fra', maxPages = 30 } = {}) {
    const { analyzePdf } = require('../../shared/ocr');
    const info = await analyzePdf(buffer);

    const pdfjsDoc = await getPdfjsDocument(buffer);
    const { createWorker } = require('tesseract.js');
    const scale = 3.0;

    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const total = pdfjsDoc.numPages;
    const pagesToDo = Math.min(total, maxPages);

    const workerOptions = process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH } : {};
    const worker = await createWorker(lang, undefined, workerOptions);
    await worker.setParameters({ user_defined_dpi: String(Math.round(72 * scale)) });

    try {
        for (let i = 1; i <= pagesToDo; i++) {
            const page = await pdfjsDoc.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const png = canvas.toBuffer('image/png');

            const { data } = await worker.recognize(png);
            const pdfPage = pdfDoc.getPage(i - 1);
            const { height: pdfHeight } = pdfPage.getSize();
            const words = (data && data.words) || [];
            for (const w of words) {
                if (!w.text || !w.text.trim()) continue;
                const bbox = w.bbox;
                const x = bbox.x0 / scale;
                const yTop = bbox.y0 / scale;
                const boxHeight = (bbox.y1 - bbox.y0) / scale;
                const y = pdfHeight - yTop - boxHeight;
                const fontSize = Math.max(4, boxHeight * 0.85);
                pdfPage.drawText(w.text, {
                    x, y, size: fontSize, font, opacity: 0, color: rgb(0, 0, 0),
                });
            }
        }
    } finally {
        await worker.terminate();
        try { await pdfjsDoc.destroy(); } catch (e) { /* ignore */ }
    }

    return {
        buffer: Buffer.from(await pdfDoc.save()),
        pagesProcessed: pagesToDo,
        totalPages: total,
        wasAlreadySearchable: !info.isRaster,
    };
}

// ─── 9. Comparaison visuelle de deux PDF ────────────────────────────────────
const MAX_COMPARE_PAGES = 40;
const COMPARE_SCALE = 0.7;
const DIFF_THRESHOLD = 30;

async function comparePdfs(bufferA, bufferB) {
    const docA = await getPdfjsDocument(bufferA);
    const docB = await getPdfjsDocument(bufferB);
    const total = Math.min(Math.max(docA.numPages, docB.numPages), MAX_COMPARE_PAGES);
    const pages = [];
    try {
        for (let i = 1; i <= total; i++) {
            const pageA = i <= docA.numPages ? await renderPageToPng(docA, i, COMPARE_SCALE) : null;
            const pageB = i <= docB.numPages ? await renderPageToPng(docB, i, COMPARE_SCALE) : null;
            let diffPercent = 100;
            let diffImage = null;

            if (pageA && pageB) {
                const imgA = await loadImage(pageA.buffer);
                const imgB = await loadImage(pageB.buffer);
                const w = Math.max(imgA.width, imgB.width);
                const h = Math.max(imgA.height, imgB.height);
                const canvasA = createCanvas(w, h); canvasA.getContext('2d').drawImage(imgA, 0, 0);
                const canvasB = createCanvas(w, h); canvasB.getContext('2d').drawImage(imgB, 0, 0);
                const dataA = canvasA.getContext('2d').getImageData(0, 0, w, h);
                const dataB = canvasB.getContext('2d').getImageData(0, 0, w, h);
                const diffCanvas = createCanvas(w, h);
                const diffCtx = diffCanvas.getContext('2d');
                const diffImageData = diffCtx.createImageData(w, h);
                let diffPixels = 0;
                for (let p = 0; p < dataA.data.length; p += 4) {
                    const dr = Math.abs(dataA.data[p] - dataB.data[p]);
                    const dg = Math.abs(dataA.data[p + 1] - dataB.data[p + 1]);
                    const db = Math.abs(dataA.data[p + 2] - dataB.data[p + 2]);
                    if (dr + dg + db > DIFF_THRESHOLD) {
                        diffPixels++;
                        diffImageData.data[p] = 239; diffImageData.data[p + 1] = 68; diffImageData.data[p + 2] = 68; diffImageData.data[p + 3] = 255;
                    } else {
                        diffImageData.data[p] = dataA.data[p]; diffImageData.data[p + 1] = dataA.data[p + 1]; diffImageData.data[p + 2] = dataA.data[p + 2]; diffImageData.data[p + 3] = 60;
                    }
                }
                diffCtx.putImageData(diffImageData, 0, 0);
                diffPercent = Math.round(((diffPixels / (w * h)) * 100) * 100) / 100;
                diffImage = `data:image/png;base64,${diffCanvas.toBuffer('image/png').toString('base64')}`;
            }

            pages.push({
                index: i - 1,
                existsInA: !!pageA,
                existsInB: !!pageB,
                diffPercent,
                thumbA: pageA ? `data:image/png;base64,${pageA.buffer.toString('base64')}` : null,
                thumbB: pageB ? `data:image/png;base64,${pageB.buffer.toString('base64')}` : null,
                diffImage,
            });
        }
    } finally {
        try { await docA.destroy(); } catch (e) { /* ignore */ }
        try { await docB.destroy(); } catch (e) { /* ignore */ }
    }
    return {
        pageCountA: docA.numPages,
        pageCountB: docB.numPages,
        truncated: Math.max(docA.numPages, docB.numPages) > MAX_COMPARE_PAGES,
        pages,
    };
}

// ─── 10. Réparation (best effort) ───────────────────────────────────────────
async function repairPdf(buffer) {
    const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        capNumbers: true,
    });
    return Buffer.from(await pdfDoc.save());
}

module.exports = {
    A4,
    getPageCount,
    mergeFiles,
    getThumbnails,
    applyPagePlan,
    compressPdf,
    pdfToImages,
    addWatermark,
    addPageNumbers,
    makeSearchable,
    comparePdfs,
    repairPdf,
    zipBuffers,
};
