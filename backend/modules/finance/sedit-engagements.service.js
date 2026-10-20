// Engagements DSI lus EN DIRECT dans Sedit (Oracle FI) — voir skill "sedit-finances".
// Remplace l'ancien import Excel « Liste des engagements » : mêmes noms de colonnes,
// donc les consommateurs (finance, budget-prep, contrats) agrègent comme avant.
//
// Une ligne = une ligne de mouvement (FI.MVTLIGNE). L'avancement (FI.AVANCEMENT.CLEACCES) distingue
// les lignes « E1 » (solde restant engagé) des lignes « TR » (réalisé) : « Reste engagé » = montant des lignes E1.
const oracledb = require('oracledb');
const financeShare = require('./finance-share.controller');

const n = (v) => Number(v) || 0;

const SQL = `
SELECT TRIM(m.MOUVEMENT) AS CODE, TRIM(m.LIBELLE) AS LIB_MVT, TRIM(l.LIBELLE) AS LIB_LIGNE,
       TRIM(av.CLEACCES) AS AVANCEMENT, TRIM(ba.EXERCICE) AS EXERCICE,
       TRIM(imp.IMPUTATION) AS IMPUTATION, TRIM(imp.TYPE_SECTION) AS SECTION,
       TRIM(imp.CODECOMP) AS NATURE, TRIM(imp.CODECHAP) AS CHAPITRE, TRIM(imp.CODEFONC) AS FONCTION,
       TRIM(sg.CLEACCES) AS SERVICE,
       TRIM(REGEXP_SUBSTR(t.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2)) AS TIERS_NOM,
       (SELECT MAX(TRIM(c.COMMANDE)) FROM FI.COMMANDE c WHERE TRIM(c.MOUVEMENT) = TRIM(m.ROO_IMA_REF)) AS COMMANDE,
       l.MONTANTTC_E AS MONTANT_TTC
FROM FI.MVTLIGNE l
JOIN FI.MOUVEMENT m  ON TRIM(m.ROO_IMA_REF) = TRIM(l.MOUVEMENT)
JOIN FI.BUDANNU ba   ON TRIM(ba.ROO_IMA_REF) = TRIM(m.BUDANNU)
JOIN FI.SERVICEFI sg ON TRIM(sg.ROO_IMA_REF) = TRIM(l.SERVGEST)
LEFT JOIN FI.AVANCEMENT av ON TRIM(av.ROO_IMA_REF) = TRIM(l.AVANCEMENT)
LEFT JOIN FI.IMPUTATION imp ON TRIM(imp.ROO_IMA_REF) = TRIM(l.IMPUTATION)
LEFT JOIN FI.TIERS t ON TRIM(t.ROO_IMA_REF) = TRIM(l.TIERS)
WHERE ba.EXERCICE = :exercice
  AND TRIM(sg.CLEACCES) LIKE 'BF%'
  AND TRIM(m.SENSMVT) = 'D'`;

/** Lignes d'engagement DSI d'un exercice, avec les noms de colonnes de l'ancien export Excel. */
async function readEngagementRows(exercice) {
    const ex = parseInt(exercice, 10) || new Date().getFullYear();
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(SQL, { exercice: ex }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return r.rows;
    });
    return rows.map(r => {
        const montant = n(r.MONTANT_TTC);
        return {
            'Code mouvement': r.CODE || '',
            'Libellé mouvement': r.LIB_MVT || '',
            'Libellé': r.LIB_LIGNE || '',
            'Avancement': r.AVANCEMENT || '',
            'Exercice': String(r.EXERCICE || ''),
            'Imputation': r.IMPUTATION || '',
            'Section': r.SECTION || '',
            'Article par nature': r.NATURE || '',
            'Chapitre par nature': r.CHAPITRE || '',
            'Référence Fonctionnelle': r.FONCTION || '',
            'Service Gestionnaire': r.SERVICE || '',
            'Nom tiers': r.TIERS_NOM || '',
            'Commande': r.COMMANDE || '',
            'Montant TTC': montant,
            'Reste engagé': r.AVANCEMENT === 'E1' ? montant : 0,
        };
    });
}

module.exports = { readEngagementRows };
