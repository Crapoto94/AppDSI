import * as pdfjsLib from 'pdfjs-dist';
// Worker pdf.js inliné dans le bundle : évite le chargement d'un asset séparé,
// qui échoue en production derrière certains reverse-proxies / builds partiels
// (« Setting up fake worker failed »).
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export { pdfjsLib };
export default pdfjsLib;
