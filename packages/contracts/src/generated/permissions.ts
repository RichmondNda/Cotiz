// Généré par scripts/gen.mjs depuis docs/specs/permissions.yaml. Ne pas modifier : lancer « pnpm --filter contracts gen ».

/** Permissions vérifiées par les gardes du back et `usePermissions()` du front. */
export const PERMISSIONS = [
  'public',
  'authenticated',
  'platform.requests.manage',
  'platform.associations.read',
  'platform.associations.manage',
  'platform.plans.manage',
  'platform.billing.manage',
  'platform.staff.manage',
  'platform.audit.read',
  'association.read',
  'association.settings.manage',
  'association.team.manage',
  'projects.manage',
  'members.manage',
  'payments.review',
  'reminders.send',
  'reports.read',
  'reports.export',
  'subscriber.self',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Rôles qui détiennent chaque permission : `platform:<rôle>`, `association:<rôle>`, `subscriber`, `*` (tout le monde),
 * `*authenticated` (toute personne connectée).
 */
export const PERMISSION_ROLES = {
  public: ['*'],
  authenticated: ['*authenticated'],
  'platform.requests.manage': ['platform:owner', 'platform:admin'],
  'platform.associations.read': ['platform:owner', 'platform:admin', 'platform:support'],
  'platform.associations.manage': ['platform:owner', 'platform:admin'],
  'platform.plans.manage': ['platform:owner', 'platform:admin'],
  'platform.billing.manage': ['platform:owner', 'platform:admin'],
  'platform.staff.manage': ['platform:owner'],
  'platform.audit.read': ['platform:owner', 'platform:admin'],
  'association.read': ['association:owner', 'association:manager', 'association:viewer'],
  'association.settings.manage': ['association:owner'],
  'association.team.manage': ['association:owner'],
  'projects.manage': ['association:owner', 'association:manager'],
  'members.manage': ['association:owner', 'association:manager'],
  'payments.review': ['association:owner', 'association:manager'],
  'reminders.send': ['association:owner', 'association:manager'],
  'reports.read': ['association:owner', 'association:manager', 'association:viewer'],
  'reports.export': ['association:owner', 'association:manager', 'association:viewer'],
  'subscriber.self': ['subscriber'],
} as const satisfies Record<Permission, readonly string[]>;
