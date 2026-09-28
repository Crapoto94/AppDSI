/**
 * Aperçus en lecture seule des formats bureautiques courants — sans dépendance à un
 * binaire externe (LibreOffice, etc., absent de l'image Docker) : mammoth (docx→HTML),
 * xlsx/SheetJS (xlsx→HTML), extraction texte "maison" pour pptx (adm-zip). Les formats
 * binaires historiques (.doc/.xls/.ppt, pré-2007) n'ont pas d'aperçu — téléchargement seul.
 *
 * Repris de C:\dev\mandat\backend\services\officePreview.js (même approche, mêmes
 * dépendances déjà présentes dans ce backend).
 */
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

async function previewDocx(buffer) {
    const result = await mammoth.convertToHtml(
        { buffer },
        {
            // Par défaut mammoth ignore les images embarquées (mise en page incomplète) :
            // on les réinjecte en data URI, pas de fichier annexe à servir pour un aperçu
            // en lecture seule.
            convertImage: mammoth.images.imgElement(async (image) => {
                const base64 = await image.read('base64');
                return { src: `data:${image.contentType};base64,${base64}` };
            }),
        }
    );
    return { html: result.value, warnings: result.messages.map((m) => m.message) };
}

function previewXlsx(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return {
        sheets: workbook.SheetNames.map((name) => ({
            name,
            html: XLSX.utils.sheet_to_html(workbook.Sheets[name], { id: undefined }),
        })),
    };
}

/** Extraction texte des diapositives, dans l'ordre — pas un rendu visuel (mise en
 * forme, images non gérées), mais suffisant pour consulter le contenu sans télécharger. */
function previewPptx(buffer) {
    const zip = new AdmZip(buffer);
    const entries = zip
        .getEntries()
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a, b) => {
            const na = Number(a.entryName.match(/slide(\d+)\.xml/)[1]);
            const nb = Number(b.entryName.match(/slide(\d+)\.xml/)[1]);
            return na - nb;
        });

    const slides = entries.map((entry, i) => {
        const xml = entry.getData().toString('utf8');
        const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) =>
            m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        );
        return { index: i + 1, text: texts.filter(Boolean).join('\n') };
    });
    return { slides };
}

module.exports = { previewDocx, previewXlsx, previewPptx };
