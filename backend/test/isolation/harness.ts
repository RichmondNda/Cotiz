import { runMigrations } from '@cotiz/db/migrate';
import { enableTenantRls } from '@cotiz/db/rls';
import { loadSpecSchema, startTestDatabase } from '@cotiz/db/testing';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { currentTx, type TenantContext, TenantDatabase, type Tx } from '../../src/shared/tenant-context/index.js';
// Clé interne (FOR_REQUEST) : la transaction d'une requête HTTP, exactement comme TenantContextInterceptor.
import { FOR_REQUEST } from '../../src/shared/tenant-context/tenant-database.js';
import { createFileDatabase, type FileDatabase, sharedPostgres } from '../support/shared-postgres.js';

/**
 * Harnais d'isolation (architecture/02) : deux associations A et B, un accès aux données par le même chemin que l'api
 * (TenantDatabase, rôle cotiz_app, contexte posé en début de transaction) et de quoi affaiblir une politique le temps
 * d'un test, pour vérifier que la suite échoue alors.
 */

/** Utilisateurs de docs/specs/rls-smoke-test.sql, plus un gestionnaire pour B et une seconde souscriptrice de A. */
export const USERS = {
  awa: '00000000-0000-7000-8000-000000000001',
  moussa: '00000000-0000-7000-8000-000000000002',
  fatou: '00000000-0000-7000-8000-000000000003',
  koffi: '00000000-0000-7000-8000-000000000004',
  aminata: '00000000-0000-7000-8000-000000000005',
} as const;

export interface FixtureAssociation {
  id: string;
  managerId: string;
}

/** Entraide Yopougon : gérée par Awa ; Moussa et Aminata y sont souscripteurs. */
export const A: FixtureAssociation = { id: '00000000-0000-7000-8000-00000000a001', managerId: USERS.awa };

/** Ressortissants de Man : gérée par Koffi ; Fatou y est souscriptrice, Awa (gestionnaire de A) aussi. */
export const B: FixtureAssociation = { id: '00000000-0000-7000-8000-00000000a002', managerId: USERS.koffi };

/** Contexte d'un gestionnaire de l'association, tel que le posera MembershipGuard (lot 1.2). */
export function asManagerOf(association: FixtureAssociation): TenantContext {
  return { space: 'association', associationId: association.id, userId: association.managerId };
}

/** Contexte d'un souscripteur dans son espace (`/me`) : aucune association, seulement l'utilisateur. */
export function asSubscriber(userId: string): TenantContext {
  return { space: 'subscriber', userId };
}

export type { Tx };

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`identifiant invalide : ${JSON.stringify(name)}`);
  return name;
}

/** Erreur PostgreSQL d'origine, éventuellement enveloppée par Drizzle (`cause`). */
function pgError(error: unknown): (Error & { code: string; constraint?: string }) | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string') return e as Error & { code: string };
  }
  return undefined;
}

/** Code SQLSTATE. 42501 couvre aussi un droit absent : vérifier en plus le message (isRlsViolation). */
export function pgCode(error: unknown): string | undefined {
  return pgError(error)?.code;
}

/** Message de l'erreur PostgreSQL d'origine (RAISE EXCEPTION…). */
export function pgMessage(error: unknown): string | undefined {
  return pgError(error)?.message;
}

/** Contrainte en cause (CHECK, clé…). */
export function pgConstraint(error: unknown): string | undefined {
  return pgError(error)?.constraint;
}

/** Refus par une politique RLS (WITH CHECK), et non par un droit absent (« permission denied for table »). */
export function isRlsViolation(error: unknown): boolean {
  return pgCode(error) === '42501' && (pgMessage(error) ?? '').includes('row-level security policy');
}

/** Résultat ou erreur d'une promesse, sans lever : `null` si elle a réussi. */
export function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}

class RollbackSignal extends Error {}

/** Expressions de remplacement d'une politique (même nom, même commande, mêmes rôles). */
export interface PolicyReplacement {
  using: string | null;
  withCheck: string | null;
}

