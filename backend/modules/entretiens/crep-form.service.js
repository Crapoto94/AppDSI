/**
 * PDF formulaire du CREP : relecture d'un PDF renseigné hors ligne (Acrobat Reader, application mobile…).
 * La génération vit dans crep-pdf.service.js (buildCrepPdf(..., { form: true })) ; les noms de champs sont dans crep-form.names.js.
 * La relecture ne touche à rien en base : elle renvoie le contenu lu, que l'évaluateur contrôle puis enregistre.
 */
const { lazy } = require('../../shared/lazy');
const { PDFDocument } = lazy('pdf-lib');
const { N } = require('./crep-form.names');
const { formToken } = require('./crep-pdf.service');
const { normalizeCrep, definitionFor, groupsOf, NB_OBJECTIFS } = require('./crep.definition');

class FormError extends Error { constructor(m) { super(m); this.status = 400; } }

/** « 05/03/2026 » (ou 5/3/26, 05-03-2026, 2026-03-05) → « 2026-03-05 » ; null si illisible. */
function parseDateFr(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2}|\d{4})$/);
    if (!m) return null;
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${yyyy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Lit un PDF formulaire du CREP.
 * @returns {{ crep: object, warnings: string[], filled: number }}  crep normalisé (même forme que hub_entretiens.entretiens.crep)
 * @throws FormError si le fichier n'est pas un PDF formulaire généré pour cet entretien
 */
async function readCrepForm(buffer, entretien, cdef) {
    if (!buffer || buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw new FormError('Le fichier doit être un PDF.');
    let doc;
    try { doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false }); }
    catch (e) { throw new FormError('PDF illisible : ' + e.message); }
    const form = doc.getForm();
    if (!form.getFields().length) {
        throw new FormError('Ce PDF ne contient aucun champ à lire (document imprimé puis scanné, ou PDF « aplati »). Pour un document scanné, utilisez « Téléverser le CREP signé ».');
    }

    const text = (name) => { try { return form.getTextField(name).getText() || ''; } catch { return null; } };
    const token = text(N.meta);
    const expected = formToken(entretien.id);
    if (token === null) throw new FormError('Ce PDF n’est pas un formulaire CREP généré par l’application.');
    if (token !== expected) throw new FormError('Ce formulaire a été généré pour un autre entretien : il ne peut pas être importé ici.');

    const warnings = [];
    let filled = 0;
    const t = (name) => { const v = text(name); if (v === null) return ''; if (String(v).trim()) filled++; return String(v).replace(/\r\n?/g, '\n').trim(); };
    const date = (name, label) => {
        const raw = t(name);
        const iso = parseDateFr(raw);
        if (iso === null) { warnings.push(`${label} : « ${raw} » n’est pas une date reconnue (attendu JJ/MM/AAAA) ; la date n’est pas reprise.`); return ''; }
        return iso;
    };

    const src = {
        grade: t(N.grade),
        date_convocation: date(N.date_convocation, 'Date de convocation'),
        date_entretien: date(N.date_entretien, 'Date de l’entretien'),
        date_notification: date(N.date_notification, 'Date de notification'),
        evaluateur_nom: t(N.evaluateur_nom),
        missions: t(N.missions),
        objectifs_ecoules: [],
        observations_complementaires: t(N.observations_complementaires),
        valeur: {},
        appreciation_generale: t(N.appreciation_generale),
        objectifs_service: t(N.objectifs_service),
        objectifs_futurs: [],
        formations: { obligatoires: t(N.formObligatoires), metiers: t(N.formMetiers), parcours: t(N.formParcours) },
        evolution: t(N.evolution),
        mobilite: t(N.mobilite),
    };
    for (let i = 0; i < NB_OBJECTIFS; i++) {
        let niveau = '';
        try { niveau = (form.getDropdown(N.oeNiveau(i)).getSelected() || [])[0] || ''; } catch { /* champ absent */ }
        if (niveau) filled++;
        src.objectifs_ecoules.push({ objectif: t(N.oeObjectif(i)), observations: t(N.oeObservations(i)), niveau });
        src.objectifs_futurs.push({ descriptif: t(N.ofDescriptif(i)), moyens: t(N.ofMoyens(i)) });
    }
    const def = cdef || definitionFor(null);
    for (const g of groupsOf(def)) for (const it of g.items) {
        try {
            const sel = form.getRadioGroup(N.valeur(it.key)).getSelected();
            if (sel) { src.valeur[it.key] = sel; filled++; }
        } catch { /* critère absent du PDF */ }
    }
    return { crep: normalizeCrep(src, cdef), warnings, filled };
}

module.exports = { readCrepForm, parseDateFr, FormError };
