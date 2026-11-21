/**
 * Source de lecture Sedit Finances : Oracle direct (comportement historique)
 * ou API Sedit (API-Nova). Bascule par paramétrage, sans redémarrage.
 *
 * Périmètre branché pour l'instant : factures et commandes de /budget.
 * Les autres lectures (engagements, lignes, synthèse) restent en direct ; le
 * comparateur permet de vérifier l'API avant de les basculer.
 */
const { getSqlite } = require('../../shared/database');
const financeShare = require('./finance-share.controller');
const seditLive = require('./sedit-live-facturation.service');
const seditEngagements = require('./sedit-engagements.service');
const seditSynthese = require('./sedit-budget-synthese.service');
const api = require('./sedit-api.client');

const SETTING_SOURCE = 'finance.sedit_source';
const DEFAULT_SOURCE = 'internal';

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
        try {
            const rows = await api.factures(year, { budget: opts.budgetScope === 'Ville' ? 'PRINCIPAL' : undefined, actor: opts.actor, clientApp: opts.clientApp });
            return { rows: rows.map(mapFacture), source: 'sedit-api' };
        } catch (e) {
            console.warn('[SEDIT SOURCE] API factures indisponible, repli direct :', e.message);
            const rows = await seditLive.readFactures(year, { refresh: opts.refresh });
            return { rows, source: 'sedit-live-fallback', warning: e.message };
        }
    }
    const rows = await seditLive.readFactures(year, { refresh: opts.refresh });
    return { rows, source: 'sedit-live' };
}

async function readCommandes(year, opts = {}) {
    const source = await getSource();
    if (source === 'api') {
        try {
            const rows = await api.commandes(year, { budget: opts.budgetScope === 'Ville' ? 'PRINCIPAL' : undefined, actor: opts.actor, clientApp: opts.clientApp });
            return { rows: rows.map(mapCommande), source: 'sedit-api' };
        } catch (e) {
            console.warn('[SEDIT SOURCE] API commandes indisponible, repli direct :', e.message);
            const rows = await seditLive.readCommandes(year, { refresh: opts.refresh });
            return { rows, source: 'sedit-live-fallback', warning: e.message };
        }
    }
    const rows = await seditLive.readCommandes(year, { refresh: opts.refresh });
    return { rows, source: 'sedit-live' };
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
    readFactures, readCommandes,
};
