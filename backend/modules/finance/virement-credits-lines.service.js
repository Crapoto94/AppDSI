const oracledb = require('oracledb');
const financeShare = require('./finance-share.controller');

// Lignes d'exécution budgétaires lues EN DIRECT dans SEDIT (schéma FI) :
//   FI.IMPUTATION  = la ligne (sens, section, chapitre, fonction, nature, opération, service gestionnaire)
//                    valide sur l'exercice si EXEDEBUT <= exercice <= EXEFIN (une ligne sans situation = 0 €, elle existe quand même).
//   FI.SITUBUDG    = situation de l'exercice (voté, prévision, engagé…) ; 2 lignes possibles par imputation
//                    (TYPEHISTO 1 et 2) qui se cumulent, l'exercice vient de FI.BUDANNU.EXERCICE (surtout pas de POBJ_EXTRACT : l'année y est parfois vide).
//   Disponible = voté - prévision (même formule que l'export « Liste des lignes d'exécution »).
// Périmètre : UNIQUEMENT les lignes que l'agent a le droit de modifier dans SEDIT (couples budget × service gestionnaire,
// accès 'M' de FI.DROITSER — voir sedit-droits.service.js). Sans périmètre fourni, aucune ligne n'est renvoyée.
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
   AND i.CODEFONC IS NOT NULL
   {{SCOPE}}
 ORDER BY i.CODECHAP, i.IMPUTATION`;

const clean = (v) => (v == null ? '' : String(v).trim());
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// services = [{ budgetRoo, budget, service }] : droits de modification de l'agent (getModifiableServices).
async function getLiveLines({ fiscalYear, allBudgets = false, services = [] } = {}) {
    const yr = Number(fiscalYear) || new Date().getFullYear();
    const allowed = allBudgets ? services : services.filter(s => String(s.budget).toUpperCase() === 'PRINCIPAL');
    if (!allowed.length) return [];
    // Un bloc « budget = :bN AND service IN (...) » par budget ; le ROO budget est repassé tel quel (CHAR) pour garder l'index.
    const binds = { yr };
    const byBudget = new Map();
    for (const s of allowed) {
        if (!byBudget.has(s.budgetRoo)) byBudget.set(s.budgetRoo, new Set());
        byBudget.get(s.budgetRoo).add(s.service);
    }
    const blocks = [];
    let n = 0;
    for (const [roo, set] of byBudget) {
        const names = [...set].map(code => { const k = `s${n++}`; binds[k] = code; return `:${k}`; });
        binds[`b${blocks.length}`] = roo;
        blocks.push(`(i.BUDGET = :b${blocks.length} AND TRIM(i.CODESERG) IN (${names.join(',')}))`);
    }
    const sql = SQL.replace('{{SCOPE}}', `AND (${blocks.join(' OR ')})`);
    const rows = await financeShare.withFinanceOracle(async (conn) => {
        const r = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 50000 });
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
