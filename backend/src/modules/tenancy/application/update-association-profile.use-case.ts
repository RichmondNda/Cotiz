import { Injectable } from '@nestjs/common';
import type { Association, PatchAssociationProfile } from '@cotiz/contracts';
import { associations, updateWithVersion } from '@cotiz/db';
import type { z } from 'zod';
import { isUsableAssociationFile } from '../../files/files.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { toAssociation } from './association-profile.js';
import { ownAssociationOf } from './association-records.js';

/** Champs du profil modifiables par le gestionnaire (colonnes d'`associations`). */
const PROFILE_FIELDS = [
  'name',
  'description',
  'city',
  'contactEmail',
  'contactPhone',
  'logoFileId',
  'defaultGraceDays',
] as const;

/**
 * as.patch : profil de l'association par son owner (onboarding étape 2, paramètres), sous verrou optimiste (`If-Match`,
 * 412) ; seuls les champs envoyés changent, la version s'incrémente même si aucune valeur ne change. Logo : fichier de
 * l'association, déposé par as.upload (purpose `logo`) et analysé sain, sinon 422. association.updated avec les champs
 * réellement modifiés, s'il y en a. Corps vide : 422.
 */
@Injectable()
export class UpdateAssociationProfileUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association.update')
  async execute(aid: string, input: z.infer<typeof PatchAssociationProfile>): Promise<Association> {
    const actor = requireActor();
    const version = expectedVersion();
    if (Object.keys(input).length === 0) throw new DomainProblem('validation_failed', { fields: { _: 'empty' } });
    if (input.logoFileId && !(await isUsableAssociationFile(input.logoFileId, 'logo'))) {
      throw new DomainProblem('validation_failed', { fields: { logoFileId: 'invalid' } });
    }
    const current = await ownAssociationOf(aid);
    if (!current) throw new DomainProblem('not_found');

    const profile = Object.fromEntries(
      PROFILE_FIELDS.flatMap((field) => (field in input ? [[field, input[field]]] : [])),
    );
    const id = current.id;
    const updated = await updateWithVersion(currentTx(), associations, { id, version }, profile);
    if (!updated) throw new DomainProblem('not_found');

    const changed = PROFILE_FIELDS.filter((field) => field in input && updated[field] !== current[field]);
    if (changed.length > 0) {
      await this.outbox.publish(currentTx(), {
        type: 'association.updated',
        associationId: id,
        actorUserId: actor.userId,
        aggregate: { type: 'association', id },
        payload: { associationId: id, changedFields: changed },
      });
    }
    recordAudit({
      entityType: 'association',
      entityId: id,
      associationId: id,
      before: Object.fromEntries(changed.map((f) => [f, current[f]])),
      after: Object.fromEntries(changed.map((f) => [f, updated[f]])),
    });
    return toAssociation(updated);
  }
}
