# Cotiz — instructions pour Claude Code

Cotiz est un SaaS multi-tenant de gestion des cotisations d'associations (Afrique de l'Ouest francophone, montants en F CFA).
Les paiements ne transitent PAS par la plateforme : le souscripteur paie l'association hors plateforme (virement, mobile money,
espèces), puis **déclare** son paiement avec une preuve ; un gestionnaire vérifie et **valide**. Un paiement peut couvrir
plusieurs échéances (répartition).

## Où en est-on
- **Front V0 : terminé** — `frontend/` (Nuxt 4), tous les écrans sur mocks Nitro (lots front 00–09 de `prompts/`).
- **Back-end : en cours de démarrage** — NestJS dans `backend/`, 33 lots dans `docs/lots/`, avancement dans `docs/progress.md`.
  Commencer par `/statut`.

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

Le workspace pnpm (`frontend`, `backend`, `packages/*`), `infra/` et la CI back sont créés au lot 0.1.
Jusque-là, le front se lance depuis `frontend/` avec npm.

## Où est la vérité
- `docs/specs/` : **normatif** — `endpoints.yaml` (le contrat d'API, `/api/v1`), `schema.sql`, `errors.yaml`, `events.yaml`,
  `permissions.yaml`, `features.yaml`, `jobs.yaml`, `status-mapping.yaml`, `screens.yaml`, `domain-rules.md`, `test-vectors/`,
  `seed-reference.yaml`, `ui-deviations.md`.
- `docs/architecture/` : le pourquoi et le comment. `docs/ui/` : fiches des écrans. `docs/decisions.md` : décisions à trancher.
- Rendu des écrans : `design/` (captures > HTML > CSS), sauf les écarts de `docs/specs/ui-deviations.md`.
- `docs/api-v0.md` : contrat **transitoire** de la V0 (chemins français) ; la cible est `endpoints.yaml` (alignement au lot 0.3).
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
| Démarrer un lot back (x.y) | `/clear` puis `/lot 0.1` → lecture, vérifications, plan ; rien n'est modifié avant validation |
| Réaliser une étape (une étape = une PR) | `/etape 0.1 1`, `/etape 0.1 2`… |
| Tout vérifier | `/verify` (`pnpm verify` à partir du lot 0.1) |
| Passer un endpoint en réel | `/bascule <id>` (ex. `lg.grid`) |
| Clôturer un lot | `/fin-lot 0.1` (met à jour `docs/progress.md`) |
| Consigner une décision | `/adr <titre>` |
| Vérifier un écran contre la maquette | `/verifier-ecran <route> [--role …] [--scenario …]` |
| Lot front (historique, 00–09) | `/lot-front NN`, `/revue-lot NN` |

Sous-agents : `isolation-reviewer`, `money-reviewer`, `contract-guardian`, `test-skeptic`.

## Commandes du dépôt (à partir du lot 0.1)
```bash
pnpm dev                          # api + worker + web (mocks Nitro pour ce qui n'est pas encore réel)
pnpm verify                       # lint + types + tests + isolation + contrats + mocks + docs — porte de sortie de chaque étape
pnpm --filter <paquet> test       # tests d'un paquet (frontend, backend, @cotiz/domain…)
pnpm db:migrate | db:seed:demo | db:seed:load
docker compose -f infra/compose/local.yml up -d
node tools/check-docs.mjs         # cohérence de docs/specs et docs/lots
```

## Méthode de travail
- **Un lot par session** (`/lot <id>`), **une étape par PR** (`/etape <id> <n>`). Commence par un plan ; ne modifie rien avant validation.
- Ordre dans une étape : contrat → tests (les voir échouer) → code → `pnpm verify`.
- Logique d'argent (lots 2.3, 2.4, 3.3, 4.6, 5.1, 6.3) : tests d'abord, toujours.
- Avant de conclure une étape touchant la base ou l'argent : sous-agents `isolation-reviewer` et `money-reviewer` sur le diff.
- Ne commence pas un lot dont une dépendance n'est pas `terminé` dans `docs/progress.md`, ni dont une décision listée est `ouvert`
  dans `docs/decisions.md` sans me demander.
- Ne modifie `docs/` que pour mettre à jour `docs/progress.md`, sauf demande explicite. Si une spec doit changer, propose le changement.
- Tout écran touché par une bascule est revérifié avec `/verifier-ecran` (le rendu ne doit pas bouger).
- Commits : Conventional Commits, portée = module ou paquet (`feat(ledger): valider un paiement`). Branche `lot/<id>-<slug>`.
- Branche d'intégration des lots back : `backend`. Chaque `lot/<id>-<slug>` part de `origin/backend` et sa PR y est fusionnée
  (`--base backend`, commit de fusion) ; `backend` n'est fusionnée dans `main` que sur demande.
- Termine chaque étape par : ce qui est fait, résultat de `pnpm verify`, ce qui reste.
- Si une information manque ou si une règle bloque : **demander**, ne pas inventer.
