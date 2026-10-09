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