export class IsolationHarness {
  /** Pool cotiz_app en accès direct, comme l'api derrière PgBouncer. */
  readonly tenantDb: TenantDatabase;
  /**
   * Connexions de préparation (superutilisateur, cotiz_migrator) gardées ouvertes : en ouvrir une par requête coûte
   * ≈ 40 ms (authentification), contre ≈ 3 ms réutilisée.
   */
  private readonly setupPools = new Map<string, pg.Pool>();

  constructor(readonly db: FileDatabase) {
    this.tenantDb = new TenantDatabase({ connectionString: db.urlFor('cotiz_app'), max: 4 });
  }

  /**
   * Requête sur une connexion réutilisée. Après une erreur, la connexion est détruite : un texte à plusieurs
   * instructions (`BEGIN; …; COMMIT;`) qui échoue la laisserait dans une transaction interrompue.
   */
  private async setupQuery(url: string, text: string, values?: unknown[]): Promise<pg.QueryResult> {
    let pool = this.setupPools.get(url);
    if (!pool) {
      pool = new pg.Pool({ connectionString: url, max: 4, allowExitOnIdle: true });
      // Connexion inactive coupée (arrêt du conteneur) : sans écouteur, l'erreur ferait tomber le processus.
      pool.on('error', () => undefined);
      this.setupPools.set(url, pool);
    }
    const client = await pool.connect();
    try {
      const result = await client.query(text, values);
      client.release();
      return result;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }

  /** Transaction en cotiz_app dans le contexte donné, celle d'une requête HTTP ; validée si `fn` réussit. */
  as<T>(context: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.tenantDb[FOR_REQUEST](context, () => fn(currentTx()));
  }

  /** Comme `as()`, mais toujours annulée : un essai d'écriture, réussi ou non, ne laisse aucune trace. */
  async asRollback<T>(context: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const holder: { value?: T } = {};
    try {
      await this.as(context, async (tx) => {
        holder.value = await fn(tx);
        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
    return holder.value as T;
  }

  /** Transaction en cotiz_app sans contexte : celle d'une requête HTTP qu'aucune garde n'a identifiée. */
  withoutContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.tenantDb[FOR_REQUEST](null, () => fn(currentTx()));
  }

  /** Nombre de lignes visibles de la table, dans le contexte donné (`null` : sans contexte). */
  count(context: TenantContext | null, table: string): Promise<number> {
    const read = async (tx: Tx) => {
      const res = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`);
      return res.rows[0]?.n ?? 0;
    };
    return context ? this.as(context, read) : this.withoutContext(read);
  }

  /**
   * Nombre de lignes visibles en cotiz_app sur une connexion brute, variables app.* jamais posées (psql, outil
   * d'exploitation) : les fonctions app_*() doivent alors valoir NULL et `none`.
   */
  countWithoutTenantDatabase(table: string): Promise<number> {
    return withClient(this.db.urlFor('cotiz_app'), async (client) => {
      const res = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${identifier(table)}`);
      return res.rows[0]?.n ?? 0;
    });
  }

  /** Préparation des données, hors RLS (superutilisateur du conteneur). Jamais dans une assertion d'isolation. */
  superuser(text: string, values?: unknown[]): Promise<pg.QueryResult> {
    return this.setupQuery(this.db.superuserUrl, text, values);
  }

  /** DDL en propriétaire des tables (cotiz_migrator), comme une migration. */
  migrator(text: string, values?: unknown[]): Promise<pg.QueryResult> {
    return this.setupQuery(this.db.urlFor('cotiz_migrator'), text, values);
  }

  /** Transaction superutilisateur toujours annulée : invariants (contraintes, déclencheurs) sans trace. */
  async superuserRollback<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    return withClient(this.db.superuserUrl, async (client) => {
      await client.query('BEGIN');
      try {
        return await fn(client);
      } finally {
        await client.query('ROLLBACK');
      }
    });
  }

