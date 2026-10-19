const oracledb = require('oracledb');
const financeShare = require('./finance-share.controller');

// Lignes d'exécution budgétaires lues EN DIRECT dans SEDIT (schéma FI) :
//   FI.IMPUTATION  = la ligne (sens, section, chapitre, fonction, nature, opération, service gestionnaire)
//                    valide sur l'exercice si EXEDEBUT <= exercice <= EXEFIN (une ligne sans situation = 0 €, elle existe quand même).
//   FI.SITUBUDG    = situation de l'exercice (voté, prévision, engagé…) ; 2 lignes possibles par imputation
//                    (TYPEHISTO 1 et 2) qui se cumulent, l'exercice vient de FI.BUDANNU.EXERCICE (surtout pas de POBJ_EXTRACT : l'année y est parfois vide).
//   Disponible = voté - prévision (même formule que l'export « Liste des lignes d'exécution »).
// Périmètre DSI : service gestionnaire dont le code commence par « BF » (BF1 Direction DSI, BF8 Bureau des projets…).
// Les imputations sans fonction (« DEFAUT », « Opération d'équipement ») sont des lignes de regroupement qui
// doublonnent la ligne complète (mêmes montants) : exclues.
// Lecture seule. Renvoie les mêmes clés que GET /api/budget/lines (export Excel) pour que l'UI soit inchangée.

const SQL = `
SELECT TRIM(i.IMPUTATION) AS CODE, i.LIBELLE, i.TYPE_SENS AS SENS, i.TYPE_SECTION AS SECTION,
       TRIM(i.CODECOMP) AS ARTICLE, TRIM(i.CODECHAP) AS CHAPITRE, TRIM(i.CODEFONC) AS FONCTION,
       TRIM(i.CODEOPER) AS OPERATION, TRIM(i.CODESERG) AS SERVGEST, TRIM(i.CODEDIV1) AS EQUIPEMENT,
       TRIM(bu.LIBELLE) AS BUDGET_LIBELLE,
       sb.VOTE, sb.PREVISION, sb.PREENGAGE, sb.ENGAGE
  FROM FI.IMPUTATION i
  JOIN FI.BUDGET bu ON bu.ROO_IMA_REF = i.BUDGET
  LEFT JOIN (
        SELECT s.IMPUTATION, SUM(s.TOTALVOTE_E) AS VOTE, SUM(s.PREVISION_E) AS PREVISION,
               SUM(s.PREENGAG_E) AS PREENGAGE, SUM(s.ENGAGE_E) AS ENGAGE
          FROM FI.SITUBUDG s
          JOIN FI.BUDANNU ba ON ba.ROO_IMA_REF = s.BUDANNU
         WHERE ba.EXERCICE = :yr
         GROUP BY s.IMPUTATION
       ) sb ON sb.IMPUTATION = i.ROO_IMA_REF
 WHERE i.EXEDEBUT <= :yr AND i.EXEFIN >= :yr
   AND i.CODESERG LIKE 'BF%'
   AND i.CODEFONC IS NOT NULL
   {{SCOPE}}
 ORDER BY i.CODECHAP, i.IMPUTATION`;

const clean = (v) => (v == null ? '' : String(v).trim());
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function getLiveLines({ fiscalYear, allBudgets = false } = {}) {
    const yr = Number(fiscalYear) || new Date().getFullYear();
    // Périmètre « Ville » = budget principal (les budgets annexes ont d'autres libellés).
    const sql = SQL.replace('{{SCOPE}}', allBudgets ? '' : "AND UPPER(TRIM(bu.LIBELLE)) = 'PRINCIPAL'");
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(sql, { yr }, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 50000 });
        return r.rows || [];
    });
    return rows.map(r => ({
        Code: clean(r.CODE),
        'Libellé': clean(r.LIBELLE),
        Masque: '',
        Sens: clean(r.SENS),
        Section: clean(r.SECTION),
        'Article par nature': clean(r.ARTICLE),
        'Chapitre par nature': clean(r.CHAPITRE),
        'Référence Fonctionnelle': clean(r.FONCTION),
        "Opération d'équipement": clean(r.OPERATION),
        'Service Gestionnaire': clean(r.SERVGEST),
        EQUIPEMENT: clean(r.EQUIPEMENT) || '-',
        TVA: '-',
        JE: '-',
        'Budget voté': money(r.VOTE),
        Disponible: money((Number(r.VOTE) || 0) - (Number(r.PREVISION) || 0)),
        'Mt. prévision': money(r.PREVISION),
        'Mt. pré-engagé': money(r.PREENGAGE),
        'Mt. engagé': money(r.ENGAGE),
        'Mt. facturé': 0, 'Mt. pré-mandaté': 0, 'Mt. mandaté': 0, 'Mt. payé': 0,
    }));
}

module.exports = { getLiveLines };
