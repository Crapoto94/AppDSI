const xlsx = require('xlsx');
const { pool } = require('../../shared/database');

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
            // La prévision N = engagements N par (service, article) + contrats N répartis sur les
            // natures du service (les contrats n'ont ni article ni fonction fiable).
            const now = new Date();
            const yearN = now.getFullYear();
            const yearN1 = yearN - 1;
            const round2 = (n) => Math.round(n * 100) / 100;

            const engagementsAgg = async (exercice, excludeOr) => {
                const bySA = new Map(); // clé "service||article" → montant (réalisé) ou engagé (prévision)
                try {
                    const orFilter = excludeOr ? ` AND TRIM("Avancement") != 'OR'` : '';
                    const r = await pool.query(
                        `SELECT TRIM("Service Gestionnaire") AS service, TRIM("Article par nature") AS article,
                                SUM("Montant TTC") AS montant, SUM("Reste engagé") AS reste
                         FROM oracle.budget_engagements
                         WHERE "Exercice" = $1 AND "Référence Fonctionnelle" IS NOT NULL AND TRIM("Référence Fonctionnelle") != ''${orFilter}
                         GROUP BY TRIM("Service Gestionnaire"), TRIM("Article par nature")`,
                        [String(exercice)]
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

            const contratsPrevisionByService = async (year) => {
                const map = new Map();
                const col = `prevision_${year}`;
                try {
                    const colCheck = await pool.query(
                        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'hub_contrats' AND table_name = 'contrats' AND column_name = $1`,
                        [col]
                    );
                    if (colCheck.rowCount === 0) return map;
                    const r = await pool.query(
                        `SELECT TRIM(svc) AS svc, SUM(${col}) AS montant
                         FROM hub_contrats.contrats
                         WHERE (statut IS NULL OR statut != 'archivé') AND ${col} IS NOT NULL
                         GROUP BY TRIM(svc)`
                    );
                    for (const row of r.rows) {
                        map.set(row.svc, parseFloat(row.montant) || 0);
                    }
                } catch (e) {
                    console.error('[BudgetPrep] contratsPrevisionByService error:', e.message);
                }
                return map;
            };

            const [engagementsN1, engagementsN, contratsN] = await Promise.all([
                engagementsAgg(yearN1, true),  // réalisé : exclut les OR (doublons des TR)
                engagementsAgg(yearN, false),   // prévision : engagements N (engagé)
                contratsPrevisionByService(yearN)
            ]);

            const realiseN1Key = `realise_engage_${yearN1}`;
            const previsionNKey = `prevision_${yearN}`;

            // Répartition des contrats N sur les natures de chaque service (les contrats n'ont pas d'article)
            const articlesPerService = new Map();
            for (const row of rows) {
                const service = (row.service_code || '').trim();
                if (!service) continue;
                if (!articlesPerService.has(service)) articlesPerService.set(service, new Set());
                articlesPerService.get(service).add((row.article_code || '').trim());
            }
            const contratsShareByService = new Map();
            for (const [service, articles] of articlesPerService) {
                const total = contratsN.get(service) || 0;
                const share = articles.size > 0 ? total / articles.size : 0;
                contratsShareByService.set(service, share);
            }

            // Attache les valeurs (par service/article) sur chaque ligne détail correspondante
            for (const row of rows) {
                const service = (row.service_code || '').trim();
                const article = (row.article_code || '').trim();
                const saKey = `${service}||${article}`;
                if (engagementsN1.has(saKey)) row.values[realiseN1Key] = round2(engagementsN1.get(saKey));
                const engage = engagementsN.get(saKey) || 0;
                const prevision = engage + (contratsShareByService.get(service) || 0);
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
            totals[previsionNKey] = round2(
                [...engagementsN.values()].reduce((s, v) => s + v, 0) +
                [...contratsN.values()].reduce((s, v) => s + v, 0)
            );

            // Construction de la liste ordonnée des colonnes (réalisé N-1, voté N, prévision N, ...)
            const periodSet = new Set();
            for (const key of Object.keys(totals)) periodSet.add(key);
            for (const row of rows) for (const key of Object.keys(row.values)) periodSet.add(key);

            const typeRank = { realise: -1, vote: 1, realise_engage: 2, prevision: 3 };
            const columns = Array.from(periodSet).map(key => {
                let type, yearStr;
                if (key === realiseN1Key) { type = 'realise_engage'; yearStr = String(yearN1); }
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
    }
};
