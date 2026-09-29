# ADR 0003 · Contrat d'API d'abord : Zod → types + OpenAPI

**Statut :** adopté · 2026-09-29

## Décision

`packages/contracts` est la source de vérité ; OpenAPI généré ; front, back et mocks importent les mêmes schémas.

## Pourquoi

Empêche les écarts entre la V0 simulée et le back réel. Un changement cassant fait échouer la CI.

## Alternatives écartées

OpenAPI écrit à la main ; types dupliqués.