  /** Retire la politique le temps de `fn`. */
  withoutPolicy<T>(table: string, policy: string, fn: () => Promise<T>): Promise<T> {
    return this.withPolicy(table, policy, null, fn);
  }

  /**
   * Remplace la politique (`null` : la retire) le temps de `fn`, puis la recrée telle que lue dans pg_policies.
   * Vérifie ensuite que les politiques et la RLS de la table sont exactement celles d'avant.
   */
  async withPolicy<T>(
    table: string,
    policy: string,
    replacement: PolicyReplacement | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    const { rows } = await this.migrator(
      `SELECT permissive, cmd, roles::text[] AS roles, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2`,
      [table, policy],
    );
    const def = rows[0] as
      { permissive: string; cmd: string; roles: string[]; qual: string | null; with_check: string | null } | undefined;
    if (!def) throw new Error(`politique ${policy} absente de ${table}`);
    const on = `${identifier(policy)} ON ${identifier(table)}`;
    const create = (using: string | null, withCheck: string | null) =>
      [
        `CREATE POLICY ${on} AS ${def.permissive} FOR ${def.cmd} TO ${def.roles.map(identifier).join(', ')}`,
        using === null ? '' : `USING (${using})`,
        withCheck === null ? '' : `WITH CHECK (${withCheck})`,
      ].join(' ');
    return this.mutate(
      table,
      async () => {
        await this.migrator(`DROP POLICY ${on}`);
        if (replacement) await this.migrator(create(replacement.using, replacement.withCheck));
      },
      async () => {
        await this.migrator(`DROP POLICY IF EXISTS ${on}; ${create(def.qual, def.with_check)}`);
      },
      fn,
    );
  }

  /** Désactive la RLS de la table le temps de `fn` (cotiz_app y voit alors tout ce que ses droits permettent). */
  withRlsDisabled<T>(table: string, fn: () => Promise<T>): Promise<T> {
    const alter = (action: string) => () =>
      this.migrator(`ALTER TABLE ${identifier(table)} ${action} ROW LEVEL SECURITY`);
    return this.mutate(table, alter('DISABLE'), alter('ENABLE'), fn);
  }

