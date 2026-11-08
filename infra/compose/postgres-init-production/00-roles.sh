#!/bin/sh
# Rôles de Cotiz en production (premier démarrage du volume, docker-entrypoint-initdb.d) : mots de passe lus dans les
# variables du conteneur par psql (\getenv), jamais passés en argument, écrits ni affichés. Attributs et droits :
# 01-roles.sql, exécuté juste après (il ne recrée pas un rôle existant). Rejouable sur un volume existant pour remettre
# les mots de passe aux valeurs des variables :
#   docker compose … exec -T postgres sh /docker-entrypoint-initdb.d/00-roles.sh
set -eu
: "${COTIZ_DB_MIGRATOR_PASSWORD:?}" "${COTIZ_DB_APP_PASSWORD:?}" "${COTIZ_DB_PLATFORM_PASSWORD:?}" "${COTIZ_DB_READONLY_PASSWORD:?}"

psql -v ON_ERROR_STOP=1 -q --username "${POSTGRES_USER:-cotiz}" --dbname "${POSTGRES_DB:-cotiz}" <<'SQL'
\getenv migrator COTIZ_DB_MIGRATOR_PASSWORD
\getenv app COTIZ_DB_APP_PASSWORD
\getenv platform COTIZ_DB_PLATFORM_PASSWORD
\getenv readonly COTIZ_DB_READONLY_PASSWORD
SELECT format('CREATE ROLE %I LOGIN', r) FROM unnest(ARRAY['cotiz_migrator', 'cotiz_app', 'cotiz_platform', 'cotiz_readonly']) AS r
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = r) \gexec
SELECT format('ALTER ROLE cotiz_migrator PASSWORD %L', :'migrator') \gexec
SELECT format('ALTER ROLE cotiz_app PASSWORD %L', :'app') \gexec
SELECT format('ALTER ROLE cotiz_platform PASSWORD %L', :'platform') \gexec
SELECT format('ALTER ROLE cotiz_readonly PASSWORD %L', :'readonly') \gexec
SQL
