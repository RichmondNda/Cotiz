import { z } from 'zod';
import { AssociationIdentity, AssociationType, ContactPerson, RequestNeeds } from '../common/association.js';
import {
  AssociationRequestStatus,
  AssociationStatus,
  BillingPeriod,
  EstimatedSubscribers,
  InvoiceStatus,
  MemberStanding,
  PlatformRole,
  ProjectStatus,
  SubscriptionStatus,
} from '../common/enums.js';
import { Handoff } from '../common/handoff.js';
import { Facets, listOf, ListQuery } from '../common/list.js';
import { IdParams } from '../common/params.js';
import { Email, PersonContact, PersonRef, PhoneE164 } from '../common/people.js';
import { FeatureSchema, Plan, PlanRef, Quota, QuotaUsage } from '../common/plan.js';
import { Currency, Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Espace plateforme (super-admin), docs/ui/super-admin.md.

const read = 'platform.associations.read';
const manage = 'platform.associations.manage';

// ---------------------------------------------------------------- Demandes de création

export const AssociationRequestSummary = z
  .object({
    id: Uuid,
    reference: z.string(),
    status: AssociationRequestStatus,
    associationName: z.string(),
    associationType: AssociationType,
    city: z.string(),
    country: z.string(),
    contact: z.object({ firstName: z.string(), lastName: z.string(), email: Email }),
    estimatedSubscribers: EstimatedSubscribers,
    desiredPlan: PlanRef.nullable(),
    createdAt: Instant,
  })
  .meta({ id: 'AssociationRequestSummary' });

export const AssociationRequestDetail = AssociationRequestSummary.extend({
  association: AssociationIdentity.extend({ activityDescription: z.string() }),
  contact: ContactPerson.extend({ title: z.string() }),
  needs: RequestNeeds,
  termsAcceptedAt: Instant,
  decision: z
    .object({
      decidedAt: Instant,
      decidedBy: PersonRef,
      rejectionReasonCode: z.string().nullable(),
      rejectionMessage: z.string().nullable(),
      /** Association créée à l'approbation. */
      associationId: Uuid.nullable(),
    })
    .nullable(),
  /** Note interne, jamais visible par l'association. */
  internalNote: z.string().nullable(),
  /** Première ouverture par la plateforme (« Consultée par Richy ») ; `null` tant que personne ne l'a ouverte. */
  viewedAt: Instant.nullable(),
  viewedBy: PersonRef.nullable(),
  /** Frise : reçue, puis décision. */
  history: z.array(
    z.object({ type: z.enum(['received', 'approved', 'rejected']), at: Instant, by: PersonRef.nullable() }),
  ),
}).meta({ id: 'AssociationRequestDetail' });
export type AssociationRequestDetail = z.infer<typeof AssociationRequestDetail>;

export const AssociationRequestsQuery = ListQuery.extend({
  status: AssociationRequestStatus.optional(),
  /** Recherche par nom d'association ou email du responsable. */
  q: z.string().min(1).optional(),
  country: z.string().optional(),
  desiredPlanId: Uuid.optional(),
});

export const pfReqList = defineEndpoint({
  id: 'pf.req.list',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/association-requests',
      request: { query: AssociationRequestsQuery },
      response: { status: 200, body: listOf(AssociationRequestSummary) },
    },
  },
});

export const pfReqGet = defineEndpoint({
  id: 'pf.req.get',
  space: 'platform',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/platform/association-requests/{id}',
      request: { params: IdParams },
      response: { status: 200, body: AssociationRequestDetail },
    },
  },
});

export const ApproveRequestInput = z.object({
  planId: Uuid,
  /** Période de facturation ; mensuelle si absente (le formulaire ne la propose pas). */
  billingPeriod: BillingPeriod.optional(),
  /** Comptes gestionnaires autorisés (défaut selon le plan). */
  managerSeats: z.int().min(1),
  subscriptionStartsOn: IsoDate,
  internalNote: z.string().max(2000).optional(),
  /** Mot personnel ajouté au message prêt. */
  personalMessage: z.string().max(1000).optional(),
});

/** L'espace est créé ; les accès du gestionnaire sont à transmettre soi-même (aucun email envoyé). */
export const RequestApproved = z.object({
  request: AssociationRequestDetail,
  associationId: Uuid,
  handoff: Handoff,
});

