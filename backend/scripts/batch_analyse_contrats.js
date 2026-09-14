/**
 * Analyse IA en lot de TOUS les contrats : pour chaque contrat, choisit son document
 * principal (PDF), l'OCRise si besoin (scan sans couche texte, pas déjà OCRisé), lance
 * l'analyse IA avec le prompt configuré en admin (/admin/transcript) et le modèle demandé,
 * enregistre le résultat en Markdown dans les documents du contrat (GED, comme le bouton
 * "Enregistrer l'analyse" de l'appli) et met à jour hub_contrats.contrats.ai_analyse_*.
 *
 * Usage :
 *   node scripts/batch_analyse_contrats.js --model "<identifiant exact du modèle>" [options]
 *
 * Options :
 *   --model <id>   Requis. Identifiant du modèle IA tel que configuré côté API Ville
 *                  (voir la liste affichée au démarrage, ou /admin/transcript).
 *   --dry-run      N'effectue AUCUNE écriture (ni OCR, ni IA, ni document) — liste
 *                  seulement les contrats qui seraient traités. À faire en premier.
 *   --limit <n>    Ne traite que les n premiers contrats éligibles (test avant lancement
 *                  complet).
 *   --force        Retraite aussi les contrats ayant déjà une analyse IA (par défaut, ceux
 *                  avec ai_analyse_at déjà renseigné sont sautés — pas de re-traitement
 *                  accidentel/coûteux d'un lancement précédent).
 *   --delay <ms>   Pause entre deux contrats, défaut 2000 — évite de saturer l'IA/OCR.
 *
 * Un contrat sans document PDF exploitable, ou sans texte extractible, est sauté (compté
 * séparément des échecs dans le résumé final). Un contrat en échec (erreur IA, etc.)
 * n'interrompt PAS le traitement des suivants — le résumé final liste les échecs.
 */
const db = require('../shared/database');
const storage = require('../shared/storage');
const ocrService = require('../shared/ocr');
const contratsController = require('../modules/contrats/contrats.controller');
const { runContratAnalysePrompt, readDocumentBuffer, runOcrJob, extractAnalyseScore } = contratsController._internal;

const MODULE = 'contrats';

function parseArgs(argv) {
    const args = { model: null, dryRun: false, limit: null, force: false, delay: 2000 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--model') args.model = argv[++i];
        else if (a === '--dry-run') args.dryRun = true;
        else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
        else if (a === '--force') args.force = true;
        else if (a === '--delay') args.delay = parseInt(argv[++i], 10);
    }
    return args;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Miroir des helpers Markdown côté front (buildAnalyseMarkdown, Contrats.tsx) ────────────
// Dupliqué volontairement (pas de frontière de code partagée entre le frontend TS et les
// scripts backend CommonJS) — garder en phase si la version front évolue.
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
    lines.push('---', '_Analyse générée automatiquement (traitement par lot) — conservée sur le contrat._');
    return lines.join('\n');
}
// ── Fin miroir front ────────────────────────────────────────────────────────────────────

/** Nom de fichier propre pour le document Markdown enregistré (sans préfixe technique, sans extension d'origine). */
function safeDocName(fileName) {
    return (fileName || 'document')
        .replace(/^\d{10,}-\d{1,15}-/, '')
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .trim() || 'document';
}

/** Choisit le document à analyser pour un contrat : le principal (est_principal=1), sinon le PDF non archivé le plus récent. */
async function pickDocument(pgDb, contratId) {
    let doc = await pgDb.get(
        `SELECT * FROM hub_contrats.contrat_documents
         WHERE contrat_id = ? AND est_principal = 1 AND COALESCE(archive,0) = 0
         ORDER BY uploaded_at DESC LIMIT 1`, [contratId]
    );
    if (!doc) {
        doc = await pgDb.get(
            `SELECT * FROM hub_contrats.contrat_documents
             WHERE contrat_id = ? AND COALESCE(archive,0) = 0 AND file_name ILIKE '%.pdf'
             ORDER BY uploaded_at DESC LIMIT 1`, [contratId]
        );
    }
    return doc || null;
}

