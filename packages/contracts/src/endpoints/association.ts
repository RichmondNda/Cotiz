import { z } from 'zod';
import { AssociationType } from '../common/association.js';
import { AssociationStatus, BillingPeriod, InvoiceStatus, SubscriptionStatus } from '../common/enums.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationIdParams, AssociationParams } from '../common/params.js';
import { PaymentMethod, PaymentMethodInput } from '../common/payment-method.js';
import { Email, PersonRef, PhoneE164 } from '../common/people.js';
import { PublicPlan, QuotaUsage } from '../common/plan.js';
import { PaymentSummary } from '../common/ledger.js';
import { ProjectRef, ProjectSummary } from '../common/project.js';
import { Currency, Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';
import { StoredFile, UploadRequest, UploadTicket } from './common.js';

// Espace association : profil, moyens de paiement, onboarding, abonnement, tableau de bord (docs/ui/manager.md).

export const Association = z
  .object({
    id: Uuid,
    slug: z.string(),
    name: z.string(),
    type: AssociationType,
    city: z.string(),
    country: z.string(),
    description: z.string().nullable(),
    logoFileId: Uuid.nullable(),
    contactEmail: Email,
    contactPhone: PhoneE164,
    status: AssociationStatus,
    currency: Currency,
    timezone: z.string(),
    /** Délai de grâce proposé par défaut aux nouveaux projets. */
    defaultGraceDays: z.int().min(0).max(90),
    /** `null` : configuration incomplète (bandeau du tableau de bord). */
    onboardingCompletedAt: Instant.nullable(),
    version: z.int().min(1),
  })
  .meta({ id: 'Association' });
export type Association = z.infer<typeof Association>;

export const PatchAssociationProfile = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).nullable(),
    city: z.string().min(1).max(80),
    contactEmail: Email,
    contactPhone: PhoneE164,
    /** Fichier de l'association déposé par `as.upload` (purpose `logo`), analysé et sain. */
    logoFileId: Uuid.nullable(),
    defaultGraceDays: z.int().min(0).max(90),
  })
  .partial();

export const asGet = defineEndpoint({
  id: 'as.get',
  space: 'association',
  permission: 'association.read',
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}',
      request: { params: AssociationParams },
      response: { status: 200, body: Association },
    },
  },
});

export const asPatch = defineEndpoint({
  id: 'as.patch',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['version_conflict'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}',
      request: { params: AssociationParams, body: PatchAssociationProfile },
      response: { status: 200, body: Association },
    },
  },
});

/** Dépôt d'un fichier de l'association : le logo seulement au lot 2.1 (couverture, imports, relevés ensuite). */
export const AssociationUploadRequest = UploadRequest.extend({ purpose: z.literal('logo') });

export const asUpload = defineEndpoint({
  id: 'as.upload',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['file_too_large', 'file_type_not_allowed', 'file_not_clean'],
  flags: { ...noFlags, rateLimited: true },
  operations: {
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/uploads',
      request: { params: AssociationParams, body: AssociationUploadRequest },
      response: { status: 201, body: UploadTicket },
    },
    /** Confirme le dépôt ; l'analyse se poursuit dans le worker. */
    complete: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/uploads/{id}/complete',
      request: { params: AssociationIdParams },
      response: { status: 202, body: StoredFile },
    },
  },
});

export const asFile = defineEndpoint({
  id: 'as.file',
  space: 'association',
  permission: 'association.read',
  errors: ['not_found'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** Redirection 302 vers une URL signée valable 5 min. */
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/files/{id}',
      request: { params: AssociationIdParams },
      response: { status: 302 },
    },
  },
});

export const PaymentMethodList = z.object({ items: z.array(PaymentMethod) });

export const asPm = defineEndpoint({
  id: 'as.pm',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['validation_failed'],
  flags: { ...noFlags, audited: true },
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/payment-methods',
      request: { params: AssociationParams },
      response: { status: 200, body: PaymentMethodList },
    },
    /** Remplacement complet de la liste. */
    replace: {
      method: 'PUT',
      path: '/api/v1/associations/{aid}/payment-methods',
      request: { params: AssociationParams, body: z.object({ items: z.array(PaymentMethodInput).max(20) }) },
      response: { status: 200, body: PaymentMethodList },
    },
  },
});

export const asOnb = defineEndpoint({
  id: 'as.onb',
  space: 'association',
  permission: 'association.settings.manage',
  errors: ['onboarding_incomplete'],
  flags: noFlags,
  operations: {
    complete: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/onboarding/complete',
      request: { params: AssociationParams },
      response: { status: 200, body: Association },
    },
  },
});

export const AssociationSubscription = z.object({
  plan: PublicPlan,
  billingPeriod: BillingPeriod,
  status: SubscriptionStatus,
  price: Money,
  currentPeriodStart: IsoDate,
  currentPeriodEnd: IsoDate.nullable(),
  trialEndsOn: IsoDate.nullable(),
  quotas: z.object({ projects: QuotaUsage, subscribers: QuotaUsage, managers: QuotaUsage }),
});

export const blSub = defineEndpoint({
  id: 'bl.sub',
  space: 'association',
  permission: 'association.read',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/subscription',
      request: { params: AssociationParams },
      response: { status: 200, body: AssociationSubscription },
    },
  },
});

export const AssociationInvoice = z.object({
  id: Uuid,
  number: z.string(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  amount: Money,
  status: InvoiceStatus,
  issuedAt: Instant.nullable(),
  dueAt: Instant.nullable(),
  paidAt: Instant.nullable(),
  pdfFileId: Uuid.nullable(),
});

export const blInv = defineEndpoint({
  id: 'bl.inv',
  space: 'association',
  permission: 'association.read',
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/invoices',
      request: { params: AssociationParams, query: ListQuery },
      response: { status: 200, body: listOf(AssociationInvoice) },
    },
  },
});

/** Mois d'un graphique « attendu vs reçu » (premier jour du mois). */
export const MonthlyCollection = z.object({ month: IsoDate, expected: Money, received: Money });

export const ManagerDashboard = z.object({
  collectedThisMonth: Money,
  expectedThisMonth: Money,
  paymentsToReview: z.object({ count: z.int().nonnegative(), oldestDeclaredAt: Instant.nullable() }),
  lateSubscribers: z.object({ count: z.int().nonnegative(), activeCount: z.int().nonnegative() }),
  /** Taux de recouvrement global, entre 0 et 1. */
  recoveryRate: z.number().min(0).max(1).nullable(),
  subscribersCount: z.int().nonnegative(),
  projectsCount: z.int().nonnegative(),
  /** Comptes non activés (« Codes à remettre »). */
  activationCodesToHand: z.int().nonnegative(),
  /** Contrats non signés depuis plus de 7 jours. */
  unsignedContracts: z.array(z.object({ enrollmentId: Uuid, member: PersonRef, project: ProjectRef, since: Instant })),
  /** 6 derniers mois, le dernier est le mois en cours. */
  monthlyCollection: z.array(MonthlyCollection),
  /** Projets triés par nombre de retards. */
  projects: z.array(ProjectSummary),
  /** 5 derniers paiements déclarés. */
  latestPayments: z.array(PaymentSummary).max(5),
});

export const asDashboard = defineEndpoint({
  id: 'as.dashboard',
  space: 'association',
  permission: 'association.read',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/dashboard',
      request: { params: AssociationParams },
      response: { status: 200, body: ManagerDashboard },
    },
  },
});
