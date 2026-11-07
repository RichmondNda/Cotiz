import { z } from 'zod';
import { FEATURES } from '../generated/features.js';
import { PERMISSIONS } from '../generated/permissions.js';
import {
  AssociationStatus,
  MemberStanding,
  MembershipRole,
  NotificationChannel,
  PaymentMethodKind,
  PlatformRole,
  ProjectStatus,
  SessionSpace,
} from '../common/enums.js';
import { AllocationInput, CoveredInstallment, Installment, PaymentProof, Rejection } from '../common/ledger.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationParams } from '../common/params.js';
import { PaymentMethod } from '../common/payment-method.js';
import { Email, NewPassword, PhoneE164 } from '../common/people.js';
import { FinancialTerms, ProjectRef } from '../common/project.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { PaymentStatus } from '../common/enums.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Espace de la personne connectée : identité (`me`, `me.profile`, `me.prefs`) et espace souscripteur
// (docs/ui/subscriber.md).

const self = 'subscriber.self';

// ---------------------------------------------------------------- Identité, droits, fonctionnalités

export const AssociationRef = z
  .object({ id: Uuid, name: z.string(), logoFileId: Uuid.nullable() })
  .meta({ id: 'AssociationRef' });
export type AssociationRef = z.infer<typeof AssociationRef>;

export const Me = z.object({
  user: z.object({
    id: Uuid,
    firstName: z.string(),
    lastName: z.string(),
    email: Email.nullable(),
    phone: PhoneE164.nullable(),
    locale: z.string(),
  }),
  space: SessionSpace,
  /** Association de la session (espace association) ; `null` ailleurs. */
  currentAssociationId: Uuid.nullable(),
  memberships: z.array(
    z.object({
      association: AssociationRef.extend({ slug: z.string(), status: AssociationStatus }),
      role: MembershipRole,
      /** Fonction affichée sous le nom (« Trésorière ») ; `null` si non renseignée. */
      title: z.string().nullable(),
    }),
  ),
  platformRole: PlatformRole.nullable(),
  /** Permissions de l'espace courant (permissions.yaml) : le front masque, le back refuse. */
  permissions: z.array(z.enum(PERMISSIONS)),
  /** Fonctionnalités actives ; une absente → « Bientôt disponible ». */
  features: z.array(z.enum(FEATURES)),
});
export type Me = z.infer<typeof Me>;

export const me = defineEndpoint({
  id: 'me',
  space: 'me',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    get: { method: 'GET', path: '/api/v1/me', request: {}, response: { status: 200, body: Me } },
  },
});

export const Profile = z.object({
  id: Uuid,
  firstName: z.string(),
  lastName: z.string(),
  email: Email.nullable(),
  /** Souscripteur : non modifiable ici (« Contactez votre association »). */
  phone: PhoneE164.nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  locale: z.string(),
  passwordChangedAt: Instant.nullable(),
  mfaEnabled: z.boolean(),
  version: z.int().min(1),
});

export const meProfile = defineEndpoint({
  id: 'me.profile',
  space: 'me',
  permission: 'authenticated',
  errors: ['invalid_credentials', 'weak_password', 'version_conflict'],
  flags: { ...noFlags, audited: true },
  operations: {
    get: { method: 'GET', path: '/api/v1/me/profile', request: {}, response: { status: 200, body: Profile } },
    patch: {
      method: 'PATCH',
      path: '/api/v1/me/profile',
      request: {
        body: z
          .object({
            firstName: z.string().min(1).max(80),
            lastName: z.string().min(1).max(80),
            email: Email.nullable(),
            address: z.string().max(200).nullable(),
            city: z.string().max(80).nullable(),
            locale: z.string().min(2).max(10),
          })
          .partial(),
      },
      response: { status: 200, body: Profile },
    },
    /** Les autres sessions sont révoquées. */
    changePassword: {
      method: 'PUT',
      path: '/api/v1/me/password',
      request: { body: z.object({ currentPassword: z.string().min(1), newPassword: NewPassword }) },
      response: { status: 204 },
    },
  },
});

