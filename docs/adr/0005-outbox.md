# ADR 0005 · Événements de domaine et patron outbox

**Statut :** adopté · 2026-09-29

## Décision

Toute action à effet de bord écrit un événement dans la même transaction ; le worker le relaie vers BullMQ ; consommateurs idempotents.

## Pourquoi

Aucune notification pour une opération annulée, aucune opération validée sans sa notification.

## Alternatives écartées

Appels directs ; publication Redis hors transaction.
