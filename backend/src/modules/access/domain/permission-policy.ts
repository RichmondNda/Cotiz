import { PERMISSION_ROLES, type Permission } from '@cotiz/contracts';

/**
 * Acteur connecté, vu par la politique de permissions : son rôle (`platform:owner`, `association:manager`,
 * `subscriber`…) ou `null` s'il n'est pas encore résolu. `null` (l'acteur entier) : personne de connectée.
 */
export interface PermissionActor {
  role: string | null;
}

/** L'acteur détient-il la permission, d'après la matrice de docs/specs/permissions.yaml ? */
export function holdsPermission(permission: Permission, actor: PermissionActor | null): boolean {
  const roles: readonly string[] = PERMISSION_ROLES[permission];
  if (roles.includes('*')) return true;
  if (!actor) return false;
  if (roles.includes('*authenticated')) return true;
  return actor.role !== null && roles.includes(actor.role);
}
