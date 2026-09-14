/**
 * Ré-interroge l'IA pour structurer en JSON complet (extractStructuredAnalyseData) chaque
 * analyse IA déjà enregistrée dont le rapport est en Markdown libre (ai_analyse_json vide) —
 * alimente la table hub_contrats.contrat_analyses_ia avec TOUTES les informations du rapport
 * (pas seulement le score), pour que la vue globale /contrats/analyses-ia permette de comparer
 * n'importe quel champ (formule de révision, RGPD, pénalités, etc.) colonne par colonne.
 *
 * Ne touche jamais ai_analyse_raw/ai_analyse_score/ai_analyse_document_id sur hub_contrats.contrats
 * (déjà corrects) — seule la structuration est refaite, best-effort par contrat (un échec
 * n'interrompt pas les suivants).
 *
 * Usage : node scripts/extract_structured_analyses.js [--dry-run] [--force] [--delay ms]
 */
const db = require('../shared/database');
const contratsController = require('../modules/contrats/contrats.controller');
const { extractStructuredAnalyseData } = contratsController._internal;
const { upsertAnalyseIaRow } = require('../shared/contrat_analyse');

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const delayArgIdx = process.argv.indexOf('--delay');
const delayMs = delayArgIdx !== -1 ? parseInt(process.argv[delayArgIdx + 1], 10) : 3000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const sqlite = await db.setupDb();
    const { pgDb } = db;

    const keys = ['contrat_analyse_ai_source', 'contrat_analyse_apm_model'];
    const cfg = {};
    for (const k of keys) {
        const row = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [k]);
        cfg[k] = row && row.setting_value != null ? String(row.setting_value) : '';
    }

    // Sans --force : seuls les contrats dont json_data est encore vide (ré-extraction jamais
    // faite, ou faite avant ce script) sont retraités — évite de repayer l'appel IA pour rien.
    const where = force
        ? "WHERE c.ai_analyse_raw IS NOT NULL"
        : "WHERE c.ai_analyse_raw IS NOT NULL AND (a.json_data IS NULL OR a.id IS NULL)";
    const rows = await pgDb.all(`
        SELECT c.id, c.objet, c.ai_analyse_raw, c.ai_analyse_score, c.ai_analyse_document_id,
               d.file_name AS document_name
        FROM hub_contrats.contrats c
        LEFT JOIN hub_contrats.contrat_analyses_ia a ON a.contrat_id = c.id
        LEFT JOIN hub_contrats.contrat_documents d ON d.id = c.ai_analyse_document_id
        ${where}
        ORDER BY c.id
    `);

    console.log(`${rows.length} analyse(s) à structurer${force ? ' (--force : toutes, même déjà structurées)' : ' (json_data encore vide uniquement)'}${dryRun ? ' — DRY RUN' : ''}.\n`);

    let ok = 0, failed = 0, empty = 0;
    for (let i = 0; i < rows.length; i++) {
        const c = rows[i];
        const label = `[${i + 1}/${rows.length}] #${c.id} — ${c.objet || '(sans objet)'}`;
        if (dryRun) { console.log(`${label} : dry-run, rien fait.`); continue; }
        try {
            const structuredData = await extractStructuredAnalyseData(c.ai_analyse_raw, cfg.contrat_analyse_apm_model || undefined, cfg);
            if (!structuredData) {
                console.warn(`${label} : structuration vide (réponse IA non exploitable) — sauté.`);
                empty++;
            } else {
                await upsertAnalyseIaRow(pgDb, {
                    contratId: c.id, documentId: c.ai_analyse_document_id, documentName: c.document_name,
                    rawText: c.ai_analyse_raw, structuredData, score: c.ai_analyse_score,
                    model: cfg.contrat_analyse_apm_model || null, source: cfg.contrat_analyse_ai_source !== 'local' ? 'apm' : 'local',
                });
                console.log(`${label} : OK (${Object.keys(structuredData).length} champs).`);
                ok++;
            }
        } catch (error) {
            console.error(`${label} : ÉCHEC — ${error.message}`);
            failed++;
        }
        if (delayMs > 0 && i < rows.length - 1) await sleep(delayMs);
    }

    console.log('\n================ RÉSUMÉ ================');
    console.log(`OK: ${ok}   Vides: ${empty}   Échecs: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
