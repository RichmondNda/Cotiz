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
- Caches invalidés par un événement (`pub.plans`) : l'invalidation passe par l'outbox et le worker, donc avec un léger délai ; un test ou une démonstration attend le consommateur (ou l'appelle comme `plans.test.ts`), jamais une lecture juste après l'écriture. Une décision qui protège une limite (quotas) ne lit jamais un cache : base, sous verrou (lot 1.4).
- Sous WSL, 429 sur `auth.*`, « Port N not bound » ou `ECONNREFUSED` en série pendant `pnpm verify` : relais de ports de Docker Desktop (le conteneur répond à `docker exec`, pas le port publié) ; redémarrer Docker, la CI fait foi.
- Cas d'usage `@Audited` (dont les `seed-dev` idempotents) : appeler `recordAudit` à chaque exécution, même sans écriture, sinon l'intercepteur d'audit échoue ; refaire passer un seed ne doit rien modifier d'existant.
- `seed-dev` de lignes d'une association sans politique plateforme (projets…) : un `withTenantContext({ space: 'association', associationId })` par association (l'espace system est réservé au worker) ; ne relier que les lignes de référence encore présentes et actives (une base de dev a pu les remplacer).
- Vues matérialisées (statistiques plateforme, module reporting) : sans RLS, donc lues par cotiz_platform seulement (`REVOKE` à cotiz_app) ; propriétaire cotiz_migrator, rafraîchies par une fonction `SECURITY DEFINER` appelée en espace system (PostgreSQL 16 : seul le propriétaire rafraîchit), dont les requêtes passent par les politiques `system_*` des tables lues.
- Registre (lot 2.4) : toute écriture sur un paiement prend les verrous dans l'ordre paiement → projet → échéances triées par id (`ledger/application/payment-review.ts`) ; une nouvelle tâche ou un cas d'usage qui touche aux échéances garde cet ordre, sinon interblocage avec `lg.pay.*`.
- Consommateur qui lit en contexte association puis écrit en espace system (notifications) : `ownTransactions: true` sur l'`EventConsumer`, il ouvre lui-même ses contextes (non imbriquables) ; invalider un cache après sa transaction, jamais dedans.
- Cache Redis à expiration par périmètre (compteur de non-lus) : une clé par périmètre + un ensemble des clés de la personne pour l'invalidation ; `EXPIRE` sur un hash repousse l'expiration de tous ses champs.
- Nouvelle tâche planifiée (`ScheduledTasks.define`) : l'ajouter à la liste attendue de `test/integration/housekeeping.test.ts`.
- Lecture de masse (rapport, tableau de bord : 50 000 échéances) : PostgreSQL ne coûte que ≈ 0,1 s, le temps est dans le décodage pg/Drizzle et le calcul en mémoire ; `.select()` des seules colonnes utiles, statuts calculés une seule fois (`computedStates`), mesurer avec `test/perf/reporting-50k.test.ts`.
- Jeu de données SQL avec paiements validés (tests, perf) : paiements et répartitions dans la même instruction (CTE `WITH p AS (INSERT …) INSERT …`), sinon `allocation_mismatch` au COMMIT (contrôle différé).
- Tâche quotidienne à heure locale (`managers.digest`, `installments.due-soon`) : passage horaire, marque Redis `jobs:<tâche>:<aid>:<jour>` (48 h) posée après le COMMIT pour le rattrapage, `dedupe_key` en secours.
- Mot de passe commun à tous les espaces : un code émis par une association ne vaut que pour un simple souscripteur (« rôle le plus élevé », lot 3.1) ; contrôle `holdsMembership(…, 'association', ['active','invited'])` + `platformRoleOf` à la demande, à l'émission et à `auth.reset`.
- Route `/me/…` en espace association : contexte sans `associationId` ; `recordAudit` sans `associationId` (hérite) et événement outbox `associationId: null`.