/** Enregistre le Markdown comme document du contrat (stockage unifié + dual-write hub_docs) — même circuit que "Enregistrer l'analyse" côté UI. */
async function saveAnalyseAsDocument(pgDb, contratId, fileName, markdown) {
    const buffer = Buffer.from(markdown, 'utf8');
    const saved = await storage.saveFile(MODULE, contratId, { buffer, originalname: fileName });
    await pgDb.run(
        'INSERT INTO hub_contrats.contrat_documents (contrat_id, file_path, file_name, nature, est_principal) VALUES (?,?,?,?,0)',
        [contratId, saved.dbPath, saved.filename, 'Analyse IA']
    );
    try {
        const docsService = require('../shared/documents.service');
        await docsService.registerExternalUpload({
            module: MODULE, entityType: 'attachment', entityId: contratId,
            title: 'Analyse IA', filename: saved.filename, originalName: fileName,
            mimetype: 'text/markdown', size: buffer.length, storageRef: saved.dbPath,
            metadata: { nature: 'Analyse IA', batch: true }, uploadedBy: 'batch_analyse_contrats',
        });
    } catch (e) { console.warn('  [DOCS] enregistrement hub_docs échoué (document quand même créé) :', e.message); }
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.model) {
        console.error('Usage: node scripts/batch_analyse_contrats.js --model "<identifiant>" [--dry-run] [--limit N] [--force] [--delay ms]');
        process.exit(1);
    }

    await db.setupDb();
    const { pgDb } = db;

    // Vérification (avertissement, pas bloquant) : le modèle demandé correspond-il à un
    // modèle actif connu de l'API Ville ?
    try {
        const apmAi = require('../shared/apm_ai');
        const models = await apmAi.listModels();
        console.log(`Modèles actifs API Ville : ${models.join(', ') || '(aucun)'}`);
        const found = models.some(m => m.toLowerCase().includes(args.model.toLowerCase()) || args.model.toLowerCase().includes(m.toLowerCase()));
        if (!found) {
            console.warn(`⚠️  "${args.model}" ne correspond exactement à aucun modèle actif listé ci-dessus.`);
            console.warn('    Vérifie l\'orthographe (Ctrl+C pour annuler) — sinon le traitement continue dans 5s...');
            await sleep(5000);
        }
    } catch (e) {
        console.warn('⚠️  Impossible de vérifier la liste des modèles IA (API Ville injoignable ?) :', e.message);
    }

    const where = args.force ? '' : 'WHERE ai_analyse_at IS NULL';
    const allContrats = await pgDb.all(`SELECT id, objet FROM hub_contrats.contrats ${where} ORDER BY id`);
    const todo = args.limit ? allContrats.slice(0, args.limit) : allContrats;

    console.log(`\n${todo.length} contrat(s) à traiter${args.force ? '' : ' (sans analyse IA existante)'}${args.dryRun ? ' — DRY RUN, aucune écriture' : ''}.\n`);

    const summary = { ok: 0, skipped: 0, failed: 0, failures: [] };

    for (let i = 0; i < todo.length; i++) {
        const c = todo[i];
        const label = `[${i + 1}/${todo.length}] Contrat #${c.id} — ${c.objet || '(sans objet)'}`;
        try {
            const doc = await pickDocument(pgDb, c.id);
            if (!doc) { console.log(`${label} : aucun document — sauté.`); summary.skipped++; continue; }
            if (!/\.pdf$/i.test(doc.file_name || '')) { console.log(`${label} : document principal non-PDF (${doc.file_name}) — sauté.`); summary.skipped++; continue; }

            if (args.dryRun) {
                console.log(`${label} : ${doc.file_name}${doc.ocr_text ? ' (déjà OCRisé)' : ''} — dry-run, rien fait.`);
                summary.ok++;
                continue;
            }

            let content = (doc.ocr_text || '').trim();
            if (!content) {
                const buffer = await readDocumentBuffer(doc);
                const info = await ocrService.analyzePdf(buffer);
                if (info.isRaster || !(info.text || '').trim()) {
                    console.log(`${label} : OCR en cours (${doc.file_name})...`);
                    const ocrJob = {};
                    await runOcrJob({ ...doc }, pgDb, ocrJob);
                    if (ocrJob.status === 'error') throw new Error(`OCR échoué : ${ocrJob.error}`);
                    const refreshed = await pgDb.get('SELECT ocr_text FROM hub_contrats.contrat_documents WHERE id = ?', [doc.id]);
                    content = (refreshed?.ocr_text || '').trim();
                } else {
                    content = info.text.trim();
                }
            }
            if (!content) { console.log(`${label} : aucun texte exploitable même après OCR — sauté.`); summary.skipped++; continue; }

            console.log(`${label} : analyse IA en cours (${content.length} caractères, modèle "${args.model}")...`);
            const { rawText, parsedJson } = await runContratAnalysePrompt({
                fileName: doc.file_name, content, requestedModel: args.model, job: undefined,
            });

            const score = extractAnalyseScore(rawText, parsedJson);
            await pgDb.run(
                'UPDATE hub_contrats.contrats SET ai_analyse_raw = ?, ai_analyse_json = ?, ai_analyse_score = ?, ai_analyse_document_id = ?, ai_analyse_at = CURRENT_TIMESTAMP WHERE id = ?',
                [rawText, parsedJson ? JSON.stringify(parsedJson) : null, score, doc.id, c.id]
            );

            const md = buildAnalyseMarkdown(doc.file_name, rawText, parsedJson);
            await saveAnalyseAsDocument(pgDb, c.id, `Analyse IA - ${safeDocName(doc.file_name)}.md`, md);

            console.log(`${label} : OK${score != null ? ` (score ${score}/100)` : ''}.`);
            summary.ok++;
        } catch (error) {
            console.error(`${label} : ÉCHEC — ${error.message}`);
            summary.failed++;
            summary.failures.push({ id: c.id, objet: c.objet, error: error.message });
        }
        if (!args.dryRun && args.delay > 0 && i < todo.length - 1) await sleep(args.delay);
    }

    console.log('\n================ RÉSUMÉ ================');
    console.log(`OK: ${summary.ok}   Sautés: ${summary.skipped}   Échecs: ${summary.failed}`);
    if (summary.failures.length) {
        console.log('\nÉchecs :');
        for (const f of summary.failures) console.log(`  #${f.id} (${f.objet || '—'}) : ${f.error}`);
    }
    process.exit(summary.failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
