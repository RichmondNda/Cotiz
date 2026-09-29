# ADR 0015 · Statuts en types ENUM PostgreSQL

**Statut :** adopté · 2026-09-29

## Décision

Valeurs alignées sur `status-mapping.yaml` ; ajout de valeur par `ALTER TYPE … ADD VALUE`.

## Pourquoi

Intégrité en base, lisibilité.

## Alternatives écartées

CHECK sur du texte (plus souple, moins lisible).
