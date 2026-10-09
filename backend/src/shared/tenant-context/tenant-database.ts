import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** Espaces de `app.space` (architecture/02). Sans contexte, la base voit l'espace `none`. */
export const SPACES = ['platform', 'association', 'subscriber', 'auth', 'public', 'system'] as const;
export type Space = (typeof SPACES)[number];

/** Contexte posé en début de transaction ; lu par les politiques RLS via app_*(). */
export interface TenantContext {
  space: Space;
  associationId?: string | undefined;
  userId?: string | undefined;
}

/** Transaction Drizzle du contexte courant : seul accès à la base des cas d'usage. */
export type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Store {
  tx: Tx;
  context: TenantContext | null;
  /** Posé à la fin de `run()` : une continuation détachée ne doit jamais réutiliser une connexion rendue au pool. */
  closed: boolean;
}

const storage = new AsyncLocalStorage<Store>();

/** Transaction du contexte en cours (requête HTTP ou tâche du worker). */
export function currentTx(): Tx {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      'currentTx() appelé hors contexte tenant : passer par TenantContextInterceptor ou withTenantContext()',
    );
  }
  if (store.closed) throw new Error('currentTx() appelé après la fin de la transaction de contexte');
  return store.tx;
}

function assertValid(context: TenantContext | null): void {
  if (!context) return;
  if (!(SPACES as readonly string[]).includes(context.space)) throw new Error('contexte tenant : space invalide');
  if (context.associationId !== undefined && !UUID.test(context.associationId)) {
    throw new Error('contexte tenant : associationId n’est pas un UUID');
  }
  if (context.userId !== undefined && !UUID.test(context.userId)) {
    throw new Error('contexte tenant : userId n’est pas un UUID');
  }
  // Cohérence espace / identifiants : tenant_isolation ne regarde pas app_space(), un associationId posé hors de
  // l'espace association (ou d'une tâche system) ouvrirait toutes les lignes de l'association.
  if (context.space === 'association' && context.associationId === undefined) {
    throw new Error('contexte tenant : associationId requis en espace association');
  }
  if (context.space === 'subscriber' && context.userId === undefined) {
    throw new Error('contexte tenant : userId requis en espace subscriber');
  }
  if (context.associationId !== undefined && context.space !== 'association' && context.space !== 'system') {
    throw new Error(`contexte tenant : associationId interdit en espace ${context.space}`);
  }
}

/**
 * Seul détenteur du pool PostgreSQL (règle dependency-cruiser). Chaque accès aux données passe par `run()` :
 * une transaction qui commence par poser le contexte, rendue disponible par `currentTx()`.
 */
export class TenantDatabase implements OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly db: NodePgDatabase;

  constructor(connectionString: string, max: number) {
    this.pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis: 5_000 });
    // Une connexion inactive qui tombe ne doit pas arrêter le processus. Jamais l'URL dans le journal.
    this.pool.on('error', (error) => {
      Logger.warn(`connexion PostgreSQL perdue : ${error.message}`, 'TenantDatabase');
    });
    this.db = drizzle({ client: this.pool });
  }

  async run<T>(context: TenantContext | null, fn: () => Promise<T>): Promise<T> {
    if (storage.getStore()) throw new Error('contexte tenant imbriqué : une requête ou une tâche = une transaction');
    assertValid(context);
    return this.db.transaction(async (tx) => {
      // Toujours les trois variables, '' si absentes, et seulement pour la transaction (is_local = true) :
      // PgBouncer en mode transaction ne réinitialise pas la session, un reste ne doit jamais être lu.
      await tx.execute(sql`SELECT
        set_config('app.association_id', ${context?.associationId ?? ''}, true),
        set_config('app.user_id', ${context?.userId ?? ''}, true),
        set_config('app.space', ${context?.space ?? ''}, true)`);
      const store: Store = { tx, context, closed: false };
      try {
        return await storage.run(store, fn);
      } finally {
        store.closed = true;
      }
    });
  }

  /** Sonde de disponibilité : aucune donnée lue. Seule requête hors transaction de contexte (architecture/02). */
  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
