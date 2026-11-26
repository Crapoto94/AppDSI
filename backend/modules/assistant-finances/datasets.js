/**
 * Catalogue des données Sedit Finances que l'assistant peut interroger.
 *
 * Tout le SQL est écrit ici : l'IA ne produit jamais de SQL, seulement le nom d'une source, de mesures,
 * de regroupements et de filtres, vérifiés contre ce catalogue. Les valeurs saisies passent en variables liées.
 *
 * Chaque source déclare comment lui appliquer le périmètre de l'agent (couples budget × service gestionnaire) :
 *   - « imputation » : le service est celui de la ligne budgétaire (FI.IMPUTATION.CODESERG, code du service) ;
 *   - « service »    : le service est porté par la pièce (colonne *_SERV* = ROO du service).
 * Une pièce sans service renseigné n'est visible de personne.
 */
const TIERS_NOM = (a) => `TRIM(REGEXP_SUBSTR(${a}.POBJ_EXTRACT, '[^' || CHR(1) || ']+', 1, 2))`;
const BUDGET_DIM = { label: 'Budget', select: 'TRIM(bg.LIBELLE)' };
const { DIRECTIONS } = require('./referentiel');

const IMPUTATION_DIMS = {
    section: { label: 'Section', select: "DECODE(TRIM(i.TYPE_SECTION), 'F', 'Fonctionnement', 'I', 'Investissement', TRIM(i.TYPE_SECTION))" },
    sens: { label: 'Sens', select: "DECODE(TRIM(i.TYPE_SENS), 'D', 'Dépenses', 'R', 'Recettes', TRIM(i.TYPE_SENS))" },
    chapitre: { label: 'Chapitre', select: 'TRIM(i.CODECHAP)' },
    nature: { label: 'Nature', select: 'TRIM(i.CODECOMP)' },
    fonction: { label: 'Fonction', select: 'TRIM(i.CODEFONC)' },
    operation: { label: 'Opération', select: 'TRIM(i.CODEOPER)' },
    ligne: { label: 'Ligne budgétaire', select: "TRIM(i.IMPUTATION) || ' · ' || TRIM(i.LIBELLE)" },
};

