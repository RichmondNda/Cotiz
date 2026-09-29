# ADR 0012 · Drizzle ORM

**Statut :** adopté · 2026-09-29

## Décision

SQL explicite et typé, migrations SQL lisibles, transactions et `SET LOCAL` simples.

## Pourquoi

Les deux besoins forts de Cotiz sont RLS par transaction et agrégats de rapports.

## Alternatives écartées

Prisma (RLS laborieux) ; TypeORM (maintenance irrégulière).
