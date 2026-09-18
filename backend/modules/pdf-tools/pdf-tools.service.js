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
const XLSX = require('xlsx');
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

// ─── Nettoyage WinAnsi (polices standard pdf-lib) ───────────────────────────
// Les polices StandardFonts (Helvetica…) utilisent l'encodage WinAnsi
// (Windows-1252) : tout caractère hors de cet ensemble fait échouer drawText
// (« WinAnsi cannot encode … »). On retire donc les emojis/symboles exotiques
// et on mappe les caractères typographiques courants avant tout dessin.
const WINANSI_EXTRAS = new Set([
    0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
    0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
    0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

function isWinAnsiCode(cp) {
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return true;
    if (cp >= 0x20 && cp <= 0x7E) return true;
    if (cp >= 0xA0 && cp <= 0xFF) return true;
    return WINANSI_EXTRAS.has(cp);
}

/** Remplace les caractères non encodables (emoji, symboles) pour éviter tout crash pdf-lib. */
function sanitizeForWinAnsi(value) {
    const text = value === null || value === undefined ? '' : String(value);
    let out = '';
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (isWinAnsiCode(cp)) out += ch;
        else if (cp === 0xFEFF || cp === 0x200B || cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) { /* invisible */ }
        else if (cp >= 0x1F000) { /* emoji */ out += ''; }
        else out += '?';
    }
    return out;
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
const MAX_RENDER_SCALE = 8; // ~576 DPI

/** Rend le blanc (proche de #fff) transparent — pour les PNG à détourer. */
async function makeWhiteTransparent(pngBuffer) {
    const img = await loadImage(pngBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const THRESHOLD = 245;
    for (let p = 0; p < data.data.length; p += 4) {
        if (data.data[p] >= THRESHOLD && data.data[p + 1] >= THRESHOLD && data.data[p + 2] >= THRESHOLD) {
            data.data[p + 3] = 0;
        }
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toBuffer('image/png');
}

async function pdfToImages(buffer, { format = 'png', scale = 4, transparent = false } = {}) {
    const safeScale = Math.min(MAX_RENDER_SCALE, Math.max(0.5, Number(scale) || 2));
    const doc = await getPdfjsDocument(buffer);
    const total = doc.numPages;
    const images = [];
    try {
        for (let i = 1; i <= total; i++) {
            const { buffer: png } = await renderPageToPng(doc, i, safeScale);
            if (format === 'jpeg') {
                const img = await loadImage(png);
                const canvas = createCanvas(img.width, img.height);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                images.push({ index: i - 1, buffer: canvas.toBuffer('image/jpeg', 0.92), ext: 'jpg' });
            } else {
                const out = transparent ? await makeWhiteTransparent(png) : png;
                images.push({ index: i - 1, buffer: out, ext: 'png' });
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
    const safeText = sanitizeForWinAnsi(text);

    for (const page of pdfDoc.getPages()) {
        const { width, height } = page.getSize();
        if (embeddedImage) {
            const scale = (Math.min(width, height) * 0.4) / Math.max(embeddedImage.width, embeddedImage.height);
            const w = embeddedImage.width * scale;
            const h = embeddedImage.height * scale;
            page.drawImage(embeddedImage, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h, opacity });
        } else if (safeText) {
            const textWidth = font.widthOfTextAtSize(safeText, fontSize);
            page.drawText(safeText, {
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
        const label = sanitizeForWinAnsi(format.replace('{page}', String(n)).replace('{total}', String(pages.length)));
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
                const word = sanitizeForWinAnsi(w.text);
                if (!word) continue;
                const bbox = w.bbox;
                const x = bbox.x0 / scale;
                const yTop = bbox.y0 / scale;
                const boxHeight = (bbox.y1 - bbox.y0) / scale;
                const y = pdfHeight - yTop - boxHeight;
                const fontSize = Math.max(4, boxHeight * 0.85);
                pdfPage.drawText(word, {
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

// ─── 11. Publipostage (mail merge PDF + Excel) ───────────────────────────────

const FONT_BY_STYLE = {
    '0_0': StandardFonts.Helvetica,
    '1_0': StandardFonts.HelveticaBold,
    '0_1': StandardFonts.HelveticaOblique,
    '1_1': StandardFonts.HelveticaBoldOblique,
};

async function embedFontCached(pdfDoc, cache, bold, italic) {
    const key = `${bold ? 1 : 0}_${italic ? 1 : 0}`;
    if (!cache[key]) cache[key] = await pdfDoc.embedFont(FONT_BY_STYLE[key]);
    return cache[key];
}

/** Découpe un texte en lignes tenant dans maxWidth (mesure avec la police choisie). */
function wrapText(text, font, size, maxWidth) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxWidth || !current) {
            current = test;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Lit un classeur Excel/CSV et renvoie les colonnes + les enregistrements.
 * La première ligne non vide sert d'en-tête ; les colonnes vides/homonymes sont
 * renommées pour rester uniques.
 */
function parseExcel(buffer, sheetName) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('Classeur Excel vide.');
    const sheet = (sheetName && wb.SheetNames.includes(sheetName)) ? sheetName : wb.SheetNames[0];
    const ws = wb.Sheets[sheet];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    if (!matrix.length) throw new Error('Feuille Excel vide.');

    const rawHeader = matrix[0] || [];
    const used = new Set();
    const columns = rawHeader.map((h, i) => {
        let name = String(h == null ? '' : h).trim() || `Colonne ${i + 1}`;
        let candidate = name;
        let n = 2;
        while (used.has(candidate)) candidate = `${name} (${n++})`;
        used.add(candidate);
        return candidate;
    });

    const records = matrix.slice(1).map((row) => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i] === undefined || row[i] === null ? '' : row[i]; });
        return obj;
    }).filter((rec) => Object.values(rec).some((v) => String(v).trim() !== ''));

    return { sheetNames: wb.SheetNames, sheet, columns, records };
}

/** Renvoie la taille (points) + un aperçu image (dataUrl) de chaque page du PDF. */
async function getPagesInfo(buffer, { scale = 1, maxPages = 20 } = {}) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const sizes = pdfDoc.getPages().map((p) => p.getSize());
    const doc = await getPdfjsDocument(buffer);
    const pages = [];
    try {
        const limit = Math.min(doc.numPages, maxPages, sizes.length);
        for (let i = 1; i <= limit; i++) {
            const { buffer: png, width, height } = await renderPageToPng(doc, i, scale);
            pages.push({
                index: i - 1,
                width, height,
                widthPt: sizes[i - 1].width,
                heightPt: sizes[i - 1].height,
                dataUrl: `data:image/png;base64,${png.toString('base64')}`,
            });
        }
    } finally {
        try { await doc.destroy(); } catch (e) { /* ignore */ }
    }
    return { pageCount: sizes.length, pages, truncated: sizes.length > maxPages };
}

/**
 * Génère le publipostage : dessine, pour chaque enregistrement, les variables
 * (fields) sur le PDF modèle, puis renvoie soit un PDF unique (toutes les
 * copies à la suite), soit un ZIP d'autant de PDF que d'enregistrements.
 *
 * field: {
 *   column, page (1-based), xPct, yPct (coin haut-gauche, % de la page),
 *   wPt, hPt (points), fontSize, bold, italic, underline, color, align, wrap
 * }
 */
async function generateMailMerge(templateBuffer, records, fields, { mode = 'single', baseName = 'publipostage' } = {}) {
    const template = await PDFDocument.load(templateBuffer, { ignoreEncryption: true });
    const totalPages = template.getPageCount();
    const safeFields = (Array.isArray(fields) ? fields : []).filter(
        (f) => f && f.column && Number(f.page) >= 1 && Number(f.page) <= totalPages
    );

    const applyRecord = async (outDoc, fontCache, record) => {
        // Les pages de l'exemplaire sont ajoutées à la suite dans outDoc : on
        // mémorise leur index de départ pour dessiner sur les bonnes pages
        // (sinon, en PDF unique, toutes les variables atterrissent sur les pages
        // du PREMIER exemplaire).
        const base = outDoc.getPageCount();
        const copied = await outDoc.copyPages(template, template.getPageIndices());
        copied.forEach((p) => outDoc.addPage(p));

        for (const f of safeFields) {
            const text = sanitizeForWinAnsi(record[f.column]);
            if (!text) continue;

            const page = outDoc.getPage(base + Number(f.page) - 1);
            const { width, height } = page.getSize();
            const size = Math.max(4, Number(f.fontSize) || 11);
            const font = await embedFontCached(outDoc, fontCache, !!f.bold, !!f.italic);
            const color = hexToRgbFractions(f.color || '#111827');
            const x = Math.max(0, (Number(f.xPct) || 0) / 100 * width);
            const yTop = Math.max(0, (Number(f.yPct) || 0) / 100 * height);
            const maxW = Math.max(10, Number(f.wPt) || (width - x));
            const maxH = Number(f.hPt) || 0;
            const lineH = size * 1.2;

            const lines = f.wrap
                ? wrapText(text, font, size, maxW)
                : [text.replace(/\s+/g, ' ').trim()];
            const maxLines = f.wrap && maxH > 0 ? Math.max(1, Math.floor(maxH / lineH)) : lines.length;

            lines.slice(0, maxLines).forEach((line, i) => {
                if (!line) return;
                const w = font.widthOfTextAtSize(line, size);
                let lx = x;
                if (f.align === 'center') lx = x + (maxW - w) / 2;
                else if (f.align === 'right') lx = x + maxW - w;
                const ly = height - yTop - size - i * lineH;
                page.drawText(line, { x: lx, y: ly, size, font, color: rgb(color.r, color.g, color.b) });
                if (f.underline) {
                    page.drawLine({
                        start: { x: lx, y: ly - 1.6 },
                        end: { x: lx + w, y: ly - 1.6 },
                        thickness: 0.7,
                        color: rgb(color.r, color.g, color.b),
                    });
                }
            });
        }
    };

    if (mode === 'separate') {
        const files = [];
        for (let i = 0; i < records.length; i++) {
            const out = await PDFDocument.create();
            await applyRecord(out, {}, records[i]);
            files.push({
                name: `${baseName}-${String(i + 1).padStart(3, '0')}.pdf`,
                buffer: Buffer.from(await out.save()),
            });
        }
        return { zip: await zipBuffers(files), count: files.length, mode };
    }

    const out = await PDFDocument.create();
    const cache = {};
    for (const record of records) await applyRecord(out, cache, record);
    return { buffer: Buffer.from(await out.save()), count: records.length, mode };
}

// ─── 13. Protection par mot de passe (chiffrement AES-256) ─────────────────
// pdf-lib ne chiffre pas ; on utilise @cantoo/pdf-lib (fork pur JS) pour
// produire un PDF ouvert uniquement avec le mot de passe « utilisateur ».
async function protectPdf(buffer, opts = {}) {
    const { PDFDocument: SecurePDFDocument } = require('@cantoo/pdf-lib');
    const userPassword = String(opts.userPassword || '').trim();
    const ownerPassword = String(opts.ownerPassword || '').trim();
    if (!userPassword && !ownerPassword) {
        throw new Error('Un mot de passe est requis pour protéger le document.');
    }

    let doc;
    try {
        doc = await SecurePDFDocument.load(buffer, {
            ignoreEncryption: false,
            password: opts.currentPassword || undefined,
        });
    } catch (e) {
        if (/encrypt/i.test(e && e.message || '')) {
            throw new Error('Ce PDF est déjà protégé par mot de passe : renseignez le mot de passe actuel pour le modifier.');
        }
        throw e;
    }

    doc.encrypt({
        userPassword: userPassword || undefined,
        ownerPassword: ownerPassword || userPassword || undefined,
        cipher: 'AES-256',
    });

    return Buffer.from(await doc.save());
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
    parseExcel,
    getPagesInfo,
    generateMailMerge,
    sanitizeForWinAnsi,
    protectPdf,
};
