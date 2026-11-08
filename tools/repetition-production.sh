#!/usr/bin/env bash
# Répétition de la pile de production sur le poste (lot 3.5, étape 4) : infra/compose/production.yml (celui que le
# lot 7.1 déploie) + production.local.yml (ports 127.0.0.1), projet compose séparé (`cotiz-prod` : ses propres
# conteneurs et volumes, la pile de dev n'est pas touchée).
#
#   tools/repetition-production.sh                 construit les images (front NUXT_MOCKS=0), lance, vérifie, parcours
#   tools/repetition-production.sh --sans-build    images déjà construites
#   tools/repetition-production.sh --arreter       arrête la pile (volumes gardés)
#
# Secrets générés à chaque lancement, en mémoire seulement (jamais écrits, jamais affichés) : clés JWT Ed25519, clé AES
# des codes, clés HMAC, mots de passe PostgreSQL et MinIO. Sur un volume existant, les mots de passe des rôles sont
# remis aux nouvelles valeurs ; les sessions et les codes ré-affichables d'une répétition précédente ne valent plus.
# Compte plateforme : un owner neuf par lancement (`create-platform-owner`, code lu sans être affiché, activé par
# l'API), transmis aux parcours par COTIZ_SUPERADMIN_EMAIL et COTIZ_SUPERADMIN_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJET=${COTIZ_PROD_PROJET:-cotiz-prod}
export COTIZ_PROD_WEB_PORT=${COTIZ_PROD_WEB_PORT:-3090}
export COTIZ_PROD_API_PORT=${COTIZ_PROD_API_PORT:-4090}
export COTIZ_PROD_MINIO_PORT=${COTIZ_PROD_MINIO_PORT:-9090}
export COTIZ_API_IMAGE=${COTIZ_API_IMAGE:-cotiz-api:production}
export COTIZ_WEB_IMAGE=${COTIZ_WEB_IMAGE:-cotiz-web:production}

compose() { docker compose -p "$PROJET" -f infra/compose/production.yml -f infra/compose/production.local.yml "$@"; }
etape() { printf '\n▶ %s\n' "$*"; }

alea() { openssl rand -hex "${1:-24}"; }
# PEM sur une ligne, `\n` littéraux (accepté par backend/src/config.ts).
une_ligne() { awk 'BEGIN { ORS = "\\n" } { print }'; }

secrets() {
  local prive
  prive=$(openssl genpkey -algorithm ed25519)
  COTIZ_JWT_PRIVATE_KEY=$(printf '%s\n' "$prive" | une_ligne)
  COTIZ_JWT_PUBLIC_KEY=$(printf '%s\n' "$prive" | openssl pkey -pubout | une_ligne)
  COTIZ_CODES_ENCRYPTION_KEY=$(openssl rand -base64 32)
  COTIZ_ALTCHA_HMAC_KEY=$(alea 32)
  COTIZ_LOG_PSEUDONYM_KEY=$(alea 32)
  COTIZ_DB_SUPERUSER_PASSWORD=$(alea)
  COTIZ_DB_MIGRATOR_PASSWORD=$(alea)
  COTIZ_DB_APP_PASSWORD=$(alea)
  COTIZ_DB_PLATFORM_PASSWORD=$(alea)
  COTIZ_DB_READONLY_PASSWORD=$(alea)
  COTIZ_S3_ACCESS_KEY_ID=cotiz-$(alea 6)
  COTIZ_S3_SECRET_ACCESS_KEY=$(alea)
  export COTIZ_JWT_PRIVATE_KEY COTIZ_JWT_PUBLIC_KEY COTIZ_CODES_ENCRYPTION_KEY COTIZ_ALTCHA_HMAC_KEY \
    COTIZ_LOG_PSEUDONYM_KEY COTIZ_DB_SUPERUSER_PASSWORD COTIZ_DB_MIGRATOR_PASSWORD COTIZ_DB_APP_PASSWORD \
    COTIZ_DB_PLATFORM_PASSWORD COTIZ_DB_READONLY_PASSWORD COTIZ_S3_ACCESS_KEY_ID COTIZ_S3_SECRET_ACCESS_KEY
  export COTIZ_PUBLIC_URL="http://localhost:${COTIZ_PROD_WEB_PORT}"
  export COTIZ_STORAGE_PUBLIC_URL="http://localhost:${COTIZ_PROD_MINIO_PORT}"
  # Sur le poste, seul le front (proxy Nitro) est devant l'api ; en production, Traefik s'y ajoute (2, la valeur par défaut).
  export COTIZ_TRUST_PROXY_HOPS=1
  export COTIZ_VERSION="repetition-$(git rev-parse --short HEAD)"
}

