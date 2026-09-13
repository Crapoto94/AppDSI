/**
 * OCR de PDF "raster" (scannés, sans couche texte) — utilisé pour préparer le
 * contenu d'un document à une analyse IA ultérieure (PAS pour l'affichage :
 * le texte produit est brut, non mis en forme).
 *
 * Pipeline :
 *   1. analyzePdf()   — pdf-parse pour détecter si le PDF a déjà une couche
 *                        texte exploitable (PDF "texte") ou pas (PDF "raster",
 *                        typiquement un scan) via une heuristique caractères/page.
 *   2. ocrPdfBuffer() — rend chaque page en image (pdfjs-dist + @napi-rs/canvas,
 *                        aucune dépendance système : @napi-rs/canvas est fourni
 *                        en binaire précompilé) puis reconnaît le texte avec
 *                        tesseract.js (WASM, pas de dépendance système non plus).
 *
 * pdfjs-dist (>=4.x) est distribué en ESM uniquement -> import() dynamique
 * depuis ce module CommonJS.
 */
const path = require('path');
const pdfParse = require('pdf-parse');

// Seuil heuristique : un PDF "texte" normal contient largement plus que ça
// par page (souvent plusieurs centaines de caractères). En dessous, on
// considère qu'il s'agit d'un scan/raster sans couche texte exploitable.
const RASTER_MIN_CHARS_PER_PAGE = 30;

// Nombre de pages OCRisées au maximum par appel (garde-fou : un contrat de
// plusieurs centaines de pages ferait exploser le temps de traitement d'une
// requête HTTP synchrone).
const OCR_MAX_PAGES = 30;

// Échelle de rendu des pages avant OCR (1.0 = 72 DPI, base de PDF.js).
// 2.0 (~144 DPI) est un bon compromis qualité OCR / temps de traitement.
const OCR_RENDER_SCALE = 2.0;

let _pdfjsPromise = null;
function loadPdfjs() {
    if (!_pdfjsPromise) {
        // Le build "legacy" désactive les API navigateur (Worker via <script>, etc.)
        // et convient à un usage Node.js classique (sans DOM).
        _pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return _pdfjsPromise;
}

/**
 * Analyse rapide d'un PDF : nombre de pages, longueur du texte extrait
 * (couche texte native, via pdf-parse) et déduction "raster ou pas".
 * @param {Buffer} buffer
 * @returns {Promise<{numPages:number, textLength:number, isRaster:boolean, text:string, error?:string}>}
 */
async function analyzePdf(buffer) {
    let numPages = 0;
    let text = '';
    try {
        const data = await pdfParse(buffer);
        numPages = data.numpages || 0;
        text = data.text || '';
    } catch (e) {
        // PDF corrompu / non parsable par pdf-parse : on ne peut pas savoir,
        // on ne propose pas l'OCR (on ne veut pas planter sur un fichier illisible).
        return { numPages: 0, textLength: 0, isRaster: false, text: '', error: e.message };
    }
    const textLength = text.trim().length;
    const avgPerPage = numPages > 0 ? textLength / numPages : textLength;
    const isRaster = numPages > 0 && avgPerPage < RASTER_MIN_CHARS_PER_PAGE;
    return { numPages, textLength, isRaster, text };
}

/**
 * OCRise un PDF page par page (rendu image + tesseract.js) et renvoie le
 * texte brut concaténé. Prévu pour un usage "analyse IA", pas affichage.
 * @param {Buffer} buffer
 * @param {{ maxPages?: number, lang?: string, onProgress?: (page:number, total:number) => void }} [opts]
 * @returns {Promise<{ text: string, pages: number, totalPages: number, truncated: boolean }>}
 */
async function ocrPdfBuffer(buffer, opts = {}) {
    const { maxPages = OCR_MAX_PAGES, lang = 'fra', onProgress } = opts;
    const pdfjsLib = await loadPdfjs();
    const { createCanvas } = require('@napi-rs/canvas');
    const { createWorker } = require('tesseract.js');

    const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;

    const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        standardFontDataUrl,
    }).promise;

    const totalPages = doc.numPages;
    const pagesToOcr = Math.min(totalPages, maxPages);

    // tesseract.js télécharge par défaut les données de langue (ex. fra.traineddata)
    // depuis un CDN au premier lancement. Sur un serveur sans accès Internet sortant,
    // définir OCR_LANG_PATH vers un dossier local contenant ces fichiers .traineddata.gz
    // (téléchargés une fois depuis https://github.com/naptha/tessdata).
    const workerOptions = process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH } : {};
    const worker = await createWorker(lang, undefined, workerOptions);
    const pageTexts = [];
    try {
        for (let i = 1; i <= pagesToOcr; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const pngBuffer = canvas.toBuffer('image/png');

            const { data } = await worker.recognize(pngBuffer);
            pageTexts.push((data && data.text || '').trim());

            if (typeof onProgress === 'function') {
                try { onProgress(i, pagesToOcr); } catch (e) { /* ignore */ }
            }
        }
    } finally {
        await worker.terminate();
        try { await doc.destroy(); } catch (e) { /* ignore */ }
    }

    const text = pageTexts
        .map((t, idx) => `--- Page ${idx + 1} ---\n${t}`)
        .join('\n\n');

    return {
        text,
        pages: pagesToOcr,
        totalPages,
        truncated: pagesToOcr < totalPages,
    };
}

module.exports = {
    RASTER_MIN_CHARS_PER_PAGE,
    OCR_MAX_PAGES,
    analyzePdf,
    ocrPdfBuffer,
};
