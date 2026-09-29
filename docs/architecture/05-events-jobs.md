# 05 · Événements, files et tâches planifiées

## Du cas d'usage à l'effet de bord (patron outbox)
1. Le cas d'usage écrit ses données **et** l'événement dans `outbox_events`, dans la même transaction.
2. Le relais du worker lit toutes les secondes (`SELECT … FOR UPDATE SKIP LOCKED LIMIT 100`), pousse dans BullMQ (`events`), pose `published_at`.
3. Des consommateurs abonnés par type traitent : notifications, invalidation de cache, statistiques, PDF.
4. Chaque consommateur est **idempotent** : clé de déduplication `{event_id}:{consumer}` (Redis 7 jours) et contraintes uniques en base (`notifications.dedupe_key`).

Le catalogue complet (charge utile, émetteur, consommateurs, lot) est dans [../specs/events.yaml](../specs/events.yaml). Les files et tâches planifiées sont dans [../specs/jobs.yaml](../specs/jobs.yaml).

## Règles
- Enveloppe : `{ id, type, version, occurredAt, associationId, actorUserId, aggregate: {type, id}, payload }`.
- Changement incompatible de charge utile : nouvelle `version`, les deux versions consommées pendant la transition.
- Le worker pose le contexte tenant de l'événement avant tout accès base (`withTenantContext(event.associationId, …)`).
- Tâches planifiées : tâches répétables BullMQ avec verrou ; avec deux workers, une seule exécution.
- Aucune file ne contient de donnée financière dont elle serait la seule copie : on peut toujours reconstruire depuis l'outbox.
