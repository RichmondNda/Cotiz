# ADR 0007 · Redis pour files, cache court et limitation

**Statut :** adopté · 2026-09-29

## Décision

BullMQ, cache de 30 s à 5 min, limitation de débit, liste de révocation. Jamais seule copie d'une donnée financière.

## Pourquoi

Simple, éprouvé, reconstruisible depuis l'outbox.

## Alternatives écartées

RabbitMQ ; cache applicatif en mémoire seul.
