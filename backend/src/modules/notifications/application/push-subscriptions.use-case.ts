import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { PushSubscriptionInput } from '@cotiz/contracts';
import { pushSubscriptions as t } from '@cotiz/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { isAllowedPushEndpoint, type PushEndpointPolicy, pushEndpointPolicy } from '../domain/push-endpoint.js';

/** me.push › vapidKey : clé publique VAPID, à passer à `pushManager.subscribe`. Clés absentes : push indisponible (404). */
@Injectable()
export class VapidPublicKeyUseCase {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  execute(): { publicKey: string } {
    const publicKey = this.config.VAPID_PUBLIC_KEY;
    if (!publicKey || !this.config.VAPID_PRIVATE_KEY) throw new DomainProblem('not_found');
    return { publicKey };
  }
}

/**
 * me.push › subscribe : enregistre l'appareil de la personne (un abonnement par URL de push). Déjà à elle : clés mises à
 * jour et réactivé. Enregistré par une autre personne (appareil partagé) : 422 `fields.endpoint = already_registered`,
 * rien n'est lu ni modifié chez l'autre ; le navigateur se réabonne et obtient une nouvelle URL. URL hors des services
 * de push connus : 422 `unsupported_push_service` (le worker ne l'appellera jamais).
 */
@Injectable()
export class SubscribePushUseCase {
  private readonly policy: PushEndpointPolicy;

  constructor(@Inject(CONFIG) config: Config) {
    this.policy = pushEndpointPolicy(config);
  }

  async execute(
    input: z.infer<typeof PushSubscriptionInput>,
    userAgent: string | undefined,
  ): Promise<{ id: string; createdAt: string }> {
    const { userId } = requireActor();
    if (!isAllowedPushEndpoint(input.endpoint, this.policy)) {
      throw new DomainProblem('validation_failed', { fields: { endpoint: 'unsupported_push_service' } });
    }
    const values = {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    };
    const tx = currentTx();
    // RLS owner_access : seules les lignes de la personne sont visibles et modifiables.
    const [own] = await tx
      .update(t)
      .set({ ...values, revokedAt: null, failedCount: 0 })
      .where(and(eq(t.endpoint, input.endpoint), eq(t.userId, userId)))
      .returning({ id: t.id, createdAt: t.createdAt });
    const row =
      own ??
      (
        await tx
          .insert(t)
          .values({ ...values, userId, endpoint: input.endpoint })
          .onConflictDoNothing({ target: t.endpoint })
          .returning({ id: t.id, createdAt: t.createdAt })
      )[0];
    if (!row) throw new DomainProblem('validation_failed', { fields: { endpoint: 'already_registered' } });
    return { id: row.id, createdAt: row.createdAt.toISOString() };
  }
}

/** me.push › unsubscribe : désactive un appareil de la personne (gardé 30 jours, puis purgé). Autre personne : 404. */
@Injectable()
export class UnsubscribePushUseCase {
  async execute(id: string): Promise<void> {
    const { userId } = requireActor();
    const [row] = await currentTx()
      .update(t)
      .set({ revokedAt: sql`coalesce(${t.revokedAt}, now())` })
      .where(and(eq(t.id, id), eq(t.userId, userId), isNull(t.revokedAt)))
      .returning({ id: t.id });
    if (!row) throw new DomainProblem('not_found');
  }
}
