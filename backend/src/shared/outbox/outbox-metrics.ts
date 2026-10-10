import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Gauge, type Registry } from 'prom-client';
import { collectErrors, METRICS_REGISTRY, OUTBOX_OLDEST_AGE, OUTBOX_UNPUBLISHED } from '../metrics/index.js';
import { currentTx, TenantDatabase } from '../tenant-context/index.js';

interface OutboxStats {
  unpublished: number;
  oldestAgeSeconds: number;
}

/** Une base lente ne retient ni le scrape ni une connexion du pool au-delà. */
const STATEMENT_TIMEOUT = '2s';

/**
 * Retard de l'outbox (architecture/11, alerte « outbox en retard > 2 min ») : nombre d'événements non publiés et âge
 * du plus ancien, lus en espace system à chaque scrape — donc dans le worker seulement (outbox_events n'est lisible
 * qu'en espace system). Aucune donnée d'événement : deux agrégats.
 *
 * Une seule requête par scrape (les deux jauges, collectées en parallèle, partagent la requête en cours). Collecte en
 * échec : `NaN` (inconnu), jamais 0 qui se lirait « outbox à jour » au pire moment ; l'échec est compté.
 */
@Injectable()
export class OutboxMetrics {
  private inFlight: Promise<OutboxStats> | undefined;
  private readonly errors: ReturnType<typeof collectErrors>;

  constructor(
    @Inject(METRICS_REGISTRY) registry: Registry,
    private readonly db: TenantDatabase,
  ) {
    this.errors = collectErrors(registry);
    const stats = () => this.stats();
    const gauge = (name: string, help: string, pick: (s: OutboxStats) => number) =>
      new Gauge({
        name,
        help,
        registers: [registry],
        async collect() {
          try {
            this.set(pick(await stats()));
          } catch {
            this.set(Number.NaN);
          }
        },
      });
    gauge(OUTBOX_UNPUBLISHED, 'Événements de l’outbox non publiés', (s) => s.unpublished);
    gauge(
      OUTBOX_OLDEST_AGE,
      'Âge (secondes) du plus ancien événement non publié ; 0 si aucun',
      (s) => s.oldestAgeSeconds,
    );
  }

  private stats(): Promise<OutboxStats> {
    // Échec compté une fois par requête, quel que soit le nombre de jauges qui l'attendaient.
    this.inFlight ??= this.query()
      .catch((error: unknown) => {
        this.errors.inc({ collector: 'outbox' });
        throw error;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  private query(): Promise<OutboxStats> {
    return this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`));
      const { rows } = await tx.execute<{ unpublished: number | string; age: number | string }>(sql`
        SELECT count(*)::int AS unpublished,
               COALESCE(EXTRACT(EPOCH FROM now() - min(occurred_at)), 0)::float8 AS age
          FROM outbox_events
         WHERE published_at IS NULL`);
      const row = rows[0];
      return { unpublished: Number(row?.unpublished ?? 0), oldestAgeSeconds: Math.max(0, Number(row?.age ?? 0)) };
    });
  }
}
