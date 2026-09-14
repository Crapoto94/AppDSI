/**
 * Remplit une fois hub_contrats.contrat_analyses_ia (table structurée servant la vue globale
 * /contrats/analyses-ia) à partir des analyses IA déjà enregistrées sur hub_contrats.contrats
 * (colonnes ai_analyse_raw/ai_analyse_json/ai_analyse_score, notamment celles produites par le
 * batch initial scripts/batch_analyse_contrats.js). Idempotent : une ligne déjà présente pour
 * un contrat est ignorée sauf --force.
 *
 * Usage :
 *   node scripts/backfill_contrat_analyses_ia.js [--force]
 */
const db = require('../shared/database');
const { upsertAnalyseIaRow } = require('../shared/contrat_analyse');

const force = process.argv.includes('--force');

(async () => {
    await db.setupDb();
    const { pgDb } = db;

    const where = force ? '' : `WHERE NOT EXISTS (SELECT 1 FROM hub_contrats.contrat_analyses_ia a WHERE a.contrat_id = c.id)`;
    const contrats = await pgDb.all(`
        SELECT c.id, c.objet, c.ai_analyse_raw, c.ai_analyse_json, c.ai_analyse_score, c.ai_analyse_document_id, c.ai_analyse_at,
               d.file_name AS document_name
        FROM hub_contrats.contrats c
        LEFT JOIN hub_contrats.contrat_documents d ON d.id = c.ai_analyse_document_id
        ${where}${where ? ' AND' : 'WHERE'} c.ai_analyse_at IS NOT NULL
        ORDER BY c.id
    `);

    console.log(`${contrats.length} contrat(s) analysé(s) à intégrer dans hub_contrats.contrat_analyses_ia${force ? ' (--force : réintègre tout)' : ' (nouveaux uniquement)'}.\n`);

    let ok = 0, failed = 0;
    for (const c of contrats) {
        try {
            const parsedJson = c.ai_analyse_json && typeof c.ai_analyse_json === 'object' ? c.ai_analyse_json : null;
            await upsertAnalyseIaRow(pgDb, {
                contratId: c.id,
                documentId: c.ai_analyse_document_id,
                documentName: c.document_name,
                rawText: c.ai_analyse_raw,
                parsedJson,
                score: c.ai_analyse_score,
                model: null,
                source: null,
            });
            console.log(`#${c.id} — ${c.objet || '(sans objet)'} : OK${c.ai_analyse_score != null ? ` (score ${c.ai_analyse_score}/100)` : ''}${parsedJson ? '' : ' (réponse Markdown libre — champs structurés non disponibles)'}`);
            ok++;
        } catch (error) {
            console.error(`#${c.id} — ${c.objet || '(sans objet)'} : ÉCHEC — ${error.message}`);
            failed++;
        }
    }

    console.log(`\n================ RÉSUMÉ ================\nOK: ${ok}   Échecs: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
