/**
 * Catalogue des KPI « réunion de service ».
 *
 * Les indicateurs repris sont ceux du tableau de bord DSI : chaque définition
 * appelle l'API interne déjà utilisée par les widgets (/api/tickets/stats,
 * /api/parc/hub/kpis, /api/copieurs/kpi…), avec le jeton de l'utilisateur qui
 * lance la réunion. Aucune donnée n'est dupliquée : on réutilise la même source
 * de vérité que /dsi-dashboard.
 *
 * Deux familles :
 *  - periodic: true  → l'API accepte une plage (from/to) : les KPI sont calculés
 *    sur la période choisie et peuvent être comparés à une autre période.
 *  - periodic: false → photo « à date » (parc, contrats, prêts…) : période et
 *    comparaison ne s'appliquent pas.
 */
const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT) || 3001;
const INTERNAL_BASE = String(process.env.INTERNAL_API_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const INTERNAL_CLIENT = INTERNAL_BASE.startsWith('https:') ? https : http;

// ── Appel HTTP interne (réutilise les endpoints du dashboard) ────────────────
// `cache` (Map) permet de mutualiser les appels d'un même endpoint entre
// plusieurs KPI d'une même réunion (ex. 8 indicateurs issus de /api/tickets/stats).
function apiGet(pathWithQuery, token, cache) {
  if (cache && cache.has(pathWithQuery)) return cache.get(pathWithQuery);
  const url = `${INTERNAL_BASE}${pathWithQuery}`;
  const promise = new Promise((resolve, reject) => {
    const req = INTERNAL_CLIENT.get(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 25000,
      ...(INTERNAL_CLIENT === https ? { rejectUnauthorized: false } : {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} sur ${pathWithQuery}`));
        }
        try { resolve(body ? JSON.parse(body) : null); }
        catch (e) { reject(new Error(`Réponse non JSON sur ${pathWithQuery}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`Délai dépassé sur ${pathWithQuery}`)); });
    req.on('error', reject);
  });
  if (cache) {
    cache.set(pathWithQuery, promise);
    promise.catch(() => cache.delete(pathWithQuery));
  }
  return promise;
}
const api = (ctx, pathWithQuery) => apiGet(pathWithQuery, ctx.token, ctx.cache);

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};
const withRange = (base, ctx) => {
  const groupId = (() => {
    const g = ctx.filters && ctx.filters.ticket_group;
    return g && g.value != null && String(g.value) !== '' ? String(g.value) : null;
  })();
  return `${base}${qs({
    ...(ctx.extraParams || {}),
    ...(groupId ? { group_id: groupId } : {}),
    from: ctx.from,
    to: ctx.to,
  })}`;
};

// ── Périodes ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: '7d', label: '7 derniers jours' },
  { key: '30d', label: '30 derniers jours' },
  { key: '90d', label: '90 derniers jours' },
  { key: '12m', label: '12 derniers mois' },
  { key: 'month_current', label: 'Mois en cours' },
  { key: 'month_previous', label: 'Mois précédent' },
  { key: 'since_last_meeting', label: 'Depuis la réunion précédente' },
  { key: 'custom', label: 'Dates personnalisées' },
];
const COMPARISONS = [
  { key: 'none', label: 'Aucune comparaison' },
  { key: 'previous', label: 'Période précédente (même durée)' },
  { key: 'year', label: "Même période l'an dernier" },
];
const DISPLAYS = [
  { key: 'number', label: 'Valeur chiffrée' },
  { key: 'bar', label: 'Valeur + jauge comparative' },
  { key: 'list', label: 'Liste de valeurs' },
];

const ymd = (d) => {
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
};
const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
};

