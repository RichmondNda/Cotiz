import { Injectable } from '@nestjs/common';
import { type Me, SessionSpace } from '@cotiz/contracts';
import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import {
  activeMembershipsOf,
  actorRoleOf,
  MANAGEMENT_ROLES,
  type ManagementRole,
  permissionsOf,
  platformRoleOf,
} from '../../access/access.public.js';
import { planFeaturesOf } from '../../billing/billing.public.js';
import { activeFeatures } from '../../../shared/features/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

const isManagement = (role: string): role is ManagementRole => (MANAGEMENT_ROLES as readonly string[]).includes(role);

/**
 * `me` (architecture/03) : la personne du jeton, jamais une autre (l'identifiant vient du contexte posé par les
 * gardes). Rôles relus à chaque appel : un membre retiré perd aussitôt ses permissions.
 * - Appartenances : actives seulement, dans l'ordre où la personne les a rejointes.
 * - Association courante (espace association) : la première gérée (owner, manager, viewer), choix du lot 1.2 ; ses
 *   permissions sont celles de ce rôle. Ailleurs : `null`.
 * Fonctionnalités soumises au plan : celles du plan de l'association courante (lot 4.1).
 */
@Injectable()
export class GetMeUseCase {
  async execute(): Promise<Me> {
    const actor = requireActor();
    const [user] = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    // Jeton valide d'une personne effacée : comme une session expirée.
    if (!user) throw new DomainProblem('session_expired');
    // Les gardes ne posent ici que l'espace du jeton (platform, association, subscriber).
    const space = SessionSpace.parse(actor.space);

    const memberships = await activeMembershipsOf(actor.userId);
    const current = space === 'association' ? memberships.find((m) => isManagement(m.role)) : undefined;
    const platformRole = space === 'platform' ? await platformRoleOf(actor.userId) : null;
    const role = actorRoleOf(space, {
      platformRole,
      membershipRole: current && isManagement(current.role) ? current.role : null,
    });
    return {
      user,
      space,
      currentAssociationId: current?.association.id ?? null,
      memberships: memberships.map(({ association, role: membershipRole, title }) => ({
        association: {
          id: association.id,
          name: association.name,
          logoFileId: association.logoFileId,
          suspended: association.status === 'suspended',
          slug: association.slug,
          status: association.status as Me['memberships'][number]['association']['status'],
        },
        role: membershipRole,
        title,
      })),
      platformRole,
      permissions: permissionsOf(role),
      features: activeFeatures({ planFeatures: await this.planFeatures(current?.association.id ?? null) }),
    };
  }

  /**
   * Fonctionnalités du plan de l'association courante, lues dans son contexte (posé par MembershipGuard sur `me`).
   * Contexte d'une autre association (appartenance changée entre la garde et cette lecture) ou sans association :
   * aucune fonctionnalité soumise au plan, jamais celles d'une autre association.
   */
  private async planFeatures(currentAssociationId: string | null) {
    const context = currentContext();
    if (!currentAssociationId || context?.space !== 'association' || context.associationId !== currentAssociationId) {
      return null;
    }
    return planFeaturesOf(currentAssociationId);
  }
}
