# 14 · Organisation du code

Workspace pnpm à la racine (mis en place au lot 0.1) ; Turborepo pour enchaîner les tâches.

```
cotiz/
├── CLAUDE.md                     # règles communes + carte du dépôt (lu à chaque session)
├── .claude/                      # commandes, sous-agents, hooks, réglages
├── pnpm-workspace.yaml           # frontend, backend, packages/*
├── frontend/                     # Nuxt 4 — public + 3 espaces (V0 livrée, lots front 00–09) — voir frontend/CLAUDE.md
│   ├── app/                      # pages, composants cz/ metier/ layout/, composables/api (seul accès aux données)
│   ├── server/api/v1/            # handlers simulés conformes au contrat (lot 0.3), supprimés à la bascule
│   ├── server/mocks/             # store en mémoire du jeu de référence
│   ├── server/bascule/           # real-endpoints.ts + middleware de proxy vers NestJS
│   ├── scripts/, tests/e2e/      # capture d'écran, parcours Playwright, accessibilité, cohérence
│   └── types/                    # types V0, remplacés par @cotiz/contracts au lot 0.3
├── backend/                      # NestJS (api + worker) — voir backend/CLAUDE.md
│   ├── src/main.ts               # processus HTTP (:4000, préfixe /api/v1)
│   ├── src/worker.ts             # processus worker
│   ├── src/cli.ts                # scripts d'exploitation (reset-password, create-platform-owner…)
│   ├── src/modules/<module>/     # http/ application/ domain/ infra/ events/ <module>.public.ts
│   ├── src/shared/               # tenant-context, outbox, storage, audit, channels, crypto, idempotency
│   └── test/                     # intégration, isolation, e2e api
├── packages/
│   ├── contracts/                # Zod → types + OpenAPI (SOURCE DE VÉRITÉ des échanges)
│   ├── domain/                   # fonctions pures : échéancier, répartition, statuts, argent, ids
│   ├── api-client/               # client typé généré
│   ├── db/                       # schéma Drizzle, migrations SQL, politiques RLS, seeds
│   ├── pdf-templates/            # gabarits HTML des PDF
│   └── config/                   # ESLint, TS, Prettier (back et paquets)
├── infra/
│   ├── compose/                  # local.yml, staging.yml, production.yml
│   ├── grafana/                  # tableaux de bord, alertes
│   └── scripts/                  # sauvegarde, restauration, rotation
├── tools/
│   └── check-docs.mjs            # cohérence de docs/specs et docs/lots
├── design/                       # maquette validée (lecture seule) : captures, HTML, CSS du DS, INVENTAIRE, données
├── prompts/                      # lots front 00–09 (terminés)
└── docs/                         # ce dossier
```

## Conventions
- TypeScript strict partout, `noUncheckedIndexedAccess` (back et paquets ; le front garde sa config Nuxt stricte).
- Back et paquets : fichiers en `kebab-case`, classes en `PascalCase`, tables et colonnes en `snake_case` (anglais), interface en français. Le front garde ses conventions (composants `PascalCase`, noms métier en français).
- Un cas d'usage par fichier : `<verbe>-<objet>.use-case.ts`, exporte une classe avec `execute(input, ctx)`.
- Pas d'`any`, pas de `number` pour l'argent hors `Money` (bigint côté base, `number` entier sûr côté JSON jusqu'à 2^53).
- Commits : Conventional Commits, portée = module ou paquet (`feat(ledger): …`).
- Une branche par lot : `lot/2.4-registre`.
