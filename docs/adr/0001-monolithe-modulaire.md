# ADR 0001 · Monolithe modulaire NestJS, deux processus

**Statut :** adopté · 2026-09-29

## Décision

Une base de code NestJS découpée en modules aux frontières strictes (vérifiées par dependency-cruiser) ; processus `api` et `worker` depuis la même image.

## Pourquoi

Le volume de Cotiz ne justifie pas des microservices (réseau, transactions distribuées, déploiements multiples). Les frontières permettent d'extraire plus tard un module (notifications en premier).

## Alternatives écartées

Microservices dès le départ ; application sans frontières.
