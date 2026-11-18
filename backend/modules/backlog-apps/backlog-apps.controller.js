const { pool } = require('../../shared/pg_db');
const { SOURCES } = require('./backlog-apps.sources');
const sync = require('./backlog-apps.sync');

// Liste commune : lue dans la table centrale hub.demandes_apps (alimentée par les applications et par la synchronisation du hub).
const toItem = (x) => {
  const src = SOURCES.find((s) => s.code === x.app);
  return {
    app: x.app, app_label: src?.label || x.app, id: x.app_ref, cle: `${x.app}:${x.app_ref}`, db_id: x.id,
    type: x.type, titre: x.titre, description: x.description || '', statut: x.statut, statut_brut: x.statut_brut, motif: x.motif,
    demandeur: x.demandeur, created_at: x.created_at, traite_par: x.traite_par, traite_le: x.traite_le, extra: x.extra, source: x.source,
    traitable: Boolean(src?.decision),   // l'application applique les décisions prises depuis le hub
    decision: x.decision_statut ? { statut: x.decision_statut, motif: x.decision_motif, par: x.decision_par, le: x.decision_le, appliquee_le: x.decision_appliquee_le, erreur: x.decision_erreur } : null,
  };
};

exports.list = async (req, res) => {
  try {
    if (!sync.etat()) await sync.synchroniser();   // première ouverture depuis le démarrage : on alimente la table
    const r = await pool.query('SELECT * FROM hub.demandes_apps WHERE NOT absente ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 3000');
    const etat = sync.etat();
    res.json({ items: r.rows.map(toItem), sources: etat?.sources || [], synchro_le: etat?.at || null });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.synchroniser = async (req, res) => {
  try { const etat = await sync.synchroniser(); res.json({ sources: etat.sources, synchro_le: etat.at }); }
  catch (e) { res.status(500).json({ message: e.message }); }
};

// Décision prise depuis le hub (applications ayant adopté le contrat) : inscrite ici, puis appliquée par l'application d'origine.
exports.decider = async (req, res) => {
  try {
    const { statut } = req.body || {}; const motif = String(req.body?.motif || '').trim();
    if (!['acceptee', 'refusee', 'realisee'].includes(statut)) return res.status(400).json({ message: 'État attendu : acceptee, refusee ou realisee' });
    if (statut === 'refusee' && motif.length < 3) return res.status(400).json({ message: 'Un refus doit être motivé' });
    const cur = (await pool.query('SELECT * FROM hub.demandes_apps WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ message: 'Demande introuvable' });
    if (!SOURCES.find((s) => s.code === cur.app)?.decision) return res.status(409).json({ message: `Cette application se traite dans sa propre interface (${cur.app}).` });
    if (cur.statut === statut) return res.status(409).json({ message: 'La demande est déjà dans cet état' });
    if (cur.decision_statut && !cur.decision_appliquee_le && !cur.decision_erreur) return res.status(409).json({ message: 'Une décision est déjà en attente d’application par l’application' });
    const par = req.user?.username || req.user?.name || 'admin';
    const r = await pool.query(
      `UPDATE hub.demandes_apps SET decision_statut = $2, decision_motif = $3, decision_par = $4, decision_le = now(), decision_appliquee_le = NULL, decision_erreur = NULL WHERE id = $1 RETURNING *`,
      [cur.id, statut, motif || null, par]);
    res.json(toItem(r.rows[0]));
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── API machine à machine (clé API du hub, périmètre « backlog-apps », nom de la clé = code de l'application) ──
// Permet aux applications dont la base n'est pas partagée avec le hub de déposer leurs demandes et d'appliquer ses décisions, sans accès SQL.
const appDeLaCle = (req, res) => {
  const app = String(req.apiKey?.name || '').toLowerCase();
  if (!SOURCES.some((s) => s.code === app)) { res.status(403).json({ message: `Le nom de la clé (« ${app} ») doit être le code d'une application connue : ${SOURCES.map((s) => s.code).join(', ')}` }); return null; }
  return app;
};

// POST /depot : { id, type, titre, description, statut, statut_brut, motif, demandeur, extra, created_at, traite_par, traite_le } — UPSERT, jamais d'écrasement des décisions
exports.depot = async (req, res) => {
  const app = appDeLaCle(req, res); if (!app) return;
  try {
    const b = req.body || {}; const ref = String(b.id ?? b.app_ref ?? '').trim();
    if (!ref || !String(b.titre || '').trim()) return res.status(400).json({ message: 'id et titre obligatoires' });
    const type = /^bug$/i.test(String(b.type || '')) ? 'bug' : 'evolution';
    const statut = ['demandee', 'acceptee', 'refusee', 'realisee'].includes(b.statut) ? b.statut : 'demandee';
    await sync.assurerTable();
    await pool.query(
      `INSERT INTO hub.demandes_apps (app, app_ref, type, titre, description, statut, statut_brut, motif, demandeur, extra, created_at, traite_par, traite_le, source, synced_at, absente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'app', now(), FALSE)
       ON CONFLICT (app, app_ref) DO UPDATE SET type = EXCLUDED.type, titre = EXCLUDED.titre, description = EXCLUDED.description, statut = EXCLUDED.statut, statut_brut = EXCLUDED.statut_brut,
         motif = EXCLUDED.motif, demandeur = EXCLUDED.demandeur, extra = EXCLUDED.extra, traite_par = EXCLUDED.traite_par, traite_le = EXCLUDED.traite_le, source = 'app', synced_at = now(), absente = FALSE`,
      [app, ref, type, String(b.titre).slice(0, 500), b.description || null, statut, b.statut_brut || statut, b.motif || null, b.demandeur || null, b.extra || null, b.created_at || new Date().toISOString(), b.traite_par || null, b.traite_le || null]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// GET /decisions : décisions prises depuis le hub pour l'application de la clé, pas encore appliquées
exports.decisionsEnAttente = async (req, res) => {
  const app = appDeLaCle(req, res); if (!app) return;
  try {
    await sync.assurerTable();
    const r = await pool.query(
      `SELECT id, app_ref, decision_statut AS statut, decision_motif AS motif, decision_par AS par, decision_le AS le FROM hub.demandes_apps
        WHERE app = $1 AND decision_statut IS NOT NULL AND decision_appliquee_le IS NULL AND decision_erreur IS NULL ORDER BY decision_le`, [app]);
    res.json({ items: r.rows });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// POST /decisions/:id/ack : { ok: true } ou { ok: false, erreur } — l'application confirme l'application (ou l'échec) de la décision
exports.accuse = async (req, res) => {
  const app = appDeLaCle(req, res); if (!app) return;
  try {
    const ok = req.body?.ok !== false; const erreur = String(req.body?.erreur || '').slice(0, 500) || 'échec non précisé';
    const r = ok
      ? await pool.query('UPDATE hub.demandes_apps SET decision_appliquee_le = now(), decision_erreur = NULL WHERE id = $1 AND app = $2 AND decision_statut IS NOT NULL RETURNING id', [req.params.id, app])
      : await pool.query('UPDATE hub.demandes_apps SET decision_erreur = $3 WHERE id = $1 AND app = $2 AND decision_statut IS NOT NULL RETURNING id', [req.params.id, app, erreur]);
    if (!r.rowCount) return res.status(404).json({ message: 'Décision introuvable pour cette application' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
