/**
 * Test de bout en bout de l'écriture Sedit d'un PV de service fait, sur la facture
 * réelle non critique F26008275, AVEC undo automatique :
 *
 *   1. FACSUIVI SERVICE_FAIT -> VALIDE (journalisé)
 *   2. PV scellé (AC interne) inséré comme PJ de la facture + fichier écrit sur le partage
 *   3. vérification (lignes Oracle + fichier + statut FACSUIVI)
 *   4. UNDO des deux écritures (restauration FACSUIVI + suppression PJ + fichier)
 *   5. vérification que tout est revenu à l'état initial
 *
 * Usage : node scripts/sedit_pv_test.js
 */
const path = require('path');
const { setupDb, pool } = require('../shared/database');
const { setupPgDb } = require('../shared/pg_db');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const seditPj = require('../modules/finance/service-fait/sedit-pj.service');
const financeShare = require('../modules/finance/finance-share.controller');

const NUMERO = 'F26008275';
const ACTOR = 'APPDSI';
const WORKFLOW_ID = 0; // synthétique (pas de workflow AppDSI réel)

async function makeFakeSourcePdf() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Piece justificative de test - source du service fait', { x: 50, y: 780, size: 13, font });
    page.drawText(`Facture ${NUMERO}`, { x: 50, y: 755, size: 11, font });
    page.drawText('Genere automatiquement par le test sedit_pv_test.js', { x: 50, y: 735, size: 9, font });
    return Buffer.from(await doc.save());
}

async function getPjRows(pjRoo, lnkRoo) {
    return financeShare.withFinanceOracle(async (conn) => {
        const pj = await conn.execute(
            `SELECT TRIM(ROO_IMA_REF) AS ROO, NOM_PJ, CHEMIN_FICHIER, TYPE_PIECE_ID, USAGE, SIGNED, TAILLE, FORMAT
             FROM FI.PJ_PES WHERE TRIM(ROO_IMA_REF) = :r`, { r: pjRoo }
        );
        const lnk = await conn.execute(
            `SELECT TRIM(ROO_IMA_REF) AS ROO, TRIM(OBJECT_ROO) AS OBJECT_ROO, TRIM(PJPES_ROO) AS PJPES_ROO, OBJECT_TYPE, ORIGINE, PRINCIPAL
             FROM FI.FIPES_OBJ_PJ WHERE TRIM(ROO_IMA_REF) = :r`, { r: lnkRoo }
        );
        const fs = await conn.execute(
            `SELECT fs.ETAT, fs.DATE_SERVICE_FAIT, TRIM(f.ROO_IMA_REF) AS FACTURE_ROO
             FROM FI.FACSUIVI fs JOIN FI.FACTURE f ON f.ROO_IMA_REF = fs.FACTURE
             WHERE fs.AVANCEMENT = 'SERVICE_FAIT' AND TRIM(f.FACTURE) = :n`, { n: NUMERO }
        );
        return { pj: pj.rows, lnk: lnk.rows, facsuivi: fs.rows };
    });
}

