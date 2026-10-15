import { setTimeout } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import type { ResetRequestSpace } from '@cotiz/contracts';
import { passwordResetRequests, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { canonicalIp } from '../../../shared/net/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { canonicalIdentifier } from '../domain/login-policy.js';
import { SpaceAccess } from './space-access.js';

/** Demandes par personne et par 24 h (architecture/03) ; au-delà, rien n'est créé. */
const MAX_REQUESTS_PER_DAY = 3;
const DAY_MS = 86_400_000;
const USER_AGENT_MAX = 512;
/**
 * Durée plancher de la réponse : un compte connu (lecture des rôles, comptage, écriture, événement) ne répond pas plus
 * lentement qu'un identifiant inconnu (une lecture). Attendue APRÈS le COMMIT, sans tenir de connexion.
 */
const RESPONSE_FLOOR_MS = 250;

/**
 * auth.forgot (architecture/03), espace auth : la réponse est toujours la même (202), que le compte existe ou non.
 * Une demande n'est créée que pour un compte actif qui a un rôle dans l'espace, 3 fois par 24 h au plus ; le rôle
 * supérieur la traite hors ligne (écrans aux lots 1.4 et 3.1). Gestionnaires et personnel plateforme : demande
 * traitée par la plateforme (`association_id` NULL) ; souscripteurs : par leur association (lot 1.2).
 */
@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    private readonly spaceAccess: SpaceAccess,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    input: { space: z.infer<typeof ResetRequestSpace>; identifier: string },
    now = new Date(),
  ): Promise<AfterCommit<void>> {
    const started = performance.now();
    await this.record(input, now);
    return afterCommit(async () => {
      const remaining = RESPONSE_FLOOR_MS - (performance.now() - started);
      if (remaining > 0) await setTimeout(remaining);
    });
  }

  private async record(
    input: { space: z.infer<typeof ResetRequestSpace>; identifier: string },
    now: Date,
  ): Promise<void> {
    const tx = currentTx();
    const identifier = canonicalIdentifier(input.identifier);
    const [user] = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(identifier.kind === 'email' ? eq(users.email, identifier.value) : eq(users.phoneE164, identifier.value))
      .limit(1);
    if (user?.status !== 'active' || !(await this.spaceAccess.allows(user.id, input.space))) return;
    // Demandes simultanées de la même personne : comptées une à une (jamais plus de 3).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password_reset_requests:${user.id}`}, 0))`);

    const [recent] = await tx
      .select({ n: count() })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.userId, user.id),
          gt(passwordResetRequests.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if ((recent?.n ?? 0) >= MAX_REQUESTS_PER_DAY) return;

    const request = currentRequestInfo();
    const requestId = newId();
    await tx.insert(passwordResetRequests).values({
      id: requestId,
      userId: user.id,
      associationId: null,
      space: input.space,
      ip: request?.ip ? canonicalIp(request.ip) : null,
      userAgent: request?.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    });
    await this.outbox.publish(tx, {
      type: 'password_reset.requested',
      associationId: null,
      actorUserId: user.id,
      aggregate: { type: 'password_reset_request', id: requestId },
      payload: { requestId, userId: user.id, associationIds: [], space: input.space },
    });
  }
}
