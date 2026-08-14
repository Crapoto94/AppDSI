const xlsx = require('xlsx');
const { pool } = require('../../shared/database');
const telecomController = require('../telecom/telecom.controller');
const financeController = require('../finance/finance.controller');

// Nature comptable des frais de télécommunication : la prévision de cette nature se base sur
// l'atterrissage annuel de /telecom plutôt que sur hub_contrats.contrats (qui ne recense pas les
// contrats télécom de façon fiable).
const TELECOM_NATURE = '6262';

// --- Schéma dédié : tables spécifiques à la préparation budgétaire (pas de réutilisation des tables existantes) ---

async function ensureTables() {
    await pool.query('CREATE SCHEMA IF NOT EXISTS hub_budget_prep');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hub_budget_prep.imports (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL,
            service_code TEXT NOT NULL,
            service_label TEXT,
            direction_label TEXT,
            proposition_year INTEGER NOT NULL,
            row_count INTEGER DEFAULT 0,
            imported_by TEXT,
            imported_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(service_code, proposition_year)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hub_budget_prep.facts (
            id SERIAL PRIMARY KEY,
            import_id INTEGER NOT NULL REFERENCES hub_budget_prep.imports(id) ON DELETE CASCADE,
            service_code TEXT NOT NULL,
            service_label TEXT,
            budget TEXT,
            depenses_recettes TEXT,
            chapitre_code TEXT,
            chapitre_libelle TEXT,
            fonction_code TEXT,
            fonction_libelle TEXT,
            article_code TEXT,
            article_libelle TEXT,
            year INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'realise' | 'vote' | 'demande'
            montant NUMERIC NOT NULL DEFAULT 0,
            explication TEXT
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_budget_prep_facts_import ON hub_budget_prep.facts(import_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_budget_prep_facts_fonction_article ON hub_budget_prep.facts(fonction_code, article_code)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_budget_prep_facts_year_type ON hub_budget_prep.facts(year, type)');
}

function parseNum(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return val;
    const num = parseFloat(String(val).trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
    return isNaN(num) ? null : num;
}

function norm(s) {
    return (s || '').toString().trim();
}

function stripAccents(s) {
    return norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Cherche l'index de la première colonne dont l'en-tête (normalisé) commence par un des préfixes donnés
function findColIndex(headers, prefixes) {
    for (let i = 0; i < headers.length; i++) {
        const h = stripAccents(headers[i]);
        for (const p of prefixes) {
            if (h.startsWith(stripAccents(p))) return i;
        }
    }
    return -1;
}

// Normalise les libellés de budget, qui varient selon les fichiers/années
// (ex: "Principal" / "PRINCIPAL", "Restauration" / "RESTAURATION MUNICIPALE").
function normalizeBudget(budget) {
    const b = norm(budget);
    const up = b.toUpperCase();
    if (up === 'PRINCIPAL') return 'PRINCIPAL';
    if (up === 'RESTAURATION' || up === 'RESTAURATION MUNICIPALE') return 'RESTAURATION MUNICIPALE';
    return b;
}

function extractYearFromHeader(headerText) {
    const m = norm(headerText).match(/(20\d{2})/);
    return m ? parseInt(m[1], 10) : null;
}

function parseServiceCodeFromFilename(filename) {
    const m = filename.match(/BF\d+/i);
    return m ? m[0].toUpperCase() : null;
}

function parseYearFromFilename(filename) {
    const m = filename.match(/(20\d{2})/);
    return m ? parseInt(m[1], 10) : null;
}

// Parse un classeur Excel de préparation budgétaire (une direction/service par fichier)
function parseWorkbook(buffer, filename) {
    const wb = xlsx.read(buffer, { type: 'buffer' });

    let sheetRows = null;
    let headerRowIdx = -1;
    let headers = null;

    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        for (let i = 0; i < Math.min(rows.length, 30); i++) {
            const row = rows[i];
            if (row && norm(row[0]) === 'Direction') {
                sheetRows = rows;
                headerRowIdx = i;
                headers = row.map(norm);
                break;
            }
        }
        if (sheetRows) break;
    }

    if (!sheetRows) {
        throw new Error("Feuille de données introuvable (en-tête 'Direction' non trouvé)");
    }

    const propositionYearFromName = parseYearFromFilename(filename);

    // Libellés Direction / Service (lignes situées juste au-dessus de l'en-tête)
    let directionLabel = '';
    let serviceLabel = '';
    for (let i = Math.max(0, headerRowIdx - 6); i < headerRowIdx; i++) {
        const row = sheetRows[i];
        if (!row) continue;
        const label = stripAccents(row[0]);
        if (label.startsWith('direction')) directionLabel = norm(row[1]);
        if (label.startsWith('service')) serviceLabel = norm(row[1]);
    }

    const idxDirection = findColIndex(headers, ['Direction']);
    const idxBudget = findColIndex(headers, ['Budget']);
    const idxDepRec = findColIndex(headers, ['Depenses/recettes', 'Dépenses/recettes']);
    const idxChapCode = findColIndex(headers, ['Chapitre code']);
    const idxChapLib = findColIndex(headers, ['Libelle chapitre', 'Libellé chapitre']);
    const idxFonctionCode = findColIndex(headers, ['Fonction code']);
    const idxFonctionLib = findColIndex(headers, ['Libelle fonction', 'Libellé fonction']);
    const idxArticleCode = findColIndex(headers, ['Article code']);
    const idxArticleLib = findColIndex(headers, ['Libelle article', 'Libellé article']);
    const idxRealise = findColIndex(headers, ['Realise', 'Réalisé']);
    const idxVote = findColIndex(headers, ['Vote BP', 'Voté BP']);
    const idxProposition = findColIndex(headers, ['Proposition BP']);
    const idxExplication = findColIndex(headers, ["Explications de l'evolution", "Explications de l'évolution"]);

    if (idxArticleCode === -1 || idxFonctionCode === -1) {
        throw new Error('Colonnes Fonction code / Article code introuvables dans le fichier');
    }

    const realiseYear = idxRealise >= 0 ? (extractYearFromHeader(headers[idxRealise]) || (propositionYearFromName - 2)) : null;
    const voteYear = idxVote >= 0 ? (extractYearFromHeader(headers[idxVote]) || (propositionYearFromName - 1)) : null;
    const propositionYear = idxProposition >= 0 ? (extractYearFromHeader(headers[idxProposition]) || propositionYearFromName) : propositionYearFromName;

    const facts = [];

    for (let i = headerRowIdx + 1; i < sheetRows.length; i++) {
        const row = sheetRows[i];
        if (!row) continue;

        const budget = idxBudget >= 0 ? normalizeBudget(row[idxBudget]) : '';
        const fonctionCode = norm(row[idxFonctionCode]);
        const articleCode = norm(row[idxArticleCode]);
        const chapitreCode = idxChapCode >= 0 ? norm(row[idxChapCode]) : '';

        // Ligne vide / de séparation : ni chapitre, ni fonction, ni article, ni budget
        if (!budget && !fonctionCode && !articleCode && !chapitreCode) continue;

        const base = {
            // Le libellé du service vient de l'en-tête du fichier ("Service :"), pas de la colonne
            // "Service" ligne par ligne : celle-ci peut contenir des valeurs incohérentes/erronées
            // selon les fichiers (ex: "UTILISATEURS" au lieu de "DIRECTION DSI" pour BF1 en 2027).
            service_label: serviceLabel,
            budget,
            depenses_recettes: idxDepRec >= 0 ? norm(row[idxDepRec]) : '',
            chapitre_code: chapitreCode,
            chapitre_libelle: idxChapLib >= 0 ? norm(row[idxChapLib]) : '',
            fonction_code: fonctionCode,
            fonction_libelle: idxFonctionLib >= 0 ? norm(row[idxFonctionLib]) : '',
            article_code: articleCode,
            article_libelle: idxArticleLib >= 0 ? norm(row[idxArticleLib]) : '',
            explication: idxExplication >= 0 ? norm(row[idxExplication]) : ''
        };

        if (idxRealise >= 0 && realiseYear) {
            const m = parseNum(row[idxRealise]);
            if (m !== null) facts.push({ ...base, year: realiseYear, type: 'realise', montant: m });
        }
        if (idxVote >= 0 && voteYear) {
            const m = parseNum(row[idxVote]);
            if (m !== null) facts.push({ ...base, year: voteYear, type: 'vote', montant: m });
        }
        if (idxProposition >= 0 && propositionYear) {
            const m = parseNum(row[idxProposition]);
            if (m !== null) facts.push({ ...base, year: propositionYear, type: 'demande', montant: m });
        }
    }

    return { directionLabel, serviceLabel, propositionYear, facts };
}

module.exports = {
    importFile: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
            await ensureTables();

            const filename = req.file.originalname;
            const serviceCode = parseServiceCodeFromFilename(filename);
            if (!serviceCode) {
                return res.status(400).json({ error: `Impossible de déterminer le service (BF1/BF6/BF8/BF9) depuis le nom de fichier "${filename}"` });
            }

            const parsed = parseWorkbook(req.file.buffer, filename);
            if (!parsed.propositionYear) {
                return res.status(400).json({ error: `Impossible de déterminer l'année depuis le nom de fichier "${filename}"` });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const existing = await client.query(
                    'SELECT id FROM hub_budget_prep.imports WHERE service_code = $1 AND proposition_year = $2',
                    [serviceCode, parsed.propositionYear]
                );
                if (existing.rows.length > 0) {
                    await client.query('DELETE FROM hub_budget_prep.imports WHERE id = $1', [existing.rows[0].id]);
                }

                const importRes = await client.query(
                    `INSERT INTO hub_budget_prep.imports
                        (filename, service_code, service_label, direction_label, proposition_year, row_count, imported_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                    [filename, serviceCode, parsed.serviceLabel, parsed.directionLabel, parsed.propositionYear, parsed.facts.length, req.user?.username || '']
                );
                const importId = importRes.rows[0].id;

                for (const f of parsed.facts) {
                    await client.query(
                        `INSERT INTO hub_budget_prep.facts
                            (import_id, service_code, service_label, budget, depenses_recettes, chapitre_code, chapitre_libelle,
                             fonction_code, fonction_libelle, article_code, article_libelle, year, type, montant, explication)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
                        [importId, serviceCode, f.service_label, f.budget, f.depenses_recettes, f.chapitre_code, f.chapitre_libelle,
                         f.fonction_code, f.fonction_libelle, f.article_code, f.article_libelle, f.year, f.type, f.montant, f.explication]
                    );
                }

                await client.query('COMMIT');
                res.json({ success: true, service_code: serviceCode, year: parsed.propositionYear, rows_imported: parsed.facts.length });
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[BudgetPrep] importFile error:', error);
            res.status(500).json({ error: error.message || 'Erreur import' });
        }
    },

    listImports: async (req, res) => {
        try {
            await ensureTables();
            const result = await pool.query(
                `SELECT id, filename, service_code, service_label, direction_label, proposition_year, row_count, imported_by, imported_at
                 FROM hub_budget_prep.imports ORDER BY proposition_year DESC, service_code ASC`
            );
            res.json(result.rows);
        } catch (error) {
            console.error('[BudgetPrep] listImports error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    deleteImport: async (req, res) => {
        try {
            await ensureTables();
            await pool.query('DELETE FROM hub_budget_prep.imports WHERE id = $1', [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            console.error('[BudgetPrep] deleteImport error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    getFacets: async (req, res) => {
        try {
            await ensureTables();
            const [services, budgets, chapitres, fonctions, articles, depRec] = await Promise.all([
                pool.query(`SELECT DISTINCT service_code, service_label FROM hub_budget_prep.facts WHERE service_code IS NOT NULL ORDER BY service_code`),
                pool.query(`SELECT DISTINCT budget FROM hub_budget_prep.facts WHERE budget != '' ORDER BY budget`),
                pool.query(`SELECT DISTINCT chapitre_code, chapitre_libelle FROM hub_budget_prep.facts WHERE chapitre_code != '' ORDER BY chapitre_code`),
                pool.query(`SELECT DISTINCT fonction_code, fonction_libelle FROM hub_budget_prep.facts WHERE fonction_code != '' ORDER BY fonction_code`),
                pool.query(`SELECT DISTINCT article_code, article_libelle FROM hub_budget_prep.facts WHERE article_code != '' ORDER BY article_code`),
                pool.query(`SELECT DISTINCT depenses_recettes FROM hub_budget_prep.facts WHERE depenses_recettes != '' ORDER BY depenses_recettes`)
            ]);
            res.json({
                services: services.rows,
                budgets: budgets.rows.map(r => r.budget),
                chapitres: chapitres.rows,
                fonctions: fonctions.rows,
                articles: articles.rows,
                depensesRecettes: depRec.rows.map(r => r.depenses_recettes)
            });
        } catch (error) {
            console.error('[BudgetPrep] getFacets error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    getData: async (req, res) => {
        try {
            await ensureTables();
            const { service_code, budget, chapitre_code, fonction_code, article_code, depenses_recettes, search } = req.query;

            const where = ["type != 'demande'"]; // Les "Demandé" (proposition non votée) ne sont pas affichés dans cette vue.
            const params = [];
            let p = 1;

            const multi = (val) => Array.isArray(val) ? val : (val ? [val] : []);
            const addInFilter = (col, values) => {
                const vals = multi(values);
                if (vals.length === 0) return;
                where.push(`${col} = ANY($${p})`);
                params.push(vals);
                p++;
            };

            addInFilter('service_code', service_code);
            addInFilter('budget', budget);
            addInFilter('chapitre_code', chapitre_code);
            addInFilter('fonction_code', fonction_code);
            addInFilter('article_code', article_code);
            addInFilter('depenses_recettes', depenses_recettes);

            if (search && String(search).trim()) {
                where.push(`(fonction_libelle ILIKE $${p} OR article_libelle ILIKE $${p} OR chapitre_libelle ILIKE $${p})`);
                params.push(`%${String(search).trim()}%`);
                p++;
            }

            const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

            // Détail par imputation (service/fonction/article), agrégé sur les autres dimensions
            const rowsResult = await pool.query(
                `SELECT service_code, service_label, fonction_code, fonction_libelle, article_code, article_libelle,
                        year, type, SUM(montant) AS montant
                 FROM hub_budget_prep.facts
                 ${whereClause}
                 GROUP BY service_code, service_label, fonction_code, fonction_libelle, article_code, article_libelle, year, type
                 ORDER BY service_code, fonction_code, article_code, year`,
                params
            );

            // Totaux agrégés tous imputations confondues (pour le graphique)
            const totalsResult = await pool.query(
                `SELECT year, type, SUM(montant) AS montant
                 FROM hub_budget_prep.facts
                 ${whereClause}
                 GROUP BY year, type
                 ORDER BY year`,
                params
            );

            const rowsMap = new Map();
            for (const r of rowsResult.rows) {
                const key = `${r.service_code}||${r.fonction_code}||${r.article_code}`;
                if (!rowsMap.has(key)) {
                    rowsMap.set(key, {
                        service_code: r.service_code,
                        service_label: r.service_label,
                        fonction_code: r.fonction_code,
                        fonction_libelle: r.fonction_libelle,
                        article_code: r.article_code,
                        article_libelle: r.article_libelle,
                        values: {}
                    });
                }
                rowsMap.get(key).values[`${r.type}_${r.year}`] = parseFloat(r.montant);
            }

            const rows = Array.from(rowsMap.values());

            const totals = {};
            for (const t of totalsResult.rows) {
                totals[`${t.type}_${t.year}`] = parseFloat(t.montant);
            }

            // ── Réalisé N-1 (engagements) et Prévision N (engagements + contrats) ──
            // Le réalisé des engagements est attaché par (service gestionnaire, article par nature) :
            // chaque ligne du suivi budgétaire porte son « Service Gestionnaire » (BF1/BF6/BF8/BF9)
            // et sa propre « Article par nature ». On ne somme donc pas toutes les natures ni tous
            // les services d'une même fonction (ex. BF1, nature 60632 = 536,24 € = 2 engagements,
            // et non le total de la fonction).
            // Les lignes « OR » (ordonnancement) sont exclues du réalisé : elles reprennent les
            // mouvements déjà comptés en « TR » (service fait) et les doubleraient (ex. code
            // 25D001456 : OR 256,34 = TR 256,34).
            // Les lignes en rattachement (engagements repris de l'exercice précédent, ex. code
            // "24D..." reporté sur l'exercice 2025) sont également exclues : seuls les engagements
            // dont le code mouvement commence par le préfixe de l'exercice en cours sont retenus
            // (ex. "25D..." pour l'exercice 2025, "26D..." pour 2026).
            // La prévision N = engagements N par (service, article) + contrats N répartis sur les
            // natures du service (les contrats n'ont ni article ni fonction fiable).
            const now = new Date();
            const yearN = now.getFullYear();
            const yearN1 = yearN - 1;
            const round2 = (n) => Math.round(n * 100) / 100;
            const yearPrefix = (exercice) => String(exercice).slice(-2);

            const engagementsAgg = async (exercice, excludeOr) => {
                const bySA = new Map(); // clé "service||article" → montant (réalisé) ou engagé (prévision)
                try {
                    const orFilter = excludeOr ? ` AND TRIM("Avancement") != 'OR'` : '';
                    const r = await pool.query(
                        `SELECT TRIM("Service Gestionnaire") AS service, TRIM("Article par nature") AS article,
                                SUM("Montant TTC") AS montant, SUM("Reste engagé") AS reste
                         FROM oracle.budget_engagements
                         WHERE "Exercice" = $1 AND "Référence Fonctionnelle" IS NOT NULL AND TRIM("Référence Fonctionnelle") != ''
                               AND TRIM("Code mouvement") LIKE $2${orFilter}
                         GROUP BY TRIM("Service Gestionnaire"), TRIM("Article par nature")`,
                        [String(exercice), `${yearPrefix(exercice)}%`]
                    );
                    for (const row of r.rows) {
                        const montant = parseFloat(row.montant) || 0;
                        const reste = parseFloat(row.reste) || 0;
                        const saKey = `${row.service}||${row.article}`;
                        bySA.set(saKey, (bySA.get(saKey) || 0) + (montant - reste));
                    }
                } catch (e) {
                    console.error('[BudgetPrep] engagementsAgg error:', e.message);
                }
                return bySA;
            };

            // Ne compte la prévision d'un contrat que s'il n'a pas encore de montant réel connu
            // pour l'année (colonne montant_<year>) : ce montant réel est sinon déjà reflété par
            // ailleurs (facturation/engagement), et l'additionner à la prévision doublerait la dépense.
            // Chaque contrat porte sa propre nature comptable (colonne "nature", ex: "2051"), qui
            // correspond directement au code d'article de la préparation budgétaire : on rattache
            // donc le contrat par (service, nature) exactement comme les engagements, sans répartition.
            const contratsPrevisionBySA = async (year) => {
                const map = new Map(); // clé "service||nature" → montant
                const previsionCol = `prevision_${year}`;
                const montantCol = `montant_${year}`;
                try {
                    const colCheck = await pool.query(
                        `SELECT column_name FROM information_schema.columns
                         WHERE table_schema = 'hub_contrats' AND table_name = 'contrats' AND column_name = ANY($1)`,
                        [[previsionCol, montantCol]]
                    );
                    const cols = new Set(colCheck.rows.map(r => r.column_name));
                    if (!cols.has(previsionCol)) return map;
                    const montantFilter = cols.has(montantCol) ? ` AND ${montantCol} IS NULL` : '';
                    const r = await pool.query(
                        `SELECT TRIM(svc) AS svc, TRIM(nature) AS nature, SUM(${previsionCol}) AS montant
                         FROM hub_contrats.contrats
                         WHERE (statut IS NULL OR statut != 'archivé') AND ${previsionCol} IS NOT NULL${montantFilter}
                         GROUP BY TRIM(svc), TRIM(nature)`
                    );
                    for (const row of r.rows) {
                        const saKey = `${row.svc}||${row.nature}`;
                        map.set(saKey, (map.get(saKey) || 0) + (parseFloat(row.montant) || 0));
                    }
                } catch (e) {
                    console.error('[BudgetPrep] contratsPrevisionBySA error:', e.message);
                }
                return map;
            };

            // Frais de télécommunication (nature 6262) : hub_contrats.contrats ne recense pas les
            // contrats télécom de façon fiable, donc la prévision de cette nature se base sur
            // l'atterrissage annuel de /telecom (réel des mois écoulés + moyenne × mois restants),
            // réparti sur le(s) service(s) qui portent cette nature dans la préparation budgétaire.
            const telecomLandingBySA = async (year) => {
                const map = new Map();
                try {
                    const landing = await telecomController.getAnnualLanding(year);
                    if (landing === null || landing === undefined) return map;
                    const services = new Set();
                    for (const row of rows) {
                        if ((row.article_code || '').trim() === TELECOM_NATURE) {
                            services.add((row.service_code || '').trim());
                        }
                    }
                    if (services.size === 0) return map;
                    const share = landing / services.size;
                    for (const service of services) {
                        map.set(`${service}||${TELECOM_NATURE}`, share);
                    }
                } catch (e) {
                    console.error('[BudgetPrep] telecomLandingBySA error:', e.message);
                }
                return map;
            };

            // Opérations budgétaires basculées en "prev" (/budget opérations) : leur reste à engager
            // (Montant prévu - used_amount, plancher 0) s'ajoute à la prévision de la nature/service
            // correspondante — ex. "[Cybersécu] IAAS" (BF1, nature 65811, prévu 120 000, consommé
            // 39 831,85) ajoute ~80 168 € à la prévision N du 65811 en BF1.
            const operationsExtraBySA = async (year) => {
                const map = new Map();
                try {
                    const ops = await financeController.getPrevOperationsExtra(year);
                    for (const op of ops) {
                        if (!op.service || !op.nature || op.reste_a_engager <= 0) continue;
                        const saKey = `${op.service}||${op.nature}`;
                        map.set(saKey, (map.get(saKey) || 0) + op.reste_a_engager);
                    }
                } catch (e) {
                    console.error('[BudgetPrep] operationsExtraBySA error:', e.message);
                }
                return map;
            };

            const [engagementsN1, engagementsN, contratsN, telecomLanding, operationsExtra] = await Promise.all([
                engagementsAgg(yearN1, true),  // réalisé : exclut les OR (doublons des TR)
                engagementsAgg(yearN, false),   // prévision : engagements N (engagé)
                contratsPrevisionBySA(yearN),
                telecomLandingBySA(yearN),
                operationsExtraBySA(yearN)
            ]);
            // L'atterrissage télécom remplace la valeur "contrats" de la nature 6262 (source plus fiable).
            for (const [key, val] of telecomLanding) contratsN.set(key, val);
            // Le reste à engager des opérations "prev" s'ajoute (source indépendante des contrats/télécom).
            for (const [key, val] of operationsExtra) contratsN.set(key, (contratsN.get(key) || 0) + val);

            const realiseN1Key = `realise_engage_${yearN1}`;
            const previsionEngageKey = `prevision_engage_${yearN}`;
            const previsionAEngagerKey = `prevision_a_engager_${yearN}`;
            const previsionNKey = `prevision_${yearN}`;

            // Attache les valeurs (par service/article) sur chaque ligne détail correspondante.
            // La prévision N est décomposée en deux montants distincts :
            // - "Engagé" : ce qui a déjà été formellement engagé sur l'exercice (oracle.budget_engagements)
            // - "Reste à engager" : ce qui reste à engager pour couvrir les contrats (ou, pour la
            //   nature 6262, l'atterrissage télécom) qui n'ont pas encore de montant réel connu
            // Le total "Prévision" reste la somme des deux, pour le graphique et les totaux.
            for (const row of rows) {
                const service = (row.service_code || '').trim();
                const article = (row.article_code || '').trim();
                const saKey = `${service}||${article}`;
                if (engagementsN1.has(saKey)) row.values[realiseN1Key] = round2(engagementsN1.get(saKey));
                const engage = engagementsN.get(saKey) || 0;
                const aEngager = contratsN.get(saKey) || 0;
                const prevision = engage + aEngager;
                if (engage > 0) row.values[previsionEngageKey] = round2(engage);
                if (aEngager > 0) row.values[previsionAEngagerKey] = round2(aEngager);
                if (engage > 0 || prevision > 0) row.values[previsionNKey] = round2(prevision);
            }

            rows.sort((a, b) => {
                if (a.service_code !== b.service_code) return a.service_code.localeCompare(b.service_code);
                if (a.fonction_code !== b.fonction_code) return a.fonction_code.localeCompare(b.fonction_code);
                return a.article_code.localeCompare(b.article_code);
            });

            // Totaux globaux (utilisés uniquement pour définir les colonnes ; le total affiché du
            // tableau est recalculé côté front sur les services affichés afin de rester cohérent).
            totals[realiseN1Key] = round2([...engagementsN1.values()].reduce((s, v) => s + v, 0));
            totals[previsionEngageKey] = round2([...engagementsN.values()].reduce((s, v) => s + v, 0));
            totals[previsionAEngagerKey] = round2([...contratsN.values()].reduce((s, v) => s + v, 0));
            totals[previsionNKey] = round2(totals[previsionEngageKey] + totals[previsionAEngagerKey]);

            // Construction de la liste ordonnée des colonnes (réalisé N-1, voté N, prévision N, ...)
            const periodSet = new Set();
            for (const key of Object.keys(totals)) periodSet.add(key);
            for (const row of rows) for (const key of Object.keys(row.values)) periodSet.add(key);

            const typeRank = { realise: -1, vote: 1, realise_engage: 2, prevision_engage: 3, prevision_a_engager: 4, prevision: 5 };
            const columns = Array.from(periodSet).map(key => {
                let type, yearStr;
                if (key === realiseN1Key) { type = 'realise_engage'; yearStr = String(yearN1); }
                else if (key === previsionEngageKey) { type = 'prevision_engage'; yearStr = String(yearN); }
                else if (key === previsionAEngagerKey) { type = 'prevision_a_engager'; yearStr = String(yearN); }
                else if (key === previsionNKey) { type = 'prevision'; yearStr = String(yearN); }
                else { [type, yearStr] = key.split('_'); }
                const year = parseInt(yearStr, 10);
                return { key, type, year, sortKey: year * 10 + (typeRank[type] ?? 0) };
            }).sort((a, b) => a.sortKey - b.sortKey);

            res.json({ columns, rows, totals });
        } catch (error) {
            console.error('[BudgetPrep] getData error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Détail des montants ayant permis de calculer une case du tableau (réalisé N-1 ou prévision N) :
    // la liste des engagements (numéro, libellé, montant) et, pour la prévision, des contrats
    // (logiciel/objet, montant) répartis sur ce service.
    getLineDetail: async (req, res) => {
        try {
            const { service_code, article_code, type, year } = req.query;
            if (!service_code || !article_code || !type || !year) {
                return res.status(400).json({ error: 'Paramètres manquants (service_code, article_code, type, year)' });
            }
            // "prevision_engage" = uniquement les engagements déjà pris ; "prevision_a_engager" =
            // uniquement les contrats/télécom restant à engager ; "prevision" (total) et
            // "realise_engage" affichent les deux / les engagements comme avant.
            const excludeOr = type === 'realise_engage';
            const includeEngagements = type !== 'prevision_a_engager';
            const includeContratsOrTelecom = type === 'prevision' || type === 'prevision_a_engager';
            const yearPrefix = String(year).slice(-2);
            const round2 = (n) => Math.round(n * 100) / 100;

            let engagements = [];
            if (includeEngagements) {
                const orFilter = excludeOr ? ` AND TRIM("Avancement") != 'OR'` : '';
                const engagementsRes = await pool.query(
                    `SELECT TRIM("Code mouvement") AS numero, TRIM("Libellé mouvement") AS libelle_mouvement,
                            TRIM("Libellé") AS libelle, ("Montant TTC" - "Reste engagé") AS montant
                     FROM oracle.budget_engagements
                     WHERE "Exercice" = $1 AND TRIM("Service Gestionnaire") = $2 AND TRIM("Article par nature") = $3
                           AND "Référence Fonctionnelle" IS NOT NULL AND TRIM("Référence Fonctionnelle") != ''
                           AND TRIM("Code mouvement") LIKE $4${orFilter}
                     ORDER BY "Code mouvement"`,
                    [String(year), service_code, article_code, `${yearPrefix}%`]
                );
                engagements = engagementsRes.rows.map(r => ({
                    numero: r.numero,
                    libelle: r.libelle_mouvement || r.libelle || '',
                    montant: parseFloat(r.montant) || 0
                })).filter(e => e.montant !== 0);
            }

            let operations = [];
            if (includeContratsOrTelecom) {
                const allOps = await financeController.getPrevOperationsExtra(year);
                operations = allOps.filter(o => o.service === service_code && o.nature === article_code && o.reste_a_engager > 0);
            }

            let contrats = [];
            let telecom = null;
            if (includeContratsOrTelecom && article_code === TELECOM_NATURE) {
                // Nature télécom : la prévision se base sur l'atterrissage annuel de /telecom
                // (réel des mois écoulés + moyenne × mois restants), pas sur hub_contrats.contrats.
                const summary = await telecomController.computeMonthlySummary(year);
                telecom = {
                    landing_global: summary.global.landing,
                    operators: summary.operators.map(o => ({ operator_name: o.operator_name, total: round2(o.total), landing: o.landing }))
                };
            } else if (includeContratsOrTelecom) {
                const previsionCol = `prevision_${year}`;
                const montantCol = `montant_${year}`;
                const colCheck = await pool.query(
                    `SELECT column_name FROM information_schema.columns
                     WHERE table_schema = 'hub_contrats' AND table_name = 'contrats' AND column_name = ANY($1)`,
                    [[previsionCol, montantCol]]
                );
                const cols = new Set(colCheck.rows.map(r => r.column_name));
                if (cols.has(previsionCol)) {
                    const montantFilter = cols.has(montantCol) ? ` AND ${montantCol} IS NULL` : '';
                    // Le champ "nature" du contrat correspond directement au code d'article budgétaire :
                    // pas de répartition, on ne prend que les contrats de cette nature exacte.
                    const contratsRes = await pool.query(
                        `SELECT objet, raison_sociale, ${previsionCol} AS montant
                         FROM hub_contrats.contrats
                         WHERE TRIM(svc) = $1 AND TRIM(nature) = $2 AND (statut IS NULL OR statut != 'archivé')
                               AND ${previsionCol} IS NOT NULL${montantFilter}
                         ORDER BY objet`,
                        [service_code, article_code]
                    );
                    contrats = contratsRes.rows.map(r => ({
                        logiciel: r.objet || r.raison_sociale || '(sans nom)',
                        montant: parseFloat(r.montant) || 0
                    }));
                }
            }

            res.json({ engagements, contrats, telecom, operations });
        } catch (error) {
            console.error('[BudgetPrep] getLineDetail error:', error);
            res.status(500).json({ error: error.message });
        }
    }
};
