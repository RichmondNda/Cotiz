// Frontières vérifiées en CI (`pnpm lint`) : architecture/01-modules.md et 02-tenancy-security.md.
// Les tests (test/, *.test.ts) n'y sont pas soumis : ils préparent la base directement.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'db-client-only-in-tenant-context',
      comment:
        'Seul src/shared/tenant-context ouvre des connexions PostgreSQL : tout accès aux données passe par sa transaction de contexte (SET LOCAL, RLS).',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/shared/tenant-context/', '\\.test\\.ts$'] },
      to: {
        path: [
          'node_modules/(pg|pg-pool|pg-native|postgres)/',
          'node_modules/drizzle-orm/(node-postgres|postgres-js)/',
          'packages/db/src/(migrate|testing)',
        ],
      },
    },
    {
      name: 'tenant-context-entry-points',
      comment:
        'Hors de shared/tenant-context, seuls index.ts, worker.ts et self.ts sont importables : FOR_REQUEST et WORKER_PROCESS restent internes.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/shared/tenant-context/' },
      to: { path: '^src/shared/tenant-context/', pathNot: '^src/shared/tenant-context/(index|worker|self)\\.ts$' },
    },
    {
      name: 'self-lookup-only-in-access',
      comment:
        'Lecture « de soi » (asSelf, LOOKUP_AS_SELF) : l’espace auth ouvre aussi codes et demandes de réinitialisation de toutes les associations ; seul src/modules/access/application/ y lit appartenances et rôles.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/modules/access/application/', '^src/shared/tenant-context/'] },
      to: { path: '^src/shared/tenant-context/self\\.ts$' },
    },
    {
      name: 'worker-tenant-context-only-in-worker',
      comment: 'L’espace system est réservé au processus worker : seul src/worker.module.ts importe ce point d’entrée.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/worker\\.module\\.ts$', '^src/shared/tenant-context/'] },
      to: { path: '^src/shared/tenant-context/worker\\.ts$' },
    },
    {
      name: 'outbox-worker-only-in-worker',
      comment:
        'Relais outbox, traitement de la file events et métriques de l’outbox : processus worker seulement (src/worker.module.ts).',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/worker\\.module\\.ts$', '^src/shared/outbox/'] },
      to: { path: '^src/shared/outbox/(worker|outbox-relay|outbox-metrics|events\\.processor)\\.ts$' },
    },
    {
      name: 'queue-metrics-only-in-worker',
      comment: 'Métriques des files BullMQ : processus worker seulement (src/worker.module.ts).',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/worker\\.module\\.ts$', '^src/shared/queues/'] },
      to: { path: '^src/shared/queues/queue-metrics\\.ts$' },
    },
    {
      name: 'no-test-code-in-src',
      comment: 'Le code livré n’importe jamais test/ (garde d’authentification de test, conteneurs).',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^test/' },
    },
    {
      name: 'no-unresolvable',
      comment: 'Un import non résolu échappe aux autres règles.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'module-public-surface-only',
      comment: 'Un module n’importe d’un autre module que son <module>.public.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '\\.public\\.ts$'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^\\.\\./packages/'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    // Paquets du workspace : `exports` pointe sur les sources .ts (condition development).
    enhancedResolveOptions: {
      conditionNames: ['development', 'import', 'node', 'default'],
      exportsFields: ['exports'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