export const NotificationPreferences = z.object({
  items: z.array(z.object({ type: z.string(), channel: NotificationChannel, enabled: z.boolean() })),
  /** Canaux proposés : `in_app`, `push` ; `sms`, `email` seulement si la fonctionnalité est activée. */
  availableChannels: z.array(NotificationChannel),
});

export const mePrefs = defineEndpoint({
  id: 'me.prefs',
  space: 'me',
  permission: 'authenticated',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/me/notification-preferences',
      request: {},
      response: { status: 200, body: NotificationPreferences },
    },
    replace: {
      method: 'PUT',
      path: '/api/v1/me/notification-preferences',
      request: { body: NotificationPreferences.pick({ items: true }) },
      response: { status: 200, body: NotificationPreferences },
    },
  },
});

// ---------------------------------------------------------------- Projets et échéances du souscripteur

/** Carte projet souscripteur (tableau de bord, mes projets, association). */
export const SubscriberProjectCard = z
  .object({
    enrollmentId: Uuid,
    project: ProjectRef.extend({ status: ProjectStatus }),
    association: AssociationRef,
    standing: MemberStanding,
    paid: Money,
    remaining: Money,
    /** Dates fixes : engagement total ; `null` pour un cycle roulant. */
    commitment: Money.nullable(),
    progress: z.number().min(0).max(1).nullable(),
    late: z.object({ count: z.int().min(1), amount: Money, since: IsoDate }).nullable(),
    nextDue: z.object({ dueDate: IsoDate, amount: Money }).nullable(),
  })
  .meta({ id: 'SubscriberProjectCard' });
export type SubscriberProjectCard = z.infer<typeof SubscriberProjectCard>;

/** Paiement déclaré, vu par le souscripteur. */
export const SubscriberPayment = z
  .object({
    id: Uuid,
    status: PaymentStatus,
    amountDeclared: Money,
    amountReceived: Money.nullable(),
    paidOn: IsoDate,
    declaredAt: Instant,
    /** Moyen choisi ; `null` si non précisé. */
    paymentMethodKind: PaymentMethodKind.nullable(),
    project: ProjectRef,
    association: AssociationRef,
    covered: z.array(CoveredInstallment),
    proof: PaymentProof,
    rejection: Rejection.nullable(),
    reviewedAt: Instant.nullable(),
  })
  .meta({ id: 'SubscriberPayment' });
export type SubscriberPayment = z.infer<typeof SubscriberPayment>;

export const SubscriberDashboard = z.object({
  /** Toutes associations confondues. */
  remainingTotal: Money,
  projectsCount: z.int().nonnegative(),
  associationsCount: z.int().nonnegative(),
  late: z.object({ count: z.int().min(1), amount: Money }).nullable(),
  nextDue: z.object({ project: ProjectRef, association: AssociationRef, dueDate: IsoDate, amount: Money }).nullable(),
  contractsToSign: z.array(z.object({ project: ProjectRef, association: AssociationRef })),
  /** Triés : retard, signature, prochaine échéance. */
  projects: z.array(SubscriberProjectCard),
  /** 3 derniers mouvements. */
  recentPayments: z.array(SubscriberPayment).max(3),
});

export const meDash = defineEndpoint({
  id: 'me.dash',
  space: 'me',
  permission: self,
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/me/dashboard',
      request: {},
      response: { status: 200, body: SubscriberDashboard },
    },
  },
});

export const meProjects = defineEndpoint({
  id: 'me.projects',
  space: 'me',
  permission: self,
  errors: [],
  flags: noFlags,
  operations: {
    /** Sert aussi au sélecteur de la déclaration : échéances ouvertes de chaque projet. */
    list: {
      method: 'GET',
      path: '/api/v1/me/projects',
      request: {},
      response: {
        status: 200,
        body: z.object({ items: z.array(SubscriberProjectCard.extend({ openInstallments: z.array(Installment) })) }),
      },
    },
  },
});

export const ProjectParamsMe = z.object({ pid: Uuid });

export const SubscriberProjectDetail = SubscriberProjectCard.extend({
  terms: FinancialTerms,
  installments: z.array(Installment),
  /** Plus récents d'abord. */
  payments: z.array(SubscriberPayment),
  /** Moyens retenus pour le projet, avec leurs consignes. */
  paymentMethods: z.array(PaymentMethod),
  contract: z.object({ required: z.boolean(), signedAt: Instant.nullable() }),
});