(async () => {
    const report = { steps: [] };
    let facsuiviLogId = null;
    let pvLogId = null;
    let pjRoo = null, lnkRoo = null, filePath = null;

    try {
        console.log('─'.repeat(72));
        console.log('INIT: SQLite + schéma Postgres (idempotent)...');
        await setupDb();
        await setupPgDb();
        console.log('OK');

        console.log('\n[0] État AVANT :');
        const before = await financeShare.withFinanceOracle(async (conn) => {
            const r = await conn.execute(
                `SELECT fs.ETAT, fs.DATE_SERVICE_FAIT, fs.UPDATOKEN
                 FROM FI.FACSUIVI fs JOIN FI.FACTURE f ON f.ROO_IMA_REF = fs.FACTURE
                 WHERE fs.AVANCEMENT='SERVICE_FAIT' AND TRIM(f.FACTURE)=:n`, { n: NUMERO });
            return r.rows[0];
        });
        console.log('   FACSUIVI SERVICE_FAIT =', JSON.stringify(before));

        // ── 1. FACSUIVI ──────────────────────────────────────────────────────
        console.log('\n[1] Écriture FACSUIVI (service fait -> VALIDE)...');
        const fsRes = await seditPj.updateServiceFaitDoneLogged({ invoiceRef: NUMERO, actorUsername: ACTOR, workflowId: WORKFLOW_ID });
        console.log('   résultat =', JSON.stringify(fsRes));
        facsuiviLogId = fsRes.logId || null;
        report.steps.push({ step: 'facsuivi', res: fsRes });

        // ── 2. PV scellé + PJ Sedit ─────────────────────────────────────────
        console.log('\n[2] Génération + scellement du PV...');
        const sourcePdf = await makeFakeSourcePdf();
        const workflow = {
            id: WORKFLOW_ID,
            invoice_ref: NUMERO,
            invoice_number: NUMERO,
            invoice_supplier: 'Test (OCD/Resah)',
            invoice_label: 'Test PV service fait — facture non critique',
            invoice_amount: 1234.56,
        };
        const pv = await seditPj.buildSealedServiceFaitPv({
            workflow,
            decisionLabel: 'Validé',
            comment: 'Service fait conforme — essai technique AppDSI (sera annulé).',
            verifierName: 'Testeur AppDSI',
            verifierEmail: 'appdsi@ivry94.fr',
            decisionAt: new Date(),
            sourceFiles: [{ buffer: sourcePdf, originalname: 'justificatif-test.pdf', mimetype: 'application/pdf' }],
        });
        console.log(`   PV scellé : ${pv.buffer.length} octets, sceau serial=${pv.seal.serial}`);
        console.log('   hash source :', JSON.stringify(pv.sourceHashes));

        console.log('\n[2b] Insertion de la PJ dans Sedit + écriture du fichier...');
        const attached = await seditPj.attachServiceFaitPv({
            invoiceRef: NUMERO,
            workflowId: WORKFLOW_ID,
            buffer: pv.buffer,
            originalName: `PV_ServiceFait_${NUMERO}_TEST.pdf`,
            actor: ACTOR,
        });
        pjRoo = attached.pjRoo; lnkRoo = attached.lnkRoo; filePath = attached.filePath;
        pvLogId = attached.logId;
        console.log('   PJ insérée =', JSON.stringify({ pjRoo, lnkRoo, filePath, logId: pvLogId }));
        report.steps.push({ step: 'attach', attached });

        // ── 3. Vérification ─────────────────────────────────────────────────
        console.log('\n[3] Vérification...');
        const rows = await getPjRows(pjRoo, lnkRoo);
        console.log('   PJ_PES        :', JSON.stringify(rows.pj));
        console.log('   FIPES_OBJ_PJ  :', JSON.stringify(rows.lnk));
        console.log('   FACSUIVI      :', JSON.stringify(rows.facsuivi));
        const docs = await financeShare.queryFactureDocuments(NUMERO);
        const visible = docs.some((d) => d.DOC_ID === pjRoo);
        console.log(`   visible via requête PJ de la facture : ${visible}`);
        const config = await financeShare.resolveShareConfig();
        const rel = financeShare.toRelativePath(config, filePath);
        const smb = require('../shared/smb_client');
        const fileBack = await smb.readFileRel(config, rel);
        console.log(`   fichier relu depuis le partage : ${fileBack ? fileBack.length + ' octets' : 'ABSENT'}`);
        report.verify = { pjRows: rows.pj.length, lnkRows: rows.lnk.length, facsuiviEtat: rows.facsuivi[0] && rows.facsuivi[0].ETAT, visible, fileSize: fileBack ? fileBack.length : 0 };

        const ok = rows.pj.length === 1 && rows.lnk.length === 1 && visible && fileBack
            && String(rows.facsuivi[0].ETAT).trim() === 'VALIDE';
        console.log(`\n>>> VÉRIFICATION ÉCRITURE : ${ok ? 'OK' : 'ÉCHEC'}`);
        report.writeOk = ok;

    } catch (e) {
        console.error('\nERREUR pendant le test:', e.message);
        report.error = e.message;
    } finally {
        // ── 4. UNDO ────────────────────────────────────────────────────────
        console.log('\n[4] UNDO des écritures Sedit...');
        const undone = [];
        if (pvLogId) {
            try { undone.push(await seditPj.undoSeditWrite(pvLogId, ACTOR)); console.log('   undo PJ      :', JSON.stringify(undone[undone.length - 1])); }
            catch (e) { console.error('   undo PJ ÉCHEC :', e.message); }
        }
        if (facsuiviLogId) {
            try { undone.push(await seditPj.undoSeditWrite(facsuiviLogId, ACTOR)); console.log('   undo FACSUIVI:', JSON.stringify(undone[undone.length - 1])); }
            catch (e) { console.error('   undo FACSUIVI ÉCHEC :', e.message); }
        }
        report.undone = undone;

        // ── 5. Vérification de l'undo ───────────────────────────────────────
        console.log('\n[5] Vérification après undo...');
        try {
            const rows = pjRoo ? await getPjRows(pjRoo, lnkRoo) : { pj: [], lnk: [] };
            const fs = await financeShare.withFinanceOracle(async (conn) => {
                const r = await conn.execute(
                    `SELECT fs.ETAT, TRIM(f.ROO_IMA_REF) AS FACTURE_ROO
                     FROM FI.FACSUIVI fs JOIN FI.FACTURE f ON f.ROO_IMA_REF = fs.FACTURE
                     WHERE fs.AVANCEMENT='SERVICE_FAIT' AND TRIM(f.FACTURE)=:n`, { n: NUMERO });
                return r.rows[0];
            });
            let fileGone = true;
            if (filePath) {
                try {
                    const config = await financeShare.resolveShareConfig();
                    const rel = financeShare.toRelativePath(config, filePath);
                    const back = await require('../shared/smb_client').readFileRel(config, rel);
                    fileGone = !back;
                } catch { fileGone = true; }
            }
            console.log(`   PJ supprimées : ${rows.pj.length === 0 && rows.lnk.length === 0}`);
            console.log(`   fichier supprimé : ${fileGone}`);
            console.log(`   FACSUIVI restauré : ETAT=${fs && fs.ETAT}`);
            report.undoOk = rows.pj.length === 0 && rows.lnk.length === 0 && fileGone && String(fs.ETAT).trim() === 'EN_COURS';
        } catch (e) {
            console.error('   vérification undo ERREUR :', e.message);
            report.undoOk = false;
        }

        console.log('\n' + '─'.repeat(72));
        console.log('RAPPORT:', JSON.stringify({ writeOk: report.writeOk, undoOk: report.undoOk, error: report.error || null }, null, 1));
        console.log('─'.repeat(72));
        try { await pool.end(); } catch (e) { /* ignore */ }
        process.exit(report.writeOk && report.undoOk ? 0 : 1);
    }
})();
