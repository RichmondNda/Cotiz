# Cotiz — instructions pour Claude Code

Cotiz est un SaaS multi-tenant de gestion des cotisations d'associations (Afrique de l'Ouest francophone, montants en F CFA).
Les paiements ne transitent PAS par la plateforme : le souscripteur paie l'association hors plateforme (virement, mobile money,
espèces), puis **déclare** son paiement avec une preuve ; un gestionnaire vérifie et **valide**. Un paiement peut couvrir
plusieurs échéances (répartition).

## Où en est-on
- **Front V0 : terminé** — `frontend/` (Nuxt 4), tous les écrans sur mocks Nitro (lots front 00–09 de `prompts/`).
- **Back-end : en cours** — NestJS dans `backend/`, 33 lots dans `docs/lots/`. Lots 0.1 à 2.4 livrés sur la branche
  d'intégration `backend` (le registre et la validation des paiements sont réels) ; `main` n'a que le front V0 et la doc.
  Avancement à jour dans `docs/progress.md` : commencer par `/statut`.

## Carte du dépôt
| Chemin | Contenu | Règles détaillées |
|---|---|---|
| `frontend/` | Nuxt 4 : public + espaces souscripteur, gestionnaire, super-admin | `frontend/CLAUDE.md` |
| `backend/` | NestJS : `api` (HTTP, :4000, `/api/v1`) + `worker` (outbox, BullMQ, tâches) | `backend/CLAUDE.md` |
| `packages/contracts` | Schémas Zod de chaque endpoint → types, OpenAPI, client | `packages/contracts/CLAUDE.md` |
| `packages/domain` | Règles métier pures : argent, échéancier, répartition, statuts | `packages/domain/CLAUDE.md` |
| `packages/db` | Drizzle, migrations SQL, RLS, seeds | `packages/db/CLAUDE.md` |
| `docs/` | Référence back-end et intégration (index : `docs/README.md`) | — |
| `design/` | Maquette validée : captures, HTML, CSS du DS, inventaire, données — **lecture seule** | `frontend/CLAUDE.md` |
| `prompts/` | Lots front 00–09 (terminés) | — |

Workspace pnpm (`frontend`, `backend`, `packages/*`) + Turborepo, `infra/` (compose local, Docker, Grafana) et la CI back
existent depuis le lot 0.1 : tout se lance depuis la racine avec pnpm (`pnpm --filter frontend <script>` pour le front).

