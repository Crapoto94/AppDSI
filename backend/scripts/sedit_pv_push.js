/**
 * (Re)génère et pousse dans Sedit le PV scellé d'un workflow de service fait
 * déjà décidé. Utile pour rattraper un PV manquant ou mal encodé.
 *
 * Usage : node scripts/sedit_pv_push.js <workflow_id> [--undo-first]
 */
const { setupDb, pool } = require('../shared/database');
const seditPj = require('../modules/finance/service-fait/sedit-pj.service');

const DECISION_LABELS = {
    valide: 'Validé',
    valide_avec_reserves: 'Validé avec réserves',
    non_valide: 'Non validé',
    ne_me_concerne_pas: 'Ne me concerne pas',
};

(async () => {
    const workflowId = Number(process.argv[2]);
    const undoFirst = process.argv.includes('--undo-first');
    if (!workflowId) throw new Error('Usage : node scripts/sedit_pv_push.js <workflow_id> [--undo-first]');

    await setupDb();

    if (undoFirst) {
        const prev = (await pool.query(
            `SELECT id FROM finance.sedit_write_log
             WHERE workflow_id = $1 AND action = 'facture_pj' AND status IN ('applied', 'pending')
             ORDER BY id DESC LIMIT 1`, [workflowId]
        )).rows[0];
        if (prev) {
            await seditPj.undoSeditWrite(prev.id, 'APPDSI');
            console.log(`Undo du PV précédent (log #${prev.id}) effectué.`);
        }
    }

    const wf = (await pool.query('SELECT * FROM finance.service_fait_workflows WHERE id = $1', [workflowId])).rows[0];
    if (!wf) throw new Error(`Workflow ${workflowId} introuvable`);

    const pjRes = await pool.query(
        `SELECT file_path, original_name FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1 ORDER BY uploaded_at`,
        [wf.id]
    );
    const sourceFiles = [];
    for (const p of pjRes.rows) {
        sourceFiles.push({ buffer: await seditPj.readStorageBuffer(p.file_path), originalname: p.original_name });
    }

    const pv = await seditPj.buildSealedServiceFaitPv({
        workflow: wf,
        decisionLabel: DECISION_LABELS[wf.status] || wf.status,
        comment: wf.decision_comment,
        verifierName: wf.verifier_name || wf.verifier_username,
        verifierEmail: wf.verifier_email,
        decisionAt: wf.decision_at || new Date(),
        sourceFiles,
    });

    const originalName = `PV_ServiceFait_${wf.invoice_ref || wf.id}_SF-${wf.id}.pdf`;
    const attached = await seditPj.attachServiceFaitPv({
        invoiceRef: wf.invoice_ref, workflowId: wf.id, buffer: pv.buffer, originalName, actor: wf.verifier_username,
    });

    console.log(JSON.stringify({ workflow: wf.id, invoice: wf.invoice_ref, status: wf.status, pvSize: pv.buffer.length, seal: pv.seal.serial, attached }, null, 1));
    await pool.end();
    process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
