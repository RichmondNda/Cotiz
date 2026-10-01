import { z } from 'zod';
import { DB_ENUMS } from '../generated/db-enums.js';

// Énumérations des échanges, prises telles quelles dans schema.sql (src/generated/db-enums.ts).

export const UserStatus = z.enum(DB_ENUMS.users_status);
export const SessionSpace = z.enum(DB_ENUMS.sessions_space);
export const PlatformRole = z.enum(DB_ENUMS.platform_staff_role);
export const MembershipRole = z.enum(DB_ENUMS.memberships_role);
export const MembershipStatus = z.enum(DB_ENUMS.memberships_status);
/** Rôles d'un gestionnaire (sans `subscriber`). */
export const ManagerRole = z.enum(['owner', 'manager', 'viewer']);
export const EstimatedSubscribers = z.enum(DB_ENUMS.association_requests_estimated_subscribers);
export const AssociationRequestStatus = z.enum(DB_ENUMS.association_requests_status);
export const AssociationStatus = z.enum(DB_ENUMS.associations_status);
export const PaymentMethodKind = z.enum(DB_ENUMS.association_payment_methods_kind);
export const BillingPeriod = z.enum(DB_ENUMS.subscriptions_billing_period);
export const SubscriptionStatus = z.enum(DB_ENUMS.subscriptions_status);
export const InvoiceStatus = z.enum(DB_ENUMS.invoices_status);
export const ProjectStatus = z.enum(DB_ENUMS.projects_status);
export const Frequency = z.enum(DB_ENUMS.projects_frequency);
export const ScheduleType = z.enum(DB_ENUMS.projects_schedule_type);
export const EnrollmentStatus = z.enum(DB_ENUMS.enrollments_status);
export const InstallmentKind = z.enum(DB_ENUMS.installments_kind);
export const InstallmentStatus = z.enum(DB_ENUMS.installments_status);
export const PaymentStatus = z.enum(DB_ENUMS.payments_status);
export const AllocationState = z.enum(DB_ENUMS.allocations_state);
export const ImportJobStatus = z.enum(DB_ENUMS.import_jobs_status);
export const ImportRowCategory = z.enum(DB_ENUMS.import_rows_category);
export const ReminderTrigger = z.enum(DB_ENUMS.reminder_rules_trigger);
export const ReminderRunKind = z.enum(DB_ENUMS.reminder_runs_kind);
export const ReminderRunStatus = z.enum(DB_ENUMS.reminder_runs_status);
export const NotificationChannel = z.enum(DB_ENUMS.notification_channel);
export const FilePurpose = z.enum(DB_ENUMS.files_purpose);
export const FileScanStatus = z.enum(DB_ENUMS.files_scan_status);
export const ExportKind = z.enum(DB_ENUMS.export_jobs_kind);
export const ExportStatus = z.enum(DB_ENUMS.export_jobs_status);
export const ResetRequestSpace = z.enum(DB_ENUMS.password_reset_requests_space);
export const ResetRequestStatus = z.enum(DB_ENUMS.password_reset_requests_status);
export const BankStatementStatus = z.enum(DB_ENUMS.bank_statements_status);
export const MatchStatus = z.enum(DB_ENUMS.statement_lines_match_status);
export const WebhookDeliveryStatus = z.enum(DB_ENUMS.webhook_deliveries_status);
export const PaymentIntentStatus = z.enum(DB_ENUMS.payment_intents_status);

/** Situation d'un souscripteur sur un projet (`memberStanding()`, docs/specs/domain-rules.md § 7). */
export const MemberStanding = z.enum(['signature_required', 'up_to_date', 'late', 'withdrawn', 'activation_pending']);

export type ProjectStatus = z.infer<typeof ProjectStatus>;
export type InstallmentStatus = z.infer<typeof InstallmentStatus>;
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export type MemberStanding = z.infer<typeof MemberStanding>;
