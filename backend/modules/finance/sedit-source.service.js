/**
 * Source de lecture Sedit Finances : API Sedit (API-Nova) par défaut.
 * Aucun repli Oracle local n'est utilisé pour les lectures budgétaires.
 * Le mode « internal » reste disponible uniquement pour les tests de parité.
 */
const { getSqlite } = require('../../shared/database');
const financeShare = require('./finance-share.controller');
const seditLive = require('./sedit-live-facturation.service');
const seditEngagements = require('./sedit-engagements.service');
const seditSynthese = require('./sedit-budget-synthese.service');
const api = require('./sedit-api.client');

const SETTING_SOURCE = 'finance.sedit_source';
const DEFAULT_SOURCE = 'api';

async function readSetting(key) {
    const db = getSqlite();
    if (!db) return '';
    try {
        const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
        return row?.setting_value != null ? String(row.setting_value) : '';
    } catch { return ''; }
}

async function writeSetting(key, value) {
    const db = getSqlite();
    if (!db) throw new Error('Base SQLite non initialisée.');
    await db.run(
        `INSERT INTO app_settings (setting_key, setting_value, description)
         VALUES (?, ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
        [key, String(value ?? ''), 'Source de lecture Sedit Finances']
    );
}

async function getSource() {
    const v = (await readSetting(SETTING_SOURCE)).trim().toLowerCase();
    return v === 'api' ? 'api' : DEFAULT_SOURCE;
}

function maskKey(key) {
    const s = String(key || '');
    if (!s) return '';
    if (s.length <= 12) return '••••';
    return `${s.slice(0, 12)}…${s.slice(-4)}`;
}

async function getPublicConfig() {
    const cfg = await api.getConfig();
    return {
        source: await getSource(),
        api_url: cfg.url,
        api_key_set: !!cfg.key,
        api_key_hint: maskKey(cfg.key),
        timeout_ms: cfg.timeoutMs,
    };
}

async function saveConfig({ source, api_url, api_key, timeout_ms } = {}) {
    if (source !== undefined) {
        const s = String(source).trim().toLowerCase();
        if (!['internal', 'api'].includes(s)) throw new Error('Source invalide : interne ou api.');
        await writeSetting(SETTING_SOURCE, s);
    }
    if (api_url !== undefined) {
        const u = api.normalizeUrl(api_url);
        if (!/^https?:\/\//i.test(u)) throw new Error('URL API invalide.');
        await writeSetting(api.SETTING_URL, u);
    }
    if (api_key !== undefined && String(api_key).trim()) {
        await writeSetting(api.SETTING_KEY, String(api_key).trim());
    }
    if (timeout_ms !== undefined && timeout_ms !== null && timeout_ms !== '') {
        const n = parseInt(timeout_ms, 10);
        if (!Number.isFinite(n) || n < 1000 || n > 120000) throw new Error('Timeout API invalide (1000 à 120000 ms).');
        await writeSetting(api.SETTING_TIMEOUT, String(n));
    }
    return getPublicConfig();
}

async function testSources() {
    const out = { internal: null, api: null };
    try {
        await financeShare.withFinanceOracle(async (conn) => conn.execute('SELECT 1 AS OK FROM DUAL'));
        out.internal = { ok: true, message: 'Oracle Sedit Finances joignable.' };
    } catch (e) {
        out.internal = { ok: false, message: e.message };
    }
    try {
        const moi = await api.moi();
        out.api = { ok: true, message: `API Sedit joignable (${moi?.base_sedit === 'test' ? 'base test' : 'base production'}).`, moi };
    } catch (e) {
        out.api = { ok: false, message: e.message };
    }
    return out;
}

function splitBudget(label) {
    const s = String(label || '').trim();
    if (!s) return { code: '', lib: '' };
    if (/^principal$/i.test(s)) return { code: '00', lib: s };
    const m = s.match(/^([0-9A-Z]{1,8})\s*-\s*(.+)$/i);
    return m ? { code: m[1].toUpperCase(), lib: m[2].trim() } : { code: '', lib: s };
}

function factureState(r) {
    if (r.date_rejet) return 'FACTURE REFUSEE';
    const st = String(r.statut || '').toUpperCase();
    if (st.includes('MANDAT')) return 'FACTURE MANDATEE';
    if (r.service_fait === 'valide') return 'SERVICE FAIT';
    return 'FACTURE RECUE';
}

function mapFacture(r) {
    const b = splitBudget(r.budget);
    return {
        FACTURE_ROO_IMA_REF: r.id,
        FACTURE_FACTURE: r.numero,
        FACTURE_REFERENCE: r.reference || '',
        FACTURE_LIBELLE1: r.libelle || '',
        FACTURE_LIBELLE2: r.tiers?.nom || '',
        FACTURE_MONTANTTC_E: r.montant_ttc,
        FACTURE_DATENTREE: r.date_entree,
        FACTURE_DATPAIPREV: r.date_paiement_prevue,
        FACETAT_LIBELLE: factureState(r),
        FACETAT_BLOCAGE: null,
        SERVICEFI_CLEACCES: r.service?.code || '',
        SERVICEFI_LIBELLE: r.service?.libelle || '',
        FACTURE_POBJ_EXTRACT_1: b.code,
        BUDGET_BUDGET: b.code,
        BUDGET_LIBELLE: b.lib,
        TIERS_POBJ_EXTRACT_2: r.tiers?.nom || '',
        TIERS_POBJ_EXTRACT_3: r.tiers?.prenom || '',
        _sedit_api: r,
    };
}

function mapCommande(r) {
    const b = splitBudget(r.budget);
    return {
        COMMANDE_ROO_IMA_REF: r.id,
        COMMANDE_COMMANDE: r.numero,
        COMMANDE_LIBELLE: r.libelle || '',
        COMMANDE_CMD_LIBELLE2: '',
        COMMANDE_CMD_DATECOMMANDE: r.date,
        COMMANDE_CMD_COMMENTAIRE: r.commentaire || '',
        COMMANDE_MONTANT_HT: r.montant_ht,
        COMMANDE_MONTANT_TVA: r.montant_tva,
        COMMANDE_MONTANT_TTC: r.montant_ttc,
        COMMANDE_NB_LIGNES_COMMANDE: r.nb_lignes,
        BUDGET_BUDGET: b.code,
        BUDGET_LIBELLE: b.lib,
        TIERS_TIERS: r.tiers?.numero || '',
        SERVICEFI_CLEACCES: r.service?.code || '',
        SERVICEFI_LIBELLE: r.service?.libelle || '',
        section: r.section || 'F',
        _sedit_api: r,
    };
}

async function readFactures(year, opts = {}) {
    const source = await getSource();
    if (source === 'api') {
        const rows = await api.factures(year, { budget: opts.budgetScope === 'Ville' ? 'PRINCIPAL' : undefined, actor: opts.actor, clientApp: opts.clientApp });
        return { rows: rows.map(mapFacture), source: 'sedit-api' };
    }
    const rows = await seditLive.readFactures(year, { refresh: opts.refresh });
    return { rows, source: 'sedit-live' };
}

async function readCommandes(year, opts = {}) {
    const source = await getSource();
    if (source === 'api') {
        const rows = await api.commandes(year, { budget: opts.budgetScope === 'Ville' ? 'PRINCIPAL' : undefined, actor: opts.actor, clientApp: opts.clientApp });
        return { rows: rows.map(mapCommande), source: 'sedit-api' };
    }
    const rows = await seditLive.readCommandes(year, { refresh: opts.refresh });
    return { rows, source: 'sedit-live' };
}

function budgetLabel(code, lib) {
    const c = String(code || '').trim();
    const l = String(lib || '').trim();
    return c && l ? `${c} - ${l}` : (l || c);
}

function mapEngagementRows(rows) {
    return rows.map(r => {
        const imp = String(r.ligne_budgetaire || '').split('.')[0] || '';
        return {
            'Code mouvement': r.mouvement || '',
            'Libellé mouvement': r.libelle_mouvement || '',
            'Libellé': r.libelle || '',
            'Avancement': r.avancement || '',
            'Exercice': String(r.exercice || ''),
            'Budget': budgetLabel(r.budget_code, r.budget),
            'Imputation': imp,
            'Section': r.section || '',
            'Article par nature': r.article || '',
            'Chapitre par nature': r.chapitre || '',
            'Référence Fonctionnelle': r.fonction || '',
            'Service Gestionnaire': r.service || '',
            'Nom tiers': r.tiers?.nom || '',
            'Commande': r.commande?.numero || '',
            'Montant TTC': n(r.montant_ttc),
            'Reste engagé': n(r.reste_engage),
        };
    });
}

function mapBudgetLine(r) {
    const code = r.code || '';
    const budgetCode = r.budget_code || '';
    const lib = r.budget || '';
    const fonction = r.fonction || '';
    return {
        'Code': code,
        'Libellé': r.libelle || '',
        'Budget': budgetLabel(budgetCode, lib),
        'Code budget': budgetCode,
        'Masque': [r.chapitre, fonction, r.article].filter(Boolean).join('-'),
        'Sens': r.sens || 'D',
        'Section': r.section || '',
        'Article par nature': r.article || '',
        'Chapitre par nature': r.chapitre || '',
        'Référence Fonctionnelle': fonction,
        "Opération d'équipement": r.operation || '',
        'Service Gestionnaire': r.service || '',
        EQUIPEMENT: r.equipement || '-',
        TVA: '-',
        JE: '-',
        'Budget voté': n(r.vote),
        'Disponible': n(r.disponible_prevision != null ? r.disponible_prevision : (n(r.vote) - n(r.prevision))),
        'Mt. prévision': n(r.prevision),
        'Mt. pré-engagé': n(r.pre_engage),
        'Mt. engagé': n(r.engage),
        'Mt. facturé': n(r.facture),
        'Mt. pré-mandaté': n(r.pre_mandate),
        'Mt. mandaté': n(r.mandate),
        'Mt. payé': n(r.tresorerie),
    };
}

async function readEngagementRows(year, opts = {}) {
    const source = await getSource();
    if (source === 'api') {
        const rows = await api.engagements(year, { actor: opts.actor, clientApp: opts.clientApp });
        return { rows: mapEngagementRows(rows), source: 'sedit-api' };
    }
    return { rows: await seditEngagements.readEngagementRows(year), source: 'sedit-live' };
}

async function readBudgetLines({ exercice, scope, budget, actor, clientApp } = {}) {
    const y = parseInt(exercice, 10) || new Date().getFullYear();
    const source = await getSource();
    if (source === 'api') {
        const rows = await api.lignesBudgetaires(y, {
            budget: scope === 'Ville' ? 'PRINCIPAL' : budget,
            actor, clientApp,
        });
        return { rows: rows.map(mapBudgetLine), source: 'sedit-api' };
    }
    return { rows: await seditSynthese.getBudgetLines({ exercice: y, scope }), source: 'sedit-live' };
}

async function readVirementLines({ fiscalYear, budget = '', allBudgets = false, services = [], actor, clientApp } = {}) {
    const y = Number(fiscalYear) || new Date().getFullYear();
    const wanted = String(budget || '').trim().toUpperCase();
    const allowed = wanted ? services.filter(s => String(s.budget).toUpperCase() === wanted)
        : (allBudgets ? services : services.filter(s => String(s.budget).toUpperCase() === 'PRINCIPAL'));
    if (!allowed.length) return { rows: [], source: 'sedit-api' };

    const byBudget = new Map();
    for (const s of allowed) {
        if (!byBudget.has(s.budget)) byBudget.set(s.budget, new Set());
        byBudget.get(s.budget).add(s.service);
    }
    const out = [];
    for (const [budgetLabel, set] of byBudget) {
        const rows = await api.lignesBudgetaires(y, {
            budget: budgetLabel,
            service: [...set].join(','),
            sens: '',
            actor, clientApp,
        });
        out.push(...rows.map(mapBudgetLine));
    }
    return { rows: out, source: 'sedit-api' };
}

async function demandesEnCoursApi(year, { actor, clientApp } = {}) {
    const { pool } = require('../../shared/database');
    const dem = (await pool.query(
        `SELECT id, designation, montant, section, commande_roo FROM finance.demandes_commande
          WHERE EXTRACT(YEAR FROM created_at) = $1 ORDER BY created_at, id`, [year]
    )).rows;
    const associated = new Set((await pool.query(
        `SELECT TRIM(commande_roo) AS roo FROM finance.demandes_commande WHERE commande_roo IS NOT NULL`
    )).rows.map(r => r.roo));
    const commandes = await api.commandes(year, { actor, clientApp });
    const free = commandes
        .filter(c => !associated.has(String(c.id || '').trim()))
        .map(c => ({ montant: n(c.montant_ttc), used: false }));
    const out = [];
    for (const d of dem) {
        if (d.commande_roo) continue;
        const montant = n(d.montant);
        const twin = free.find(c => !c.used && Math.abs(c.montant - montant) < 0.005);
        if (twin) { twin.used = true; continue; }
        out.push({ id: d.id, designation: d.designation, section: d.section || '', montant });
    }
    return out;
}

async function readBudgetSynthese({ exercice, scope, budget, actor, clientApp } = {}) {
    const y = parseInt(exercice, 10) || new Date().getFullYear();
    const source = await getSource();
    if (source !== 'api') return seditSynthese.getBudgetSynthese({ exercice: y, scope, budget });
    {
        const lines = (await api.lignesBudgetaires(y, {
            budget: scope === 'Ville' ? 'PRINCIPAL' : budget, actor, clientApp,
        })).map(mapBudgetLine);
        const groups = new Map();
        for (const l of lines) {
            const key = [l.Section, l['Chapitre par nature'], l['Article par nature'], l['Service Gestionnaire']].join('|');
            let g = groups.get(key);
            if (!g) groups.set(key, g = {
                section: l.Section || '', chapitre: l['Chapitre par nature'] || '', nature: l['Article par nature'] || '',
                service: l['Service Gestionnaire'] || '', service_libelle: l['Service Gestionnaire'] || '',
                vote: 0, disponible: 0, engage: 0, en_cours: 0, mandate: 0,
            });
            g.vote += n(l['Budget voté']);
            g.disponible += n(l['Disponible']);
            g.engage += n(l['Mt. engagé']);
            g.en_cours += n(l['Mt. pré-engagé']) - n(l['Mt. engagé']);
            g.mandate += n(l['Mt. mandaté']);
        }
        const demandes = await demandesEnCoursApi(y, { actor, clientApp });
        return {
            exercice: y,
            scope: scope === 'Ville' ? 'Ville' : 'All',
            demandes_count: demandes.length,
            rows: [...groups.values(), ...demandes.map(d => ({
                section: d.section, chapitre: 'DEMANDES', nature: '', service: '', service_libelle: '',
                vote: 0, disponible: 0, engage: 0, en_cours: d.montant, mandate: 0,
                source: 'demande', demande_id: d.id, demande_designation: d.designation,
            }))],
            source: 'sedit-api',
        };
    }
}

const n = (v) => Number(v) || 0;
const money = (v) => Math.round(n(v) * 100) / 100;

function sumRows(rows, fn) { return rows.reduce((a, r) => a + n(fn(r)), 0); }

async function compare(year) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const out = { exercice: y, compare_at: new Date().toISOString(), datasets: {} };

    const safe = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message }; } };

    const [intFact, apiFact, intCmd, apiCmd, intEng, apiEng, intLines, apiLines] = await Promise.all([
        safe(() => seditLive.readFactures(y)),
        safe(() => api.factures(y)),
        safe(() => seditLive.readCommandes(y)),
        safe(() => api.commandes(y)),
        safe(() => seditEngagements.readEngagementRows(y)),
        safe(() => api.engagements(y)),
        safe(() => seditSynthese.getBudgetLines({ exercice: y, scope: 'All' })),
        safe(() => api.lignesBudgetaires(y)),
    ]);

    if (intFact.ok && apiFact.ok) {
        const intRows = intFact.value.filter(r => String(r.FACTURE_DATENTREE || '').slice(0, 4) === String(y));
        const apiRows = apiFact.value.filter(r => String(r.date_entree || '').slice(0, 4) === String(y));
        out.datasets.factures = {
            internal: { count: intRows.length, montant_ttc: money(sumRows(intRows, r => r.FACTURE_MONTANTTC_E)) },
            api: { count: apiRows.length, montant_ttc: money(sumRows(apiRows, r => r.montant_ttc)) },
        };
    } else out.datasets.factures = { error: intFact.error || apiFact.error };

    if (intCmd.ok && apiCmd.ok) {
        out.datasets.commandes = {
            internal: { count: intCmd.value.length, montant_ttc: money(sumRows(intCmd.value, r => r.COMMANDE_MONTANT_TTC)) },
            api: { count: apiCmd.value.length, montant_ttc: money(sumRows(apiCmd.value, r => r.montant_ttc)) },
        };
    } else out.datasets.commandes = { error: intCmd.error || apiCmd.error };

    if (intEng.ok && apiEng.ok) {
        out.datasets.engagements = {
            internal: { count: intEng.value.length, montant: money(sumRows(intEng.value, r => r['Montant TTC'])) },
            api: { count: apiEng.value.length, montant: money(sumRows(apiEng.value, r => r.montant_ttc)) },
        };
    } else out.datasets.engagements = { error: intEng.error || apiEng.error };

    if (intLines.ok && apiLines.ok) {
        out.datasets.lignes = {
            internal: { count: intLines.value.length, vote: money(sumRows(intLines.value, r => r['Budget voté'])), engage: money(sumRows(intLines.value, r => r['Mt. engagé'])) },
            api: { count: apiLines.value.length, vote: money(sumRows(apiLines.value, r => r.vote)), engage: money(sumRows(apiLines.value, r => r.engage)) },
            note: 'Les totaux doivent être identiques ; le nombre de lignes peut différer (regroupement API plus large).',
        };
    } else out.datasets.lignes = { error: intLines.error || apiLines.error };

    return out;
}

module.exports = {
    getSource, getPublicConfig, saveConfig, testSources, compare,
    readFactures, readCommandes, readEngagementRows, readBudgetLines, readVirementLines, readBudgetSynthese,
};
