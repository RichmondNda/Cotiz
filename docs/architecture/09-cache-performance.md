# 09 · Cache et performance

## Cache
| Donnée | Où | Durée | Invalidation |
|---|---|---|---|
| KPI tableau de bord gestionnaire | Redis | 60 s | `payment.*`, `member.*` de l'association |
| Synthèse souscripteur | Redis | 30 s | Événements le concernant |
| Compteur de non-lus | Redis | Jusqu'à changement | Chaque notification / lecture |
| Abonnement, quotas, features d'une association | Mémoire + Redis | 5 min | Changement de plan, suspension |
| Plans publics | Redis + `Cache-Control` | 1 h | Modification d'un plan |
| Statistiques plateforme, rapports lourds | Vues matérialisées | 15 min | Rafraîchissement concurrent planifié |

**Jamais en cache** : file de validation, échéancier au moment de déclarer, toute donnée lue pour décider d'une écriture.

## Index des requêtes chaudes
Définis dans `docs/specs/schema.sql` (section Index) : grille, file de validation, espace souscripteur, retards, cloche, relais outbox, recherche trigramme, codes à remettre, demandes de réinitialisation, file « À relancer ».

## Règles
- Pagination par curseur (jamais `OFFSET`) pour les listes longues.
- Objectifs : 95 % des lectures < 300 ms, écritures < 800 ms, grille 200 × 24 < 500 ms.
- Chaque lot qui ajoute une requête de liste l'examine avec `EXPLAIN (ANALYZE, BUFFERS)` sur le jeu de charge (`pnpm db:seed:load`, 50 000 échéances).
- `outbox_events`, `deliveries`, `audit_logs` : partitionnement mensuel (pg_partman) quand elles dépassent quelques millions de lignes.