/** Résout la période {from,to,label,preset} d'un KPI pour une réunion donnée. */
function resolvePeriod(config, ctx) {
  const ref = ymd(ctx.meetingDate) || ymd(new Date());
  const preset = config?.period || '30d';
  if (preset === 'custom') {
    const from = ymd(config.from) || addDays(ref, -30);
    const to = ymd(config.to) || ref;
    return { from, to, label: `du ${frDate(from)} au ${frDate(to)}`, preset };
  }
  if (preset === 'month_current') {
    const from = `${ref.slice(0, 7)}-01`;
    return { from, to: ref, label: `Mois en cours (${frMonth(ref)})`, preset };
  }
  if (preset === 'month_previous') {
    const d = new Date(`${ref.slice(0, 7)}-01T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear(); const m = d.getMonth();
    const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { from: first, to: last, label: `Mois précédent (${frMonth(first)})`, preset };
  }
  if (preset === 'since_last_meeting' && ctx.previousMeetingDate) {
    const from = ymd(ctx.previousMeetingDate);
    return { from, to: ref, label: `Depuis la réunion du ${frDate(from)}`, preset };
  }
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : preset === '12m' ? 365 : 30;
  const from = addDays(ref, -days);
  return {
    from, to: ref,
    label: preset === '12m' ? '12 derniers mois' : `${days} derniers jours`,
    preset: preset === 'since_last_meeting' ? '30d' : preset,
  };
}

/** Période de comparaison : même durée juste avant, ou un an plus tôt. */
function comparisonPeriod(period, compare) {
  if (!compare || compare === 'none') return null;
  const from = new Date(`${period.from}T12:00:00`);
  const to = new Date(`${period.to}T12:00:00`);
  if (compare === 'year') {
    from.setFullYear(from.getFullYear() - 1);
    to.setFullYear(to.getFullYear() - 1);
  } else {
    const days = Math.round((to - from) / 86400000) + 1;
    to.setDate(to.getDate() - days);
    from.setDate(from.getDate() - days);
  }
  const f = ymd(from); const t = ymd(to);
  return {
    from: f, to: t,
    label: compare === 'year' ? `même période l'an dernier` : `période précédente`,
  };
}

function frDate(s) {
  if (!s) return '—';
  try { return new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); }
  catch { return s; }
}
function frMonth(s) {
  try { return new Date(`${String(s).slice(0, 7)}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
  catch { return s; }
}

// ── Catalogue ────────────────────────────────────────────────────────────────
// run(ctx) → { value, sub } (valeur) | { items: [{label,value,sub}] } (liste)
//          | { series: [...], seriesKeys: [...] } (courbe)
const DEFS = [];

// Filtres proposés par module (périmètre du KPI). `source` alimente les listes
// déroulantes du configurateur (voir getFilterSources).
const MODULE_FILTERS = {
  Projets: [
    { key: 'project_manager', label: 'Chef de projet', source: 'project_managers' },
    { key: 'project_service', label: 'Service pilote', source: 'project_services' },
    { key: 'project_status', label: 'Statut du projet', source: 'project_statuses' },
  ],
  Tickets: [
    { key: 'ticket_group', label: "Groupe d'affectation", source: 'ticket_groups' },
  ],
};
const filtersFor = (module) => MODULE_FILTERS[module] || [];

// Source de la donnée, affichée sur le KPI (HUB = copie locale synchronisée).
const MODULE_SOURCES = {
  Tickets: 'HUB Tickets (synchro GLPI)',
  Parc: 'HUB Parc (dernière synchro)',
  Copieurs: 'Relevés copieurs',
  Budget: 'SEDIT Finances',
  Télécom: 'Factures opérateur',
  Contrats: 'Contrats AppDSI',
  Certificats: 'Certificats AppDSI',
  Prêts: 'Prêts AppDSI',
  Tâches: 'Tâches AppDSI',
  Consommables: 'Consommables AppDSI',
  Projets: 'Projets AppDSI',
  Entretiens: 'Entretiens AppDSI',
  'Réunions de service': 'Réunions de service',
  MagApp: 'MagApp',
  Réseau: 'Réseau (switchs)',
  Notes: 'Mes Notes',
  Système: 'Système',
  RH: 'Studio RH',
};

function def(module, key, label, opts) {
  const kind = opts.kind || (opts.multi ? 'list' : 'value');
  DEFS.push({
    key, label, module,
    unit: opts.unit || 'count',
    periodic: opts.periodic !== false,
    kind,
    multi: kind === 'list',
    chart: opts.chart || (kind === 'chart' ? 'line' : null),
    description: opts.description || '',
    filters: filtersFor(module),
    source: opts.source || MODULE_SOURCES[module] || null,
    run: opts.run,
  });
}

// Filtre actif (objet {value,label}) ou null.
const filterValue = (ctx, key) => {
  const f = ctx.filters && ctx.filters[key];
  return f && f.value != null && String(f.value) !== '' ? String(f.value) : null;
};

// — Tickets (période) —───────────────────────────────────────────────────────
const ticketsRun = (pick) => async (ctx) => {
  const d = await api(ctx, withRange('/api/tickets/stats', ctx));
  return { value: pick(d) };
};
def('Tickets', 'tickets.ouverts', 'Tickets ouverts', { run: ticketsRun(d => num(d?.overview?.open)), description: 'Tickets créés sur la période et encore ouverts (nouveau, en cours)' });
def('Tickets', 'tickets.critiques', 'Tickets critiques ouverts', { run: ticketsRun(d => num(d?.overview?.critical_open)), description: 'Priorité critique, encore ouverts' });
def('Tickets', 'tickets.resolus_jour', 'Tickets résolus / jour', { unit: 'decimal', run: ticketsRun(d => num(d?.resolvedAvgPerDay)), description: 'Moyenne journalière de résolution' });
def('Tickets', 'tickets.sla', 'SLA violés', { run: ticketsRun(d => num(d?.overview?.sla_breached)), description: 'Tickets de la période dont le SLA est violé' });
def('Tickets', 'tickets.resolus', 'Tickets résolus (période)', { run: ticketsRun(d => num(d?.overview?.resolved)) });
def('Tickets', 'tickets.crees', 'Tickets créés (période)', { run: ticketsRun(d => num(d?.overview?.total)) });

// — Parc informatique (photo à date) —───────────────────────────────────────
const parcRun = (pick) => async (ctx) => {
  const d = await api(ctx, '/api/parc/hub/kpis');
  const o = d?.ordinateurs || {};
  return { value: pick(d, o) };
};
def('Parc', 'parc.total', 'Équipements au total', { periodic: false, run: parcRun(d => num(d?.totalAll)) });
def('Parc', 'parc.ordinateurs', 'Ordinateurs', { periodic: false, run: parcRun((d, o) => num(o.total)) });
def('Parc', 'parc.affectes', 'Ordinateurs affectés', { periodic: false, run: parcRun((d, o) => num(o.affectes)) });
def('Parc', 'parc.taux_affectation', "Taux d'affectation", { periodic: false, unit: 'percent', run: parcRun((d, o) => num(o.tauxAffectation)) });
def('Parc', 'parc.age_moyen', 'Âge moyen des PC', { periodic: false, unit: 'years', run: parcRun((d, o) => num(o?.age?.moyen)) });
def('Parc', 'parc.renouveler', 'PC à renouveler (> 5 ans)', { periodic: false, run: parcRun((d, o) => num(o?.age?.aRenouveler)) });
def('Parc', 'parc.mise_en_service', 'Mise en service connue', { periodic: false, unit: 'percent', run: parcRun((d, o) => num(o?.miseEnService?.tauxConnue)) });

// — Copieurs (photo à date) ─────────────────────────────────────────────────
const copRun = (pick) => async (ctx) => {
  const d = await api(ctx, '/api/copieurs/kpi');
  return { value: pick(d?.global || d || {}) };
};
def('Copieurs', 'copieurs.nb', 'Copies noir & blanc', { periodic: false, run: copRun(d => num(d?.totalNB)) });
def('Copieurs', 'copieurs.couleur', 'Copies couleur', { periodic: false, run: copRun(d => num(d?.totalCoul ?? d?.totalColor)) });
def('Copieurs', 'copieurs.ratio', 'Ratio N&B', { periodic: false, unit: 'percent', run: copRun(d => num(d?.ratio ?? d?.ratioNB)) });
def('Copieurs', 'copieurs.cout', 'Coût total copieurs', { periodic: false, unit: 'currency', run: copRun(d => num(d?.coutTotal ?? d?.totalCost)) });
def('Copieurs', 'copieurs.actifs', 'Copieurs actifs', { periodic: false, run: copRun(d => num(d?.nbCopieursActifs ?? d?.activeCount)) });

// — Budget / finances (année de la réunion) ─────────────────────────────────
const budgetYear = (ctx) => String(new Date(`${(ymd(ctx.meetingDate) || ymd(new Date()))}T12:00:00`).getFullYear());
const parseMoney = (v) => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.').replace(/[^\d.\-]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const budgetInvoices = async (ctx) => {
  const arr = await api(ctx, `/api/budget/invoices?fiscalYear=${budgetYear(ctx)}`);
  return Array.isArray(arr) ? arr : [];
};
const budgetOrders = async (ctx) => {
  const arr = await api(ctx, `/api/budget/orders?fiscalYear=${budgetYear(ctx)}`);
  return Array.isArray(arr) ? arr : [];
};
const budgetOperations = async (ctx) => {
  const arr = await api(ctx, `/api/budget/operations?fiscalYear=${budgetYear(ctx)}`);
  return Array.isArray(arr) ? arr : [];
};
def('Budget', 'budget.commandes', 'Montant des commandes', {
  periodic: false, unit: 'currency',
  run: async (ctx) => ({ value: (await budgetOrders(ctx)).reduce((s, o) => s + parseMoney(o['COMMANDE_MONTANT_TTC'] ?? o['Montant TTC'] ?? o.montant_ttc), 0) }),
});
def('Budget', 'budget.factures', 'Montant facturé', {
  periodic: false, unit: 'currency',
  run: async (ctx) => ({ value: (await budgetInvoices(ctx)).reduce((s, i) => s + parseMoney(i['FACTURE_MONTANTTC_E'] ?? i['Montant TTC'] ?? i.montant_ttc), 0) }),
});
def('Budget', 'budget.a_traiter', 'Factures à traiter', {
  periodic: false,
  run: async (ctx) => {
    const inv = await budgetInvoices(ctx);
    return {
      value: inv.filter(i => !/mandat|pay|refus/i.test(String(i['Etat'] ?? i.FACETAT_LIBELLE ?? ''))).length,
      sub: `${inv.length} facture(s) sur l'exercice`,
    };
  },
});
def('Budget', 'budget.engage', 'Montant engagé (opérations)', {
  periodic: false, unit: 'currency',
  run: async (ctx) => ({ value: (await budgetOperations(ctx)).reduce((s, o) => s + parseMoney(o['Montant prévu'] ?? o.montant_prevu), 0) }),
});
def('Budget', 'budget.realise', 'Montant réalisé (opérations)', {
  periodic: false, unit: 'currency',
  run: async (ctx) => ({ value: (await budgetOperations(ctx)).reduce((s, o) => s + parseMoney(o.used_amount), 0) }),
});
def('Budget', 'budget.dgp', 'DGP moyen', {
  periodic: false, unit: 'days',
  run: async (ctx) => {
    const d = await api(ctx, `/api/finance/dgp/stats?fiscal_year=${budgetYear(ctx)}`);
    return { value: num(d?.dgp_moyen), sub: `payées dans les délais : ${num(d?.taux_dans_delai)} %` };
  },
});

