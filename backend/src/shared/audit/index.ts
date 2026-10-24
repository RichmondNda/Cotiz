// Journal d'audit en ajout seul (architecture/02, 13) : @Audited sur les cas d'usage sensibles.
export { auditDiff, MASKED, maskPhone } from './audit-diff.js';
export { Audited, type AuditRecord, recordAudit } from './audited.js';
export {
  type AuditTrailEntry,
  platformAuditTrailOf,
  type PlatformActivityEntry,
  platformRecentActivityOf,
} from './audit-trail.js';
