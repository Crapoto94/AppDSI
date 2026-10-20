// Synthèse budgétaire lue EN DIRECT dans Sedit (Oracle FI) — voir skill "sedit-finances".
// Périmètre DSI : services dont le code commence par BF.
// Section › Chapitre › Nature › Service gestionnaire : voté, disponible, engagé, en cours d'engagement.
//
// Les étapes SITUBUDG sont cumulatives (prévision ⊇ pré-engagé ⊇ engagé) :
//   disponible            = voté − prévision      (ex. voté 20000 − prévision 15189,35 = 4810,65)
//   engagé                = ENGAGE_E
//   en cours d'engagement = PREENGAG_E − ENGAGE_E (commandes/pré-engagements pas encore engagés)
const oracledb = require('oracledb');
const financeShare = require('./finance-share.controller');
const { pool } = require('../../shared/database');
const { listCommandesExercice } = require('../demandes-commande/sedit-commandes.service');

const SQL = (principalOnly) => `
SELECT TRIM(i.TYPE_SECTION) AS SECTION,
       TRIM(i.CODECHAP)     AS CHAPITRE,
       TRIM(i.CODECOMP)     AS NATURE,
       TRIM(i.CODESERG)     AS SERVICE,
       MIN(TRIM(sv.LIBELLE)) AS SERVICE_LIBELLE,
       SUM(s.TOTALVOTE_E) AS VOTE,
       SUM(s.PREVISION_E) AS PREVISION,
       SUM(s.PREENGAG_E)  AS PREENGAGE,
       SUM(s.ENGAGE_E)    AS ENGAGE,
       SUM(s.MANDAT_E)    AS MANDATE
FROM FI.SITUBUDG s
JOIN FI.IMPUTATION i ON TRIM(i.ROO_IMA_REF) = TRIM(s.IMPUTATION)
JOIN FI.BUDANNU ba   ON TRIM(ba.ROO_IMA_REF) = TRIM(s.BUDANNU)
JOIN FI.BUDGET bg    ON TRIM(bg.ROO_IMA_REF) = TRIM(ba.BUDGET)
LEFT JOIN FI.SERVICEFI sv ON TRIM(sv.CLEACCES) = TRIM(i.CODESERG)
WHERE ba.EXERCICE = :exercice
  AND TRIM(i.TYPE_SENS) = 'D'
  AND TRIM(i.CODESERG) LIKE 'BF%'
  AND TRIM(i.TYPE_SECTION) IN ('F','I')
  AND (TRIM(i.CODEFONC) IS NOT NULL OR UPPER(TRIM(bg.LIBELLE)) <> 'PRINCIPAL')
  ${principalOnly ? "AND TRIM(bg.BUDGET) = '00'" : ''}
GROUP BY TRIM(i.TYPE_SECTION), TRIM(i.CODECHAP), TRIM(i.CODECOMP), TRIM(i.CODESERG)
ORDER BY 1, 2, 3, 4`;

const n = (v) => Number(v) || 0;

/**
 * Demandes de commande pas encore commandées, à ajouter à « en cours d'engagement » :
 *  - demande associée à une commande Sedit → rien à ajouter (la commande, au montant de la commande, est déjà
 *    dans le pré-engagé Sedit) ;
 *  - demande sans commande dont le montant est EXACTEMENT celui d'une commande DSI non associée → c'est que
 *    la commande n'est pas encore rattachée à la demande : on ignore la demande (pas de doublon) ;
 *  - sinon la demande compte pour son montant, sur sa section (F/I).
 */
async function getDemandesEnCours(exercice) {
    try {
        const dem = (await pool.query(
            `SELECT id, designation, montant, section, commande_roo FROM finance.demandes_commande
              WHERE EXTRACT(YEAR FROM created_at) = $1 ORDER BY created_at, id`, [exercice]
        )).rows;
        const associated = new Set((await pool.query(
            `SELECT TRIM(commande_roo) AS roo FROM finance.demandes_commande WHERE commande_roo IS NOT NULL`
        )).rows.map(r => r.roo));
        const free = (await listCommandesExercice(exercice))
            .filter(c => !associated.has(String(c.ROO).trim()))
            .map(c => ({ montant: n(c.MONTANT_TTC), used: false }));
        const out = [];
        for (const d of dem) {
            if (d.commande_roo) continue;
            const montant = n(d.montant);
            const twin = free.find(c => !c.used && Math.abs(c.montant - montant) < 0.005);
            if (twin) { twin.used = true; continue; }
            out.push({ id: d.id, designation: d.designation, section: d.section || '', montant });
        }
        return out;
    } catch (e) {
        console.error('[Finance] getDemandesEnCours:', e.message);
        return [];
    }
}

