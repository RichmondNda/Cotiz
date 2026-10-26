import { Injectable } from '@nestjs/common';
import type { MemberDetail, PatchMemberInput } from '@cotiz/contracts';
import { enrollments, subscriberProfiles } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { type IdentityChanges, SubscriberAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { normalizePhone } from '../domain/phone.js';
import { profileCreatorOf } from './enrollment-records.js';
import { GetMemberUseCase } from './get-member.use-case.js';
import { contextAssociationId } from './member-context.js';

type Input = z.infer<typeof PatchMemberInput>;

/** Champs de la fiche, dans l'ordre de `changedFields`. */
const FIELDS = ['firstName', 'lastName', 'phone', 'email', 'address', 'city'] as const;
const IDENTITY = new Set<string>(['firstName', 'lastName', 'phone', 'email']);

/**
 * mb.patch : fiche d'une personne inscrite chez l'association (sinon 404), sous verrou optimiste (`If-Match` sur la
 * version du compte, 412) ; corps vide : 422. Nom, téléphone, email : seulement si le compte n'est pas activé et a été
 * créé par cette association (Q7), sinon `invalid_state` ; adresse et ville toujours. Téléphone revalidé
 * (`invalid_phone`), déjà porté : `phone_taken` ; email porté : 422 (`email: taken`). member.updated avec les champs
 * réellement modifiés ; audit avant/après (téléphones masqués par l'audit).
 */
@Injectable()
export class UpdateMemberUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly members: GetMemberUseCase,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('member.update')
  async execute(aid: string, uid: string, input: Input): Promise<z.infer<typeof MemberDetail>> {
    const actor = requireActor();
    const version = expectedVersion();
    if (Object.keys(input).length === 0) throw new DomainProblem('validation_failed', { fields: { _: 'empty' } });
    const associationId = contextAssociationId(aid);
    const tx = currentTx();
    const [enrolled] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.associationId, associationId), eq(enrollments.userId, uid)))
      .limit(1);
    const member = enrolled ? await this.accounts.contactOf(uid) : null;
    if (!member) throw new DomainProblem('not_found');

    const touchesIdentity = Object.keys(input).some((field) => IDENTITY.has(field));
    if (
      touchesIdentity &&
      (member.status !== 'pending_activation' || (await profileCreatorOf(uid)) !== associationId)
    ) {
      throw new DomainProblem('invalid_state');
    }
    const phone = input.phone === undefined ? undefined : normalizePhone(input.phone);
    if (phone === null) throw new DomainProblem('validation_failed', { fields: { phone: 'invalid_phone' } });

    const [profile] = await tx
      .select({ address: subscriberProfiles.address, city: subscriberProfiles.city })
      .from(subscriberProfiles)
      .where(eq(subscriberProfiles.userId, uid))
      .for('update');
    const before = { ...member, address: profile?.address ?? null, city: profile?.city ?? null };
    const identity: IdentityChanges = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone,
      email: input.email,
    };
    await this.accounts.updateIdentity(uid, version, identity);
    const place = {
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.city === undefined ? {} : { city: input.city }),
    };
    if (Object.keys(place).length > 0) {
      await tx
        .insert(subscriberProfiles)
        .values({ userId: uid, ...place })
        .onConflictDoUpdate({ target: subscriberProfiles.userId, set: place });
    }

    const after = { ...before, ...identity, ...place };
    const changed = FIELDS.filter((field) => field in input && after[field] !== before[field]);
    if (changed.length > 0) {
      await this.outbox.publish(tx, {
        type: 'member.updated',
        associationId,
        actorUserId: actor.userId,
        aggregate: { type: 'user', id: uid },
        payload: { userId: uid, changedFields: changed },
      });
    }
    recordAudit({
      entityType: 'user',
      entityId: uid,
      before: Object.fromEntries(changed.map((f) => [f, before[f]])),
      after: Object.fromEntries(changed.map((f) => [f, after[f]])),
    });
    return this.members.execute(aid, uid);
  }
}
