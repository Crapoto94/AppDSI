/**
 * Mandatement d'une facture — lecture directe Sedit (Oracle FI).
 *
 * Chemin : FACTURE -> FI.FAIT (FACTURE_ID_CS = facture.ROO_IMA_REF) qui porte
 * MANDAT_ID_CS / BORDEREAU_ID_CS / MANDAT_TYPE (« NORM » = mandat ordinaire), puis
 * FI.MANDAT (n° pièce, dates, montant), FI.BORDEREAU (n° bord, date d'émission) et
 * FI.WO_MANDOBJET (libellés d'objet ; NS_SOURCE = mandat.ROO_IMA_REF).
 *
 * Vérifié sur F26007017 : mandat 7561, bord 600, objet « Fac n°2026111 du 02/07/2026 »,
 * montant 3 163,37 €, paiement 07/08/2026.
 */
const oracledb = require('oracledb');
const financeShare = require('./finance-share.controller');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const MANDAT_TYPE_LABELS = {
    NORM: 'Mandat ordinaire',
    REDU: 'Mandat de réduction',
    REJE: 'Mandat rejeté',
    RERE: 'Ré-émission',
};

function trim(v) { return v == null ? null : String(v).trim(); }

/** Tous les mandatements (mandats) rattachés à une facture (n° interne Sedit). */
async function getMandatementByFacture(numero) {
    const n = String(numero || '').trim();
    if (!n) return { numero: n, mandats: [] };

    return financeShare.withFinanceOracle(async (conn) => {
        const fRes = await conn.execute(`SELECT TRIM(ROO_IMA_REF) AS ROO FROM FI.FACTURE WHERE TRIM(FACTURE) = :n`, { n });
        if (!fRes.rows.length) return { numero: n, mandats: [] };
        const factureRoo = trim(fRes.rows[0].ROO);

        const faits = await conn.execute(
            `SELECT DISTINCT TRIM(MANDAT_ID_CS) AS MANDAT_ROO, TRIM(BORDEREAU_ID_CS) AS BORD_ROO, TRIM(MANDAT_TYPE) AS MANDAT_TYPE
             FROM FI.FAIT WHERE TRIM(FACTURE_ID_CS) = :r`, { r: factureRoo }
        );

        const mandats = [];
        for (const row of faits.rows) {
            if (!row.MANDAT_ROO) continue;
            const mRes = await conn.execute(
                `SELECT MANDAT, DATMANDAT, DATINDIGO, DATE_PAIEMENT, MONTANTTC_E, TRIM(BORDEREAU) AS BORD_ROO,
                        REJET, MANDREJETE
                 FROM FI.MANDAT WHERE TRIM(ROO_IMA_REF) = :r`, { r: row.MANDAT_ROO }
            );
            if (!mRes.rows.length) continue;
            const md = mRes.rows[0];

            const bordRoo = row.BORD_ROO || trim(md.BORD_ROO);
            let bord = null, dateTransmission = trim(md.DATINDIGO);
            if (bordRoo) {
                const bRes = await conn.execute(
                    `SELECT BORDEREAU, DATEMISS FROM FI.BORDEREAU WHERE TRIM(ROO_IMA_REF) = :r`, { r: bordRoo }
                );
                if (bRes.rows.length) {
                    bord = bRes.rows[0].BORDEREAU;
                    dateTransmission = bRes.rows[0].DATEMISS || dateTransmission;
                }
            }

            const oRes = await conn.execute(
                `SELECT LIGNE, LIBELLE FROM FI.WO_MANDOBJET WHERE TRIM(NS_SOURCE) = :r ORDER BY LIGNE`, { r: row.MANDAT_ROO }
            );

            mandats.push({
                mandat_roo: row.MANDAT_ROO,
                type: MANDAT_TYPE_LABELS[row.MANDAT_TYPE] || row.MANDAT_TYPE || '',
                objet: oRes.rows.map((o) => trim(o.LIBELLE)).filter(Boolean).join(' ; '),
                bord: bord,
                piece: md.MANDAT,
                date_emission: md.DATMANDAT || null,
                date_transmission: dateTransmission || null,
                date_paiement: md.DATE_PAIEMENT || null,
                montant: md.MONTANTTC_E != null ? Number(md.MONTANTTC_E) : null,
                rejete: trim(md.REJET) === 'O' || trim(md.MANDREJETE) === 'O',
            });
        }
        return { numero: n, mandats };
    });
}

module.exports = { getMandatementByFacture, MANDAT_TYPE_LABELS };
