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
