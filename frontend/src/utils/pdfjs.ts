import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// Worker pdf.js inliné dans le bundle : évite le chargement d'un asset séparé,
// qui échoue en production derrière certains reverse-proxies / builds partiels
// (« Setting up fake worker failed »).
//
// Build « legacy » : inclut les polyfills nécessaires aux navigateurs plus
// anciens (ex. Android) — notamment `Uint8Array.prototype.toHex`, utilisé par
// pdf.js pour calculer les empreintes, sinon erreur « a.toHex is not a function ».
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

// Ressources runtime copiées dans public/pdfjs (voir scripts/copy-pdfjs-assets.mjs).
// Indispensables pour décoder les images raster des PDF scannés : JBIG2,
// JPEG2000 (wasm), profils ICC, cmaps Adobe et polices standard. Sans elles,
// ces PDF s'affichent en pages blanches.
const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
// URL ABSOLUE obligatoire : le worker est inliné (blob:), contexte où une URL relative comme « /pdfjs/wasm/jbig2.wasm »
// ne peut pas être résolue (« Failed to parse URL »). Sans cela, en production, le décodeur wasm (JBIG2, CCITT des scans)
// ne s'initialise pas et les PDF scannés s'affichent en pages blanches (alors que tout fonctionne en dev).
const pdfAssetBase = new URL(`${base}pdfjs/`, window.location.href).href;

export const pdfDocumentOptions = {
  wasmUrl: `${pdfAssetBase}wasm/`,
  iccUrl: `${pdfAssetBase}iccs/`,
  cMapUrl: `${pdfAssetBase}cmaps/`,
  standardFontDataUrl: `${pdfAssetBase}standard_fonts/`,
};

export { pdfjsLib };
export default pdfjsLib;