// — Télécom ─────────────────────────────────────────────────────────────────
const telLines = (pick) => async (ctx) => ({ value: pick(await api(ctx, '/api/telecom/lines/stats')) });
const telBilling = (pick) => async (ctx) => ({ value: pick(await api(ctx, '/api/telecom/billing/stats')) });
def('Télécom', 'telecom.lignes', 'Lignes télécom', { periodic: false, run: telLines(d => num(d?.total)) });
def('Télécom', 'telecom.fixe', 'Lignes de téléphonie fixe', { periodic: false, run: telLines(d => num(d?.fixe)) });
def('Télécom', 'telecom.internet', "Accès internet", { periodic: false, run: telLines(d => num(d?.internet)) });
def('Télécom', 'telecom.cuivre', 'Lignes à migrer (cuivre)', { periodic: false, run: telLines(d => num(d?.toMigrate)) });
def('Télécom', 'telecom.cout_mois', 'Coût télécom / mois', { periodic: false, unit: 'currency', run: telBilling(d => num(d?.totalHT)) });
def('Télécom', 'telecom.cout_annuel', 'Estimation coût / an', { periodic: false, unit: 'currency', run: telBilling(d => num(d?.annualEstimate)) });
def('Télécom', 'telecom.mobiles', 'Lignes mobiles', { periodic: false, run: telBilling(d => num(d?.mobileLines)) });
def('Télécom', 'telecom.dormantes', 'Lignes dormantes', { periodic: false, run: telBilling(d => num(d?.dormant)) });

// — Contrats / certificats / prêts / tâches / consommables (photo à date) ───
def('Contrats', 'contrats.expires', 'Contrats expirés', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/contrats/expiry-count'); return { value: num(d?.expired) }; },
});
def('Contrats', 'contrats.bientot', 'Contrats arrivant à échéance', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/contrats/expiry-count'); return { value: num(d?.soon) }; },
});
def('Certificats', 'certificats.renouveler', 'Certificats à renouveler', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/certificates/renewal-count'); return { value: num(d?.count ?? d?.renewal_count) }; },
});
def('Prêts', 'prets.en_cours', 'Prêts en cours', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/prets/kpis'); return { value: num(d?.prets_en_cours) }; },
});
def('Prêts', 'prets.retard', 'Prêts en retard', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/prets/kpis'); return { value: num(d?.prets_en_retard) }; },
});
def('Prêts', 'prets.reservations', 'Réservations en attente', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/prets/kpis'); return { value: num(d?.reservations_en_attente) }; },
});
def('Tâches', 'taches.retard', 'Tâches en retard', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/tasks/count'); return { value: num(d?.overdue) }; },
});
def('Tâches', 'taches.en_cours', 'Tâches en cours', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/tasks/count'); return { value: num(d?.en_cours) }; },
});
def('Consommables', 'consommables.attente', 'Consommables en attente', {
  periodic: false,
  run: async (ctx) => { const d = await api(ctx, '/api/consumable/pending-count'); return { value: num(d?.count) }; },
});

// — Projets (photo à date, multi-valeurs) — filtrables (chef, service, statut)
const PROJET_STATUT_LABELS = {
  idee: 'Idée', demande_initiale: 'Demande initiale', etude_dsi: 'Étude DSI', arbitrage: 'Arbitrage',
  planification: 'Planification', en_cours: 'En cours', en_recette: 'En recette', en_cloture: 'En clôture',
  cloture: 'Clôturé', refuse: 'Refusé', suspendu: 'Suspendu', abandonne: 'Abandonné', en_pause: 'En pause',
};
const getProjets = async (ctx) => {
  const raw = await api(ctx, '/api/projets');
  const arr = Array.isArray(raw) ? raw : (raw?.projets || raw?.data || []);
  const manager = filterValue(ctx, 'project_manager');
  const service = filterValue(ctx, 'project_service');
  const statut = filterValue(ctx, 'project_status');
  const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  return (Array.isArray(arr) ? arr : []).filter(p =>
    (!manager || eq(p.chef_projet_username, manager)) &&
    (!service || eq(p.service_pilote, service)) &&
    (!statut || eq(p.statut, statut))
  );
};
const countBy = (rows, pick) => {
  const map = new Map();
  for (const r of rows) {
    const label = pick(r) || 'Non renseigné';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label: truncate(label, 55), value })).sort((a, b) => b.value - a.value);
};
def('Projets', 'projets.total', 'Projets (total)', {
  periodic: false,
  run: async (ctx) => ({ value: (await getProjets(ctx)).length }),
});
def('Projets', 'projets.alertes_retard', 'Projets en retard', {
  periodic: false,
  run: async (ctx) => ({
    value: (await getProjets(ctx)).filter(p => num(p.nb_taches_en_retard) > 0 || num(p.nb_jalons_en_retard) > 0).length,
  }),
});
def('Projets', 'projets.par_statut', 'Projets par statut', {
  periodic: false, multi: true,
  run: async (ctx) => ({ items: countBy(await getProjets(ctx), p => PROJET_STATUT_LABELS[p.statut] || p.statut) }),
});

// — Entretiens professionnels (photo à date) ────────────────────────────────
const entRun = (pick) => async (ctx) => { const d = await api(ctx, '/api/entretiens/stats'); return { value: pick(d?.stats || {}) }; };
def('Entretiens', 'entretiens.total', 'Entretiens (campagne)', { periodic: false, run: entRun(s => num(s.total)) });
def('Entretiens', 'entretiens.realises', 'Entretiens réalisés', { periodic: false, run: entRun(s => num(s.realises)) });
def('Entretiens', 'entretiens.taux', 'Taux de réalisation', { periodic: false, unit: 'percent', run: entRun(s => num(s.taux_realisation)) });
def('Entretiens', 'entretiens.retard', 'Entretiens en retard', { periodic: false, run: entRun(s => num(s.en_retard)) });

// — Réunions de service (photo à date) ──────────────────────────────────────
const reuRun = (pick) => async (ctx) => { const d = await api(ctx, '/api/reunions-service/stats'); return { value: pick(d || {}) }; };
def('Réunions de service', 'reunions.total', 'Réunions (total)', { periodic: false, run: reuRun(d => num(d.total)) });
def('Réunions de service', 'reunions.terminees', 'Réunions terminées', { periodic: false, run: reuRun(d => num(d.finished)) });
def('Réunions de service', 'reunions.presence', 'Taux de présence', { periodic: false, unit: 'percent', run: reuRun(d => num(d.participation_rate)) });
def('Réunions de service', 'reunions.duree', 'Durée moyenne', { periodic: false, unit: 'minutes', run: reuRun(d => num(d.avg_duration)) });

// — MagApp ──────────────────────────────────────────────────────────────────
def('MagApp', 'magapp.idees', 'Idées en attente', {
  periodic: false,
  run: async (ctx) => {
    const r = await api(ctx, '/api/admin/magapp/ideas');
    const ideas = Array.isArray(r) ? r : (r?.ideas || []);
    return { value: ideas.filter(i => ['new', 'nouveau'].includes(String(i.status || '').toLowerCase()) || !i.status).length };
  },
});
def('MagApp', 'magapp.maintenances', 'Maintenances à venir', {
  periodic: false,
  run: async (ctx) => {
    const r = await api(ctx, '/api/admin/magapp/maintenances');
    const all = Array.isArray(r) ? r : (r?.maintenances || []);
    const now = new Date();
    return { value: all.filter(m => !m.end_date || new Date(m.end_date) >= now).length };
  },
});

// ════════════════════════════════════════════════════════════════════════════
// Catalogue étendu (tous les widgets de /dsi-dashboard) : valeurs, listes,
// répartitions et courbes.
// ════════════════════════════════════════════════════════════════════════════
const sinceDate = (ctx, days = 30) => {
  const prev = ymd(ctx.previousMeetingDate);
  if (prev) return prev;
  const ref = ymd(ctx.meetingDate) || ymd(new Date());
  return addDays(ref, -days);
};
const truncate = (s, n = 110) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const shortDate = (v) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return frDate(s.slice(0, 10));
  try { return new Date(s).toLocaleDateString('fr-FR'); } catch { return s; }
};
const priorityLabel = (p) => ({ 1: 'Très basse', 2: 'Basse', 3: 'Moyenne', 4: 'Haute', 5: 'Critique' }[Number(p)] || `P${p}`);