if [[ "${1:-}" == "--arreter" ]]; then
  # Variables exigées par l'interpolation, sans usage à l'arrêt.
  secrets
  compose stop
  exit 0
fi

if [[ "${1:-}" != "--sans-build" ]]; then
  etape "Images (front sans handlers simulés : NUXT_MOCKS=0)"
  docker build -q -f infra/docker/api.Dockerfile -t "$COTIZ_API_IMAGE" .
  docker build -q -f infra/docker/web.Dockerfile --build-arg NUXT_MOCKS=0 -t "$COTIZ_WEB_IMAGE" .
fi

secrets

etape "PostgreSQL, rôles et mots de passe de ce lancement"
compose up -d --wait postgres
compose exec -T postgres sh /docker-entrypoint-initdb.d/00-roles.sh
# Superutilisateur : variable du conteneur lue par psql (\getenv), jamais passée en argument.
compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U cotiz -d cotiz <<'SQL'
\getenv pw POSTGRES_PASSWORD
SELECT format('ALTER ROLE cotiz PASSWORD %L', :'pw') \gexec
SQL

etape "Pile complète (migrations d'abord, ClamAV : premier démarrage long)"
compose up -d
for _ in $(seq 1 180); do
  if [[ "$(compose ps -q api | xargs -r docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" == healthy ]]; then break; fi
  sleep 2
done
statut=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${COTIZ_PROD_API_PORT}/api/v1/health/ready")
echo "GET /api/v1/health/ready → ${statut}"
[[ "$statut" == 200 ]] || { compose ps; exit 1; }
compose ps --format '{{.Service}}\t{{.Status}}'
until [[ "$(compose ps -q worker | xargs -r docker inspect -f '{{.State.Status}}' 2>/dev/null)" == running ]]; do
  sleep 5
done

etape "Compte plateforme de la répétition"
email="owner-$(date +%Y%m%d%H%M%S)@repetition.cotiz.app"
sortie=$(compose exec -T api node dist/cli.js create-platform-owner "$email" Répétition Production)
code=$(printf '%s\n' "$sortie" | sed -n 's/^Code d’activation : \([^ ]*\).*/\1/p')
[[ -n "$code" ]] || { echo "create-platform-owner : code introuvable dans la sortie"; exit 1; }
mot_de_passe="Rep-$(alea 12)"
api="http://127.0.0.1:${COTIZ_PROD_API_PORT}/api/v1"
# Corps et réponses JSON par node (jamais affichés) : le code et le mot de passe restent hors des journaux.
jeton=$(EMAIL="$email" CODE="$code" MDP="$mot_de_passe" API="$api" node --input-type=module -e '
  const r = await fetch(`${process.env.API}/auth/activate`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ space: "platform", identifier: process.env.EMAIL, code: process.env.CODE, newPassword: process.env.MDP }) })
  if (!r.ok) { console.error(`auth.activate du compte plateforme → ${r.status}`); process.exit(1) }
  console.log((await r.json()).accessToken)')
echo "owner plateforme activé : ${email}"

etape "Plan d'entrée (base neuve : aucun plan ; en production, l'owner les crée dans /plateforme/plans)"
# Valeurs du plan Découverte du jeu de référence (billing/application/seed-dev-plans.use-case.ts), par pf.plan.write.
JETON="$jeton" API="$api" node --input-type=module -e '
  const h = { authorization: `Bearer ${process.env.JETON}`, "content-type": "application/json" }
  const plans = await (await fetch(`${process.env.API}/platform/plans`, { headers: h })).json()
  if (plans.items.some(p => p.code === "decouverte")) { console.log("plan Découverte déjà présent"); process.exit(0) }
  const zero = { amount: 0, currency: "XOF" }
  const r = await fetch(`${process.env.API}/platform/plans`, { method: "POST", headers: h, body: JSON.stringify({
    code: "decouverte", name: "Découverte", description: null, priceMonthly: zero, priceYearly: zero,
    limits: { projects: 1, subscribers: 20, managers: 1 }, features: [], isFeatured: false, isActive: true }) })
  if (r.status !== 201) { console.error(`pf.plan.write → ${r.status} ${await r.text()}`); process.exit(1) }
  console.log("plan Découverte créé")'

etape "Parcours de l'étape 1 sur la pile de production (aucun endpoint simulé toléré)"
COTIZ_BASE="http://localhost:${COTIZ_PROD_WEB_PORT}" COTIZ_STRICT=1 \
  COTIZ_SUPERADMIN_EMAIL="$email" COTIZ_SUPERADMIN_PASSWORD="$mot_de_passe" \
  node frontend/tests/e2e/parcours.mjs jalon
