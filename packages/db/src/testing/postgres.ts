import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedNetwork } from 'testcontainers';

/** Mots de passe de développement posés par ROLES_SCRIPT. */
export const ROLE_PASSWORDS = {
  cotiz_migrator: 'cotiz-migrator-local',
  cotiz_app: 'cotiz-app-local',
  cotiz_platform: 'cotiz-platform-local',
  cotiz_readonly: 'cotiz-readonly-local',
} as const;

/** Script des rôles, le même qu'en local (infra/compose/postgres-init). */
export const ROLES_SCRIPT = fileURLToPath(
  new URL('../../../../infra/compose/postgres-init/01-roles.sql', import.meta.url),
);

export type CotizRole = keyof typeof ROLE_PASSWORDS;

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  /** Superutilisateur du conteneur : préparation des tests uniquement. */
  superuserUrl: string;
  urlFor(role: CotizRole, database?: string): string;
}

/**
 * PostgreSQL 16 (même image que infra/compose/local.yml), rôles Cotiz créés sauf `withRoles: false`.
 * Avec `network`, le conteneur y est joignable sous le nom `postgres` (ex. depuis un conteneur PgBouncer).
 */
export async function startTestDatabase(
  options: { withRoles?: boolean; network?: StartedNetwork; maxConnections?: number } = {},
): Promise<TestDatabase> {
  // Base jetable : durabilité coupée et caches réduits (plusieurs conteneurs tournent en parallèle).
  let builder = new PostgreSqlContainer('postgres:16-alpine').withCommand([
    'postgres',
    '-c',
    'fsync=off',
    '-c',
    'synchronous_commit=off',
    '-c',
    'full_page_writes=off',
    '-c',
    'shared_buffers=16MB',
    '-c',
    'max_wal_size=128MB',
    // Serveur partagé par tous les fichiers de test (backend/test/support/global-setup.ts) : une base par fichier.
    ...(options.maxConnections ? ['-c', `max_connections=${String(options.maxConnections)}`] : []),
  ]);
  if (options.network) builder = builder.withNetwork(options.network).withNetworkAliases('postgres');
  if (options.withRoles ?? true) {
    builder = builder.withCopyFilesToContainer([
      { source: ROLES_SCRIPT, target: '/docker-entrypoint-initdb.d/01-roles.sql' },
    ]);
  }
  const container = await builder.start();
  return {
    container,
    superuserUrl: container.getConnectionUri(),
    urlFor(role, database = container.getDatabase()) {
      const url = new URL(container.getConnectionUri());
      url.username = role;
      url.password = ROLE_PASSWORDS[role];
      url.pathname = `/${database}`;
      return url.toString();
    },
  };
}