export const meProject = defineEndpoint({
  id: 'me.project',
  space: 'me',
  permission: self,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/me/projects/{pid}',
      request: { params: ProjectParamsMe },
      response: { status: 200, body: SubscriberProjectDetail },
    },
  },
});

// ---------------------------------------------------------------- Déclaration

export const AllocationPreviewInput = z.object({ projectId: Uuid, amount: Money });

/** Résultat de `proposeAllocation()` (aucune écriture). */
export const AllocationPreview = z.object({ allocations: z.array(AllocationInput), remainingAfter: Money });

export const meAlloc = defineEndpoint({
  id: 'me.alloc',
  space: 'me',
  permission: self,
  errors: ['amount_exceeds_remaining'],
  flags: noFlags,
  operations: {
    preview: {
      method: 'POST',
      path: '/api/v1/me/payments/allocation-preview',
      request: { body: AllocationPreviewInput },
      response: { status: 200, body: AllocationPreview },
    },
  },
});

export const DeclarePaymentInput = z
  .object({
    projectId: Uuid,
    amount: Money,
    paidOn: IsoDate,
    paymentMethodId: Uuid.nullable(),
    /** Fichier déposé par `fl.upload` (purpose `payment_proof`), analysé `clean`. */
    proofFileId: Uuid.optional(),
    transactionReference: z.string().min(1).max(120).optional(),
    comment: z.string().max(500).optional(),
    allocations: z.array(AllocationInput).min(1),
  })
  .refine((d) => d.proofFileId !== undefined || d.transactionReference !== undefined, {
    message: 'proof_required',
    path: ['proofFileId'],
  });

export const meDeclare = defineEndpoint({
  id: 'me.declare',
  space: 'me',
  permission: self,
  errors: [
    'amount_exceeds_remaining',
    'allocation_mismatch',
    'allocation_exceeds_remaining',
    'proof_required',
    'file_not_clean',
    'file_scan_pending',
    'proof_already_used',
    'signature_required',
    'invalid_state',
  ],
  flags: { idempotencyKey: true, ifMatch: false, rateLimited: true, audited: true },
  operations: {
    declare: {
      method: 'POST',
      path: '/api/v1/me/payments',
      request: { body: DeclarePaymentInput },
      response: { status: 201, body: SubscriberPayment },
    },
  },
});

export const SubscriberPaymentDetail = SubscriberPayment.extend({
  paymentMethod: PaymentMethod.nullable(),
  comment: z.string().nullable(),
});

export const mePayment = defineEndpoint({
  id: 'me.payment',
  space: 'me',
  permission: self,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/me/payments/{id}',
      request: { params: z.object({ id: Uuid }) },
      response: { status: 200, body: SubscriberPaymentDetail },
    },
  },
});

export const HistoryFilters = z.object({
  associationId: Uuid.optional(),
  projectId: Uuid.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export const History = listOf(SubscriberPayment).extend({
  summary: z.object({ totalPaid: Money, paymentsCount: z.int().nonnegative(), remaining: Money }),
});

export const HistorySeries = z.object({
  /** Versé cumulé par mois (premier jour du mois) et objectif (engagement total). */
  cumulative: z.array(z.object({ month: IsoDate, paid: Money })),
  target: Money.nullable(),
  /** Versé par mois et par projet. */
  byMonth: z.array(z.object({ month: IsoDate, projects: z.array(z.object({ projectId: Uuid, paid: Money })) })),
});

export const meHistory = defineEndpoint({
  id: 'me.history',
  space: 'me',
  permission: self,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/me/history',
      request: { query: ListQuery.extend(HistoryFilters.shape) },
      response: { status: 200, body: History },
    },
    series: {
      method: 'GET',
      path: '/api/v1/me/history/series',
      request: { query: HistoryFilters },
      response: { status: 200, body: HistorySeries },
    },
  },
});

// ---------------------------------------------------------------- Contrats (lot 4.1)

