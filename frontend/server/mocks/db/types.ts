// Tables du jeu simulé : formes proches de docs/specs/schema.sql (anglais, montants entiers en F CFA, dates ISO).
// Les réponses des handlers `/api/v1` sont construites à partir de ces lignes (mocks/views/*), jamais l'inverse.
import type { Feature, Permission } from '@cotiz/contracts'

export type Currency = 'XOF'
export type AssociationStatus = 'onboarding' | 'active' | 'past_due' | 'suspended' | 'closed'
export type ProjectStatus = 'draft' | 'enrolling' | 'active' | 'completed' | 'archived'
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
export type EnrollmentStatus = 'pending_signature' | 'active' | 'withdrawn' | 'completed'
export type PaymentStatus = 'pending' | 'validated' | 'rejected' | 'canceled'
export type PaymentMethodKind = 'bank_transfer' | 'mobile_money' | 'cash' | 'other'
export type ManagerRole = 'owner' | 'manager' | 'viewer'
export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand'

export interface PlanRow {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  limits: { projects: number | null, subscribers: number | null, managers: number | null }
  features: Feature[]
  isFeatured: boolean
  isActive: boolean
  archivedAt: string | null
  /** Associations abonnées sur toute la plateforme (chiffre illustratif des maquettes). */
  subscribersCount: number
  version: number
}

export interface PaymentMethodRow {
  id: string
  associationId: string
  kind: PaymentMethodKind
  label: string
  details: Record<string, string>
  instructions: string | null
  position: number
  isActive: boolean
}

export interface AssociationRow {
  id: string
  slug: string
  name: string
  type: string
  city: string
  country: string
  description: string | null
  logoFileId: string | null
  contactEmail: string
  contactPhone: string
  status: AssociationStatus
  currency: Currency
  timezone: string
  defaultGraceDays: number
  onboardingCompletedAt: string | null
  planId: string
  /** Comptes gestionnaires secondaires autorisés (surcharge du plan) ; `null` = limite du plan. */
  managerSeatsOverride: number | null
  createdAt: string
  lastActivityAt: string | null
  suspendedAt: string | null
  suspensionReason: string | null
  /** Statut rétabli à la réactivation. */
  statusBeforeSuspension: AssociationStatus | null
  version: number
}

export interface SubscriptionRow {
  id: string
  associationId: string
  planId: string
  billingPeriod: 'monthly' | 'yearly'
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled'
  currentPeriodStart: string
  currentPeriodEnd: string | null
  trialEndsOn: string | null
}

export interface InvoiceRow {
  id: string
  associationId: string
  number: string
  periodStart: string
  periodEnd: string
  amount: number
  status: 'draft' | 'open' | 'paid' | 'overdue' | 'void'
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  paymentReference: string | null
}

export interface UserRow {
  id: string
  /** Slug lisible (scripts, tests). */
  key: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  status: 'pending_activation' | 'active' | 'locked' | 'disabled'
  locale: string
  address: string | null
  city: string | null
  passwordChangedAt: string | null
  lastLoginAt: string | null
  version: number
}

export interface MembershipRow {
  associationId: string
  userId: string
  role: ManagerRole | 'subscriber'
  status: 'invited' | 'active' | 'removed'
  title: string | null
  joinedAt: string
}

export interface StaffRow {
  userId: string
  role: 'owner' | 'admin' | 'support'
  status: 'active' | 'invited'
}

export interface ProjectRow {
  id: string
  key: string
  associationId: string
  name: string
  description: string
  coverFileId: string | null
  coverFileName: string | null
  status: ProjectStatus
  scheduleType: 'fixed' | 'rolling'
  entryFee: number | null
  installmentAmount: number
  frequency: Frequency
  dueDay: number
  startDate: string
  endDate: string | null
  requiredSubscribers: number | null
  graceDays: number
  paymentMethods: { paymentMethodId: string, instructionsOverride: string | null }[]
  contractRequired: boolean
  financialTermsLockedAt: string | null
  closedAt: string | null
  createdAt: string
  version: number
}

export interface EnrollmentRow {
  id: string
  projectId: string
  userId: string
  status: EnrollmentStatus
  startsFrom: string
  joinedAt: string
  contractSignedAt: string | null
  withdrawnAt: string | null
}

export interface InstallmentRow {
  id: string
  enrollmentId: string
  projectId: string
  kind: 'entry_fee' | 'periodic'
  sequence: number
  dueDate: string
  amountDue: number
  /** Cumul des allocations confirmées (colonne persistée, mise à jour à la validation). */
  amountPaid: number
  /** Seuls `waived` et `canceled` sont persistés ; les autres statuts sont calculés (installmentStatus). */
  persistedStatus: 'open' | 'waived' | 'canceled'
  paidAt: string | null
}

