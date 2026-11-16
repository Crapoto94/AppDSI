-- ════════════════════════════════════════════════════════════════════════
-- Rôle PostgreSQL LECTURE SEULE du module dataquery.
--
-- À exécuter UNE FOIS, en tant que superutilisateur, sur la base ivry_admin :
--   psql -h 10.103.130.106 -U postgres -d ivry_admin \
--        -v dq_password="'<mot-de-passe-fort>'" \
--        -f backend/modules/dataquery/sql/create_readonly_role.sql
--
-- Puis définir côté backend :
--   DATAQUERY_ENABLED=true
--   DATAQUERY_PG_USER=dq_readonly
--   DATAQUERY_PG_PASSWORD=<mot-de-passe-fort>
--
-- Les droits SELECT (tables et colonnes autorisées) sont ensuite (ré)appliqués
-- automatiquement à chaque démarrage du backend par applyDataqueryGrants()
-- (shared/pg_db.js) : inutile de les gérer ici.
-- ════════════════════════════════════════════════════════════════════════

CREATE ROLE dq_readonly LOGIN PASSWORD :dq_password
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 5;

-- Garde-fous au niveau du rôle : même hors du module, toute session est
-- en lecture seule et bornée dans le temps.
ALTER ROLE dq_readonly SET default_transaction_read_only = on;
ALTER ROLE dq_readonly SET statement_timeout = '20s';
ALTER ROLE dq_readonly SET idle_in_transaction_session_timeout = '60s';

-- Pas de création d'objets.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE ivry_admin FROM dq_readonly;
GRANT CONNECT ON DATABASE ivry_admin TO dq_readonly;

-- Pour désactiver d'urgence :  ALTER ROLE dq_readonly NOLOGIN;
-- Pour supprimer :             REASSIGN OWNED BY dq_readonly TO postgres; DROP OWNED BY dq_readonly; DROP ROLE dq_readonly;