const ticketsStats = (ctx) => api(ctx, withRange('/api/tickets/stats', ctx));
const ticketsItems = (field, opts = {}) => async (ctx) => {
  const d = await ticketsStats(ctx);
  const rows = Array.isArray(d?.[field]) ? d[field] : [];
  const limit = opts.limit || 12;
  const items = rows.slice(0, limit).map(r => {
    const label = opts.labelFn ? opts.labelFn(r) : (r.name ?? r.label ?? r.range ?? '—');
    const raw = opts.valueKey ? r[opts.valueKey] : (r.count ?? r.value ?? r.total ?? 0);
    return {
      label: truncate(label, 60),
      value: num(raw),
      ...(opts.subFn ? { sub: truncate(opts.subFn(r), 70) } : {}),
    };
  });
  return { items };
};

// — Tickets : répartitions, listes et courbes —──────────────────────────────
def('Tickets', 'tickets.par_etat', 'Tickets par état', { kind: 'list', description: 'Répartition des tickets de la période par statut', run: ticketsItems('statusDistribution') });
def('Tickets', 'tickets.par_categorie', 'Top catégories de tickets', { kind: 'list', description: 'Catégories les plus sollicitées sur la période', run: ticketsItems('categoryDistribution', { limit: 10 }) });
def('Tickets', 'tickets.par_priorite', 'Tickets par priorité', { kind: 'list', run: ticketsItems('priorityDistribution', { labelFn: r => priorityLabel(r.priority), valueKey: 'value' }) });
def('Tickets', 'tickets.par_groupe', 'Tickets par affectation (groupe)', { kind: 'list', description: 'Charge par groupe d\'affectation sur la période', run: ticketsItems('groupDistribution', { limit: 12 }) });
def('Tickets', 'tickets.par_technicien', 'Tickets par technicien', { kind: 'list', description: 'Affectations par technicien sur la période', run: ticketsItems('technicianAssignments', { limit: 10 }) });
def('Tickets', 'tickets.sla_statut', 'Statut SLA des tickets', { kind: 'list', run: ticketsItems('slaOverview') });
def('Tickets', 'tickets.backlog_aging', 'Âge du backlog', { kind: 'list', description: 'Ancienneté des tickets encore ouverts', run: ticketsItems('backlogAging', { labelFn: r => r.range, valueKey: 'count' }) });
def('Tickets', 'tickets.semaine', 'Tickets créés cette semaine', {
  periodic: false, description: 'Comparaison avec la semaine précédente',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const w = d?.weeklyComparison || {};
    return { value: num(w.this_week), sub: `semaine dernière : ${num(w.last_week)}${w.change_pct != null ? ` (${w.change_pct > 0 ? '+' : ''}${w.change_pct} %)` : ''}` };
  },
});
def('Tickets', 'tickets.backlog_evolution', 'Évolution du backlog de tickets', {
  periodic: true, kind: 'chart', chart: 'composed',
  description: 'Créés / résolus et backlog cumulé sur la période choisie',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const rows = Array.isArray(d?.trend?.data) ? d.trend.data : [];
    return {
      series: rows.map(r => ({ label: r.label || shortDate(r.bucket), created: num(r.created), resolved: num(r.resolved), open: num(r.open) })),
      seriesKeys: [
        { key: 'created', label: 'Créés', color: '#3b82f6', type: 'bar' },
        { key: 'resolved', label: 'Résolus', color: '#22c55e', type: 'bar' },
        { key: 'open', label: 'Backlog', color: '#f59e0b', type: 'line' },
      ],
    };
  },
});
def('Tickets', 'tickets.statuts_12m', 'Statuts des tickets sur 12 mois', {
  periodic: false, kind: 'chart', chart: 'area',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const rows = Array.isArray(d?.statusTrend) ? d.statusTrend : [];
    return {
      series: rows.map(r => ({ label: r.label || r.month, open: num(r.open), resolved: num(r.resolved), rejected: num(r.rejected) })),
      seriesKeys: [
        { key: 'open', label: 'Ouverts', color: '#f59e0b', type: 'area' },
        { key: 'resolved', label: 'Résolus', color: '#22c55e', type: 'area' },
        { key: 'rejected', label: 'Rejetés', color: '#ef4444', type: 'area' },
      ],
    };
  },
});
def('Tickets', 'tickets.incidents_demandes', 'Incidents vs demandes (90 j)', {
  periodic: false, kind: 'chart', chart: 'line',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const rows = Array.isArray(d?.incidentVsRequestTrend) ? d.incidentVsRequestTrend : [];
    return {
      series: rows.map(r => ({ label: shortDate(r.week_start), incidents: num(r.incidents), requests: num(r.requests) })),
      seriesKeys: [
        { key: 'incidents', label: 'Incidents', color: '#ef4444', type: 'line' },
        { key: 'requests', label: 'Demandes', color: '#3b82f6', type: 'line' },
      ],
    };
  },
});
def('Tickets', 'tickets.derniers', 'Derniers tickets', {
  periodic: true, kind: 'list', description: 'Les 12 derniers tickets créés sur la période',
  run: async (ctx) => {
    const d = await api(ctx, `${withRange('/api/tickets', ctx)}&limit=30&sort=date_creation&order=desc`);
    const rows = Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []);
    return {
      items: rows.slice(0, 12).map(t => ({
        label: truncate(`#${t.id} ${t.title || t.subject || t.name || ''}`, 80),
        value: 0,
        sub: [
          t.status?.label || t.status_label || t.status,
          t.priority?.label || t.priority_label || (t.priority ? priorityLabel(t.priority) : ''),
          t.type_label || '',
          shortDate(t.date_creation),
        ].filter(Boolean).join(' · '),
      })),
    };
  },
});

