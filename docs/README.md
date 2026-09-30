# Documentation Cotiz — point d'entrée

Documentation de travail pour implémenter Cotiz avec Claude Code. **Ce dossier est la référence du back-end et de l'intégration** ; le rendu des écrans reste défini par `design/` (maquette validée, lecture seule).

## Où en est-on
- **Front V0 : terminé.** Tous les écrans sur mocks Nitro (`frontend/`, lots front 00–09 de `prompts/`).
- **Back-end : à démarrer.** 33 lots dans [`lots/`](lots/README.md), avancement dans [`progress.md`](progress.md). Premier lot : **0.1**.

## Ordre de lecture
1. [`architecture/00-overview.md`](architecture/00-overview.md) — le produit, le principe « sans fournisseur », la pile.
2. [`architecture/14-code-organization.md`](architecture/14-code-organization.md) — carte du dépôt (`frontend/`, `backend/`, `packages/`).
3. [`architecture/10-front-integration.md`](architecture/10-front-integration.md) — comment la V0 passe des mocks au vrai back.
4. [`lots/README.md`](lots/README.md) — les 33 lots, leurs dépendances et estimations.
5. [`progress.md`](progress.md) et [`decisions.md`](decisions.md) — où on en est, ce qui reste à trancher.
6. Le fichier du lot en cours dans [`lots/`](lots/).

## Contenu
| Chemin | Contenu | Nature |
|---|---|---|
| `architecture/` | 15 documents : modules, isolation, auth, flux, événements, API, notifications, fichiers, cache, intégration front, exploitation, tests, conformité, code | Explicatif |
| `specs/` | `endpoints.yaml` (107 ressources, 152 opérations), `schema.sql` (43 tables, RLS, triggers, index), `errors.yaml`, `events.yaml`, `permissions.yaml`, `features.yaml`, `jobs.yaml`, `status-mapping.yaml`, `screens.yaml` (60 écrans, route Nuxt + nom dans `design/INVENTAIRE.md`), `domain-rules.md`, `test-vectors/`, `seed-reference.yaml`, `ui-deviations.md`, `rls-smoke-test.sql`, `data-model.md` | **Normatif** |
| `ui/` | Fiches détaillées des écrans par espace, avec endpoints, lot et écarts | Référence écran |
| `lots/` | Un fichier par lot : objectif, périmètre, étapes vérifiables, définition de fini | Plan de travail |
| `adr/` | Décisions d'architecture | Historique |
| `runbooks/` | Procédures d'exploitation (lot 7.1) | Exploitation |
| `glossary.md` | Vocabulaire interface (français) ↔ code (anglais) | Référence |
| `api-v0.md` | Contrat de la V0 (chemins français, mocks Nitro), généré par `frontend/scripts/generer-contrat-api.mjs` ; supprimé à la fin du lot 0.3 | Transitoire |
| `placeholders-v0.md` | Placeholders `[N]`, `[MONTANT]`… encore présents dans la V0 | Transitoire |

## Hiérarchie des sources
1. `docs/specs/` — normatif pour l'API, la base, les règles d'argent, les permissions.
2. `docs/architecture/` — le pourquoi et le comment.
3. `design/` — le rendu des écrans (captures > HTML > CSS du DS), sauf les écarts de `specs/ui-deviations.md`.
4. `docs/ui/`, `docs/lots/` — le reste.

Une contradiction entre deux sources : **s'arrêter et la signaler**, puis la trancher dans `docs/specs/` (jamais dans le code seul).

## Garanties de cohérence
Chaque endpoint appartient à un lot et est cité dans une étape ; chaque table appartient à un lot ; chaque erreur, événement et permission référencé existe ; chaque écran pointe vers des endpoints existants ; `schema.sql` s'exécute sur PostgreSQL 16 et `rls-smoke-test.sql` passe. `node tools/check-docs.mjs` refait les contrôles principaux (lancé par `pnpm verify` à partir du lot 0.1).