  /** Politiques et drapeaux RLS de la table, pour vérifier une restauration. */
  async securityOf(table: string): Promise<unknown> {
    const { rows } = await this.migrator(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              coalesce((SELECT json_agg(p ORDER BY p.policyname) FROM pg_policies p
                         WHERE p.schemaname = 'public' AND p.tablename = c.relname), '[]') AS policies
         FROM pg_class c WHERE c.oid = to_regclass($1)`,
      [`public.${identifier(table)}`],
    );
    return rows[0];
  }

  private async mutate<T>(
    table: string,
    apply: () => Promise<unknown>,
    restore: () => Promise<unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const before = JSON.stringify(await this.securityOf(table));
    await apply();
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await fn() };
    } catch (error) {
      outcome = { ok: false, error };
    }
    await restore();
    if (JSON.stringify(await this.securityOf(table)) !== before) {
      throw new Error(`${table} : politiques ou RLS non rétablies à l'identique`);
    }
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  async stop(): Promise<void> {
    await this.tenantDb.onModuleDestroy();
    await Promise.all([...this.setupPools.values()].map((pool) => pool.end()));
    this.setupPools.clear();
    await this.db.dispose();
  }
}

/**
 * Base de test pour le harnais :
 * - `migrated` : migrations du dépôt (les tables tenant de test se créent avec createTenantTable) ;
 * - `spec` : docs/specs/schema.sql, tant que les migrations ne créent pas les tables du test de fumée (lots 0.5–2.4).
 */
export async function startIsolationHarness(schema: 'migrated' | 'spec'): Promise<IsolationHarness> {
  const db = await harnessDatabase(schema);
  const harness = new IsolationHarness(db);
  if (schema === 'migrated') await seedUsers(harness);
  return harness;
}

/**
 * Base du harnais : copie de la base modèle sur le PostgreSQL partagé de l'exécution (`test/support/global-setup.ts`),
 * sinon conteneur dédié (COTIZ_TEST_SHARED_PG=0, Docker absent au démarrage) migré ici.
 */
async function harnessDatabase(schema: 'migrated' | 'spec'): Promise<FileDatabase> {
  const shared = sharedPostgres();
  if (shared) {
    const db = await createFileDatabase(shared, schema === 'migrated');
    if (schema === 'spec') await loadSpecSchema(db.urlFor('cotiz_migrator'));
    return db;
  }
  const db = await startTestDatabase();
  const migratorUrl = db.urlFor('cotiz_migrator');
  await (schema === 'migrated' ? runMigrations(migratorUrl) : loadSpecSchema(migratorUrl));
  return {
    superuserUrl: db.superuserUrl,
    urlFor: (role, database) => db.urlFor(role, database),
    dispose: async () => {
      await db.container.stop();
    },
  };
}

/** Personnes de USERS (clés étrangères vers users, lot 1.1), actives. Le schéma `spec` a ses propres données. */
async function seedUsers(harness: IsolationHarness): Promise<void> {
  const people = Object.entries(USERS);
  await harness.superuser(
    `INSERT INTO users (id, email, first_name, last_name, status)
     SELECT id, key || '@test.cotiz.app', initcap(key), 'Test', 'active'
       FROM unnest($1::uuid[], $2::text[]) AS p(id, key)`,
    [people.map(([, id]) => id), people.map(([key]) => key)],
  );
}

/**
 * Associations A et B (clés étrangères vers associations, lot 1.2), sans appartenances : chaque test pose celles dont
 * il a besoin. Base migrée seulement.
 */
export async function seedAssociations(harness: IsolationHarness): Promise<void> {
  await harness.superuser(
    `INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone, status) VALUES
       ($1, 'entraide-yopougon', 'Entraide Yopougon', 'entraide', 'Abidjan', 'CI', 'contact@ey.ci', '+2250700000000',
        'active'),
       ($2, 'ressortissants-man', 'Ressortissants de Man', 'ressortissants', 'Abidjan', 'CI', 'contact@man.ci',
        '+2250700000001', 'active')`,
    [A.id, B.id],
  );
}

/**
 * Table d'association de test, créée comme une migration : enableTenantRls() puis la politique souscripteur de
 * docs/specs/schema.sql (lecture de ses propres lignes, dans l'espace subscriber seulement).
 */
export async function createTenantTable(harness: IsolationHarness, table: string): Promise<void> {
  const name = identifier(table);
  await harness.migrator(`
    CREATE TABLE ${name} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      association_id uuid NOT NULL,
      user_id uuid,
      label text NOT NULL
    );
    ${enableTenantRls(name)}
    CREATE POLICY subscriber_self_read ON ${name} FOR SELECT
      USING (user_id = app_user_id() AND app_space() = 'subscriber');`);
}

/**
 * Lignes de chaque association : une ligne de gestion (sans souscripteur) et une par souscripteur. Deux souscripteurs
 * dans A ; Awa, gestionnaire de A, est souscriptrice de B.
 */
export const SEEDED_LABELS = {
  A: ['a-aminata', 'a-gestion', 'a-moussa'],
  B: ['b-awa', 'b-fatou', 'b-gestion'],
  moussa: ['a-moussa'],
  fatou: ['b-fatou'],
  awa: ['b-awa'],
} as const;

export async function seedTwoAssociations(harness: IsolationHarness, table: string): Promise<void> {
  await harness.superuser(
    `INSERT INTO ${identifier(table)} (association_id, user_id, label) VALUES
       ($1, NULL, 'a-gestion'), ($1, $2, 'a-moussa'), ($1, $3, 'a-aminata'),
       ($4, NULL, 'b-gestion'), ($4, $5, 'b-fatou'), ($4, $6, 'b-awa')`,
    [A.id, USERS.moussa, USERS.aminata, B.id, USERS.fatou, USERS.awa],
  );
}

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
