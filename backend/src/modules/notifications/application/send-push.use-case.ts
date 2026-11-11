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
 * Envoi d'un job `notify-push` (worker, espace system). Transaction 1 : appareils actifs de la personne, ligne
 * `deliveries` créée sous l'id du job (aucun appareil : `failed`, `no_device`) puis relue, à traiter si `queued`. Envoi hors transaction (réseau). Transaction 2 : bilan par appareil (succès :
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
      const devices = await tx
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, job.userId), isNull(pushSubscriptions.revokedAt)));
      const n = devices.length;
      // Créée au premier passage (id du job) ; une reprise ou un job rejoué la retrouve.
      await tx
        .insert(deliveries)
        .values({
          id: job.deliveryId,
          userId: job.userId,
          associationId: job.associationId,
          notificationId: job.notificationId,
          channel: 'push',
          provider: 'webpush',
          // Jamais l'URL d'un appareil (elle vaut accès à l'appareil) : le nombre seulement.
          recipientMasked: `${String(n)} appareil${n > 1 ? 's' : ''}`,
          ...(n === 0 ? { status: 'failed' as const, lastError: 'no_device' } : {}),
        })
        .onConflictDoNothing({ target: deliveries.id });
      const [delivery] = await tx
        .select({ status: deliveries.status })
        .from(deliveries)
        .where(
          and(eq(deliveries.id, job.deliveryId), eq(deliveries.userId, job.userId), eq(deliveries.channel, 'push')),
        );
      return delivery?.status === 'queued' ? devices : null;
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
                lastError: transient[0] ?? 'gone',
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
