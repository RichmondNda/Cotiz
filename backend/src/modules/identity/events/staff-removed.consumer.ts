import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { sessions } from '@cotiz/db';
import { and, eq, isNull } from 'drizzle-orm';
import { platformRoleOf } from '../../access/access.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { SessionFamilies } from '../application/session-families.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';

/**
 * staff.changed (events.yaml : « auth », lot 4.7) : une personne retirée du personnel perd ses sessions de l'espace
 * plateforme (familles entières, jetons d'accès récents en liste noire). Les gardes lui refusent déjà la plateforme dès
 * le retrait (plus de rôle) ; le consommateur ferme les sessions elles-mêmes (GET /me, renouvellement). Ses sessions
 * des autres espaces restent. Personne réinvitée entre-temps (événement retardé ou rejoué) : rien n'est révoqué.
 */
@Injectable()
export class StaffRemovedConsumer implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'staff-removed-sessions',
      types: ['staff.changed'],
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async handle(event: EventEnvelope, now = new Date()): Promise<void> {
    const payload = event.payload as { userId?: unknown; change?: unknown };
    if (payload.change !== 'removed') return;
    if (typeof payload.userId !== 'string') throw new Error(`${event.type} incomplet`);
    if ((await platformRoleOf(payload.userId)) !== null) return;
    const open = await currentTx()
      .selectDistinct({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(eq(sessions.userId, payload.userId), eq(sessions.space, 'platform'), isNull(sessions.revokedAt)));
    const blacklist: string[] = [];
    for (const { familyId } of open) blacklist.push(...(await this.families.revoke(familyId, now)));
    await this.revoked.revoke(blacklist);
  }
}
