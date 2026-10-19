import { Injectable } from '@nestjs/common';
import { type Me, SessionSpace } from '@cotiz/contracts';
import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { actorRoleOf, permissionsOf, platformRoleOf } from '../../access/access.public.js';
import { activeFeatures } from '../../../shared/features/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * `me` (architecture/03) : la personne du jeton, jamais une autre (l'identifiant vient du contexte posé par les
 * gardes). Rôle plateforme relu à chaque appel : un membre du personnel retiré perd aussitôt ses permissions.
 * Appartenances, association courante et plan : lot 1.2 (aucune avant).
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
    // Les gardes ne posent ici que l'espace du jeton (platform, subscriber ; association au lot 1.2).
    const space = SessionSpace.parse(actor.space);

    const platformRole = space === 'platform' ? await platformRoleOf(actor.userId) : null;
    const role = actorRoleOf(space, { platformRole });
    return {
      user,
      space,
      currentAssociationId: null,
      memberships: [],
      platformRole,
      permissions: permissionsOf(role),
      features: activeFeatures({ planFeatures: null }),
    };
  }
}
