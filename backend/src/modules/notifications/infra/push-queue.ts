import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

/**
 * Job `send` de la file `notify-push` : l'id de la ligne `deliveries` à créer, la personne, et le message à chiffrer.
 * Les appareils sont relus au moment de l'envoi (un appareil retiré entre-temps ne reçoit rien).
 */
export const PushJob = z.object({
  deliveryId: z.uuid(),
  userId: z.uuid(),
  associationId: z.uuid().nullable(),
  notificationId: z.uuid().nullable(),
  urgent: z.boolean(),
  payload: z.object({ title: z.string(), body: z.string(), url: z.string().nullable(), tag: z.string() }),
});
export type PushJob = z.infer<typeof PushJob>;

/** Producteur de la file `notify-push` (worker). */
@Injectable()
export class PushQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(CONFIG) config: Config) {
    this.queue = new Queue(QUEUES['notify-push'].name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES['notify-push'].jobOptions,
    });
  }

  /** `jobId` stable (un envoi rejoué n'est mis en file qu'une fois) ; `delay` : heures calmes. */
  async add(job: PushJob, options: { jobId: string; delay: number }): Promise<void> {
    await this.queue.add('send', withTraceContext(job), {
      jobId: options.jobId,
      ...(options.delay > 0 ? { delay: options.delay } : {}),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
