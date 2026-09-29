# ADR 0002 · PostgreSQL unique source de vérité, isolation par Row Level Security

**Statut :** adopté · 2026-09-29

## Décision

Une base, une colonne `association_id` sur chaque table métier, politiques RLS forcées, contexte posé par `SET LOCAL` dans chaque transaction.

## Pourquoi

Un filtre oublié dans le code ne suffit plus à provoquer une fuite : la base refuse. Compatible PgBouncer en mode transaction.

## Alternatives écartées

Une base par association (exploitation lourde) ; filtrage applicatif seul.