export interface PaymentRow {
  id: string
  associationId: string
  projectId: string
  enrollmentId: string
  userId: string
  amountDeclared: number
  amountReceived: number | null
  paidOn: string
  paymentMethodId: string | null
  paymentMethodKind: PaymentMethodKind | null
  proof: { fileId: string | null, fileName: string | null, mimeType: string | null, transactionReference: string | null }
  comment: string | null
  status: PaymentStatus
  declaredAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejection: { reasonCode: 'unreadable_proof' | 'not_received' | 'amount_mismatch' | 'other', message: string | null } | null
  allocationAdjusted: boolean
  /** Répartition déclarée par le souscripteur : recréée en propositions si une validation est annulée. */
  declaredAllocations: { installmentId: string, amount: number }[]
  version: number
}

export interface AllocationRow {
  paymentId: string
  installmentId: string
  amount: number
  state: 'proposed' | 'confirmed' | 'voided'
}

export interface ContractRow {
  id: string
  projectId: string
  bodyTemplate: string
  signerName: string
  signerTitle: string
  associationSignedAt: string | null
  associationSignedBy: string | null
  lockedAt: string | null
  createdAt: string
  version: number
}

export interface NotificationRow {
  id: string
  userId: string
  associationId: string | null
  type: string
  title: string
  body: string
  actionUrl: string | null
  actionLabel: string | null
  readAt: string | null
  createdAt: string
}

export interface RequestRow {
  id: string
  key: string
  reference: string
  status: 'pending' | 'approved' | 'rejected'
  association: { name: string, type: string, city: string, country: string, registrationNumber: string | null, activityDescription: string }
  contact: { firstName: string, lastName: string, title: string, email: string, phone: string }
  needs: { estimatedSubscribers: '1_20' | '21_50' | '51_200' | '201_500' | '500_plus', plannedProjects: number | null, desiredPlanId: string | null, acquisitionSource: string | null }
  termsAcceptedAt: string
  createdAt: string
  viewedAt: string | null
  viewedBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  rejectionReasonCode: string | null
  rejectionMessage: string | null
  internalNote: string | null
  associationId: string | null
  /** Approbation : plan et comptes attribués (frise « plan Essentiel »). */
  approvedPlanId: string | null
}

export interface ReminderRuleRow {
  id: string
  associationId: string
  projectId: string | null
  trigger: 'before_due' | 'on_due' | 'after_due'
  offsetDays: number
  channels: ('in_app' | 'push' | 'email' | 'sms')[]
  message: string
  isActive: boolean
  createdAt: string
}

export interface ReminderRunRow {
  id: string
  associationId: string
  at: string
  kind: 'automatic' | 'manual'
  status: 'auto_sent' | 'to_handle' | 'handled' | 'dismissed'
  userId: string
  projectId: string
  installmentId: string | null
  channels: string[]
  message: string | null
  triggeredBy: string | null
  ruleId: string | null
}

export interface ActivationCodeRow {
  id: string
  associationId: string
  userId: string
  code: string
  issuedAt: string
  expiresAt: string
  handedAt: string | null
}

export interface PreferenceRow {
  userId: string
  type: string
  channel: 'in_app' | 'push' | 'email' | 'sms'
  enabled: boolean
}

/** Événement des frises (association plateforme, souscripteur) : données d'affichage des maquettes. */
export interface EventRow {
  id: string
  scope: 'association' | 'member'
  scopeId: string
  associationId: string | null
  at: string
  type: string
  title: string
  detail: string | null
  tone: Tone
  projectId: string | null
  by: string | null
}

/**
 * Souscripteurs et montants présents dans les compteurs des maquettes mais jamais nommés (« 52 souscripteurs »
 * alors que l'annuaire en détaille une douzaine). Ajoutés aux agrégats calculés, jamais listés.
 */
export interface UnlistedRow {
  scope: 'association' | 'project'
  scopeId: string
  members: number
  late: number
  activeMembers: number
  /** Montants (F CFA) : cumul collecté, attendu à date, collecté et attendu dans le mois. */
  collected: number
  expectedToDate: number
  collectedThisMonth: number
  expectedThisMonth: number
  lateAmount: number
}

export interface MockDb {
  today: string
  plans: PlanRow[]
  associations: AssociationRow[]
  paymentMethods: PaymentMethodRow[]
  subscriptions: SubscriptionRow[]
  invoices: InvoiceRow[]
  users: UserRow[]
  memberships: MembershipRow[]
  staff: StaffRow[]
  projects: ProjectRow[]
  enrollments: EnrollmentRow[]
  installments: InstallmentRow[]
  payments: PaymentRow[]
  allocations: AllocationRow[]
  contracts: ContractRow[]
  notifications: NotificationRow[]
  requests: RequestRow[]
  reminderRules: ReminderRuleRow[]
  reminderRuns: ReminderRunRow[]
  activationCodes: ActivationCodeRow[]
  preferences: PreferenceRow[]
  events: EventRow[]
  unlisted: UnlistedRow[]
  /** Fonctionnalités et permissions exposées par `GET /me` (maquettes : tout est visible, sauf les aperçus V2). */
  features: Feature[]
  permissions: Record<'platform' | 'association' | 'subscriber', Permission[]>
}
