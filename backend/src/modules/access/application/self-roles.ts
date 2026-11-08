import { Injectable } from '@nestjs/common';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { LOOKUP_AS_SELF } from '../../../shared/tenant-context/self.js';
import { type PlatformRole, platformRoleOf } from './platform-staff.js';
import { activeMembershipsOf, type ManagementAccess, managementAccessIn, MANAGEMENT_ROLES } from './memberships.js';

/**
 * Rôles de la personne du jeton, lus en base à chaque requête par les gardes (avant la transaction de la requête) :
 * un membre retiré perd aussitôt l'accès. Lecture « de soi » seulement (`LOOKUP_AS_SELF`).
 */
@Injectable()
export class SelfRoles {
  constructor(private readonly db: TenantDatabase) {}

  platformRole(userId: string): Promise<PlatformRole | null> {
    return this.db[LOOKUP_AS_SELF](userId, () => platformRoleOf(userId));
  }

  managementAccess(userId: string, associationId: string): Promise<ManagementAccess | null> {
    return this.db[LOOKUP_AS_SELF](userId, () => managementAccessIn(userId, associationId));
  }

  /**
   * Association courante de `GET /me` en espace association : la première gérée (owner, manager, viewer) parmi les
   * appartenances actives, dans l'ordre où la personne les a rejointes (même choix que GetMeUseCase, lot 1.2).
   */
  async currentManagedAssociation(userId: string): Promise<string | null> {
    const memberships = await this.db[LOOKUP_AS_SELF](userId, () => activeMembershipsOf(userId));
    const current = memberships.find((m) => (MANAGEMENT_ROLES as readonly string[]).includes(m.role));
    return current?.association.id ?? null;
  }
}