## Où est la vérité
- `docs/specs/` : **normatif** — `endpoints.yaml` (le contrat d'API, `/api/v1`), `schema.sql`, `errors.yaml`, `events.yaml`,
  `permissions.yaml`, `features.yaml`, `jobs.yaml`, `status-mapping.yaml`, `screens.yaml`, `domain-rules.md`, `test-vectors/`,
  `seed-reference.yaml`, `ui-deviations.md`.
- `docs/architecture/` : le pourquoi et le comment. `docs/ui/` : fiches des écrans. `docs/decisions.md` : décisions à trancher.
- Rendu des écrans : `design/` (captures > HTML > CSS), sauf les écarts de `docs/specs/ui-deviations.md`.
- Conflit : `docs/specs/` > `docs/architecture/` > le reste. Une contradiction trouvée → **s'arrêter et la signaler** au lieu de choisir.
- Le dossier `backend data/` (s'il existe encore) est la source brute de cette documentation : ne pas s'en servir.

## Règles non négociables
1. **Contrat d'abord** : tout échange HTTP est défini dans `packages/contracts` (Zod) avant d'être codé. Front, back et mocks
   importent les mêmes types. L'OpenAPI est généré, jamais écrit à la main.
2. **Calculs métier uniquement dans `packages/domain`** (échéancier, répartition, statuts, argent). Jamais de copie dans un module
   ou un composant. Les vecteurs de `docs/specs/test-vectors/` doivent passer à l'identique.
3. **Argent** : entiers (`bigint` en base, entier en JSON) + devise. Jamais de flottant, jamais de `numeric`.
   Affichage `25 000 F` (U+202F), via `formatMoney` / `formatFCFA`.
4. **Isolation** : toute table avec `association_id` a une politique RLS (`FORCE ROW LEVEL SECURITY`) et un test d'isolation.
   Tout accès base passe par `shared/tenant-context` (transaction + `SET LOCAL`). Ressource d'une autre association → 404.
5. **Effets de bord par l'outbox** : notifier, générer un PDF, invalider un cache = événement écrit dans la même transaction.
   Consommateurs idempotents.
6. **Aucun fournisseur externe** (SMS, email, paiement, captcha hébergé, polices Google…) hors des lots du groupe 6.
   Les codes et relances sont remis par une personne (message prêt : copier, WhatsApp, `sms:`, impression).
7. **Migrations** : une migration commitée ne se modifie jamais ; on en ajoute une. Schéma cible : `docs/specs/schema.sql`.
8. **Données financières** : pas de suppression physique ; annulation = opération compensatoire auditée.
9. **Frontières de modules** : un module back n'importe d'un autre que son `<module>.public.ts`.
10. **Secrets** : ne lis jamais les fichiers `.env*` ; aucun secret, code ou téléphone en clair dans les journaux.
11. **`design/` est en lecture seule** ; le logo n'est jamais modifié.

## Vocabulaire
Interface en français, code back en anglais : souscripteur = subscriber, échéance = installment, déclarer = declare,
répartition = allocation, fonds d'entrée = entry fee, gestionnaire = manager (rôles owner/manager/viewer),
association = association (tenant), projet = project, inscription = enrollment. Glossaire : `docs/glossary.md`.
À l'écran, jamais : campagne, client, adhérent, mensualité, facture (pour une échéance), payer, approuver (un paiement), encaisser.

## Commandes Claude Code
| Moment | Commande |
|---|---|
| Faire le point | `/statut` |
| Démarrer un lot back (x.y) | `/clear` puis `/lot 2.5` → lecture, vérifications, plan, puis exécution des étapes |
| Réaliser une étape (une étape = une PR) | `/etape 2.5 1`, `/etape 2.5 2`… |
| Tout vérifier | `/verify` (`pnpm verify`) |
| Passer un endpoint en réel | `/bascule <id>` (ex. `lg.grid`) |
| Clôturer un lot | `/fin-lot 2.5` (met à jour `docs/progress.md`) |
| Consigner une décision | `/adr <titre>` |
| Vérifier un écran contre la maquette | `/verifier-ecran <route> [--role …] [--scenario …]` |
| Lot front (historique, 00–09) | `/lot-front NN`, `/revue-lot NN` |

Sous-agents : `isolation-reviewer`, `money-reviewer`, `contract-guardian`, `test-skeptic`.

## Commandes du dépôt
```bash
pnpm install                      # pnpm 10.10.0 via corepack (`packageManager`), Node 22 ; installe aussi les hooks husky
pnpm dev                          # api + worker + web (mocks Nitro pour ce qui n'est pas encore réel)
pnpm verify                       # lint + types + tests + isolation + contrats + mocks + docs — porte de sortie de chaque étape
pnpm --filter <paquet> test       # tests d'un paquet (frontend, backend, @cotiz/domain…)
pnpm test:perf                    # mesures de durée (backend/test/perf), hors de pnpm verify : à lancer quand on touche en.bulk, rapports, tableau de bord
pnpm db:migrate | db:seed:demo
docker compose -f infra/compose/local.yml up -d
docker compose -f infra/compose/local.yml -f infra/compose/app.yml up -d --build   # tout en Docker, front sur :3080
node tools/check-docs.mjs         # cohérence de docs/specs et docs/lots
```

## Méthode de travail
- **Un lot par session** (`/lot <id>`), **une étape par PR** (`/etape <id> <n>`). Commence par un plan, consigné dans
  `.claude/notes/decisions.md`, puis exécute-le sans attendre de validation (voir « Mode autonome »).
- Ordre dans une étape : contrat → tests (les voir échouer) → code → `pnpm verify`.
- Logique d'argent (lots 2.3, 2.4, 3.3, 4.6, 5.1, 6.3) : tests d'abord, toujours.
- Avant de conclure une étape touchant la base ou l'argent : sous-agents `isolation-reviewer` et `money-reviewer` sur le diff.
- **Revue humaine** (critère « revue humaine » d'une définition de fini) : acquise dès que l'utilisateur a approuvé ou fusionné la PR
  qui porte le code concerné. Avant, le critère reste « à confirmer » ; ne jamais le cocher sans cette approbation.
- Ne commence pas un lot dont une dépendance n'est pas `terminé` dans `docs/progress.md`, ni dont une décision listée est `ouvert`
  dans `docs/decisions.md` sans me demander.
- Ne modifie `docs/` que pour mettre à jour `docs/progress.md`, sauf demande explicite. Si une spec doit changer, propose le changement.
- Tout écran touché par une bascule est revérifié avec `/verifier-ecran` (le rendu ne doit pas bouger).
- Commits : Conventional Commits, portée = module ou paquet (`feat(ledger): valider un paiement`). Branche `lot/<id>-<slug>`.
- Branche d'intégration des lots back : `backend`. Chaque `lot/<id>-<slug>` part de `origin/backend` et sa PR y est fusionnée
  (`--base backend`, commit de fusion) ; `backend` n'est fusionnée dans `main` que sur demande.
- Termine chaque étape par : ce qui est fait, résultat de `pnpm verify`, ce qui reste.
- Si une information manque ou si une règle bloque : **demander**, ne pas inventer.

## Notes persistantes
**Au début de chaque session, lire `.claude/notes/`** (mode d'emploi : `.claude/notes/README.md`) :
`apprentissages.md` (ce qui a été appris : architecture, conventions, commandes, pièges), `decisions.md` (choix faits en autonome),
`a-verifier.md` (points incertains et actions en attente d'accord). Y consigner seulement des faits vérifiés (code ou commande),
avec leur source ; mettre à jour une entrée existante plutôt que la dupliquer.

## Mode autonome
- Le plan d'un lot s'exécute **sans validation** : l'écrire, le consigner, puis enchaîner les étapes (`/etape`) jusqu'à `/fin-lot`.
- Un choix technique avec une option recommandée ou conventionnelle : la prendre, la noter dans `.claude/notes/decisions.md`,
  continuer sans poser de question.
- Une étape finie se vérifie (tests, lint, build — `pnpm verify`) et ses erreurs se corrigent avant d'enchaîner sur la suivante du plan ;
  continuer jusqu'au bout de la tâche, puis résumer.
- Les règles non négociables ci-dessus restent valables : contradiction entre sources, changement de `docs/specs/`, migration commitée,
  politique RLS → s'arrêter et demander.
- **Toujours demander d'abord**, et consigner la demande dans `.claude/notes/a-verifier.md` :
  - suppression de données ou de fichiers non versionnés ;
  - `git push --force`, réécriture d'historique, suppression de branches distantes ;
  - déploiement en production, changement de configuration Dokploy ou Traefik ;
  - modification de secrets, de fichiers `.env` ou de clés SSH ;
  - installation de skills ou de dépendances dont la source n'est pas vérifiée ;
  - toute dépense ou action irréversible vers un service externe.
- **Pousser sans demander** les branches `lot/*` et `chore/*` et ouvrir leur PR vers `backend` (`--base backend`), une fois
  `pnpm verify` vert (ou, pour un changement limité à du Markdown, contrôle du diff). Jamais de `--force`, jamais de push
  vers `main` ni `backend` directement ; fusionner une PR reste une demande explicite.
