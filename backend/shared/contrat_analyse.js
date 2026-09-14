/**
 * Helpers partagés pour matérialiser une analyse IA de contrat en document Markdown dans la
 * GED — utilisés à la fois par le script de traitement par lot
 * (scripts/batch_analyse_contrats.js) et par le déclenchement automatique à l'ajout d'un
 * document (contrats.controller.js#addDocument).
 *
 * Miroir de buildAnalyseMarkdown côté frontend (Contrats.tsx) — dupliqué là-bas faute de
 * frontière de code partagée avec le frontend TypeScript ; garder les deux versions en phase
 * si le format évolue.
 */
const storage = require('./storage');

const MODULE = 'contrats';

const KNOWN_ANALYSE_FIELDS = [
    ['fournisseur', 'Fournisseur'],
    ['date_debut', 'Date début'],
    ['duree_annees', 'Durée (années)'],
    ['nb_reconductions', 'Reconductions'],
    ['reconduction', 'Type reconduction'],
    ['date_fin', 'Date fin'],
    ['montant_2022', 'Montant initial'],
    ['gti', 'GTI'],
    ['gtr', 'GTR'],
    ['indice_revision', 'Indice révision'],
];
const KNOWN_ANALYSE_KEYS = new Set([...KNOWN_ANALYSE_FIELDS.map(([k]) => k), 'resume']);

const humanizeJsonKey = (key) => key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

function jsonValueToMarkdown(value, indent = 0) {
    const pad = '  '.repeat(indent);
    if (value === null || value === undefined || value === '') return '_—_';
    if (Array.isArray(value)) {
        return value.map(item => (typeof item === 'object' && item !== null)
            ? `${pad}- ${jsonValueToMarkdown(item, indent + 1).trim()}`
            : `${pad}- **${String(item)}**`
        ).join('\n');
    }
    if (typeof value === 'object') {
        return Object.entries(value).map(([k, v]) => {
            const vMd = jsonValueToMarkdown(v, indent + 1);
            return vMd.includes('\n') ? `${pad}- **${humanizeJsonKey(k)}** :\n${vMd}` : `${pad}- **${humanizeJsonKey(k)}** : ${vMd}`;
        }).join('\n');
    }
    return `**${String(value)}**`;
}

function buildAnalyseMarkdown(documentName, rawText, parsedJson) {
    const lines = [`# Analyse IA — ${documentName || 'document'}`, '', `_Générée le ${new Date().toLocaleString('fr-FR')}_`, ''];
    if (parsedJson) {
        lines.push('## Champs détectés', '');
        for (const [key, label] of KNOWN_ANALYSE_FIELDS) {
            const v = parsedJson[key];
            lines.push(`- ${label} : ${(v === null || v === undefined || v === '') ? '—' : `**${String(v)}**`}`);
        }
        lines.push('');
        if (parsedJson.resume) lines.push('## Résumé', '', String(parsedJson.resume), '');
        const extraEntries = Object.entries(parsedJson).filter(([k]) => !KNOWN_ANALYSE_KEYS.has(k));
        for (const [k, v] of extraEntries) lines.push(`## ${humanizeJsonKey(k)}`, '', jsonValueToMarkdown(v), '');
    } else if (rawText) {
        lines.push(rawText, '');
    }
    lines.push('---', '_Analyse générée automatiquement — conservée sur le contrat._');
    return lines.join('\n');
}

/** Nom de fichier propre (sans préfixe technique de stockage, sans extension d'origine). */
function safeDocName(fileName) {
    return (fileName || 'document')
        .replace(/^\d{10,}-\d{1,15}-/, '')
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .trim() || 'document';
}

/**
 * Enregistre le résultat d'une analyse comme document du contrat (GED) — remplace une
 * éventuelle analyse déjà présente (nature "Analyse IA") au lieu d'empiler des doublons.
 * `uploadedBy` est optionnel (null pour un déclenchement automatique, sans utilisateur).
 */
async function saveAnalyseAsDocument(pgDb, contratId, sourceFileName, rawText, parsedJson, uploadedBy = null) {
    const existing = await pgDb.all(
        "SELECT id, file_path FROM hub_contrats.contrat_documents WHERE contrat_id = ? AND nature = 'Analyse IA'",
        [contratId]
    );
    for (const old of existing) {
        try {
            if (storage.isStoragePath(old.file_path)) await storage.deleteFile(old.file_path);
            await pgDb.run('DELETE FROM hub_contrats.contrat_documents WHERE id = ?', [old.id]);
        } catch (e) { console.warn(`[Contrats] suppression de l'ancienne analyse #${old.id} échouée :`, e.message); }
    }

    const md = buildAnalyseMarkdown(sourceFileName, rawText, parsedJson);
    const buffer = Buffer.from(md, 'utf8');
    const fileName = `Analyse IA - ${safeDocName(sourceFileName)}.md`;
    const saved = await storage.saveFile(MODULE, contratId, { buffer, originalname: fileName });
    await pgDb.run(
        'INSERT INTO hub_contrats.contrat_documents (contrat_id, file_path, file_name, nature, est_principal) VALUES (?,?,?,?,0)',
        [contratId, saved.dbPath, saved.filename, 'Analyse IA']
    );
    try {
        const docsService = require('./documents.service');
        await docsService.registerExternalUpload({
            module: MODULE, entityType: 'attachment', entityId: contratId,
            title: 'Analyse IA', filename: saved.filename, originalName: fileName,
            mimetype: 'text/markdown', size: buffer.length, storageRef: saved.dbPath,
            metadata: { nature: 'Analyse IA' }, uploadedBy,
        });
    } catch (e) { console.warn('[Contrats] enregistrement hub_docs échoué (document quand même créé) :', e.message); }
}

