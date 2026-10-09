-- Rôles PostgreSQL de Cotiz (architecture/02-tenancy-security.md, fin de docs/specs/schema.sql).
-- Exécuté en superutilisateur : au premier démarrage du conteneur (docker-entrypoint-initdb.d) et par les tests
-- (Testcontainers). Idempotent : sur un volume existant, le rejouer avec
--   docker compose -f infra/compose/local.yml exec -T postgres psql -U cotiz -d cotiz < infra/compose/postgres-init/01-roles.sql
-- Mots de passe de développement uniquement, jamais réutilisés ailleurs : en recette et en production, les rôles
-- sont créés par l'exploitation avec des secrets propres à l'environnement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotiz_migrator') THEN
    CREATE ROLE cotiz_migrator LOGIN PASSWORD 'cotiz-migrator-local';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotiz_app') THEN
    CREATE ROLE cotiz_app LOGIN PASSWORD 'cotiz-app-local';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotiz_platform') THEN
    CREATE ROLE cotiz_platform LOGIN PASSWORD 'cotiz-platform-local';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotiz_readonly') THEN
    CREATE ROLE cotiz_readonly LOGIN PASSWORD 'cotiz-readonly-local';
  END IF;
END $$;

-- Attributs posés à chaque exécution : seul cotiz_platform contourne la RLS ; aucun ne réplique (un flux de
-- réplication lit toute la base sans RLS).
ALTER ROLE cotiz_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE cotiz_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE cotiz_platform NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
ALTER ROLE cotiz_readonly NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- cotiz_migrator possède la base (extensions de confiance, schéma « drizzle » du journal) et le schéma public.
-- Pas de tables temporaires pour PUBLIC : derrière PgBouncer (mode transaction), une table temporaire survit sur la
-- connexion serveur et masquerait une vraie table pour le client suivant.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO cotiz_migrator', current_database());
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;
ALTER SCHEMA public OWNER TO cotiz_migrator;
-- L'usage du schéma est accordé rôle par rôle par la migration 0000, pas à PUBLIC.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