// — Budget : dernières commandes / factures, tranches d'âge, dépenses —──────
def('Budget', 'budget.dernieres_commandes', 'Dernières commandes', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const arr = await budgetOrders(ctx);
    const dt = (o) => String(o['Date de la commande'] || o.COMMANDE_CMD_DATECOMMANDE || '');
    arr.sort((a, b) => dt(b).localeCompare(dt(a)));
    return {
      items: arr.slice(0, 10).map(o => {
        const amount = parseMoney(o['Montant TTC'] ?? o.COMMANDE_MONTANT_TTC ?? o._total_ttc);
        const affectee = !!(o.operation_id || o.operation_label);
        return {
          label: truncate(o['Libellé'] || o.COMMANDE_LIBELLE || o['N° Commande'] || '—', 70),
          value: Math.round(amount),
          text: `${Math.round(amount).toLocaleString('fr-FR')} €`,
          sub: [shortDate(dt(o)), o['Service émetteur'], affectee ? (o.operation_label || 'Affectée') : 'Non affectée'].filter(Boolean).join(' · '),
        };
      }),
    };
  },
});
def('Budget', 'budget.dernieres_factures', 'Dernières factures', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const arr = await budgetInvoices(ctx);
    const dt = (i) => String(i['Arrivée'] || i.FACTURE_DATENTREE || '');
    arr.sort((a, b) => dt(b).localeCompare(dt(a)));
    return {
      items: arr.slice(0, 10).map(i => {
        const amount = parseMoney(i['Montant TTC'] ?? i.FACTURE_MONTANTTC_E);
        return {
          label: truncate(i['Libellé'] || i['Fournisseur'] || i['N° Facture interne'] || '—', 70),
          value: Math.round(amount),
          text: `${Math.round(amount).toLocaleString('fr-FR')} €`,
          sub: [shortDate(dt(i)), i['Fournisseur'], i['Etat'] ?? i.FACETAT_LIBELLE].filter(Boolean).join(' · '),
        };
      }),
    };
  },
});
def('Budget', 'budget.factures_age', 'Factures à traiter par ancienneté', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const arr = await budgetInvoices(ctx);
    const pending = arr.filter(i => !/mandat|pay|refus/i.test(String(i['Etat'] ?? i.FACETAT_LIBELLE ?? '')));
    const counts = { '+30j': 0, '+20j': 0, '+10j': 0, 'Récentes': 0 };
    const now = Date.now();
    for (const inv of pending) {
      const t = new Date(inv['Arrivée'] || inv.FACTURE_DATENTREE || inv.created_at || 0).getTime();
      if (!t) { counts['Récentes'] += 1; continue; }
      const days = Math.floor((now - t) / 86400000);
      if (days >= 30) counts['+30j'] += 1;
      else if (days >= 20) counts['+20j'] += 1;
      else if (days >= 10) counts['+10j'] += 1;
      else counts['Récentes'] += 1;
    }
    return { items: Object.entries(counts).map(([label, value]) => ({ label, value })) };
  },
});
def('Budget', 'budget.factures_par_etat', 'Factures par état', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const arr = await budgetInvoices(ctx);
    const map = new Map();
    for (const i of arr) {
      const k = String(i['Etat'] ?? i.FACETAT_LIBELLE ?? 'Non renseigné').trim() || 'Non renseigné';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return { items: [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 12) };
  },
});
def('Budget', 'budget.commandes_par_etat', 'Commandes par affectation', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const arr = await budgetOrders(ctx);
    const map = new Map();
    for (const o of arr) {
      const affectee = !!(o.operation_id || o.operation_label);
      const k = affectee ? (o.operation_label || 'Affectée') : 'Non affectée';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return { items: [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) };
  },
});
def('Budget', 'budget.facturation_mensuelle', 'Facturation par mois', {
  periodic: false, kind: 'chart', chart: 'bar',
  description: 'Montant facturé par mois de réception (exercice de la réunion)',
  run: async (ctx) => {
    const arr = await budgetInvoices(ctx);
    const map = new Map();
    for (const i of arr) {
      const raw = i['Arrivée'] || i.FACTURE_DATENTREE;
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + parseMoney(i['Montant TTC'] ?? i.FACTURE_MONTANTTC_E));
    }
    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      series: rows.map(([key, amount]) => ({
        label: new Date(`${key}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        montant: Math.round(amount),
      })),
      seriesKeys: [{ key: 'montant', label: 'Facturé (€)', color: '#f59e0b', type: 'bar' }],
    };
  },
});

// — Budget : ENS (engagements non soldés) —──────────────────────────────────
const engagements = async (ctx) => {
  const d = await api(ctx, `/api/budget/engagements?fiscalYear=${budgetYear(ctx)}`);
  const rows = Array.isArray(d) ? d : (d?.rows || []);
  return (Array.isArray(rows) ? rows : []).filter(r => r && (
    r.is_ens === true ||
    ((r['Type mvt'] === 'Report' || r['Type mvt'] === 'Rattachement') && Number(r['Reste engagé']) > 0.01)
  ));
};
const ensAmount = (rows) => rows.reduce((s, r) => s + num(r['Reste engagé']), 0);
def('Budget', 'budget.ens_count', 'ENS — engagements non soldés', {
  periodic: false, source: 'SEDIT Finances (engagements)',
  description: 'Nombre d\'engagements non soldés (reports et rattachements avec reste engagé)',
  run: async (ctx) => {
    const rows = await engagements(ctx);
    return { value: rows.length, sub: `reste engagé : ${Math.round(ensAmount(rows)).toLocaleString('fr-FR')} €` };
  },
});
def('Budget', 'budget.ens_montant', 'ENS — reste engagé', {
  periodic: false, unit: 'currency', source: 'SEDIT Finances (engagements)',
  description: 'Montant restant engagé sur les engagements non soldés',
  run: async (ctx) => {
    const rows = await engagements(ctx);
    return { value: ensAmount(rows), sub: `${rows.length} engagement(s) non soldé(s)` };
  },
});
def('Budget', 'budget.ens_list', 'ENS — détail des engagements non soldés', {
  periodic: false, kind: 'list', source: 'SEDIT Finances (engagements)',
  run: async (ctx) => {
    const rows = (await engagements(ctx)).sort((a, b) => num(b['Reste engagé']) - num(a['Reste engagé']));
    return {
      items: rows.slice(0, 15).map(r => ({
        label: truncate(`${r['Code mouvement'] || ''} — ${r['Libellé'] || ''}`, 65),
        value: Math.round(num(r['Reste engagé'])),
        text: `${Math.round(num(r['Reste engagé'])).toLocaleString('fr-FR')} €`,
        sub: [r['Bon de commande'] ? `BC ${r['Bon de commande']}` : '', r['Nom tiers'], r['Imputation']].filter(Boolean).join(' · '),
      })),
    };
  },
});
def('Budget', 'budget.ens_par_section', 'ENS par section', {
  periodic: false, kind: 'list', source: 'SEDIT Finances (engagements)',
  run: async (ctx) => {
    const rows = await engagements(ctx);
    const map = new Map();
    for (const r of rows) {
      const label = r['Section'] === 'I' ? 'Investissement' : r['Section'] === 'F' ? 'Fonctionnement' : (r['Section'] || 'Non renseigné');
      map.set(label, (map.get(label) || 0) + num(r['Reste engagé']));
    }
    return {
      items: [...map.entries()].map(([label, amount]) => ({
        label, value: Math.round(amount),
        text: `${Math.round(amount).toLocaleString('fr-FR')} €`,
      })).sort((a, b) => b.value - a.value),
    };
  },
});

// — Copieurs : évolutions et top directions —───────────────────────────────
const copieursKpi = (ctx) => api(ctx, '/api/copieurs/kpi');
def('Copieurs', 'copieurs.evolution', 'Évolution annuelle des copies', {
  periodic: false, kind: 'chart', chart: 'composed',
  run: async (ctx) => {
    const d = await copieursKpi(ctx);
    const rows = d?.byYear || d?.yearlyData || [];
    return {
      series: (Array.isArray(rows) ? rows : []).map(r => ({ label: String(r.year || ''), nb: num(r.deltaNB ?? r.nb), color: num(r.deltaCoul ?? r.color) })),
      seriesKeys: [
        { key: 'nb', label: 'Noir & blanc', color: '#1e293b', type: 'bar' },
        { key: 'color', label: 'Couleur', color: '#3b82f6', type: 'bar' },
      ],
    };
  },
});
def('Copieurs', 'copieurs.couts', 'Évolution des coûts copieurs', {
  periodic: false, kind: 'chart', chart: 'line',
  run: async (ctx) => {
    const d = await copieursKpi(ctx);
    const rows = d?.byYear || d?.yearlyData || [];
    return {
      series: (Array.isArray(rows) ? rows : []).map(r => ({ label: String(r.year || ''), cost: num(r.coutTotal ?? r.cost) })),
      seriesKeys: [{ key: 'cost', label: 'Coût (€)', color: '#f59e0b', type: 'line' }],
    };
  },
});
def('Copieurs', 'copieurs.top_directions', 'Top directions — copies', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const d = await copieursKpi(ctx);
    const rows = d?.topDirections || d?.byDirection || [];
    return {
      items: (Array.isArray(rows) ? rows : []).slice(0, 8).map(r => ({
        label: truncate(r.direction || r.name, 50),
        value: num(r.totalPages ?? r.nb),
        sub: `${num(r.deltaNB ?? r.nb)} N&B · ${num(r.deltaCoul ?? r.color)} couleur`,
      })),
    };
  },
});
def('Copieurs', 'copieurs.top_volume', 'Top copieurs (volume)', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const d = await copieursKpi(ctx);
    const rows = d?.top10Volume || [];
    return {
      items: (Array.isArray(rows) ? rows : []).slice(0, 8).map(r => ({
        label: truncate(`${r.numero_serie || ''} — ${r.direction || ''} ${r.service || ''}`, 55),
        value: num(r.totalPages),
        sub: `${r.modele || ''} · ${Math.round(num(r.coutTotal)).toLocaleString('fr-FR')} €`,
      })),
    };
  },
});
def('Copieurs', 'copieurs.sans_releve', 'Copieurs sans relevé récent', {
  periodic: false,
  run: async (ctx) => {
    const d = await copieursKpi(ctx);
    return { value: Array.isArray(d?.alertsNoReleve) ? d.alertsNoReleve.length : 0 };
  },
});

// — Parc : pyramide des âges, OS, répartitions —────────────────────────────
def('Parc', 'parc.pyramide_ages', 'Pyramide des âges — PC', {
  periodic: false, kind: 'chart', chart: 'bar',
  run: async (ctx) => {
    const d = await api(ctx, '/api/parc/hub/kpis');
    const rows = d?.ordinateurs?.age?.tranches || [];
    return {
      series: (Array.isArray(rows) ? rows : []).map(r => ({ label: r.label, count: num(r.count) })),
      seriesKeys: [{ key: 'count', label: 'Ordinateurs', color: '#2563eb', type: 'bar' }],
    };
  },
});
def('Parc', 'parc.repartition_os', 'Répartition par OS', {
  periodic: false, kind: 'chart', chart: 'bar', source: 'Active Directory',
  run: async (ctx) => {
    const d = await api(ctx, '/api/parc/ad/stats');
    const rows = d?.by_os_family || [];
    return {
      series: (Array.isArray(rows) ? rows : []).map(r => ({ label: r.family, count: num(r.total) })),
      seriesKeys: [{ key: 'count', label: 'Postes', color: '#0891b2', type: 'bar' }],
    };
  },
});
const parcDist = (field) => async (ctx) => {
  const d = await api(ctx, '/api/parc/hub/kpis');
  const rows = d?.ordinateurs?.[field] || [];
  return { items: (Array.isArray(rows) ? rows : []).slice(0, 12).map(r => ({ label: truncate(r.label, 50), value: num(r.count) })) };
};
def('Parc', 'parc.par_statut', 'Ordinateurs par statut', { periodic: false, kind: 'list', run: parcDist('parStatut') });
def('Parc', 'parc.par_lieu', 'Ordinateurs par lieu', { periodic: false, kind: 'list', run: parcDist('parLieu') });
def('Parc', 'parc.par_modele', 'Ordinateurs par modèle', { periodic: false, kind: 'list', run: parcDist('parModele') });
def('Parc', 'parc.par_fabricant', 'Ordinateurs par fabricant', { periodic: false, kind: 'list', run: parcDist('parFabricant') });

// — Réseau : sites et switchs —─────────────────────────────────────────────
const reseauSites = (ctx) => api(ctx, '/api/network/sites-with-switches');
def('Réseau', 'reseau.sites', 'Sites réseau', {
  periodic: false,
  run: async (ctx) => { const sites = await reseauSites(ctx); return { value: Array.isArray(sites) ? sites.length : 0 }; },
});
def('Réseau', 'reseau.switches', 'Switchs réseau', {
  periodic: false,
  run: async (ctx) => { const sites = await reseauSites(ctx); return { value: (sites || []).reduce((s, x) => s + num(x.total_switchs), 0) }; },
});
def('Réseau', 'reseau.switches_ok', 'Switchs OK', {
  periodic: false,
  run: async (ctx) => { const sites = await reseauSites(ctx); return { value: (sites || []).reduce((s, x) => s + num(x.switchs_ok), 0) }; },
});
def('Réseau', 'reseau.switches_ko', 'Switchs KO', {
  periodic: false,
  run: async (ctx) => { const sites = await reseauSites(ctx); return { value: (sites || []).reduce((s, x) => s + num(x.switchs_ko), 0) }; },
});
def('Réseau', 'reseau.sites_ko', 'Sites entièrement KO', {
  periodic: false,
  run: async (ctx) => {
    const sites = await reseauSites(ctx);
    return { value: (sites || []).filter(s => num(s.total_switchs) > 0 && num(s.switchs_ko) === num(s.total_switchs)).length };
  },
});
def('Réseau', 'reseau.etat_sites', 'État des switchs par site', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const sites = await reseauSites(ctx);
    return {
      items: (Array.isArray(sites) ? sites : []).slice(0, 15).map(s => ({
        label: truncate(s.nom || s.site_code, 55),
        value: num(s.total_switchs),
        sub: `${num(s.switchs_ok)} OK · ${num(s.switchs_ko)} KO`,
      })),
    };
  },
});

// — Projets : avancements et actualité depuis la dernière réunion —─────────
// Les entrées de journal sont restreintes aux projets du périmètre filtré
// (chef de projet / service / statut) quand un filtre est actif.
const journalSince = async (ctx) => {
  const rows = await api(ctx, '/api/projets/journal-global?limit=2000');
  const since = sinceDate(ctx, 30);
  const sinceTs = new Date(`${since}T00:00:00`).getTime();
  let allowedIds = null;
  if (filterValue(ctx, 'project_manager') || filterValue(ctx, 'project_service') || filterValue(ctx, 'project_status')) {
    allowedIds = new Set((await getProjets(ctx)).map(p => Number(p.id)));
  }
  return (Array.isArray(rows) ? rows : []).filter(j => {
    const t = new Date(j.date_entree).getTime();
    if (isNaN(t) || t < sinceTs) return false;
    if (allowedIds && !allowedIds.has(Number(j.projet_id))) return false;
    return true;
  });
};
const groupJournalByProject = (entries) => {
  const map = new Map();
  for (const j of entries) {
    const key = j.projet_id;
    if (!map.has(key)) {
      map.set(key, { label: truncate(`${j.projet_code || '#' + key} — ${j.projet_titre || ''}`, 70), count: 0, last: j });
    }
    const g = map.get(key);
    g.count += 1;
    if (new Date(j.date_entree) > new Date(g.last.date_entree)) g.last = j;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
};
def('Projets', 'projets.avancement', 'Projets dont l\'état a avancé', {
  periodic: false, kind: 'list',
  description: 'Changements de statut journalisés depuis la dernière réunion (ou 30 j)',
  run: async (ctx) => {
    const entries = (await journalSince(ctx)).filter(j => j.type_entree === 'changement_statut');
    const groups = groupJournalByProject(entries);
    return { items: groups.slice(0, 12).map(g => ({ label: g.label, value: g.count, sub: truncate(g.last.message, 80) })) };
  },
});
def('Projets', 'projets.avancement_count', 'Nombre de projets ayant avancé', {
  periodic: false,
  description: 'Projets avec au moins un changement de statut depuis la dernière réunion',
  run: async (ctx) => {
    const entries = (await journalSince(ctx)).filter(j => j.type_entree === 'changement_statut');
    return { value: new Set(entries.map(j => j.projet_id)).size };
  },
});
def('Projets', 'projets.actualite', 'Projets d\'actualité', {
  periodic: false, kind: 'list',
  description: 'Projets avec au moins une entrée de journal depuis la dernière réunion (ou 30 j)',
  run: async (ctx) => {
    const groups = groupJournalByProject(await journalSince(ctx));
    return { items: groups.slice(0, 12).map(g => ({ label: g.label, value: g.count, sub: truncate(g.last.message, 80) })) };
  },
});
def('Projets', 'projets.actualite_count', 'Nombre de projets d\'actualité', {
  periodic: false,
  description: 'Projets avec au moins une entrée de journal depuis la dernière réunion',
  run: async (ctx) => {
    const groups = groupJournalByProject(await journalSince(ctx));
    return { value: groups.length };
  },
});
def('Projets', 'projets.par_service', 'Projets par service pilote', {
  periodic: false, kind: 'list',
  run: async (ctx) => ({
    items: countBy(await getProjets(ctx), p => p.service_pilote_label || p.service_pilote).slice(0, 12),
  }),
});

// — Entretiens : répartition par statut —──────────────────────────────────
def('Entretiens', 'entretiens.par_statut', 'Entretiens par statut', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const d = await api(ctx, '/api/entretiens/stats');
    const rows = Array.isArray(d?.par_statut) ? d.par_statut : [];
    return { items: rows.map(r => ({ label: truncate(r.label || r.key || r.statut || '—', 50), value: num(r.value ?? r.count) })) };
  },
});

// — MagApp : top applications —────────────────────────────────────────────
def('MagApp', 'magapp.top_applis', 'Top applications (clics)', {
  periodic: false, kind: 'list',
  run: async (ctx) => {
    const r = await api(ctx, '/api/magapp/stats');
    const rows = Array.isArray(r) ? r : (r?.stats || []);
    return {
      items: rows
        .sort((a, b) => num(b.total_clicks ?? b.clicks) - num(a.total_clicks ?? a.clicks))
        .slice(0, 8)
        .map(a => ({ label: truncate(a.app_name || a.name || '—', 50), value: num(a.total_clicks ?? a.clicks), sub: num(a.today_clicks ?? a.today) ? `${num(a.today_clicks ?? a.today)} aujourd'hui` : undefined })),
    };
  },
});

// — Mes Notes —─────────────────────────────────────────────────────────────
const notesRun = (pick) => async (ctx) => { const d = await api(ctx, '/api/notes/stats'); return { value: pick(d || {}) }; };
def('Notes', 'notes.total', 'Notes', { periodic: false, run: notesRun(d => num(d.total)) });
def('Notes', 'notes.analysee', 'Notes analysées par IA', { periodic: false, run: notesRun(d => num(d.analyzed)) });
def('Notes', 'notes.carnets', 'Carnets de notes', { periodic: false, run: notesRun(d => num(d.notebooks)) });

// — Sécurité : sauvegarde (état) —──────────────────────────────────────────
def('Système', 'systeme.sauvegarde', 'Sauvegarde à jour', {
  periodic: false, unit: 'boolean',
  run: async (ctx) => {
    const d = await api(ctx, '/api/backup/health-summary');
    const enabled = !!d?.enabled;
    return {
      value: enabled && d?.healthy ? 1 : 0,
      sub: enabled ? `dernière sauvegarde il y a ${num(d.ageDays)} j` : 'sauvegarde désactivée',
    };
  },
});

// — Compléments Tickets / Parc / Entretiens / Télécom / Sécurité —───────────
def('Tickets', 'tickets.par_type', 'Tickets par type', { kind: 'list', run: ticketsItems('typeDistribution') });
def('Tickets', 'tickets.top_logiciels', 'Top logiciels (tickets)', { periodic: false, kind: 'list', run: ticketsItems('topSoftwares', { labelFn: r => r.software, valueKey: 'count' }) });
def('Tickets', 'tickets.top_demandeurs', 'Top demandeurs', { periodic: false, kind: 'list', run: ticketsItems('topRequesters', { valueKey: 'count' }) });
def('Tickets', 'tickets.activite_horaire', 'Activité horaire (créations)', {
  periodic: true, kind: 'chart', chart: 'bar',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const rows = Array.isArray(d?.hourlyDistribution) ? d.hourlyDistribution : [];
    return {
      series: rows.map(r => ({ label: `${r.hour}h`, count: num(r.count) })),
      seriesKeys: [{ key: 'count', label: 'Tickets', color: '#3b82f6', type: 'bar' }],
    };
  },
});
def('Tickets', 'tickets.temps_resolution', 'Temps de résolution (30 j)', {
  periodic: false, kind: 'chart', chart: 'line',
  run: async (ctx) => {
    const d = await ticketsStats(ctx);
    const rows = Array.isArray(d?.resolutionTimeTrend) ? d.resolutionTimeTrend : [];
    return {
      series: rows.map(r => ({ label: r.month, heures: num(r.avg_hours) })),
      seriesKeys: [{ key: 'heures', label: 'Heures ouvrées', color: '#0891b2', type: 'line' }],
    };
  },
});
def('Parc', 'parc.par_os', "Postes par système d'exploitation (AD)", {
  periodic: false, kind: 'list', source: 'Active Directory',
  description: "Familles d'OS des machines présentes dans l'annuaire (source AD, pas le HUB)",
  run: async (ctx) => {
    const d = await api(ctx, '/api/parc/ad/stats');
    const rows = Array.isArray(d?.by_os_family) ? d.by_os_family : [];
    return {
      items: rows.map(r => ({
        label: r.family || 'Inconnu',
        value: num(r.total),
        sub: (Array.isArray(r.versions) ? r.versions : []).slice(0, 3).map(v => `${v.label}: ${v.count}`).join(' · ') || undefined,
      })),
    };
  },
});
def('Entretiens', 'entretiens.planifies', 'Entretiens planifiés', { periodic: false, run: entRun(s => num(s.planifies)) });
def('Entretiens', 'entretiens.a_planifier', 'Entretiens à planifier', { periodic: false, run: entRun(s => num(s.a_planifier)) });
def('Entretiens', 'entretiens.a_venir', 'Entretiens à venir (7 j)', { periodic: false, run: entRun(s => num(s.a_venir_7j)) });
def('Entretiens', 'entretiens.preparations', 'Préparations reçues', { periodic: false, run: entRun(s => num(s.preparations_recues)) });

def('Télécom', 'telecom.economies', 'Économies télécom potentielles', {
  periodic: false, unit: 'currency',
  description: 'Lignes dormantes + lignes résiliées encore facturées (par mois)',
  run: async (ctx) => {
    const [stats, rec] = await Promise.all([
      api(ctx, '/api/telecom/billing/stats'),
      api(ctx, '/api/telecom/billing/reconciliation'),
    ]);
    const savings = num(stats?.dormantCost) + num(rec?.resilieesFactureesCost);
    return { value: savings, sub: `${Math.round(savings * 12).toLocaleString('fr-FR')} € / an` };
  },
});
def('Télécom', 'telecom.resiliees_facturees', 'Lignes résiliées encore facturées', {
  periodic: false,
  run: async (ctx) => {
    const rec = await api(ctx, '/api/telecom/billing/reconciliation');
    return { value: Array.isArray(rec?.resilieesFacturees) ? rec.resilieesFacturees.length : 0 };
  },
});

// (Les KPI de sécurité « connexions suspectes » dépendent d'une API amont lente
//  et ne sont pas repris ici : ils bloqueraient le lancement de la réunion.)

// — RH / Studio RH : agents partis depuis la dernière réunion —─────────────
const rhDeparts = async (ctx) => {
  const since = sinceDate(ctx, 30);
  const to = ymd(ctx.meetingDate) || ymd(new Date());
  const d = await api(ctx, `/api/admin/rh/departs?since=${since}&to=${to}`);
  return Array.isArray(d?.agents) ? d.agents : [];
};
def('RH', 'rh.departs_count', 'Agents partis depuis la dernière réunion', {
  periodic: false, source: 'Studio RH',
  description: 'Départs enregistrés dans Studio RH depuis la réunion précédente (ou 30 jours)',
  run: async (ctx) => {
    const agents = await rhDeparts(ctx);
    return {
      value: agents.length,
      sub: agents.length ? `dont ${agents.slice(0, 2).map(a => `${a.prenom || ''} ${a.nom || ''}`.trim()).join(', ')}${agents.length > 2 ? '…' : ''}` : 'aucun départ',
    };
  },
});
def('RH', 'rh.departs', 'Agents partis', {
  periodic: false, kind: 'list', source: 'Studio RH',
  description: 'Liste des agents partis (Studio RH) depuis la réunion précédente',
  run: async (ctx) => {
    const agents = await rhDeparts(ctx);
    return {
      items: agents.slice(0, 15).map(a => ({
        label: `${a.prenom || ''} ${a.nom || ''}`.trim() || a.matricule,
        value: 0,
        sub: [a.date_depart_fr || a.date_depart, a.direction, a.service].filter(Boolean).join(' · '),
      })),
    };
  },
});

// ── API publique du moteur ──────────────────────────────────────────────────
const DEF_BY_KEY = new Map(DEFS.map(d => [d.key, d]));

function listCatalog() {
  return {
    periods: PERIODS,
    comparisons: COMPARISONS,
    displays: DISPLAYS,
    modules: [...new Set(DEFS.map(d => d.module))],
    kpis: DEFS.map(d => ({
      key: d.key, label: d.label, module: d.module, unit: d.unit,
      periodic: d.periodic, multi: d.kind === 'list', kind: d.kind, chart: d.chart,
      description: d.description,
      filters: d.filters && d.filters.length ? d.filters : [],
      source: d.source || null,
      defaultPeriod: d.periodic ? '30d' : null,
      defaultCompare: d.periodic ? 'previous' : 'none',
      defaultDisplay: d.kind === 'chart' ? 'chart' : d.kind === 'list' ? 'list' : 'number',
      supportsCompare: d.periodic,
    })),
  };
}

/** Normalise une config saisie dans le template (pour éviter le bruit/abus). */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = DEF_BY_KEY.get(String(raw.key || ''));
  if (!d) return null;
  const period = d.periodic ? String(raw.period || '30d') : null;
  const compare = d.periodic ? String(raw.compare || 'none') : 'none';
  const display = ['number', 'bar', 'list', 'chart'].includes(raw.display)
    ? raw.display
    : (d.kind === 'chart' ? 'chart' : d.kind === 'list' ? 'list' : 'number');
  // Filtres de périmètre autorisés pour ce KPI (chef de projet, groupe…).
  const filters = {};
  for (const f of (d.filters || [])) {
    const v = raw.filters && raw.filters[f.key];
    if (!v) continue;
    const value = String(v.value != null ? v.value : v).trim();
    if (!value) continue;
    filters[f.key] = { value, label: String(v.label || value).slice(0, 120) };
  }
  return {
    id: String(raw.id || `kpi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    key: d.key,
    name: String(raw.name || '').trim().slice(0, 120) || d.label,
    period,
    from: period === 'custom' ? ymd(raw.from) : null,
    to: period === 'custom' ? ymd(raw.to) : null,
    compare,
    display,
    filters,
  };
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeConfig).filter(Boolean).slice(0, 40);
}

function formatValue(value, unit) {
  const n = num(value);
  switch (unit) {
    case 'percent': return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
    case 'currency': return `${Math.round(n).toLocaleString('fr-FR')} €`;
    case 'days': return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
    case 'minutes': return `${Math.round(n)} min`;
    case 'years': return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`;
    case 'decimal': return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    case 'boolean': return n ? 'Oui' : 'Non';
    default: return n.toLocaleString('fr-FR');
  }
}

/**
 * Évalue un KPI et renvoie son instantané « en dur » :
 * { key, name, module, unit, display, period, current, previous, delta_pct, computed_at }
 */
async function evaluate(config, ctx) {
  const d = DEF_BY_KEY.get(config.key);
  const period = d.periodic ? resolvePeriod(config, ctx) : { from: null, to: null, label: 'À date (au lancement)', preset: null };
  const filters = config.filters || {};
  const base = {
    key: config.key, name: config.name, module: d.module, unit: d.unit, source: d.source || null,
    display: config.display, multi: d.kind === 'list', kind: d.kind, chart: d.chart,
    periodic: d.periodic, filters,
    period, compare: d.periodic ? (config.compare || 'none') : 'none',
    computed_at: new Date().toISOString(),
  };
  const run = (p) => d.run({ ...ctx, filters, from: p?.from, to: p?.to });
  const isScalar = (v) => !!v && v.series === undefined && v.items === undefined;
  try {
    const current = await run(period);
    const result = {
      ...base,
      current: {
        ...current,
        text: isScalar(current) ? formatValue(current.value, d.unit) : null,
      },
    };
    if (d.periodic && base.compare !== 'none' && isScalar(current)) {
      const cp = comparisonPeriod(period, base.compare);
      if (cp) {
        try {
          const previous = await run(cp);
          const cv = num(current.value); const pv = num(previous.value);
          result.previous = {
            ...previous, period: cp, text: formatValue(previous.value, d.unit),
          };
          result.delta_pct = pv === 0 ? (cv === 0 ? 0 : null) : Math.round(((cv - pv) / pv) * 1000) / 10;
          result.delta_abs = Math.round((cv - pv) * 100) / 100;
        } catch (e) {
          result.previous_error = e.message;
        }
      }
    }
    return result;
  } catch (e) {
    return { ...base, error: e.message };
  }
}

async function evaluateList(configs, ctx) {
  const list = normalizeList(configs);
  // Mutualise les appels API entre les KPI d'une même rubrique.
  const runCtx = ctx.cache ? ctx : { ...ctx, cache: new Map() };
  const out = [];
  for (const cfg of list) {
    out.push(await evaluate(cfg, runCtx)); // séquentiel : limite la charge sur les API internes
  }
  return out;
}

// ── Sources des filtres (listes déroulantes du configurateur) ───────────────
// Chefs de projet, services pilotes, statuts, groupes d'affectation tickets.
// Cache 5 min : ces listes changent peu et /api/projets est volumineux.
let _sourcesCache = { ts: 0, data: null };

async function getFilterSources(token) {
  if (_sourcesCache.data && Date.now() - _sourcesCache.ts < 5 * 60 * 1000) return _sourcesCache.data;
  const safe = async (p) => { try { return await apiGet(p, token); } catch { return null; } };
  const [projetsRaw, groupsRaw] = await Promise.all([
    safe('/api/projets'),
    safe('/api/tickets/admin/groups'),
  ]);
  const arr = Array.isArray(projetsRaw) ? projetsRaw : (projetsRaw?.projets || projetsRaw?.data || []);
  const managers = new Map();
  const services = new Map();
  for (const p of (Array.isArray(arr) ? arr : [])) {
    if (p.chef_projet_username) {
      managers.set(String(p.chef_projet_username).toLowerCase(), {
        value: p.chef_projet_username,
        label: p.chef_projet_display_name || p.chef_projet_username,
      });
    }
    if (p.service_pilote) {
      services.set(String(p.service_pilote).toLowerCase(), {
        value: p.service_pilote,
        label: p.service_pilote_label || p.service_pilote,
      });
    }
  }
  const byFr = (a, b) => a.label.localeCompare(b.label, 'fr');
  const data = {
    project_managers: [...managers.values()].sort(byFr),
    project_services: [...services.values()].sort(byFr),
    project_statuses: Object.entries(PROJET_STATUT_LABELS).map(([value, label]) => ({ value, label })),
    ticket_groups: (Array.isArray(groupsRaw) ? groupsRaw : [])
      .map(g => ({ value: String(g.id), label: g.name }))
      .sort(byFr),
  };
  _sourcesCache = { ts: Date.now(), data };
  return data;
}

module.exports = {
  listCatalog, normalizeConfig, normalizeList, evaluate, evaluateList,
  resolvePeriod, comparisonPeriod, formatValue, getFilterSources,
  PERIODS, COMPARISONS, DISPLAYS,
};
