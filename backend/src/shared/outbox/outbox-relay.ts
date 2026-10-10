import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../config.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../queues/index.js';
import { currentTx, TenantDatabase } from '../tenant-context/index.js';

/** Événements relayés par passage (architecture/05). */
export const RELAY_BATCH = 100;

interface PendingRow extends Record<string, unknown> {
  id: string;
  association_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date | string;
}

/** Identifiant du job BullMQ d'un événement : un second relais du même événement est écarté tant que le job existe. */
export const eventJobId = (eventId: string) => `event-${eventId}`;

/** Littéral de tableau PostgreSQL d'identifiants bigserial (chiffres seulement, lus en base). */
const idArray = (ids: string[]) => `{${ids.join(',')}}`;

/**
 * Relais du worker (jobs.yaml : outbox.relay, chaque seconde) : en espace system, verrouille jusqu'à 100 événements
 * non publiés (`FOR UPDATE SKIP LOCKED` : plusieurs relais ne prennent jamais les mêmes), les pousse dans la file
 * `events`, puis pose `published_at` dans la même transaction. Un arrêt entre l'envoi et le COMMIT renverra
 * l'événement : écarté par le jobId, puis par la déduplication des consommateurs.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly queue: Queue;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;
  private stopped = false;

  constructor(
    private readonly db: TenantDatabase,
    @Inject(CONFIG) private readonly config: Config,
  ) {
    this.queue = new Queue(QUEUES.events.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.events.jobOptions,
    });
    this.queue.on('error', (error) => {
      this.logger.warn(`file events : ${error.message}`);
    });
  }

  /** Un passage du relais ; renvoie le nombre d'événements publiés. */
  async relayOnce(options: { timeoutMs?: number } = {}): Promise<number> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    let ids: string[] = [];
    try {
      return await this.db.withTenantContext({ space: 'system' }, async () => {
        const tx = currentTx();
        const { rows } = await tx.execute<PendingRow>(sql`
          SELECT id::text AS id, association_id, actor_user_id, event_type, event_version, aggregate_type,
                 aggregate_id, payload, occurred_at
            FROM outbox_events
           WHERE published_at IS NULL
           -- Les lignes déjà tentées passent derrière : une ligne invalide ne bloque jamais la file.
           -- outbox_events.id : la colonne bigint, pas l'alias texte (« 100 » avant « 95 »).
           ORDER BY attempts, outbox_events.id
           LIMIT ${RELAY_BATCH}
             FOR UPDATE SKIP LOCKED`);
        if (rows.length === 0) return 0;
        ids = rows.map((r) => r.id);
        const jobs = [];
        const invalid: string[] = [];
        for (const row of rows) {
          const parsed = EventEnvelope.safeParse({
            id: row.id,
            type: row.event_type,
            version: row.event_version,
            occurredAt: new Date(row.occurred_at).toISOString(),
            associationId: row.association_id,
            actorUserId: row.actor_user_id,
            aggregate: { type: row.aggregate_type, id: row.aggregate_id },
            payload: row.payload,
          });
          if (!parsed.success) {
            // Ni le payload ni les identifiants : le numéro et le type suffisent à retrouver la ligne.
            this.logger.error(`outbox : événement #${row.id} (${row.event_type}) invalide, non publié`);
            invalid.push(row.id);
            continue;
          }
          const envelope = parsed.data;
          jobs.push({ name: envelope.type, data: envelope, opts: { jobId: eventJobId(envelope.id) } });
        }
        if (jobs.length > 0) await withTimeout(this.queue.addBulk(jobs), timeoutMs, 'file events injoignable');
        const published = jobs.map((job) => job.data.id);
        await tx.execute(sql`
          UPDATE outbox_events
             SET published_at = CASE WHEN id = ANY(${idArray(published)}::bigint[]) THEN now() END,
                 attempts = attempts + 1
           WHERE id = ANY(${idArray(ids)}::bigint[])`);
        return jobs.length;
      });
    } catch (error) {
      // Transaction annulée : les événements restent à publier. La tentative est comptée à part.
      if (ids.length > 0) await this.countFailedAttempt(ids);
      throw error;
    }
  }

  private async countFailedAttempt(ids: string[]): Promise<void> {
    try {
      await this.db.withTenantContext({ space: 'system' }, () =>
        currentTx().execute(sql`
          UPDATE outbox_events SET attempts = attempts + 1
           WHERE id = ANY(${idArray(ids)}::bigint[]) AND published_at IS NULL`),
      );
    } catch (error) {
      this.logger.warn({ msg: 'outbox : tentative non comptée', err: error });
    }
  }

  onApplicationBootstrap(): void {
    const interval = this.config.OUTBOX_RELAY_INTERVAL_MS;
    if (interval === 0) return;
    const tick = () => {
      // Relance immédiate tant qu'il reste des lots pleins, sinon attente de l'intervalle.
      this.running = this.relayOnce().then(
        (count) => count,
        (error: unknown) => {
          this.logger.error({ msg: 'relais outbox en échec', err: error });
          return 0;
        },
      );
      void this.running.then((count) => {
        if (!this.stopped) this.timer = setTimeout(tick, count === RELAY_BATCH ? 0 : interval);
      });
    };
    this.timer = setTimeout(tick, interval);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
    await this.queue.close();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