export const pfReqApprove = defineEndpoint({
  id: 'pf.req.approve',
  space: 'platform',
  permission: 'platform.requests.manage',
  errors: ['request_already_handled', 'email_already_owner'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    approve: {
      method: 'POST',
      path: '/api/v1/platform/association-requests/{id}/approve',
      request: { params: IdParams, body: ApproveRequestInput },
      response: { status: 200, body: RequestApproved },
    },
  },
});

export const RejectRequestInput = z.object({
  reasonCode: z.string().min(1).max(60),
  message: z.string().max(2000).optional(),
});

export const pfReqReject = defineEndpoint({
  id: 'pf.req.reject',
  space: 'platform',
  permission: 'platform.requests.manage',
  errors: ['request_already_handled'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    reject: {
      method: 'POST',
      path: '/api/v1/platform/association-requests/{id}/reject',
      request: { params: IdParams, body: RejectRequestInput },
      response: { status: 200, body: AssociationRequestDetail },
    },
  },
});

// ---------------------------------------------------------------- Associations

export const PlatformAssociationSummary = z.object({
  id: Uuid,
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  logoFileId: Uuid.nullable(),
  status: AssociationStatus,
  plan: PlanRef,
  projectsCount: z.int().nonnegative(),
  subscribersCount: z.int().nonnegative(),
  lastActivityAt: Instant.nullable(),
  createdAt: Instant,
});

export const PlatformAssociationsQuery = ListQuery.extend({
  status: AssociationStatus.optional(),
  planId: Uuid.optional(),
  country: z.string().optional(),
  q: z.string().min(1).optional(),
});

export const pfAssoList = defineEndpoint({
  id: 'pf.asso.list',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/associations',
      request: { query: PlatformAssociationsQuery },
      response: { status: 200, body: listOf(PlatformAssociationSummary) },
    },
  },
});

export const PlatformSubscription = z
  .object({
    id: Uuid,
    plan: PlanRef,
    billingPeriod: BillingPeriod,
    status: SubscriptionStatus,
    price: Money,
    currentPeriodStart: IsoDate,
    currentPeriodEnd: IsoDate.nullable(),
    trialEndsOn: IsoDate.nullable(),
    /** Surcharge du nombre de comptes gestionnaires du plan. */
    managerSeatsOverride: z.int().min(1).nullable(),
  })
  .meta({ id: 'PlatformSubscription' });

export const PlatformAssociationDetail = PlatformAssociationSummary.extend({
  type: AssociationType,
  description: z.string().nullable(),
  contactEmail: Email,
  contactPhone: PhoneE164,
  currency: Currency,
  timezone: z.string(),
  suspendedAt: Instant.nullable(),
  suspensionReason: z.string().nullable(),
  onboardingCompletedAt: Instant.nullable(),
  /** Gestionnaire principal (owner). */
  owner: PersonContact,
  managers: z.array(PersonContact.extend({ role: z.enum(['owner', 'manager', 'viewer']) })),
  subscription: PlatformSubscription,
  quotas: z.object({ projects: QuotaUsage, subscribers: QuotaUsage, managers: QuotaUsage }),
  kpi: z.object({
    activeProjects: z.int().nonnegative(),
    subscribers: z.int().nonnegative(),
    collectedTotal: Money,
    /** Taux de recouvrement entre 0 et 1 ; `null` sans échéance échue. */
    recoveryRate: z.number().min(0).max(1).nullable(),
  }),
  /** Frise du compte : création, suspension, changement de plan… */
  events: z.array(z.object({ type: z.string(), at: Instant, by: PersonRef.nullable(), detail: z.string().nullable() })),
  /** Verrouillage optimiste (`If-Match` de `pf.asso.patch`). */
  version: z.int().min(1),
}).meta({ id: 'PlatformAssociationDetail' });
export type PlatformAssociationDetail = z.infer<typeof PlatformAssociationDetail>;

