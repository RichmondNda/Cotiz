import { Injectable } from '@nestjs/common';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { LOOKUP_AS_SELF } from '../../../shared/tenant-context/self.js';
import { type PlatformRole, platformRoleOf } from './platform-staff.js';
import { type ManagementAccess, managementAccessIn } from './memberships.js';

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
}
