import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { sessions } from '@cotiz/db';
import { and, eq, isNull } from 'drizzle-orm';
import { teamMembershipOf } from '../../access/access.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { SessionFamilies } from '../application/session-families.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';

/**
 * team.changed (events.yaml : « auth: révocation si retrait », lot 4.5) : un gestionnaire retiré d'une équipe perd
 * ses sessions de l'espace association (familles entières, jetons d'accès récents en liste noire). MembershipGuard lui
 * refuse déjà l'association dès le retrait (404) ; le consommateur ferme les sessions elles-mêmes (GET /me, routes
 * communes, renouvellement). Limite (comme la suspension) : une personne qui gère aussi une autre association doit se
 * reconnecter. Personne réinvitée entre-temps (événement retardé ou rejoué) : rien n'est révoqué.
 */
@Injectable()
export class TeamRemovedConsumer implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'team-removed-sessions',
      types: ['team.changed'],
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async handle(event: EventEnvelope, now = new Date()): Promise<void> {
    const payload = event.payload as { userId?: unknown; change?: unknown };
    if (payload.change !== 'removed') return;
    if (!event.associationId || typeof payload.userId !== 'string') throw new Error(`${event.type} incomplet`);
    const membership = await teamMembershipOf(event.associationId, payload.userId);
    if (membership && membership.status !== 'removed') return;
    const open = await currentTx()
      .selectDistinct({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(eq(sessions.userId, payload.userId), eq(sessions.space, 'association'), isNull(sessions.revokedAt)));
    const blacklist: string[] = [];
    for (const { familyId } of open) blacklist.push(...(await this.families.revoke(familyId, now)));
    await this.revoked.revoke(blacklist);
  }
}
