import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { sessions } from '@cotiz/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { suspensionTeamOf } from '../../access/access.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { SessionFamilies } from '../application/session-families.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';

/**
 * association.suspended (events.yaml : « auth: liste noire Redis ») : les sessions de l'espace association des
 * gestionnaires actifs sont révoquées (familles entières) et leurs jetons d'accès récents mis en liste noire ; la
 * reconnexion est refusée (`association_suspended`, auth.login). MembershipGuard refuse déjà l'espace dès la
 * suspension : ce consommateur ferme les sessions elles-mêmes. Limite : une personne qui gère aussi une autre
 * association doit se reconnecter. Association réactivée entre-temps (événement retardé ou rejoué) : rien n'est
 * révoqué. La liste noire est écrite avant le COMMIT du consommateur : un échec le fait
 * rejouer, et rejoué, il ne trouve plus rien à révoquer en base (la liste noire du premier passage reste valable).
 * La réactivation n'a rien à retirer : aucune clé par association, les sessions révoquées le restent.
 */
@Injectable()
export class AssociationSuspendedConsumer implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'association-suspended-sessions',
      types: ['association.suspended'],
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async handle(event: EventEnvelope, now = new Date()): Promise<void> {
    if (!event.associationId) throw new Error(`${event.type} sans association`);
    const team = await suspensionTeamOf(event.associationId);
    if (team?.status !== 'suspended' || team.activeManagerIds.length === 0) return;
    const managers = team.activeManagerIds;
    const open = await currentTx()
      .selectDistinct({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(inArray(sessions.userId, managers), eq(sessions.space, 'association'), isNull(sessions.revokedAt)));
    const blacklist: string[] = [];
    for (const { familyId } of open) blacklist.push(...(await this.families.revoke(familyId, now)));
    await this.revoked.revoke(blacklist);
  }
}
