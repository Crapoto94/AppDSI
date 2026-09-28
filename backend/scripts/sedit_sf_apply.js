/**
 * Rattrapage : applique la synchro Sedit du service fait pour un workflow déjà
 * décidé (utile quand l'écriture Sedit a échoué au moment de la décision).
 * Fait la MÊME chose que syncServiceFaitToSedit : FACSUIVI + PV scellé (flag actif).
 *
 * Usage : node scripts/sedit_sf_apply.js <workflow_id>
 */
const { setupDb, pool } = require('../shared/database');
const controller = require('../modules/finance/service-fait/service-fait.controller');

(async () => {
    const workflowId = Number(process.argv[2]);
    if (!workflowId) throw new Error('Usage : node scripts/sedit_sf_apply.js <workflow_id>');

    await setupDb();
    const wf = (await pool.query('SELECT * FROM finance.service_fait_workflows WHERE id = $1', [workflowId])).rows[0];
    if (!wf) throw new Error(`Workflow ${workflowId} introuvable`);

    const decision = wf.status === 'valide_avec_reserves' ? 'valide_avec_reserves' : 'valide';
    const result = await controller.syncServiceFaitToSedit({ wf, decision, comment: wf.decision_comment || '' });
    console.log(JSON.stringify(result, null, 1));
    await pool.end();
    process.exit(result.errors && result.errors.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
