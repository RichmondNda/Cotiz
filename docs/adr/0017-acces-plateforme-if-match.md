# ADR 0017 · Accès plateforme (cotiz_platform) et If-Match par opération

**Statut :** adopté · 2026-10-20 (lot 1.2, étape 4)

## Contexte

`architecture/02` réserve le rôle `cotiz_platform` (BYPASSRLS) aux cas d'usage `/platform` et dit « chaque requête auditée ». Au lot 1.2, trois points n'étaient pas couverts :

- **Lectures `/platform`.** `pf.plans` et les listes du super-admin sont lues souvent. Les auditer toutes noierait le journal sans rien apprendre : aucune donnée n'y change.
- **Script `seed-dev`.** Il crée les plans de référence. `plans` est une table globale, et `cotiz_app` n'a plus le droit d'y écrire (`REVOKE INSERT, UPDATE ON plans FROM cotiz_app`).
- **`If-Match`.** `endpoints.yaml` porte le drapeau `ifMatch` au niveau de l'endpoint. Or `pf.plan.write` regroupe la création (POST 201, sans version à comparer) et la modification (PATCH, qui exige la version).

## Décision

1. **Choix de la connexion.** La connexion `cotiz_platform` se choisit d'après la route du contrat, jamais d'après le jeton.
   - Seules les routes `/platform` (espace `platform`) l'utilisent. `SpaceGuard` marque la requête, et le contexte tenant ouvre alors la transaction sur `cotiz_platform`.
   - Un jeton plateforme sur `/me` ou sur une route commune reste en `cotiz_app`.
   - Hors de l'espace `platform`, la connexion est refusée.
   - Sans `PLATFORM_DATABASE_URL`, les routes `/platform` sont refusées : aucun repli sur `cotiz_app`. Cette variable est obligatoire en production.
2. **Audit.** Les écritures `/platform` sont auditées (`@Audited`). Les lectures ne le sont que si le contrat le demande, par le drapeau `audited` de l'endpoint.
3. **Scripts.** Un script n'utilise `cotiz_platform` que s'il le demande explicitement (`withTenantContext(platform, fn, { platformConnection: true })`), dans l'espace `platform`. Aujourd'hui, seul `seed-dev` le fait, et seulement en développement et en test (`assertDevSeedAllowed`). Ses écritures sont auditées (`plan.seed_dev`).
4. **If-Match.** `ifMatch` reste au niveau de l'endpoint dans `endpoints.yaml`.
   - Dans `packages/contracts`, une opération de création (POST 201) peut porter l'exception `ifMatch: false`. Aujourd'hui, seule la création de `pf.plan.write` la porte.
   - La règle `requiresIfMatch` est partagée par le serveur, l'api-client et l'OpenAPI. Un GET ne l'exige jamais.
   - Une opération absente du contrat est une erreur de configuration.

## Conséquences

- Le journal d'audit garde ce qui change, pas les consultations courantes du super-admin.
- `architecture/02` renvoie à cet ADR pour `cotiz_platform`.
- Chaque environnement doit fournir `PLATFORM_DATABASE_URL` : CI, local (`backend/.env`) et production.
- Un test vérifie que l'exception `ifMatch: false` n'existe que sur un POST 201 d'un endpoint `ifMatch`. Une nouvelle exception doit passer ce test.

## Alternatives écartées

- **Auditer toutes les requêtes `/platform`, lectures comprises.** Volume sans valeur pour la traçabilité.
- **Choisir la connexion d'après le jeton plateforme.** `/me` et les routes communes passeraient en BYPASSRLS sans raison.
- **Garder `cotiz_app` pour `seed-dev`.** Il faudrait lui rendre `INSERT` et `UPDATE` sur `plans`, ouverts alors à toute l'API.
- **Séparer la création en un endpoint distinct dans `endpoints.yaml`.** Changement du contrat et des mocks pour une seule opération.
- **Ignorer `If-Match` sur tout POST.** Les actions sur une ressource existante (`lg.pay.validate`, verrouillage d'un contrat) en ont besoin.