export const CreateAssociationInput = z.object({
  association: AssociationIdentity.extend({
    description: z.string().max(500).nullable().optional(),
    /** Identifiant d'URL ; déduit du nom si absent. */
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60)
      .optional(),
  }),
  owner: ContactPerson,
  subscription: z.object({
    planId: Uuid,
    billingPeriod: BillingPeriod.optional(),
    startsOn: IsoDate,
    managerSeats: z.int().min(1),
    /** Période d'essai en jours ; `null` = pas d'essai. */
    trialDays: z.int().min(1).max(365).nullable(),
  }),
  /** « Envoyer les identifiants maintenant » : renvoie le message prêt. */
  issueCredentialsNow: z.boolean(),
});

export const AssociationCreated = z.object({ association: PlatformAssociationDetail, handoff: Handoff.nullable() });

export const pfAssoCreate = defineEndpoint({
  id: 'pf.asso.create',
  space: 'platform',
  permission: manage,
  errors: ['slug_taken', 'email_already_owner'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/platform/associations',
      request: { body: CreateAssociationInput },
      response: { status: 201, body: AssociationCreated },
    },
  },
});

export const pfAssoGet = defineEndpoint({
  id: 'pf.asso.get',
  space: 'platform',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/platform/associations/{id}',
      request: { params: IdParams },
      response: { status: 200, body: PlatformAssociationDetail },
    },
  },
});

export const PatchAssociationInput = z
  .object({
    name: z.string().min(2).max(120),
    type: AssociationType,
    city: z.string().min(1).max(80),
    country: z.string().min(2).max(80),
    description: z.string().max(500).nullable(),
    contactEmail: Email,
    contactPhone: PhoneE164,
    managerSeatsOverride: z.int().min(1).nullable(),
  })
  .partial();

export const pfAssoPatch = defineEndpoint({
  id: 'pf.asso.patch',
  space: 'platform',
  permission: manage,
  errors: ['version_conflict'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    patch: {
      method: 'PATCH',
      path: '/api/v1/platform/associations/{id}',
      request: { params: IdParams, body: PatchAssociationInput },
      response: { status: 200, body: PlatformAssociationDetail },
    },
  },
});

export const SuspendAssociationInput = z.object({
  reason: z.string().min(1).max(500),
  /** Saisie du nom de l'association (confirmation renforcée). */
  confirmName: z.string().min(1),
});

export const pfAssoSuspend = defineEndpoint({
  id: 'pf.asso.suspend',
  space: 'platform',
  permission: manage,
  errors: ['invalid_state'],
  flags: { ...noFlags, audited: true },
  operations: {
    suspend: {
      method: 'POST',
      path: '/api/v1/platform/associations/{id}/suspend',
      request: { params: IdParams, body: SuspendAssociationInput },
      response: { status: 200, body: PlatformAssociationDetail },
    },
    reactivate: {
      method: 'POST',
      path: '/api/v1/platform/associations/{id}/reactivate',
      request: { params: IdParams },
      response: { status: 200, body: PlatformAssociationDetail },
    },
  },
});

export const ChangePlanInput = z.object({
  planId: Uuid,
  effectiveOn: IsoDate,
  billingPeriod: BillingPeriod.optional(),
});

export const pfAssoPlan = defineEndpoint({
  id: 'pf.asso.plan',
  space: 'platform',
  permission: manage,
  errors: ['quota_exceeded', 'invalid_state'],
  flags: { ...noFlags, audited: true },
  operations: {
    changePlan: {
      method: 'POST',
      path: '/api/v1/platform/associations/{id}/change-plan',
      request: { params: IdParams, body: ChangePlanInput },
      response: { status: 200, body: PlatformSubscription },
    },
  },
});

// ---------------------------------------------------------------- Plans

export const PlanList = z.object({ items: z.array(Plan) });

export const pfPlans = defineEndpoint({
  id: 'pf.plans',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: { method: 'GET', path: '/api/v1/platform/plans', request: {}, response: { status: 200, body: PlanList } },
  },
});

export const PlanInput = z.object({
  code: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(40),
  name: z.string().min(1).max(60),
  description: z.string().max(200).nullable(),
  /** Montants dans la devise du plan (F CFA par défaut). */
  priceMonthly: Money,
  priceYearly: Money,
  limits: z.object({ projects: Quota, subscribers: Quota, managers: Quota }),
  features: z.array(FeatureSchema),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
});

