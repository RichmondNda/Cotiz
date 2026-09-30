import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { HealthCheckStatus, HealthReadyResponse } from '@cotiz/contracts';
import { Redis } from 'ioredis';
import pg from 'pg';
import { CONFIG, type Config } from '../../../config.js';

/** Au-delà, une dépendance est considérée comme indisponible : la sonde ne doit jamais rester bloquée. */
const PROBE_TIMEOUT_MS = 1_000;

/** Vérifie PostgreSQL, Redis et MinIO avec des connexions dédiées, distinctes de celles des cas d'usage. */
@Injectable()
export class ReadinessProbe implements OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly redis: Redis;
  private readonly minioReadyUrl: string;

  constructor(@Inject(CONFIG) config: Config) {
    this.pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: PROBE_TIMEOUT_MS,
      idleTimeoutMillis: 10_000,
    });
    // Une erreur de connexion inactive ne doit pas faire tomber le processus.
    this.pool.on('error', () => undefined);
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: PROBE_TIMEOUT_MS,
    });
    this.redis.on('error', () => undefined);
    this.minioReadyUrl = new URL('/minio/health/ready', config.S3_ENDPOINT).toString();
  }

  async check(): Promise<HealthReadyResponse> {
    const [postgres, redis, minio] = await Promise.all([
      probe(() => this.pool.query('SELECT 1')),
      probe(() => this.pingRedis()),
      probe(() => this.pingMinio()),
    ]);
    const ok = postgres === 'up' && redis === 'up' && minio === 'up';
    return { status: ok ? 'ok' : 'unavailable', checks: { postgres, redis, minio } };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
    await this.pool.end();
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') await this.redis.connect();
    await this.redis.ping();
  }

  private async pingMinio(): Promise<void> {
    const res = await fetch(this.minioReadyUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    // Libère la connexion : le corps n'est pas utilisé.
    await res.body?.cancel();
    if (!res.ok) throw new Error(`MinIO : HTTP ${String(res.status)}`);
  }
}

async function probe(fn: () => Promise<unknown>): Promise<HealthCheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('délai dépassé'));
    }, PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([fn(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
