#!/bin/sh
# Compartiments de architecture/08-files-pdf.md. Idempotent : relançable sans effet de bord.
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "minio-init : attente de MinIO…"
  sleep 1
done

# Preuves de paiement : versionnées.
mc mb --ignore-existing local/cotiz-proofs
mc version enable local/cotiz-proofs

# Contrats signés, factures : verrouillage d'objet (WORM). La rétention par défaut n'est pas posée en local,
# pour pouvoir vider la base de développement ; elle l'est en production (lot 7.1).
if ! mc stat local/cotiz-legal >/dev/null 2>&1; then
  mc mb --with-lock local/cotiz-legal
fi

# Exports : expiration 7 jours. Imports et relevés : expiration 30 jours.
expire() {
  mc mb --ignore-existing "local/$1"
  mc ilm rule ls --json "local/$1" 2>/dev/null | grep -q "\"Days\":$2}" || mc ilm rule add --expire-days "$2" "local/$1"
}
expire cotiz-exports 7
expire cotiz-imports 30

# Logos, couvertures.
mc mb --ignore-existing local/cotiz-media

echo "minio-init : compartiments prêts"
mc ls local