export const pfPlanWrite = defineEndpoint({
  id: 'pf.plan.write',
  space: 'platform',
  permission: 'platform.plans.manage',
  errors: ['code_taken', 'version_conflict'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    /** Création : aucune version à vérifier (If-Match pour la seule modification). */
    create: {
      method: 'POST',
      path: '/api/v1/platform/plans',
      ifMatch: false,
      request: { body: PlanInput },
      response: { status: 201, body: Plan },
    },
    patch: {
      method: 'PATCH',
      path: '/api/v1/platform/plans/{id}',
      request: { params: IdParams, body: PlanInput.partial() },
      response: { status: 200, body: Plan },
    },
  },
});

export const pfPlanArchive = defineEndpoint({
  id: 'pf.plan.archive',
  space: 'platform',
  permission: 'platform.plans.manage',
  errors: ['invalid_state'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** Les associations abonnées gardent le plan archivé. */
    archive: {
      method: 'POST',
      path: '/api/v1/platform/plans/{id}/archive',
      request: { params: IdParams },
      response: { status: 200, body: Plan },
    },
    duplicate: {
      method: 'POST',
      path: '/api/v1/platform/plans/{id}/duplicate',
      request: { params: IdParams },
      response: { status: 201, body: Plan },
    },
  },
});

// ---------------------------------------------------------------- Tableau de bord, détail, usage

export const PlatformDashboard = z.object({
  pendingRequests: z.int().nonnegative(),
  /** Les 3 plus anciennes demandes à traiter. */
  oldestPendingRequests: z.array(AssociationRequestSummary).max(3),
  kpi: z.object({
    activeAssociations: z.int().nonnegative(),
    newAssociationsThisMonth: z.int().nonnegative(),
    totalAssociations: z.int().nonnegative(),
    subscribers: z.int().nonnegative(),
    monthlyRecurringRevenue: Money,
    subscriptionsUpToDate: z.int().nonnegative(),
    subscriptionsUnpaid: z.int().nonnegative(),
  }),
  /** Associations actives sur 12 mois, du plus ancien au plus récent (premier jour du mois). */
  activeAssociationsByMonth: z.array(z.object({ month: IsoDate, count: z.int().nonnegative() })),
  associationsByPlan: z.array(z.object({ plan: PlanRef, count: z.int().nonnegative() })),
  watchlist: z.array(
    z.object({
      associationId: Uuid,
      name: z.string(),
      signal: z.enum(['unpaid', 'inactive', 'quota']),
      since: IsoDate.nullable(),
    }),
  ),
  /** 10 derniers événements : nouvelle association, suspension, changement de plan… */
  activity: z.array(z.object({ type: z.string(), at: Instant, associationId: Uuid, associationName: z.string() })),
});

export const pfDashboard = defineEndpoint({
  id: 'pf.dashboard',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/platform/dashboard',
      request: {},
      response: { status: 200, body: PlatformDashboard },
    },
  },
});

export const PlatformAssociationProject = z.object({
  id: Uuid,
  name: z.string(),
  status: ProjectStatus,
  subscribersCount: z.int().nonnegative(),
  collected: Money,
  createdAt: Instant,
});

export const PlatformAssociationMember = z.object({
  user: PersonContact,
  projectsCount: z.int().nonnegative(),
  /** Pire situation de ses projets. */
  standing: MemberStanding,
});

export const pfAssoSub = defineEndpoint({
  id: 'pf.asso.sub',
  space: 'platform',
  permission: read,
  errors: [],
  flags: { ...noFlags, audited: true },
  operations: {
    projects: {
      method: 'GET',
      path: '/api/v1/platform/associations/{id}/projects',
      request: { params: IdParams, query: ListQuery },
      response: { status: 200, body: listOf(PlatformAssociationProject) },
    },
    members: {
      method: 'GET',
      path: '/api/v1/platform/associations/{id}/members',
      request: { params: IdParams, query: ListQuery.extend({ q: z.string().min(1).optional() }) },
      response: { status: 200, body: listOf(PlatformAssociationMember) },
    },
  },
});

export const UsageDay = z.object({
  day: IsoDate,
  logins: z.int().nonnegative(),
  activeUsers: z.int().nonnegative(),
  paymentsDeclared: z.int().nonnegative(),
  paymentsValidated: z.int().nonnegative(),
  /** Délai moyen de validation, en heures (indicateur, pas un montant). */
  avgValidationHours: z.number().nonnegative(),
});

