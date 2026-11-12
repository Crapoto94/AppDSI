/**
 * « Mon assistant IA » de l'éditeur PDF (PdfCraft) : Résumer / Interroger / Traduire un PDF
 * via l'API IA Ville (APM, shared/apm_ai.js).
 *
 * PdfCraft (build web) n'a aucun fournisseur IA branchable : ses commandes ai.summary / ai.ask /
 * ai.translate sont désactivées. L'assistant est donc fourni par MagApp (cf. docs/PDFCRAFT-INTEGRATION.md) :
 * le front envoie le PDF, on en extrait le texte (pdf-parse) puis on interroge l'APM.
 * La clé APM reste côté serveur (hub.infra_apis, key='apm_ai').
 */
const pdfParse = require('pdf-parse');
const apmAi = require('../../shared/apm_ai');

// pdfjs-dist (>=4.x, ESM uniquement) : import() dynamique, comme pdf-tools.service.js.
let _pdfjsPromise = null;
const loadPdfjs = () => (_pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

/**
 * Extrait le texte d'un PDF. pdf-parse (pdf.js 1.x, très ancien) échoue sur les PDF réenregistrés par
 * PdfCraft (« bad XRef entry », « Illegal character »…) : on utilise pdfjs-dist, et pdf-parse en repli.
 */
async function extractText(buffer) {
    try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
        const doc = await task.promise;
        const parts = [];
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            let line = '';
            for (const it of content.items) {
                line += it.str;
                line += it.hasEOL ? '\n' : (it.str && !it.str.endsWith(' ') ? ' ' : '');
            }
            parts.push(line.trim());
            page.cleanup();
        }
        const numpages = doc.numPages;
        await doc.destroy();
        return { text: parts.join('\n\n'), numpages };
    } catch (primaryErr) {
        console.warn('[pdf-ai] pdfjs-dist a échoué, repli sur pdf-parse :', primaryErr.message);
        const parsed = await pdfParse(buffer);
        return { text: parsed.text || '', numpages: parsed.numpages };
    }
}

// Garde-fou : on borne le texte envoyé à l'APM (fenêtre de contexte limitée).
const MAX_CHARS = 60000;

const ACTIONS = {
    summary: () => "Résume fidèlement le document suivant en français : commence par une synthèse de 3 à 5 lignes, puis liste les points clés sous forme de puces. N'invente rien.",
    ask: (opts) => `Réponds en français à la question suivante en te basant uniquement sur le document. Si la réponse n'y figure pas, dis-le clairement.\n\nQuestion : ${opts.question}`,
    translate: (opts) => `Traduis intégralement le document suivant en ${opts.language || 'français'}. Conserve la structure (titres, listes, paragraphes) et ne rajoute aucun commentaire.`,
};

exports.assist = async (req, res) => {
    try {
        const action = String(req.body.action || '');
        if (!ACTIONS[action]) return res.status(400).json({ message: 'Action inconnue (summary, ask ou translate).' });
        if (!req.file) return res.status(400).json({ message: 'Aucun PDF reçu.' });
        const question = String(req.body.question || '').trim();
        if (action === 'ask' && !question) return res.status(400).json({ message: 'La question est vide.' });

        const parsed = await extractText(req.file.buffer);
        const fullText = (parsed.text || '').replace(/\n{3,}/g, '\n\n').trim();
        if (fullText.length < 20) {
            return res.status(422).json({ message: "Ce PDF ne contient pas de texte exploitable (document scanné ?). Utilisez d'abord « Numérisation et OCR »." });
        }
        const truncated = fullText.length > MAX_CHARS;
        const text = truncated ? fullText.slice(0, MAX_CHARS) : fullText;

        const instruction = ACTIONS[action]({ question, language: String(req.body.language || '').trim() });
        const prompt = `${instruction}\n\n----- DÉBUT DU DOCUMENT -----\n${text}\n----- FIN DU DOCUMENT -----`;
        const model = String(req.body.model || '').trim() || undefined;

        const response = await apmAi.queryAi(prompt, model);
        res.json({ response: String(response || '').trim(), pages: parsed.numpages, truncated });
    } catch (err) {
        console.error('[pdf-ai] assist:', err.message);
        res.status(500).json({ message: err.message || "Erreur lors de l'appel à l'API IA." });
    }
};