const SOURCES = {
    // ─── Situation budgétaire (chiffres officiels : voté, engagé, mandaté…) ───
    budget: {
        label: 'Budget (situation budgétaire)',
        from: `FROM FI.SITUBUDG s
               JOIN FI.IMPUTATION i ON i.ROO_IMA_REF = s.IMPUTATION
               JOIN FI.BUDANNU ba ON ba.ROO_IMA_REF = s.BUDANNU
               JOIN FI.BUDGET bg ON bg.ROO_IMA_REF = ba.BUDGET`,
        // Même règle que la synthèse budgétaire d'AppDSI : sur le budget principal, les lignes sans fonction doublonnent le détail
        where: ["(TRIM(i.CODEFONC) IS NOT NULL OR UPPER(TRIM(bg.LIBELLE)) <> 'PRINCIPAL')"],
        scope: { mode: 'imputation', budget: 'bg.ROO_IMA_REF' },
        exercice: 'ba.EXERCICE',
        measures: {
            vote: { label: 'Budget voté', expr: 'SUM(s.TOTALVOTE_E)' },
            disponible: { label: 'Disponible', expr: 'SUM(s.TOTALVOTE_E) - SUM(s.PREVISION_E)' },
            prevision: { label: 'Prévision', expr: 'SUM(s.PREVISION_E)' },
            preengage: { label: 'Pré-engagé', expr: 'SUM(s.PREENGAG_E)' },
            engage: { label: 'Engagé', expr: 'SUM(s.ENGAGE_E)' },
            facture: { label: 'Facturé', expr: 'SUM(s.FACTURE_E)' },
            mandate: { label: 'Mandaté / titré', expr: 'SUM(s.MANDAT_E)' },
            paye: { label: 'Payé / encaissé', expr: 'SUM(s.TRESORERIE_E)' },
        },
        dims: { exercice: { label: 'Exercice', select: 'ba.EXERCICE' }, ...IMPUTATION_DIMS, service: { label: 'Service', select: 'TRIM(i.CODESERG)' }, budget: BUDGET_DIM },
        filters: { section: 'TRIM(i.TYPE_SECTION)', sens: 'TRIM(i.TYPE_SENS)', chapitre: 'TRIM(i.CODECHAP)', nature: 'TRIM(i.CODECOMP)', fonction: 'TRIM(i.CODEFONC)', texte: ['i.LIBELLE', 'i.IMPUTATION'] },
        defaults: { mesures: ['vote', 'mandate'], sens: 'D' },
    },

    // ─── Engagements (lignes de mouvement) ───
    engagements: {
        label: 'Engagements',
        from: `FROM FI.MVTLIGNE l
               JOIN FI.MOUVEMENT m ON m.ROO_IMA_REF = l.MOUVEMENT
               JOIN FI.BUDANNU ba ON ba.ROO_IMA_REF = m.BUDANNU
               JOIN FI.BUDGET bg ON bg.ROO_IMA_REF = ba.BUDGET
               JOIN FI.SERVICEFI sg ON sg.ROO_IMA_REF = l.SERVGEST
               LEFT JOIN FI.IMPUTATION i ON i.ROO_IMA_REF = l.IMPUTATION
               LEFT JOIN FI.AVANCEMENT av ON av.ROO_IMA_REF = l.AVANCEMENT
               LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = l.TIERS`,
        where: [],
        scope: { mode: 'service', budget: 'bg.ROO_IMA_REF', service: 'l.SERVGEST' },
        exercice: 'ba.EXERCICE',
        sensExpr: 'TRIM(m.SENSMVT)',
        measures: { montant: { label: 'Montant TTC', expr: 'SUM(l.MONTANTTC_E)' }, nombre: { label: 'Nombre d’engagements', expr: 'COUNT(DISTINCT m.ROO_IMA_REF)', count: true } },
        dims: {
            exercice: { label: 'Exercice', select: 'ba.EXERCICE' }, mois: { label: 'Mois', select: "TO_CHAR(m.DATE_CREAT, 'YYYY-MM')" },
            section: IMPUTATION_DIMS.section, chapitre: IMPUTATION_DIMS.chapitre, nature: IMPUTATION_DIMS.nature, ligne: IMPUTATION_DIMS.ligne,
            service: { label: 'Service', select: 'TRIM(sg.CLEACCES)' }, budget: BUDGET_DIM,
            tiers: { label: 'Tiers', select: TIERS_NOM('t') }, avancement: { label: 'Avancement', select: "NVL(TRIM(av.LIBELLE), '(non renseigné)')" },
        },
        filters: { section: 'TRIM(i.TYPE_SECTION)', chapitre: 'TRIM(i.CODECHAP)', nature: 'TRIM(i.CODECOMP)', fonction: 'TRIM(i.CODEFONC)', tiers: 't.POBJ_EXTRACT', texte: ['l.LIBELLE', 'm.LIBELLE'], numero: 'm.MOUVEMENT', montant: 'l.MONTANTTC_E' },
        flags: { en_cours: "TRIM(av.CLEACCES) IN ('E0', 'E1')" },
        list: {
            columns: [
                { key: 'NUM', label: 'Engagement', type: 'text' }, { key: 'LIBELLE', label: 'Libellé', type: 'text' }, { key: 'TIERS', label: 'Tiers', type: 'text' },
                { key: 'SERVICE', label: 'Service', type: 'text' }, { key: 'IMPUTATION', label: 'Imputation', type: 'text' },
                { key: 'AVANCEMENT', label: 'Avancement', type: 'text' }, { key: 'MONTANT', label: 'Montant TTC', type: 'money' },
            ],
            select: `TRIM(m.MOUVEMENT) AS NUM, TRIM(NVL(l.LIBELLE, m.LIBELLE)) AS LIBELLE, ${TIERS_NOM('t')} AS TIERS, TRIM(sg.CLEACCES) AS SERVICE,
                     TRIM(i.IMPUTATION) AS IMPUTATION, TRIM(av.LIBELLE) AS AVANCEMENT, l.MONTANTTC_E AS MONTANT, TRIM(m.ROO_IMA_REF) AS PJ_ID`,
            order: { montant: 'l.MONTANTTC_E', date: 'm.DATE_CREAT', defaut: 'm.DATE_CREAT' },
            total: 'l.MONTANTTC_E', tie: 'l.ROO_IMA_REF',
        },
        dateCol: 'm.DATE_CREAT',
        pj: { type: 'engagement', objectTypes: ['ENGAGEMENT'] },
        fiche: 'FicheMouvement.html?mouvementId=',
        defaults: { mesures: ['montant'], sens: 'D' },
        note: 'Somme des lignes de mouvement Sedit : le montant « engagé » officiel est celui de la situation budgétaire.',
    },

    // ─── Commandes ───
    commandes: {
        label: 'Commandes',
        from: `FROM FI.COMMANDE c
               JOIN FI.BUDANNU ba ON ba.ROO_IMA_REF = c.BUDANNU
               JOIN FI.BUDGET bg ON bg.ROO_IMA_REF = ba.BUDGET
               JOIN FI.SERVICEFI sg ON sg.ROO_IMA_REF = c.CMD_SERVGEST
               LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = c.TIERS`,
        where: ['c.DATE_REJET IS NULL'],
        scope: { mode: 'service', budget: 'bg.ROO_IMA_REF', service: 'c.CMD_SERVGEST' },
        exercice: 'ba.EXERCICE',
        measures: {
            montant: { label: 'Montant TTC', expr: 'SUM(c.MONTANT_TTC)' }, montant_ht: { label: 'Montant HT', expr: 'SUM(c.MONTANT_HT)' },
            nombre: { label: 'Nombre de commandes', expr: 'COUNT(*)', count: true },
        },
        dims: {
            exercice: { label: 'Exercice', select: 'ba.EXERCICE' }, mois: { label: 'Mois', select: "TO_CHAR(c.CMD_DATECOMMANDE, 'YYYY-MM')" },
            service: { label: 'Service', select: 'TRIM(sg.CLEACCES)' }, budget: BUDGET_DIM, tiers: { label: 'Tiers', select: TIERS_NOM('t') },
        },
        filters: { tiers: 't.POBJ_EXTRACT', texte: ['c.LIBELLE', 'c.CMD_COMMENTAIRE'], numero: 'c.COMMANDE', montant: 'c.MONTANT_TTC' },
        // Section / chapitre / nature : portés par les lignes de la commande
        lineFilter: (cond) => `EXISTS (SELECT 1 FROM FI.CMDLIGNE cl JOIN FI.IMPUTATION i ON i.ROO_IMA_REF = cl.IMPUTATION WHERE cl.COMMANDE = c.ROO_IMA_REF AND ${cond})`,
        lineFilters: { section: 'TRIM(i.TYPE_SECTION)', chapitre: 'TRIM(i.CODECHAP)', nature: 'TRIM(i.CODECOMP)', fonction: 'TRIM(i.CODEFONC)' },
        list: {
            columns: [
                { key: 'NUM', label: 'Commande', type: 'text' }, { key: 'DATE_', label: 'Date', type: 'date' }, { key: 'LIBELLE', label: 'Libellé', type: 'text' },
                { key: 'TIERS', label: 'Tiers', type: 'text' }, { key: 'SERVICE', label: 'Service', type: 'text' }, { key: 'MONTANT', label: 'Montant TTC', type: 'money' },
            ],
            select: `TRIM(c.COMMANDE) AS NUM, TO_CHAR(c.CMD_DATECOMMANDE, 'YYYY-MM-DD') AS DATE_, TRIM(c.LIBELLE) AS LIBELLE, ${TIERS_NOM('t')} AS TIERS,
                     TRIM(sg.CLEACCES) AS SERVICE, c.MONTANT_TTC AS MONTANT, TRIM(c.ROO_IMA_REF) AS PJ_ID`,
            order: { montant: 'c.MONTANT_TTC', date: 'c.CMD_DATECOMMANDE', defaut: 'c.CMD_DATECOMMANDE' },
            total: 'c.MONTANT_TTC', tie: 'c.ROO_IMA_REF',
        },
        dateCol: 'c.CMD_DATECOMMANDE',
        pj: { type: 'commande', objectTypes: ['COMMANDE'] },
        fiche: 'FicheCommande.html?commandeId=',
        defaults: { mesures: ['montant', 'nombre'] },
    },

    // ─── Factures (même rattachement au service que « Mes factures ») ───
    factures: {
        label: 'Factures',
        from: `FROM FI.FACTURE f
               JOIN FI.BUDGET bg ON bg.ROO_IMA_REF = f.BUDGET
               LEFT JOIN FI.SERVICEFI sg ON sg.ROO_IMA_REF = f.EF_SERVICE
               LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = f.TIERS`,
        where: [],
        scope: { mode: 'service', budget: 'f.BUDGET', service: 'f.EF_SERVICE', shared: true },
        // Comme « Mes factures » : l'année est celle de la réception
        exerciceDate: 'f.DATENTREE',
        measures: { montant: { label: 'Montant TTC', expr: 'SUM(f.MONTANTTC_E)' }, nombre: { label: 'Nombre de factures', expr: 'COUNT(*)', count: true } },
        dims: {
            exercice: { label: 'Année de réception', select: "TO_CHAR(f.DATENTREE, 'YYYY')" }, mois: { label: 'Mois de réception', select: "TO_CHAR(f.DATENTREE, 'YYYY-MM')" },
            service: { label: 'Service', select: 'TRIM(sg.CLEACCES)' }, budget: BUDGET_DIM, tiers: { label: 'Tiers', select: TIERS_NOM('t') },
        },
        filters: { tiers: 't.POBJ_EXTRACT', texte: ['f.LIBELLE1', 'f.FACTIERS'], numero: 'f.FACTURE', montant: 'f.MONTANTTC_E' },
        flags: {
            rejetees: 'f.DATE_REJET IS NOT NULL',
            non_rejetees: 'f.DATE_REJET IS NULL',
            sans_service_fait: "f.DATE_REJET IS NULL AND NOT EXISTS (SELECT 1 FROM FI.FACSUIVI fs WHERE fs.FACTURE = f.ROO_IMA_REF AND fs.AVANCEMENT = 'SERVICE_FAIT' AND fs.ETAT = 'VALIDE')",
        },
        list: {
            columns: [
                { key: 'NUM', label: 'Facture', type: 'text' }, { key: 'REF', label: 'N° fournisseur', type: 'text' }, { key: 'DATE_', label: 'Reçue le', type: 'date' },
                { key: 'LIBELLE', label: 'Libellé', type: 'text' }, { key: 'TIERS', label: 'Tiers', type: 'text' }, { key: 'SERVICE', label: 'Service', type: 'text' },
                { key: 'REJET', label: 'Rejetée le', type: 'date' }, { key: 'MONTANT', label: 'Montant TTC', type: 'money' },
            ],
            select: `TRIM(f.FACTURE) AS NUM, TRIM(f.FACTIERS) AS REF, TO_CHAR(f.DATENTREE, 'YYYY-MM-DD') AS DATE_, TRIM(f.LIBELLE1) AS LIBELLE, ${TIERS_NOM('t')} AS TIERS,
                     TRIM(sg.CLEACCES) AS SERVICE, TO_CHAR(f.DATE_REJET, 'YYYY-MM-DD') AS REJET, f.MONTANTTC_E AS MONTANT, TRIM(f.ROO_IMA_REF) AS PJ_ID`,
            order: { montant: 'f.MONTANTTC_E', date: 'f.DATENTREE', defaut: 'f.DATENTREE' },
            total: 'f.MONTANTTC_E', tie: 'f.ROO_IMA_REF',
        },
        dateCol: 'f.DATENTREE',
        pj: { type: 'facture', objectTypes: ['FACTURE'] },
        fiche: 'FicheFacture.html?factureId=',
        defaults: { mesures: ['montant', 'nombre'] },
    },

    // ─── Mandats (dépenses) et titres (recettes), à la ligne d'imputation ───
    mandats: {
        label: 'Mandats et titres',
        from: `FROM FI.MANDLIGNE ml
               JOIN FI.MANDAT md ON md.ROO_IMA_REF = ml.MANDAT
               JOIN FI.BUDANNU ba ON ba.ROO_IMA_REF = md.BUDANNU
               JOIN FI.BUDGET bg ON bg.ROO_IMA_REF = ba.BUDGET
               JOIN FI.IMPUTATION i ON i.ROO_IMA_REF = ml.IMPUTATION
               LEFT JOIN FI.BORDEREAU bd ON bd.ROO_IMA_REF = md.BORDEREAU
               LEFT JOIN FI.MVTLIGNE l ON l.ROO_IMA_REF = ml.MVTLIGNE
               LEFT JOIN FI.TIERS t ON t.ROO_IMA_REF = l.TIERS`,
        where: ["NVL(TRIM(md.REJET), 'N') <> 'O'"],
        scope: { mode: 'imputation', budget: 'bg.ROO_IMA_REF' },
        exercice: 'ba.EXERCICE',
        sensExpr: "DECODE(TRIM(md.SENSMVT), 'M', 'D', TRIM(md.SENSMVT))",
        // Les mandats et titres de réduction viennent en déduction
        measures: {
            montant: { label: 'Montant net TTC', expr: "SUM(CASE WHEN TRIM(md.REDUCTION) = 'O' THEN -ml.MONTANTTC_E ELSE ml.MONTANTTC_E END)" },
            nombre: { label: 'Nombre de mandats / titres', expr: 'COUNT(DISTINCT md.ROO_IMA_REF)', count: true },
        },
        dims: {
            exercice: { label: 'Exercice', select: 'ba.EXERCICE' }, mois: { label: 'Mois d’émission', select: "TO_CHAR(md.DATMANDAT, 'YYYY-MM')" },
            section: IMPUTATION_DIMS.section, chapitre: IMPUTATION_DIMS.chapitre, nature: IMPUTATION_DIMS.nature, fonction: IMPUTATION_DIMS.fonction, ligne: IMPUTATION_DIMS.ligne,
            service: { label: 'Service', select: 'TRIM(i.CODESERG)' }, budget: BUDGET_DIM, tiers: { label: 'Tiers', select: TIERS_NOM('t') },
        },
        filters: { section: 'TRIM(i.TYPE_SECTION)', chapitre: 'TRIM(i.CODECHAP)', nature: 'TRIM(i.CODECOMP)', fonction: 'TRIM(i.CODEFONC)', tiers: 't.POBJ_EXTRACT', texte: ['l.LIBELLE', 'i.LIBELLE'], numero: 'md.MANDAT', montant: 'ml.MONTANTTC_E' },
        list: {
            columns: [
                { key: 'NUM', label: 'Mandat / titre', type: 'text' }, { key: 'BORD', label: 'Bordereau', type: 'text' }, { key: 'DATE_', label: 'Émis le', type: 'date' },
                { key: 'PAIEMENT', label: 'Payé le', type: 'date' }, { key: 'LIBELLE', label: 'Libellé', type: 'text' }, { key: 'TIERS', label: 'Tiers', type: 'text' },
                { key: 'IMPUTATION', label: 'Imputation', type: 'text' }, { key: 'SERVICE', label: 'Service', type: 'text' }, { key: 'MONTANT', label: 'Montant TTC', type: 'money' },
            ],
            select: `TO_CHAR(md.MANDAT) AS NUM, TO_CHAR(bd.BORDEREAU) AS BORD, TO_CHAR(md.DATMANDAT, 'YYYY-MM-DD') AS DATE_, TO_CHAR(md.DATE_PAIEMENT, 'YYYY-MM-DD') AS PAIEMENT,
                     TRIM(NVL(l.LIBELLE, i.LIBELLE)) AS LIBELLE, ${TIERS_NOM('t')} AS TIERS, TRIM(i.IMPUTATION) AS IMPUTATION, TRIM(i.CODESERG) AS SERVICE,
                     CASE WHEN TRIM(md.REDUCTION) = 'O' THEN -ml.MONTANTTC_E ELSE ml.MONTANTTC_E END AS MONTANT, TRIM(md.ROO_IMA_REF) AS PJ_ID, TRIM(md.SENSMVT) AS SENS`,
            order: { montant: 'ml.MONTANTTC_E', date: 'md.DATMANDAT', defaut: 'md.DATMANDAT' },
            total: "CASE WHEN TRIM(md.REDUCTION) = 'O' THEN -ml.MONTANTTC_E ELSE ml.MONTANTTC_E END", tie: 'ml.ROO_IMA_REF',
        },
        dateCol: 'md.DATMANDAT',
        pj: { type: 'mandat', objectTypes: ['MANDAT', 'Mandat'] },
        // Pas de fiche connue pour les titres de recette : lien réservé aux mandats
        fiche: 'FicheMandat.html?mandatId=',
        ficheSi: (row) => row.SENS === 'M',
        defaults: { mesures: ['montant'], sens: 'D' },
        note: 'Mandats détaillés, réductions déduites : le montant « mandaté » officiel est celui de la situation budgétaire.',
    },
};

// « par direction » : les services sont additionnés d'après le référentiel (constantes du code, jamais de saisie)
const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
function directionSql(serviceExpr) {
    // Les listes de codes précis d'abord (ex. DGST avant le préfixe de la DGS)
    const exact = DIRECTIONS.flatMap(d => d.codes.filter(c => !c.endsWith('*')).map(c => `WHEN ${serviceExpr} = ${sql(c)} THEN ${sql(d.nom)}`));
    const prefix = DIRECTIONS.flatMap(d => d.codes.filter(c => c.endsWith('*')).map(c => `WHEN ${serviceExpr} LIKE ${sql(`${c.slice(0, -1)}%`)} THEN ${sql(d.nom)}`));
    return `CASE ${[...exact, ...prefix].join(' ')} ELSE 'Autres services' END`;
}
for (const def of Object.values(SOURCES)) {
    if (def.dims.service) def.dims.direction = { label: 'Direction', select: directionSql(def.dims.service.select) };
}

module.exports = { SOURCES };