export const SubscriberContract = z.object({
  project: ProjectRef,
  association: AssociationRef,
  /** « 50 000 F à l'entrée, puis 10 000 F par mois pendant 12 mois. Total : 170 000 F. » */
  commitment: z.object({
    entryFee: Money.nullable(),
    installmentAmount: Money,
    frequency: FinancialTerms.shape.frequency,
    periodicCount: z.int().nonnegative().nullable(),
    total: Money.nullable(),
  }),
  /** Texte personnalisé (variables remplacées). */
  body: z.string(),
  /** Empreinte SHA-256 du texte, à renvoyer à la signature. */
  renderedSha256: z.string().regex(/^[0-9a-f]{64}$/),
  associationSigner: z.object({ name: z.string(), title: z.string(), signedAt: Instant.nullable() }),
  consentText: z.string(),
  signedAt: Instant.nullable(),
  pdfFileId: Uuid.nullable(),
});

export const meContract = defineEndpoint({
  id: 'me.contract',
  space: 'me',
  permission: self,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/me/projects/{pid}/contract',
      request: { params: ProjectParamsMe },
      response: { status: 200, body: SubscriberContract },
    },
  },
});

export const meSign = defineEndpoint({
  id: 'me.sign',
  space: 'me',
  permission: self,
  errors: ['contract_changed', 'already_signed'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    /** `contract_changed` si l'empreinte ne correspond plus au texte affiché. */
    sign: {
      method: 'POST',
      path: '/api/v1/me/projects/{pid}/contract/sign',
      request: {
        params: ProjectParamsMe,
        body: z.object({ renderedSha256: z.string().regex(/^[0-9a-f]{64}$/), accepted: z.literal(true) }),
      },
      response: { status: 201, body: SubscriberContract },
    },
  },
});

export const meContracts = defineEndpoint({
  id: 'me.contracts',
  space: 'me',
  permission: self,
  errors: [],
  flags: noFlags,
  operations: {
    /** Contrats à signer en tête. */
    list: {
      method: 'GET',
      path: '/api/v1/me/contracts',
      request: {},
      response: {
        status: 200,
        body: z.object({
          items: z.array(
            z.object({
              project: ProjectRef,
              association: AssociationRef,
              status: z.enum(['to_sign', 'signed']),
              signedAt: Instant.nullable(),
              pdfFileId: Uuid.nullable(),
            }),
          ),
        }),
      },
    },
  },
});

// ---------------------------------------------------------------- Associations du souscripteur (lot 4.5)

export const meAssos = defineEndpoint({
  id: 'me.assos',
  space: 'me',
  permission: self,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/me/associations',
      request: {},
      response: {
        status: 200,
        body: z.object({
          items: z.array(
            z.object({
              association: AssociationRef.extend({ city: z.string() }),
              memberSince: Instant,
              activeProjects: z.int().nonnegative(),
              remaining: Money,
              standing: MemberStanding,
            }),
          ),
        }),
      },
    },
    get: {
      method: 'GET',
      path: '/api/v1/me/associations/{aid}',
      request: { params: AssociationParams },
      response: {
        status: 200,
        body: z.object({
          association: AssociationRef.extend({
            city: z.string(),
            country: z.string(),
            description: z.string().nullable(),
            contactEmail: Email,
            contactPhone: PhoneE164,
          }),
          projects: z.array(SubscriberProjectCard),
          paymentMethods: z.array(PaymentMethod),
        }),
      },
    },
  },
});

// ---------------------------------------------------------------- Paiement en ligne (lot 6.3, option)

export const pspCheckout = defineEndpoint({
  id: 'psp.checkout',
  space: 'me',
  permission: self,
  errors: ['feature_disabled', 'amount_exceeds_remaining'],
  flags: { ...noFlags, idempotencyKey: true },
  operations: {
    checkout: {
      method: 'POST',
      path: '/api/v1/me/payments/checkout',
      request: {
        body: z.object({ projectId: Uuid, amount: Money, allocations: z.array(AllocationInput).min(1) }),
      },
      response: {
        status: 201,
        body: z.object({ intentId: Uuid, provider: z.string(), redirectUrl: z.url(), expiresAt: Instant }),
      },
    },
  },
});
