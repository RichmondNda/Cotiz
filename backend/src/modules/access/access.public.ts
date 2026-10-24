// Surface publique du module access : personnel de la plateforme, appartenances aux associations (lus « de soi »),
// rôles des gardes et politique de permissions.

export { grantPlatformRole, isPlatformStaff, type PlatformRole, platformRoleOf } from './application/platform-staff.js';
export {
  type ActiveMembership,
  activeMembershipsOf,
  holdsMembership,
  MANAGEMENT_ROLES,
  type ManagementRole,
  type ManagementAccess,
  managementAccessIn,
  type MembershipSpace,
  type MembershipStatus,
} from './application/memberships.js';
export {
  type AssociationMembers,
  type AssociationTeam,
  grantOwnership,
  membersOf,
  ownerOf,
  ownsAnAssociation,
  suspensionTeamOf,
  teamsOf,
} from './application/owner-membership.js';
export { platformSubscribersCount, platformTeamSizes, type TeamSize } from './application/platform-team-stats.js';
export { SeedDevMembershipsUseCase } from './application/seed-dev-memberships.use-case.js';
export { SelfRoles } from './application/self-roles.js';
export { actorRoleOf, permissionsOf } from './domain/permission-policy.js';
