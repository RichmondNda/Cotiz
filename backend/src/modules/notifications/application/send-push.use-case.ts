import { Inject, Injectable } from '@nestjs/common';
import { deliveries, pushSubscriptions } from '@cotiz/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { PUSH_SENDER, type PushOutcome, type PushSender } from '../infra/push-sender.js';
import type { PushJob } from '../infra/push-queue.js';

/** Échecs consécutifs après lesquels un appareil est désabonné (architecture/07). */
export const MAX_PUSH_FAILURES = 5;

/** Tous les appareils ont échoué pour une raison passagère : BullMQ reprend le job (3 tentatives, jobs.yaml). */
export class PushRetryableError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(`envoi push à reprendre (${reasons.join(', ')})`);
    this.name = 'PushRetryableError';
  }
}

/**
 * Envoi d'un job `notify-push` (worker, espace system). Transaction 1 : la ligne `deliveries` encore `queued` et les
 * appareils actifs de la personne. Envoi hors transaction (réseau). Transaction 2 : bilan par appareil (succès :
 * compteur remis à zéro ; 404/410 : désabonné ; autre échec : compté, désabonné au 5e) et statut de l'envoi. Un appareil
 * au moins servi : `sent`, pas de reprise (elle renverrait aux autres). Aucun : reprise, `failed` à la dernière.
 */
@Injectable()
export class SendPushUseCase {
  constructor(
    private readonly db: TenantDatabase,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  async execute(job: PushJob, attempt: { final: boolean }): Promise<void> {
    const loaded = await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      const [delivery] = await tx
        .select({ status: deliveries.status })
        .from(deliveries)
        .where(
          and(eq(deliveries.id, job.deliveryId), eq(deliveries.userId, job.userId), eq(deliveries.channel, 'push')),
        );
      if (delivery?.status !== 'queued') return null;
      return tx
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, job.userId), isNull(pushSubscriptions.revokedAt)));
    });
    // Déjà traité (job rejoué) ou envoi inconnu : rien à faire.
    if (loaded === null) return;

    const outcomes = await Promise.all(
      loaded.map(async (device) => ({
        id: device.id,
        outcome: await this.sender.send(device, job.payload, { urgent: job.urgent }),
      })),
    );
    const sent = outcomes.some((o) => o.outcome.kind === 'sent');
    const transient = outcomes.flatMap((o) => (o.outcome.kind === 'failed' ? [o.outcome.reason] : []));
    const retry = !sent && transient.length > 0 && !attempt.final;

    await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      const now = new Date();
      for (const { id, outcome } of outcomes) await recordOutcome(id, outcome, now);
      await tx
        .update(deliveries)
        .set({
          attempts: sql`${deliveries.attempts} + 1`,
          ...(sent
            ? { status: 'sent' as const, sentAt: now, lastError: null }
            : {
                ...(retry ? {} : { status: 'failed' as const }),
                lastError: transient[0] ?? (loaded.length === 0 ? 'no_device' : 'gone'),
              }),
        })
        .where(and(eq(deliveries.id, job.deliveryId), eq(deliveries.status, 'queued')));
    });
    if (retry) throw new PushRetryableError(transient);
  }
}

async function recordOutcome(id: string, outcome: PushOutcome, now: Date): Promise<void> {
  const tx = currentTx();
  const where = and(eq(pushSubscriptions.id, id), isNull(pushSubscriptions.revokedAt));
  if (outcome.kind === 'sent') {
    await tx.update(pushSubscriptions).set({ lastSuccessAt: now, failedCount: 0 }).where(where);
  } else if (outcome.kind === 'gone') {
    await tx.update(pushSubscriptions).set({ revokedAt: now }).where(where);
  } else {
    await tx
      .update(pushSubscriptions)
      .set({
        failedCount: sql`${pushSubscriptions.failedCount} + 1`,
        revokedAt: sql`CASE WHEN ${pushSubscriptions.failedCount} + 1 >= ${MAX_PUSH_FAILURES} THEN now() ELSE NULL END`,
      })
      .where(where);
  }
}
