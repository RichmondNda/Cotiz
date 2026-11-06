import { Injectable } from '@nestjs/common';
import type { Profile } from '@cotiz/contracts';
import { subscriberProfiles } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { type UserProfileChanges, UserProfiles } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

export interface MyProfileChanges extends UserProfileChanges {
  address?: string | null | undefined;
  city?: string | null | undefined;
}

/**
 * me.profile › get et patch (lot 3.1), espace me : identité (module identity) et adresse du profil de souscripteur
 * (subscriber_profiles, module members, global : la même pour toutes les associations de la personne). Toujours la
 * personne du jeton.
 * - Adresse et ville : seulement avec un profil de souscripteur ; sinon 422 `validation_failed` (`not_applicable`).
 * - Une seule transaction : un refus (email pris, email requis) n'écrit rien.
 * - Modification auditée : noms des champs changés, jamais leurs valeurs (email, adresse : données personnelles).
 */
@Injectable()
export class MyProfile {
  constructor(private readonly identities: UserProfiles) {}

  async get(): Promise<z.infer<typeof Profile>> {
    const { userId } = requireActor();
    const identity = await this.identities.read(userId);
    // Jeton valide d'une personne effacée : comme une session expirée.
    if (!identity) throw new DomainProblem('session_expired');
    const [address] = await currentTx()
      .select({ address: subscriberProfiles.address, city: subscriberProfiles.city })
      .from(subscriberProfiles)
      .where(eq(subscriberProfiles.userId, userId))
      .limit(1);
    return {
      ...identity,
      passwordChangedAt: identity.passwordChangedAt?.toISOString() ?? null,
      address: address?.address ?? null,
      city: address?.city ?? null,
    };
  }

  @Audited('user.update_profile')
  async update(changes: MyProfileChanges): Promise<z.infer<typeof Profile>> {
    const { userId } = requireActor();
    const tx = currentTx();
    const { address, city, ...identity } = changes;
    const addressChanges = {
      ...(address === undefined ? {} : { address }),
      ...(city === undefined ? {} : { city }),
    };
    if (Object.keys(addressChanges).length > 0) {
      const [profile] = await tx
        .select({ userId: subscriberProfiles.userId })
        .from(subscriberProfiles)
        .where(eq(subscriberProfiles.userId, userId))
        .for('update');
      if (!profile) {
        const fields = Object.fromEntries(Object.keys(addressChanges).map((field) => [field, 'not_applicable']));
        throw new DomainProblem('validation_failed', { fields });
      }
    }
    await this.identities.update(userId, identity);
    if (Object.keys(addressChanges).length > 0) {
      await tx.update(subscriberProfiles).set(addressChanges).where(eq(subscriberProfiles.userId, userId));
    }
    recordAudit({
      entityType: 'user',
      entityId: userId,
      after: { fields: Object.keys(changes).filter((key) => changes[key as keyof MyProfileChanges] !== undefined) },
    });
    return this.get();
  }
}
