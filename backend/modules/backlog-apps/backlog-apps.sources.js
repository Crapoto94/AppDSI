// Registre des sources de demandes et de bugs des applications de la DSI (phase 1 : lecture seule, directement dans le PostgreSQL partagé).
//
// Chaque application GARDE sa propre table et son propre traitement : elle reste autonome. Le hub se contente de les lire et d'en afficher une vue commune.
// Chaque source est interrogée SÉPARÉMENT (une table absente, renommée ou inaccessible n'empêche pas d'afficher les autres).
//
// Colonnes que doit renvoyer chaque requête :
//   id, type_brut, titre, description, statut_brut, motif, demandeur, created_at, traite_par, traite_le, extra (libre)
// Les valeurs brutes sont ramenées à un vocabulaire commun par `type` et `statut` ci-dessous.
//
// Phase 2 (prévue) : une table centrale hub.demandes_apps où les applications déposent leurs déclarations via un contrat commun ; elle s'ajoutera ici comme une source de plus.

const LIMITE = 500;

// Vocabulaire commun : type = bug | evolution ; statut = demandee | acceptee | refusee | realisee
const typeCommun = (brut) => (/^bug$/i.test(String(brut || '')) ? 'bug' : 'evolution');
const STATUT = {
  // DSI Hub (hub.backlog) et idées MagApp
  open: 'demandee', discussion: 'demandee', new: 'demandee', in_progress: 'acceptee', accepted: 'acceptee', rejected: 'refusee', completed: 'realisee', done: 'realisee',
  // VibeLocatif, VibeDélib, iAmbassadeurs
  demandee: 'demandee', acceptee: 'acceptee', refusee: 'refusee', realisee: 'realisee',
  // Mandat
  nouveau: 'demandee', traite: 'realisee',
};
const statutCommun = (brut) => STATUT[String(brut || '').toLowerCase()] || 'demandee';

const SOURCES = [
  {
    code: 'hub', label: 'DSI Hub', schema: 'hub',
    sql: `SELECT id::text AS id, category AS type_brut, title AS titre, description, status AS statut_brut, admin_comment AS motif, created_by AS demandeur, created_at,
                 NULL::text AS traite_par, CASE WHEN status <> 'open' THEN updated_at END AS traite_le, category AS extra
            FROM hub.backlog ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'magapp', label: 'Idées MagApp', schema: 'magapp',
    sql: `SELECT id::text AS id, 'idée' AS type_brut, title AS titre, description, status AS statut_brut, NULLIF(admin_response, '') AS motif, COALESCE(author_name, author_email) AS demandeur, created_at,
                 NULL::text AS traite_par, CASE WHEN status <> 'new' THEN updated_at END AS traite_le, NULL::text AS extra
            FROM magapp.ideas ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'locatif', label: 'VibeLocatif', schema: 'locatif',
    sql: `SELECT id::text AS id, type AS type_brut, titre, description, statut AS statut_brut, motif, COALESCE(demandeur_nom, demandeur) AS demandeur, created_at, traite_par, traite_le, version_app AS extra
            FROM locatif.backlog_demandes ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'delib', label: 'VibeDélib', schema: 'ivrydelib',
    sql: `SELECT id::text AS id, type AS type_brut, titre, description, statut AS statut_brut, motif, COALESCE(demandeur_nom, demandeur) AS demandeur, created_at, traite_par, traite_le, version_app AS extra
            FROM ivrydelib.backlog_demandes ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'odp', label: 'ODP', schema: 'ODP',
    sql: `SELECT id::text AS id, type AS type_brut, title AS titre, description, status AS statut_brut, NULL::text AS motif, "requestedBy" AS demandeur, created_at,
                 NULL::text AS traite_par, CASE WHEN upper(status) <> 'OPEN' THEN updated_at END AS traite_le, priority AS extra
            FROM "ODP"."BacklogItem" ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'iambassadeurs', label: 'iAmbassadeurs', schema: 'charte_ia',
    sql: `SELECT b.id::text AS id, b.type AS type_brut, b.title AS titre, b.description, b.status AS statut_brut, b.reason AS motif, a.display_name AS demandeur, b.created_at,
                 t.display_name AS traite_par, b.treated_at AS traite_le, b.app_version AS extra
            FROM charte_ia.backlog_items b LEFT JOIN charte_ia.users a ON a.id = b.author_id LEFT JOIN charte_ia.users t ON t.id = b.treated_by
           ORDER BY b.created_at DESC LIMIT ${LIMITE}`,
  },
  {
    code: 'mandat', label: 'Mandat', schema: 'mandat',
    sql: `SELECT id::text AS id, type AS type_brut, titre, description, statut AS statut_brut, NULL::text AS motif, COALESCE(submitted_by_name, submitted_by) AS demandeur, created_at,
                 NULL::text AS traite_par, treated_at AS traite_le, page_url AS extra
            FROM mandat.feedback ORDER BY created_at DESC LIMIT ${LIMITE}`,
  },
];

SOURCES.forEach((s) => { s.limite = LIMITE; });
// Applications qui ont ADOPTÉ le contrat « décision » : elles lisent hub.demandes_apps et appliquent chez elles les décisions prises depuis le hub.
// Les autres se traitent dans leur propre interface (le hub n'écrit jamais dans leurs tables).
SOURCES.find((s) => s.code === 'locatif').decision = true;

// Transport HTTP (applications dont la base n'est PAS partagée avec le hub) : variable d'environnement BACKLOG_APPS_HTTP, JSON
//   {"locatif": {"url": "https://locatif/api/v1/backlog/export", "cle": "<clé d'export de l'application>"}, ...}
// Une application absente de cette liste est lue par SQL (même base PostgreSQL), comme en phase 1.
const configHttp = () => { try { return JSON.parse(process.env.BACKLOG_APPS_HTTP || '{}'); } catch { return {}; } };

module.exports = { SOURCES, typeCommun, statutCommun, configHttp };
