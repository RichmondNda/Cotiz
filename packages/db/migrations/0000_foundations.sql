-- Lot 0.4 · fondations : extensions, fonctions de contexte tenant, droits de base (docs/specs/schema.sql).
-- Les rôles sont créés hors migration (infra/compose/postgres-init/01-roles.sql, ou l'exploitation).

-- Garde-fous : rôles présents, cotiz_app sans contournement de la RLS, exécution par cotiz_migrator.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['cotiz_migrator', 'cotiz_app', 'cotiz_platform', 'cotiz_readonly'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      RAISE EXCEPTION 'rôle % absent : exécuter infra/compose/postgres-init/01-roles.sql (ou le créer en exploitation)', r;
    END IF;
  END LOOP;
  -- cotiz_app et cotiz_readonly : ni contournement de la RLS, ni réplication, ni rôle hérité (SET ROLE cotiz_platform
  -- ou cotiz_migrator donnerait BYPASSRLS ou la propriété des tables).
  FOREACH r IN ARRAY ARRAY['cotiz_app', 'cotiz_readonly'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r AND (rolbypassrls OR rolsuper OR rolreplication)) THEN
      RAISE EXCEPTION '% ne doit avoir ni BYPASSRLS, ni SUPERUSER, ni REPLICATION', r;
    END IF;
    IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = r) THEN
      RAISE EXCEPTION '% ne doit être membre d''aucun rôle', r;
    END IF;
  END LOOP;
  IF current_user <> 'cotiz_migrator' THEN
    RAISE EXCEPTION 'les migrations s''exécutent en cotiz_migrator (rôle courant : %)', current_user;
  END IF;
END $$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Contexte de requête (posé par shared/tenant-context, transaction par transaction).
--   app.association_id : association courante (espace gestionnaire, tâches d'une association)
--   app.user_id        : utilisateur courant
--   app.space          : platform | association | subscriber | auth | public | system
CREATE FUNCTION app_association_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.association_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_space() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('app.space', true), ''), 'none') $$;
--> statement-breakpoint

-- Droits de base. Les tables n'existent pas encore : droits par défaut sur celles que cotiz_migrator créera.
-- Les retraits propres à une table (audit_logs, contract_signatures, argent) sont posés par le lot qui la crée.
GRANT USAGE ON SCHEMA public TO cotiz_app, cotiz_platform, cotiz_readonly;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE cotiz_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cotiz_app, cotiz_platform;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE cotiz_migrator IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO cotiz_app, cotiz_platform;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE cotiz_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO cotiz_readonly;