export const pfAssoUsage = defineEndpoint({
  id: 'pf.asso.usage',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/platform/associations/{id}/usage',
      request: { params: IdParams, query: z.object({ from: IsoDate.optional(), to: IsoDate.optional() }) },
      response: { status: 200, body: z.object({ days: z.array(UsageDay) }) },
    },
  },
});

// ---------------------------------------------------------------- Facturation

export const PlatformInvoice = z.object({
  id: Uuid,
  number: z.string(),
  association: z.object({ id: Uuid, name: z.string() }),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  amount: Money,
  status: InvoiceStatus,
  issuedAt: Instant.nullable(),
  dueAt: Instant.nullable(),
  paidAt: Instant.nullable(),
  paymentReference: z.string().nullable(),
  pdfFileId: Uuid.nullable(),
});

export const PlatformInvoiceList = listOf(PlatformInvoice).extend({
  /** KPI de la facturation globale. */
  summary: z.object({ revenueThisMonth: Money, collected: Money, pending: Money, overdue: Money }),
  facets: Facets.optional(),
});

export const pfInvoices = defineEndpoint({
  id: 'pf.invoices',
  space: 'platform',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/invoices',
      request: {
        query: ListQuery.extend({ status: InvoiceStatus.optional(), associationId: Uuid.optional() }),
      },
      response: { status: 200, body: PlatformInvoiceList },
    },
  },
});

export const pfInvoicePaid = defineEndpoint({
  id: 'pf.invoice.paid',
  space: 'platform',
  permission: 'platform.billing.manage',
  errors: ['invalid_state'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    markPaid: {
      method: 'POST',
      path: '/api/v1/platform/invoices/{id}/mark-paid',
      request: {
        params: IdParams,
        body: z.object({ paidOn: IsoDate, paymentReference: z.string().max(120).optional() }),
      },
      response: { status: 200, body: PlatformInvoice },
    },
  },
});

// ---------------------------------------------------------------- Personnel et audit

export const StaffMember = z.object({
  user: PersonRef.extend({ email: Email }),
  role: PlatformRole,
  status: z.enum(['active', 'invited']),
  lastLoginAt: Instant.nullable(),
});

export const UserParams = z.object({ uid: Uuid });

export const pfStaff = defineEndpoint({
  id: 'pf.staff',
  space: 'platform',
  permission: 'platform.staff.manage',
  errors: ['last_owner'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/staff',
      request: {},
      response: { status: 200, body: z.object({ items: z.array(StaffMember) }) },
    },
    /** Invitation par code à 8 caractères affiché une fois, à transmettre soi-même. */
    invite: {
      method: 'POST',
      path: '/api/v1/platform/staff/invitations',
      request: {
        body: z.object({
          firstName: z.string().min(1).max(80),
          lastName: z.string().min(1).max(80),
          email: Email,
          role: PlatformRole,
        }),
      },
      response: { status: 201, body: z.object({ member: StaffMember, handoff: Handoff }) },
    },
    patch: {
      method: 'PATCH',
      path: '/api/v1/platform/staff/{uid}',
      request: { params: UserParams, body: z.object({ role: PlatformRole }) },
      response: { status: 200, body: StaffMember },
    },
    remove: {
      method: 'DELETE',
      path: '/api/v1/platform/staff/{uid}',
      request: { params: UserParams },
      response: { status: 204 },
    },
  },
});

export const AuditEntry = z.object({
  /** Identifiant séquentiel (bigserial), transmis en chaîne. */
  id: z.string().regex(/^\d+$/),
  occurredAt: Instant,
  actor: PersonRef.nullable(),
  actorRole: z.string(),
  associationId: Uuid.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: Uuid.nullable(),
  ip: z.string().nullable(),
});

export const pfAudit = defineEndpoint({
  id: 'pf.audit',
  space: 'platform',
  permission: 'platform.audit.read',
  errors: [],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/platform/audit-logs',
      request: {
        query: ListQuery.extend({
          actorUserId: Uuid.optional(),
          action: z.string().optional(),
          associationId: Uuid.optional(),
          from: Instant.optional(),
          to: Instant.optional(),
        }),
      },
      response: { status: 200, body: listOf(AuditEntry) },
    },
  },
});
