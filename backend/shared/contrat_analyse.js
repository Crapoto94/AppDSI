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

module.exports = {
    KNOWN_ANALYSE_FIELDS,
    KNOWN_ANALYSE_KEYS,
    humanizeJsonKey,
    jsonValueToMarkdown,
    buildAnalyseMarkdown,
    safeDocName,
    saveAnalyseAsDocument,
};
