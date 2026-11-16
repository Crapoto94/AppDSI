-- ═══════════════════════════════════════════════════════════════════════════
-- Module dataquery / serveur MCP — script SQL global
--
-- À exécuter en superutilisateur `postgres` sur la base `ivry_admin` :
--   psql -h 10.103.130.106 -U postgres -d ivry_admin -f backend/modules/dataquery/sql/setup_global.sql
--
-- Idempotent : peut être relancé sans risque.
-- Ne contient AUCUN mot de passe : le rôle est créé sans mot de passe (il ne
-- peut donc pas encore se connecter). Le mot de passe se définit ENSUITE, à la
-- main, en saisie masquée :
--   psql -h 10.103.130.106 -U postgres -d ivry_admin
--   ivry_admin=# \password dq_readonly
-- (cf. DEPLOIEMENT_MCP.md, étape 3).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- 1. Rôle lecture seule ------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dq_readonly') THEN
    CREATE ROLE dq_readonly LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      CONNECTION LIMIT 5;
    RAISE NOTICE 'Rôle dq_readonly créé (sans mot de passe : utiliser \password dq_readonly)';
  ELSE
    ALTER ROLE dq_readonly WITH LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      CONNECTION LIMIT 5;
    RAISE NOTICE 'Rôle dq_readonly déjà présent : attributs réalignés, mot de passe inchangé';
  END IF;
END $$;

-- Garde-fous au niveau du rôle : toute session est en lecture seule et bornée.
ALTER ROLE dq_readonly SET default_transaction_read_only = on;
ALTER ROLE dq_readonly SET statement_timeout = '20s';
ALTER ROLE dq_readonly SET idle_in_transaction_session_timeout = '60s';
GRANT CONNECT ON DATABASE ivry_admin TO dq_readonly;

-- 2. Tables d'audit et de sessions (le backend les crée aussi au démarrage) --
CREATE TABLE IF NOT EXISTS hub.dataquery_audit (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  api_key_id   INT,
  api_key_name VARCHAR(255),
  ip           VARCHAR(100),
  action       VARCHAR(30),
  sql_text     TEXT,
  row_count    INT,
  duration_ms  INT,
  error        TEXT
);
ALTER TABLE hub.dataquery_audit ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE hub.dataquery_audit ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_dataquery_audit_created ON hub.dataquery_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataquery_audit_trace   ON hub.dataquery_audit (trace_id);

CREATE TABLE IF NOT EXISTS hub.dataquery_sessions (
  jti            UUID PRIMARY KEY,
  username       VARCHAR(100) NOT NULL,
  display_name   VARCHAR(255),
  api_key_id     INT,
  ip             VARCHAR(100),
  client         VARCHAR(200),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  last_used_at   TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_reason VARCHAR(200)
);

-- 3. Droits SELECT : toutes les tables, sauf tables et colonnes sensibles ----
--    Identique à applyDataqueryGrants() (backend/shared/pg_db.js), que le
--    backend réapplique à chaque démarrage pour couvrir les nouvelles tables.
DO $dq$
DECLARE
  r record; cols text;
  role_name text := 'dq_readonly';
  deny_tbl  text := '(api_keys|kiosk_tokens|otp|settings|config|credential|secret|oauth|dataquery_)';
  deny_col  text := '(passw|pwd|secret|token|api_?key|apikey|hash|otp|private_?key|credential|pin_code|refresh|cookie|salt)';
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace
           WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg\_%' LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.nspname, role_name);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', r.nspname, role_name);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', r.nspname, role_name);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', r.nspname, role_name);
  END LOOP;
  FOR r IN SELECT c.oid, n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r','p','v','m','f')
             AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg\_%' LOOP
    CONTINUE WHEN r.relname ~* deny_tbl;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = r.oid AND attnum > 0 AND NOT attisdropped AND attname ~* deny_col) THEN
      SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
        FROM pg_attribute WHERE attrelid = r.oid AND attnum > 0 AND NOT attisdropped AND attname !~* deny_col;
      IF cols IS NOT NULL THEN
        EXECUTE format('GRANT SELECT (%s) ON %I.%I TO %I', cols, r.nspname, r.relname, role_name);
      END IF;
    ELSE
      EXECUTE format('GRANT SELECT ON %I.%I TO %I', r.nspname, r.relname, role_name);
    END IF;
  END LOOP;
END
$dq$;

-- 4. Vérifications (résultats attendus en commentaire) -----------------------

-- 4a. Aucun privilège d'administration → toutes les colonnes à f (false)
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin,
       (rolpassword IS NOT NULL) AS a_un_mot_de_passe
FROM pg_authid WHERE rolname = 'dq_readonly';

-- 4b. Bilan des tables : la plupart « lisibles », quelques « colonnes_masquees »
--     (hub.users, hub.infra_apis…), quelques « interdites » (hub.api_keys, *settings*, *config*…)
SELECT count(*) FILTER (WHERE has_table_privilege('dq_readonly', c.oid, 'SELECT'))                       AS lisibles,
       count(*) FILTER (WHERE NOT has_table_privilege('dq_readonly', c.oid, 'SELECT')
                          AND has_any_column_privilege('dq_readonly', c.oid, 'SELECT'))                  AS colonnes_masquees,
       count(*) FILTER (WHERE NOT has_any_column_privilege('dq_readonly', c.oid, 'SELECT'))              AS interdites
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m','f')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg\_%';

-- 4c. Liste des tables interdites (à relire : rien d'utile ne doit y manquer)
SELECT n.nspname || '.' || c.relname AS table_interdite
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m','f')
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg\_%'
  AND NOT has_any_column_privilege('dq_readonly', c.oid, 'SELECT')
ORDER BY 1;

-- 4d. Aucun droit d'écriture → 0
SELECT count(*) AS tables_modifiables
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND (has_table_privilege('dq_readonly', c.oid, 'INSERT') OR has_table_privilege('dq_readonly', c.oid, 'UPDATE')
    OR has_table_privilege('dq_readonly', c.oid, 'DELETE') OR has_table_privilege('dq_readonly', c.oid, 'TRUNCATE'));

-- 4e. Mots de passe des utilisateurs illisibles → f
SELECT has_column_privilege('dq_readonly', 'hub.users', 'password', 'SELECT') AS password_lisible;
