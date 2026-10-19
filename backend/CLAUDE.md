# backend/ — NestJS (api + worker)

Vide jusqu'au lot 0.1. Plan : `docs/lots/`, avancement : `docs/progress.md`, architecture : `docs/architecture/`.

- Deux points d'entrée : `src/main.ts` (HTTP, port 4000, préfixe `/api/v1`) et `src/worker.ts` (relais outbox, files BullMQ,
  tâches planifiées). Même image Docker. Configuration validée au démarrage par Zod (`src/config.ts`).
- Le contrat : `docs/specs/endpoints.yaml` → `@cotiz/contracts`. Les chemins, permissions, erreurs et drapeaux
  (`idempotencyKey`, `ifMatch`) viennent de là.
- Un module = `src/modules/<module>/` avec `http/`, `application/`, `domain/`, `infra/`, `events/` et `<module>.public.ts`
  (seule surface importable par les autres modules). Voir `docs/architecture/01-modules.md`.
- Un cas d'usage par fichier `<verbe>-<objet>.use-case.ts`, méthode `execute(input, ctx)`, **une transaction** obtenue de
  `shared/tenant-context`. Jamais d'accès base hors de cette transaction.
- Contrôleurs : valident avec le schéma de `@cotiz/contracts` (pipe Zod), déclarent `@Can('<permission>')` exactement comme
  `docs/specs/endpoints.yaml`, n'ont aucune logique métier.
- Calculs d'argent, d'échéancier, de répartition et de statut : uniquement via `@cotiz/domain`.
- Erreurs métier : `throw new DomainProblem('<code>', details)` ; le code doit exister dans `docs/specs/errors.yaml`
  (réponse `Problem` RFC 9457, voir `docs/architecture/06-api-conventions.md`).
- Effets de bord : `outbox.publish(tx, { type, payload })` dans la transaction ; types listés dans `docs/specs/events.yaml`.
- Actions sensibles : `@Audited('<action>')`.
- Tests : `test/integration` (Testcontainers, vraie PostgreSQL), `test/isolation` (obligatoire pour tout endpoint tenant ou `/me`),
  unitaires à côté du code.
- Isolation : partir de `test/isolation/harness.ts` (`asManagerOf`, `asSubscriber`, `asRollback`) ; chaque politique testée l'est aussi
  affaiblie (`withPolicy`, `withoutPolicy`) pour prouver que le test échoue.
- Un endpoint terminé est basculé côté front (`/bascule <id>`) : le front l'appelle via le proxy Nitro, même origine.
- Scripts d'exploitation dans `src/cli.ts` (`pnpm --filter backend cli <commande>`).
- Chaque route déclare `@Endpoint('<id>', '<opération>')` : drapeaux du contrat (débit, `Idempotency-Key`, `If-Match`) ; `test/integration/routes.test.ts` vérifie méthode et chemin.
- Attendre un effet du worker : renvoyer `afterCommit(run)` ; ne jamais garder `currentTx()` dans une fermeture (refusée après la fin du contexte).
- Journaux : jamais le message d'une erreur SQL (Drizzle y met requête et paramètres) ; analyse : faux clamd dans les tests, vrai via `pnpm --filter backend test:clamav`.
- Journaux : `new Logger(Classe.name)` de Nest (branché sur pino, `shared/logging`) ; requestId, traceId, association et utilisateur pseudonymisé sont ajoutés seuls. Journaliser un objet (`{ msg, … }`) plutôt que concaténer ; dans le worker, `runWithLogContext` autour d'un job.
- Métriques : registre du processus injecté par `METRICS_REGISTRY` (`shared/metrics`), noms dans `metric-names.ts` (préfixe `cotiz_`), jamais de valeur d'URL ni d'identifiant en étiquette ; servies sur le port interne (`API_METRICS_PORT`, `WORKER_METRICS_PORT`). Tableau : `infra/grafana/`.
- Traces et erreurs : traçage préchargé (`--import ./src/telemetry.ts` en dev, `./dist/telemetry.js` en prod) ; un job BullMQ se traite dans `traceJob`, un producteur joint `withTraceContext(data)` ; erreur à signaler : `ErrorReporter.capture` (GlitchTip, inactif sans `GLITCHTIP_DSN`), jamais `Sentry` directement. Démonstration : `GET /api/v1/__debug/error` (développement).
- Sous vitest, les bibliothèques chargées par `import` (pg, ioredis) échappent au hook OpenTelemetry : tester leurs spans dans un vrai processus (`test/integration/tracing-process.test.ts`). Sentry 11 collecte tout par défaut : `dataCollection` (pas `sendDefaultPii`).
- Erreur métier dont l'écriture doit survivre (essai compté, verrou, révocation) : `return afterCommit(() => Promise.reject(new DomainProblem(…)))`, jamais `throw` dans la transaction. Aucune fuite d'existence : même coût argon2 (haché leurre) et mêmes réponses pour un identifiant inconnu (compteurs Redis, décision 22).
- Gardes globales (ContractSpace → Jwt → Space → Membership → Permission) : chaque route déclare `@Endpoint` et `@Can` égal au contrat (sinon 500) ; route de test hors contrat ou en espace association avant le lot 1.2 : `AppModule.register(config, { guards: [TestAuthGuard] })`.

