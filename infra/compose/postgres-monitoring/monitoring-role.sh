#!/bin/sh
# Rôle de supervision cotiz_monitoring, lu par l'intégration PostgreSQL d'Elastic (dépôt observability-elk).
# Exécuté à chaque déploiement par le service ponctuel « postgres-monitoring » (superutilisateur, via PGHOST,
# PGUSER, PGPASSWORD, PGDATABASE) : idempotent, il s'applique aussi à un volume existant, contrairement à
# docker-entrypoint-initdb.d.
#
# Droits : membre de pg_monitor seulement (statistiques du serveur, requêtes en cours), aucun accès aux tables
# (pas d'USAGE sur le schéma public, pas de BYPASSRLS), session en lecture seule, 3 connexions au plus.
# pg_stat_statements est installé dans un schéma dédié « monitoring » : public reste fermé à ce rôle, et les
# requêtes y sont normalisées (constantes remplacées par $1, $2…).
#
# Mot de passe lu par psql (\getenv), jamais passé en argument, écrit ni affiché. Sans mot de passe, rien n'est fait.
set -eu

if [ -z "${COTIZ_DB_MONITORING_PASSWORD:-}" ]; then
	echo "COTIZ_DB_MONITORING_PASSWORD absent : rôle de supervision non créé."
	exit 0
fi

psql -v ON_ERROR_STOP=1 -q <<'SQL'
\getenv monitoring COTIZ_DB_MONITORING_PASSWORD
SELECT 'CREATE ROLE cotiz_monitoring LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cotiz_monitoring') \gexec
SELECT format('ALTER ROLE cotiz_monitoring PASSWORD %L', :'monitoring') \gexec
ALTER ROLE cotiz_monitoring LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
GRANT pg_monitor TO cotiz_monitoring;

CREATE SCHEMA IF NOT EXISTS monitoring;
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;
GRANT USAGE ON SCHEMA monitoring TO cotiz_monitoring;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA monitoring;

ALTER ROLE cotiz_monitoring SET search_path = monitoring, pg_catalog;
ALTER ROLE cotiz_monitoring SET default_transaction_read_only = on;
ALTER ROLE cotiz_monitoring SET statement_timeout = '5s';
SQL
echo "Rôle de supervision cotiz_monitoring à jour."
