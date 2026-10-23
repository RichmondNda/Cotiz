import { Injectable } from '@nestjs/common';
import type { PatchAssociationInput, PlatformAssociationDetail } from '@cotiz/contracts';
import { associations, updateWithVersion } from '@cotiz/db';
import type { z } from 'zod';
import { setManagerSeats } from '../../billing/billing.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { platformAssociationOf } from './association-records.js';
import { platformAssociationDetail } from './association-views.js';

/** Champs du profil modifiables par la plateforme (colonnes d'`associations`). */
const PROFILE_FIELDS = ['name', 'type', 'city', 'country', 'description', 'contactEmail', 'contactPhone'] as const;

/**
 * pf.asso.patch : modification administrative (sa-association-detail), sous verrou optimiste (`If-Match`, 412) ;
 * seuls les champs envoyés changent, la version s'incrémente même si aucune valeur ne change. Comptes gestionnaires
 * autorisés : surcharge de l'abonnement en cours (billing). association.updated avec les champs réellement modifiés,
 * s'il y en a. Corps vide : 422.
 */
@Injectable()
export class UpdateAssociationUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association.update')
  async execute(id: string, input: z.infer<typeof PatchAssociationInput>): Promise<PlatformAssociationDetail> {
    const actor = requireActor();
    const version = expectedVersion();
    if (Object.keys(input).length === 0) throw new DomainProblem('validation_failed', { fields: { _: 'empty' } });
    const current = await platformAssociationOf(id);
    if (!current) throw new DomainProblem('not_found');

    const profile = Object.fromEntries(
      PROFILE_FIELDS.flatMap((field) => (field in input ? [[field, input[field]]] : [])),
    );
    const updated = await updateWithVersion(currentTx(), associations, { id, version }, profile);
    if (!updated) throw new DomainProblem('not_found');

    const changed: string[] = PROFILE_FIELDS.filter((field) => field in input && updated[field] !== current[field]);
    const before: Record<string, unknown> = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, current[f]]));
    const after: Record<string, unknown> = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, updated[f]]));
    if (input.managerSeatsOverride !== undefined) {
      const seats = await setManagerSeats(id, input.managerSeatsOverride);
      if (!seats) {
        throw new DomainProblem('validation_failed', { fields: { managerSeatsOverride: 'no_current_subscription' } });
      }
      before.managerSeatsOverride = seats.before;
      after.managerSeatsOverride = seats.after;
      if (seats.after !== seats.before) changed.push('managerSeatsOverride');
    }

    if (changed.length > 0) {
      await this.outbox.publish(currentTx(), {
        type: 'association.updated',
        associationId: id,
        actorUserId: actor.userId,
        aggregate: { type: 'association', id },
        payload: { associationId: id, changedFields: changed },
      });
    }
    recordAudit({ entityType: 'association', entityId: id, associationId: id, before, after });
    return platformAssociationDetail(id);
  }
}
