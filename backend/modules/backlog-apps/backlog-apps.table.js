// Table centrale hub.demandes_apps — CONTRAT COMMUN des demandes et bugs de toutes les applications de la DSI.
//
// • Chaque application reste la source de vérité de SES demandes (elle fonctionne seule, même si le hub est arrêté).
// • Une application peut DÉPOSER sa demande ici (INSERT … ON CONFLICT (app, app_ref) DO UPDATE, en essai simple : une erreur ne doit jamais gêner l'application) ;
//   à défaut, le hub la LIT lui-même périodiquement dans la table de l'application (synchronisation de rattrapage, voir backlog-apps.sync.js).
// • Le hub peut prendre une DÉCISION (accepter, refuser avec motif, réalisée) pour les applications qui l'ont adopté : elle est inscrite dans decision_* et c'est
//   l'APPLICATION qui l'applique chez elle (puis renseigne decision_appliquee_le, ou decision_erreur si elle ne peut pas).
//
// Vocabulaire commun : type = bug | evolution ; statut = demandee | acceptee | refusee | realisee.
const SQL_CREATION = `
  CREATE TABLE IF NOT EXISTS hub.demandes_apps (
    id                    SERIAL PRIMARY KEY,
    app                   TEXT NOT NULL,                 -- code de l'application (locatif, delib, odp, …)
    app_ref               TEXT NOT NULL,                 -- identifiant de la demande dans l'application
    type                  TEXT NOT NULL CHECK (type IN ('bug', 'evolution')),
    titre                 TEXT NOT NULL,
    description           TEXT,
    statut                TEXT NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee', 'acceptee', 'refusee', 'realisee')),
    statut_brut           TEXT,                          -- état tel qu'il s'appelle dans l'application
    motif                 TEXT,
    demandeur             TEXT,
    extra                 TEXT,
    created_at            TIMESTAMPTZ,
    traite_par            TEXT,
    traite_le             TIMESTAMPTZ,
    source                TEXT NOT NULL DEFAULT 'sync',  -- sync = lue par le hub ; app = déposée par l'application
    synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    absente               BOOLEAN NOT NULL DEFAULT FALSE, -- n'existe plus dans l'application
    decision_statut       TEXT CHECK (decision_statut IN ('acceptee', 'refusee', 'realisee')),
    decision_motif        TEXT,
    decision_par          TEXT,
    decision_le           TIMESTAMPTZ,
    decision_appliquee_le TIMESTAMPTZ,
    decision_erreur       TEXT,
    UNIQUE (app, app_ref)
  );
  CREATE INDEX IF NOT EXISTS demandes_apps_statut_idx ON hub.demandes_apps (statut, created_at DESC);
  CREATE INDEX IF NOT EXISTS demandes_apps_decision_idx ON hub.demandes_apps (app) WHERE decision_statut IS NOT NULL AND decision_appliquee_le IS NULL;
`;

module.exports = { SQL_CREATION };