async function getBudgetSynthese({ exercice, scope }) {
    const ex = parseInt(exercice, 10) || new Date().getFullYear();
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(SQL(scope === 'Ville'), { exercice: ex }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return r.rows;
    });
    const demandes = await getDemandesEnCours(ex);
    return {
        exercice: ex,
        scope: scope === 'Ville' ? 'Ville' : 'All',
        demandes_count: demandes.length,
        rows: [...rows.map(r => {
            const vote = n(r.VOTE), prevision = n(r.PREVISION), preengage = n(r.PREENGAGE), engage = n(r.ENGAGE);
            return {
                section: r.SECTION,
                chapitre: r.CHAPITRE || '',
                nature: r.NATURE || '',
                service: r.SERVICE || '',
                service_libelle: r.SERVICE_LIBELLE || '',
                vote,
                disponible: vote - prevision,
                engage,
                en_cours: preengage - engage,
                mandate: n(r.MANDATE),
            };
        }), ...demandes.map(d => ({
            section: d.section, chapitre: 'DEMANDES', nature: '', service: '', service_libelle: '',
            vote: 0, disponible: 0, engage: 0, en_cours: d.montant, mandate: 0, source: 'demande',
            demande_id: d.id, demande_designation: d.designation,
        }))],
    };
}

// Lignes d'exécution DSI en direct (même colonnes que l'ancien import Excel « Liste des lignes d'exécution »).
const LINES_SQL = (principalOnly) => `
SELECT TRIM(i.IMPUTATION) AS CODE, MIN(TRIM(i.LIBELLE)) AS LIBELLE,
       TRIM(i.TYPE_SECTION) AS SECTION, TRIM(i.CODECHAP) AS CHAPITRE, TRIM(i.CODECOMP) AS NATURE,
       TRIM(i.CODEFONC) AS FONCTION, TRIM(i.CODEOPER) AS OPERATION, TRIM(i.CODESERG) AS SERVICE,
       SUM(s.TOTALVOTE_E) AS VOTE, SUM(s.PREVISION_E) AS PREVISION, SUM(s.PREENGAG_E) AS PREENGAGE,
       SUM(s.ENGAGE_E) AS ENGAGE, SUM(s.FACTURE_E) AS FACTURE, SUM(s.PREMANDAT_E) AS PREMANDAT,
       SUM(s.MANDAT_E) AS MANDAT, SUM(s.TRESORERIE_E) AS TRESORERIE
FROM FI.SITUBUDG s
JOIN FI.IMPUTATION i ON TRIM(i.ROO_IMA_REF) = TRIM(s.IMPUTATION)
JOIN FI.BUDANNU ba   ON TRIM(ba.ROO_IMA_REF) = TRIM(s.BUDANNU)
JOIN FI.BUDGET bg    ON TRIM(bg.ROO_IMA_REF) = TRIM(ba.BUDGET)
WHERE ba.EXERCICE = :exercice
  AND TRIM(i.TYPE_SENS) = 'D'
  AND TRIM(i.CODESERG) LIKE 'BF%'
  AND TRIM(i.TYPE_SECTION) IN ('F','I')
  AND (TRIM(i.CODEFONC) IS NOT NULL OR UPPER(TRIM(bg.LIBELLE)) <> 'PRINCIPAL')
  ${principalOnly ? "AND TRIM(bg.BUDGET) = '00'" : ''}
GROUP BY i.ROO_IMA_REF, TRIM(i.IMPUTATION), TRIM(i.TYPE_SECTION), TRIM(i.CODECHAP), TRIM(i.CODECOMP),
         TRIM(i.CODEFONC), TRIM(i.CODEOPER), TRIM(i.CODESERG)
ORDER BY 4, 1`;

async function getBudgetLines({ exercice, scope }) {
    const ex = parseInt(exercice, 10) || new Date().getFullYear();
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(LINES_SQL(scope === 'Ville'), { exercice: ex }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return r.rows;
    });
    return rows.map(r => ({
        'Code': r.CODE || '',
        'Libellé': r.LIBELLE || '',
        'Masque': [r.CHAPITRE, r.FONCTION, r.NATURE].filter(Boolean).join('-'),
        'Sens': 'D',
        'Section': r.SECTION || '',
        'Article par nature': r.NATURE || '',
        'Chapitre par nature': r.CHAPITRE || '',
        'Référence Fonctionnelle': r.FONCTION || '',
        "Opération d'équipement": r.OPERATION || '',
        'Service Gestionnaire': r.SERVICE || '',
        'Budget voté': n(r.VOTE),
        'Disponible': n(r.VOTE) - n(r.PREVISION),
        'Mt. prévision': n(r.PREVISION),
        'Mt. pré-engagé': n(r.PREENGAGE),
        'Mt. engagé': n(r.ENGAGE),
        'Mt. facturé': n(r.FACTURE),
        'Mt. pré-mandaté': n(r.PREMANDAT),
        'Mt. mandaté': n(r.MANDAT),
        'Mt. payé': n(r.TRESORERIE),
    }));
}

module.exports = { getBudgetSynthese, getBudgetLines };