// ── Table hub_contrats.contrat_analyses_ia (vue globale /contrats/analyses-ia) ─────────────
// Une ligne par contrat, remplacée à chaque nouvelle analyse (même convention que le document
// Markdown en GED ci-dessus) : extraction des champs structurés de ai_analyse_json (quand l'IA
// répond en JSON — dépend du prompt configuré en admin, cf. extractAnalyseScore) pour permettre
// le tri/filtrage côté frontend sans reparser le JSON à la volée à chaque affichage.

/** Date "YYYY-MM-DD" valide -> chaîne inchangée pour Postgres (colonne DATE), sinon null. Rejette
 * les dates non conformes plutôt que de laisser Postgres lever une erreur de cast au INSERT. */
function toPgDate(v) {
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

function toPgInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d.-]/g, ''), 10);
    return Number.isFinite(n) ? Math.round(n) : null;
}

function toPgNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function toText(v) {
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'string' ? v : String(v);
}

function toJsonArray(v) {
    if (Array.isArray(v)) return JSON.stringify(v);
    if (v === null || v === undefined || v === '') return '[]';
    return JSON.stringify([v]);
}

/**
 * Met à jour (ou crée) la ligne "vue globale" d'un contrat dans hub_contrats.contrat_analyses_ia
 * à partir du résultat brut d'une analyse IA. Fonctionne aussi quand l'IA a répondu en Markdown
 * libre plutôt qu'en JSON (parsedJson null) : seuls score_global/raw_text/document restent
 * renseignés dans ce cas, le reste des colonnes structurées est laissé à null — c'est le
 * comportement attendu, pas une erreur (cf. extractAnalyseScore pour le même constat sur le
 * score).
 */
async function upsertAnalyseIaRow(pgDb, { contratId, documentId, documentName, rawText, parsedJson, score, model, source }) {
    const j = parsedJson || {};
    const avis = (j.avis && typeof j.avis === 'object') ? j.avis : {};

    await pgDb.run(
        `INSERT INTO hub_contrats.contrat_analyses_ia (
            contrat_id, document_id, document_name, fournisseur, date_debut, date_fin,
            duree_annees, nb_reconductions, reconduction, montant_annuel, gti, gtr,
            indice_revision, resume, points_de_vigilance, recommandations, notes,
            score_global, raw_text, json_data, ai_model, ai_source, analysed_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT (contrat_id) DO UPDATE SET
            document_id = EXCLUDED.document_id,
            document_name = EXCLUDED.document_name,
            fournisseur = EXCLUDED.fournisseur,
            date_debut = EXCLUDED.date_debut,
            date_fin = EXCLUDED.date_fin,
            duree_annees = EXCLUDED.duree_annees,
            nb_reconductions = EXCLUDED.nb_reconductions,
            reconduction = EXCLUDED.reconduction,
            montant_annuel = EXCLUDED.montant_annuel,
            gti = EXCLUDED.gti,
            gtr = EXCLUDED.gtr,
            indice_revision = EXCLUDED.indice_revision,
            resume = EXCLUDED.resume,
            points_de_vigilance = EXCLUDED.points_de_vigilance,
            recommandations = EXCLUDED.recommandations,
            notes = EXCLUDED.notes,
            score_global = EXCLUDED.score_global,
            raw_text = EXCLUDED.raw_text,
            json_data = EXCLUDED.json_data,
            ai_model = EXCLUDED.ai_model,
            ai_source = EXCLUDED.ai_source,
            analysed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP`,
        [
            contratId, documentId || null, toText(documentName), toText(j.fournisseur), toPgDate(j.date_debut), toPgDate(j.date_fin),
            toPgInt(j.duree_annees), toPgInt(j.nb_reconductions), toText(j.reconduction), toPgNumber(j.montant_2022), toText(j.gti), toText(j.gtr),
            toText(j.indice_revision), toText(j.resume), toJsonArray(avis.points_de_vigilance), toJsonArray(avis.recommandations), toText(avis.notes),
            score != null ? score : null, rawText || null, parsedJson ? JSON.stringify(parsedJson) : null, toText(model), toText(source),
        ]
    );
}

/**
 * Point d'entrée unique appelé par les 3 endroits qui terminent une analyse IA de contrat
 * (analyseDocumentAi, le déclenchement automatique à l'ajout de document, et le script batch) :
 * persiste le résultat à la fois sur hub_contrats.contrats (colonnes ai_analyse_*, résumé
 * "dernier résultat") et sur la table structurée contrat_analyses_ia (vue globale
 * triable/filtrable). Centralisé ici pour ne pas dupliquer une troisième fois ces deux écritures.
 */
async function persistAnalyseResult(pgDb, { contratId, documentId, documentName, rawText, parsedJson, score, model, source }) {
    await pgDb.run(
        'UPDATE hub_contrats.contrats SET ai_analyse_raw = ?, ai_analyse_json = ?, ai_analyse_score = ?, ai_analyse_document_id = ?, ai_analyse_at = CURRENT_TIMESTAMP WHERE id = ?',
        [rawText || null, parsedJson ? JSON.stringify(parsedJson) : null, score != null ? score : null, documentId || null, contratId]
    );
    await upsertAnalyseIaRow(pgDb, { contratId, documentId, documentName, rawText, parsedJson, score, model, source });
}

module.exports = {
    KNOWN_ANALYSE_FIELDS,
    KNOWN_ANALYSE_KEYS,
    humanizeJsonKey,
    jsonValueToMarkdown,
    buildAnalyseMarkdown,
    safeDocName,
    saveAnalyseAsDocument,
    toPgDate,
    toPgInt,
    toPgNumber,
    upsertAnalyseIaRow,
    persistAnalyseResult,
};
