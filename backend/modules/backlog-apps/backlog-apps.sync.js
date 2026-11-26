const { pool } = require('../../shared/pg_db');
const { SQL_CREATION } = require('./backlog-apps.table');
const { SOURCES, typeCommun, statutCommun, configHttp } = require('./backlog-apps.sources');

// Synchronisation de rattrapage : le hub lit la table de chaque application et met à jour hub.demandes_apps (UPSERT).
// Les colonnes de décision (decision_*) ne sont JAMAIS écrasées ici : elles appartiennent au hub et à l'application qui les applique.
// Chaque source est traitée séparément : une application absente, renommée ou inaccessible n'empêche pas les autres.
let derniereSynchro = null;   // { at, sources: [{ code, label, ok, nb, erreur }] }
let enCours = null;

async function assurerTable() { await pool.query(SQL_CREATION); }

// Lecture HTTP : GET sur la route d'export de l'application (clé API dans X-API-Key). Réponse : { items: [...] } ou tableau, au format du contrat
// (id, type, titre, description, statut, statut_brut, motif, demandeur, extra, created_at, traite_par, traite_le).
async function lireHttp(cfg) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(cfg.url, { headers: { 'X-API-Key': cfg.cle || '', Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${cfg.url}`);
    const j = await r.json(); const items = Array.isArray(j) ? j : j.items;
    if (!Array.isArray(items)) throw new Error('réponse inattendue (liste « items » attendue)');
    return items.map((x) => ({ id: x.id ?? x.app_ref, type_brut: x.type, titre: x.titre, description: x.description, statut_brut: x.statut_brut ?? x.statut, motif: x.motif, demandeur: x.demandeur,
      created_at: x.created_at, traite_par: x.traite_par, traite_le: x.traite_le, extra: x.extra }));
  } finally { clearTimeout(timer); }
}

async function synchroniserSource(s) {
  try {
    const http = configHttp()[s.code];
    const lues = http?.url ? await lireHttp(http) : (await pool.query(s.sql)).rows;   // HTTP si l'application est configurée, SQL direct sinon (même base)
    const limite = http?.url ? 5000 : s.limite;
    const lignes = lues.map((x) => ({
      app_ref: String(x.id), type: typeCommun(x.type_brut), titre: x.titre || '(sans titre)', description: x.description || null,
      statut: statutCommun(x.statut_brut), statut_brut: x.statut_brut ?? null, motif: x.motif || null, demandeur: x.demandeur || null, extra: x.extra || null,
      created_at: x.created_at || null, traite_par: x.traite_par || null, traite_le: x.traite_le || null,
    }));
    if (lignes.length) {
      await pool.query(
        `INSERT INTO hub.demandes_apps (app, app_ref, type, titre, description, statut, statut_brut, motif, demandeur, extra, created_at, traite_par, traite_le, source, synced_at, absente)
         SELECT $1, x.app_ref, x.type, x.titre, x.description, x.statut, x.statut_brut, x.motif, x.demandeur, x.extra, x.created_at, x.traite_par, x.traite_le, 'sync', now(), FALSE
           FROM jsonb_to_recordset($2::jsonb) AS x(app_ref text, type text, titre text, description text, statut text, statut_brut text, motif text, demandeur text, extra text, created_at timestamptz, traite_par text, traite_le timestamptz)
         ON CONFLICT (app, app_ref) DO UPDATE SET type = EXCLUDED.type, titre = EXCLUDED.titre, description = EXCLUDED.description, statut = EXCLUDED.statut, statut_brut = EXCLUDED.statut_brut,
           motif = EXCLUDED.motif, demandeur = EXCLUDED.demandeur, extra = EXCLUDED.extra, created_at = EXCLUDED.created_at, traite_par = EXCLUDED.traite_par, traite_le = EXCLUDED.traite_le,
           synced_at = now(), absente = FALSE`,
        [s.code, JSON.stringify(lignes)]);
    }
    // Demandes disparues de l'application (supprimées) : marquées absentes, sauf si la lecture a été tronquée par la limite
    if (lignes.length < limite) await pool.query('UPDATE hub.demandes_apps SET absente = TRUE WHERE app = $1 AND NOT (app_ref = ANY($2::text[]))', [s.code, lignes.map((l) => l.app_ref)]);
    return { code: s.code, label: s.label, ok: true, nb: lignes.length, via: http?.url ? 'http' : 'sql' };
  } catch (e) {
    return { code: s.code, label: s.label, ok: false, nb: 0, erreur: e.message };
  }
}

// Une seule synchronisation à la fois ; les appels simultanés partagent la même
async function synchroniser() {
  if (enCours) return enCours;
  enCours = (async () => {
    try {
      await assurerTable();
      const sources = await Promise.all(SOURCES.map(synchroniserSource));
      derniereSynchro = { at: new Date().toISOString(), sources };
      return derniereSynchro;
    } finally { enCours = null; }
  })();
  return enCours;
}

const etat = () => derniereSynchro;

module.exports = { synchroniser, assurerTable, etat, lireHttp };
