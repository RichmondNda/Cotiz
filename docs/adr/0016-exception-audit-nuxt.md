# ADR 0016 · Exception temporaire à l'audit des dépendances de production (outils de dev/build de Nuxt)

**Statut :** adopté · 2026-10-09 · révisé le 2026-10-22 (2 GHSA restantes, voir « Révision ») · **réexamen au plus tard le 2026-11-09**

## Contexte

La CI lance `pnpm audit --prod`. `nuxt` est une dépendance de production du `frontend`, donc l'audit remonte aussi ses outils de développement et de build. Six alertes (2 critiques, 4 hautes) n'ont aucune version corrigée compatible :

| GHSA | Paquet | Chemin | Correctif |
|---|---|---|---|
| GHSA-86w9-cpqp-85rv | node-forge ≤ 1.4.0 | `nuxt > @nuxt/cli > listhen` | aucun |
| GHSA-vfj7-8cjw-p6xm | braces ≤ 3.0.3 | `nuxt > @nuxt/nitro-server > nitropack > globby > micromatch` | aucun |
| ~~GHSA-v5rq-49vh-5v5c~~ | @simple-git/argv-parser < 2.0.1 | `nuxt > @nuxt/devtools > simple-git` | ≥ 2.0.1, via simple-git 4 (retirée le 2026-10-22) |
| ~~GHSA-x6jw-m9v5-85vh~~ | simple-git < 4.0.1 | `nuxt > @nuxt/devtools` | ≥ 4.0.1 (retirée le 2026-10-22) |
| ~~GHSA-g4wm-2vf7-vfgr~~ | simple-git ≤ 3.36.0 | `nuxt > @nuxt/devtools` | ≥ 4.0.0 (retirée le 2026-10-22) |
| ~~GHSA-858h-whjf-mvg5~~ | simple-git ≤ 3.36.0 | `nuxt > @nuxt/devtools` | ≥ 4.0.0 (retirée le 2026-10-22) |

La version stable de `@nuxt/devtools` (3.4.2) exige `simple-git ^3.36.0`, et sa version 4 est en bêta.

Vérification faite sur un build (`pnpm --filter "frontend..." run build`) : aucun de ces paquets, ni `listhen`, `micromatch`, `nitropack` ou `@nuxt/devtools`, ne figure dans `frontend/.output`. Ils n'y apparaissent ni comme dossier ni comme référence dans le code. L'image `web` ne copie que `.output`, donc ces paquets n'atteignent pas la production. Par ailleurs, `source-map-js` 1.2.1 (GHSA-68fv-2mgg-jv7q), lui, **est** livré : il a été corrigé (1.2.2, dans la plage `^1.2.1`) et ne fait pas partie de l'exception.

## Décision

Ces six GHSA sont ignorées par `pnpm.auditConfig.ignoreGhsas` dans le `package.json` racine. Ce sont des identifiants précis, pas un seuil de sévérité : toute nouvelle alerte fait toujours échouer la CI. Le pas d'audit de `.github/workflows/ci.yml` renvoie à cet ADR.

L'exception est temporaire :
- on retire une GHSA dès qu'un correctif compatible avec Nuxt est publié (montée de `nuxt`, `@nuxt/cli`, `nitropack` ou `@nuxt/devtools` 4 stable) ;
- au plus tard le 2026-11-09, on réexamine la liste. Une GHSA maintenue reçoit une nouvelle date, consignée ici.

## Révision du 2026-10-22

Montée de `nuxt` en 4.6.2 (correctifs de GHSA-vjh5-4x84-xrqp, GHSA-xfq5-w38q-pc2x et GHSA-jjm6-p2m9-9w4x, alertes
publiées entre le 20 et le 22 octobre) : `@nuxt/devtools` 3.4.4 n'entraîne plus `simple-git`, et `vite` (8.3.5) et
`launch-editor` (2.14.2) sont corrigés. Les quatre GHSA de `simple-git` sont retirées de `ignoreGhsas`.

Restent ignorées, sans correctif publié : GHSA-86w9-cpqp-85rv (`node-forge` 1.4.0) et GHSA-vfj7-8cjw-p6xm (`braces` 3.0.3).
Vérification refaite sur un build : ni `node-forge`, `braces`, `micromatch`, `listhen` ni `nitropack` ne figurent dans
`frontend/.output`. La date de réexamen est inchangée.

## Conséquences

- La CI repasse au vert sans changer le code ni le comportement des écrans.
- La règle d'audit est assouplie pour ces six alertes. Risque : l'exception est oubliée. La date de réexamen et le renvoi depuis la CI sont là pour l'éviter.
- Ces alertes concernent toujours l'environnement de développement (`pnpm dev`, devtools, CLI). Le risque y est limité au poste du développeur et au dépôt local.
- Si un de ces paquets entre un jour dans `.output`, l'exception n'est plus justifiée. Il faut alors refaire la vérification sur un build à chaque réexamen.

## Alternatives écartées

- **Forcer `simple-git` 4 par un override pnpm** : l'audit passerait sans exception, mais au prix d'une version majeure imposée à `@nuxt/devtools` 3.x, avec un risque de casser les devtools en développement.
- **Overrides pour node-forge et braces** : sans effet, aucune version corrigée n'existe.
- **Passer à `pnpm audit --prod --audit-level critical`** ou retirer l'audit : cela assouplirait la règle pour toutes les alertes futures, et pas seulement pour celles-ci.
- **Déplacer `nuxt` en `devDependencies`** : contraire à son rôle de dépendance d'exécution du serveur Nitro, et cela masquerait les vraies alertes de production.
