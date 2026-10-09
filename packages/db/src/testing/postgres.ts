import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** Script des rôles, le même qu'en local (infra/compose/postgres-init). */
export const ROLES_SCRIPT = fileURLToPath(
  new URL('../../../../infra/compose/postgres-init/01-roles.sql', import.meta.url),
);

/** Mots de passe de développement posés par ROLES_SCRIPT. */
const PASSWORDS = {
  cotiz_migrator: 'cotiz-migrator-local',
  cotiz_app: 'cotiz-app-local',
  cotiz_platform: 'cotiz-platform-local',
  cotiz_readonly: 'cotiz-readonly-local',
} as const;

export type CotizRole = keyof typeof PASSWORDS;

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  /** Superutilisateur du conteneur : préparation des tests uniquement. */
  superuserUrl: string;
  urlFor(role: CotizRole, database?: string): string;
}

/** PostgreSQL 16 (même image que infra/compose/local.yml), rôles Cotiz créés sauf `withRoles: false`. */
export async function startTestDatabase(options: { withRoles?: boolean } = {}): Promise<TestDatabase> {
  let builder = new PostgreSqlContainer('postgres:16-alpine');
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
      url.password = PASSWORDS[role];
      url.pathname = `/${database}`;
      return url.toString();
    },
  };
}
