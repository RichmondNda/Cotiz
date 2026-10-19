import { PERMISSION_ROLES, PERMISSIONS, type Permission } from '@cotiz/contracts';

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

/** Permissions détenues par une personne connectée de ce rôle (`GET /me`), dans l'ordre de permissions.yaml. */
export function permissionsOf(role: string | null): Permission[] {
  return PERMISSIONS.filter((permission) => holdsPermission(permission, { role }));
}

/**
 * Rôle de l'acteur pour la matrice : `subscriber` pour un jeton souscripteur, `platform:<rôle>` pour le personnel
 * plateforme, `association:<rôle>` pour une appartenance (lot 1.2). Partagé par PermissionGuard et `GET /me` : ce que
 * le front affiche et ce que le back accorde sortent du même calcul.
 */
export function actorRoleOf(
  space: string,
  roles: { platformRole: string | null; membershipRole?: string | null },
): string | null {
  if (space === 'subscriber') return 'subscriber';
  if (space === 'platform') return roles.platformRole ? `platform:${roles.platformRole}` : null;
  if (space === 'association') return roles.membershipRole ? `association:${roles.membershipRole}` : null;
  return null;
}
