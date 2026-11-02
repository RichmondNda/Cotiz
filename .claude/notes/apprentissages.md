# Apprentissages

Format : **date** · contexte — apprentissage. *Source.*

## Branches et état d'avancement

- **2026-11-02** · exploration initiale — Le travail back se fait sur la branche d'intégration `backend`, pas sur `main`.
  `main` (521a541, PR #8) n'a que le front V0 et la doc ; `origin/backend` a 176 commits de plus (0c15832, PR #25, lot 2.4).
  Chaque lot part de `origin/backend` dans `lot/<id>-<slug>` et sa PR est fusionnée dans `backend` ; `backend` ne va dans `main`
  que sur demande. *`git rev-list --count main..origin/backend`, `CLAUDE.md` (branche `backend`, « Méthode de travail »).*
- **2026-11-02** (mis à jour le même jour) · `/fin-lot 2.4` — Lots 0.1 à 2.4 `terminé` dans `docs/progress.md` ; 2.4 clôturé
  avec deux points à confirmer (CI de la PR #25, revue humaine de la transaction de validation). Prochain lot : 2.5.
  Les clôtures précédentes sont des commits `docs(progress): …` ou `docs(lot-x.y): clôture du lot`, qui touchent `docs/progress.md`
  et un `CLAUDE.md` de paquet. *`git log --grep=progress origin/backend`.*
- **2026-11-02** · exploration initiale — Modules back présents : access, billing, docs, files, identity, ledger, members,
  onboarding, projects, reporting, system, tenancy. *`git ls-tree origin/backend backend/src/modules/`.*

## Outillage (branche `backend`)

- **2026-11-02** · exploration initiale — Monorepo pnpm (`packageManager: pnpm@10.10.0`, Node ≥ 22, `.nvmrc` = 22) + Turborepo.
  Workspace : `frontend`, `backend`, `packages/*`. pnpm 10 bloque les scripts d'installation sauf `esbuild` et `unrs-resolver`.
  *`package.json`, `pnpm-workspace.yaml`, `.nvmrc`.*
- **2026-11-02** · exploration initiale — `pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test && pnpm check:docs`.
  `lint` = `turbo run lint` + `eslint tools *.mjs` + `prettier --check .`. Autres scripts : `db:migrate`,
  `db:seed:demo` (`COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev`), `format`. *`package.json`.*
- **2026-11-02** · exploration initiale — Prettier ignore `frontend/`, `design/`, `docs/`, `prompts/`, `.claude/`, `.github/` et tous les
  `*.md` : modifier des notes ou un `CLAUDE.md` ne fait pas échouer `prettier --check`. *`.prettierignore`.*
- **2026-11-02** · exploration initiale — Hooks git (husky) : `pre-commit` = `pnpm exec lint-staged` (prettier + eslint
  `--max-warnings=0` sur `backend|packages|tools`), `commit-msg` = commitlint `@commitlint/config-conventional`.
  Ils ne sont actifs qu'après `pnpm install` (script `prepare: husky`). *`.husky/`, `commitlint.config.mjs`, `package.json`.*
- **2026-11-02** · exploration initiale — Tests back : `turbo test` laisse passer `CI`, `COTIZ_TEST_WORKERS`, `DOCKER_*`,
  `TESTCONTAINERS_*` (tests d'intégration sur PostgreSQL réelle via Testcontainers). *`turbo.json`, `backend/CLAUDE.md`.*
- **2026-11-02** · exploration initiale — Services locaux : `docker compose -f infra/compose/local.yml up -d` (dossiers `minio-init`,
  `postgres-init` à côté). *`git ls-tree origin/backend infra/compose/`.*
- **2026-11-02** · exploration initiale — `AGENTS.md` (racine) contient un bloc géré par Turborepo, réécrit par `turbo` quand un agent
  est détecté : le garder commité tel quel. *`AGENTS.md`.*

## Environnement de cette machine

- **2026-11-02** (mis à jour le même jour) · installation — Node v22.23.4. pnpm 10.10.0 activé sans sudo par
  `corepack enable --install-directory ~/.local/bin` ; dans une commande Bash, faire `export PATH=$HOME/.local/bin:$PATH` avant `pnpm`.
  `pnpm install --frozen-lockfile` : ~25 s, hooks husky installés, `nuxt prepare` lancé ; scripts d'installation ignorés
  (@swc/core, cpu-features, msgpackr-extract, protobufjs, ssh2, vue-demi) conformément à `onlyBuiltDependencies`. *Commandes de la session.*
- **2026-11-02** · `pnpm verify` sans Docker — L'utilisateur `dev` n'est pas dans le groupe `docker` (socket `root:docker` 660) et sudo
  demande un mot de passe. Testcontainers échoue (« Could not find a working container runtime strategy ») : `@cotiz/db` (4 fichiers)
  et `backend` (70 fichiers sur 121) échouent, les autres `TypeError … reading 'stop'/'close'` viennent des `afterAll` sur des fixtures
  jamais démarrées. Sans Docker, passent : lint, typecheck, `check:docs` (112 endpoints, 158 opérations, 60 écrans, 34 lots),
  domain 261, contracts 580, api-client 12, frontend 200, backend 583 tests sans base. `pnpm verify` s'arrête au premier paquet en
  échec : `pnpm turbo run test --continue` pour tout voir. *`id -nG`, `ls -l /var/run/docker.sock`, `pnpm verify`.*
- **2026-11-02** · CI GitHub — `gh` n'est pas installé et le dépôt `RichmondNda/Cotiz` est privé (API publique : « Not Found ») :
  impossible de lire l'état de la CI sans `gh auth login`. *`curl api.github.com/…/check-runs`.*

## Garde-fous Claude Code du dépôt

- **2026-11-02** · exploration initiale — `.claude/settings.json` : lecture des `.env*` refusée, `git push --force` et
  `git reset --hard` refusés ; `pnpm`, `docker compose`, `git add/commit/switch/diff/log/branch/status` autorisés.
  *`.claude/settings.json`.*
- **2026-11-02** · exploration initiale — Hook `protect-files.mjs` (avant écriture) bloque : écriture dans un `.env`, dans `design/`,
  modification d'une migration `packages/db/migrations/*.sql` déjà commitée, ajout d'un SDK de fournisseur externe
  (twilio, stripe, nodemailer…) dans un `package.json` (liste `ALLOWED` à compléter au groupe 6). Hook `format-and-lint.mjs`
  (après écriture) : prettier + eslint sur `backend|packages|tools`, inactif sans `node_modules/.bin/eslint`.
  *`.claude/hooks/`.*
- **2026-11-02** · exploration initiale — Commandes projet : `/statut`, `/lot`, `/etape`, `/verify`, `/bascule`, `/fin-lot`, `/adr`,
  `/verifier-ecran`, `/lot-front`, `/revue-lot` ; sous-agents `isolation-reviewer`, `money-reviewer`, `contract-guardian`,
  `test-skeptic`. *`.claude/commands/`, `.claude/agents/`.*
- **2026-11-02** · exploration initiale — Un garde-fou d'un plugin de l'utilisateur (« GateGuard », hors dépôt) exige, avant le premier
  Bash d'une session et avant la création de chaque fichier, d'énoncer la demande, l'effet du fichier et une recherche préalable
  (Grep/Glob ou grep/find ; `git show` ne compte pas). *Messages d'erreur du hook dans la session.*

## Front (V0)

- **2026-11-02** · exploration initiale — CI front (`.github/workflows/ci.yml` sur `main`) : depuis `frontend/`, `npm ci`, lint,
  typecheck, `vitest run`, build, puis parcours e2e Playwright (`npm run e2e`, `coherence`, `a11y`) contre `npm run dev`
  (port 3000). Tests unitaires : `frontend/tests/unit/**/*.test.ts`. *`.github/workflows/ci.yml`, `frontend/vitest.config.ts`.*
- **2026-11-02** · exploration initiale — Pas de `README.md` à la racine ; `frontend/README.md` est le gabarit Nuxt complété d'une
  section « Vérifications de la V0 ». Le point d'entrée de la doc est `docs/README.md`. *`ls`, `frontend/README.md`.*
