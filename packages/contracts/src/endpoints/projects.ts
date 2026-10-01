import { z } from 'zod';
import { InstallmentKind, ProjectStatus } from '../common/enums.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationParams, ProjectParams } from '../common/params.js';
import { PersonRef } from '../common/people.js';
import { FinancialTerms, Project, ProjectPaymentMethod, ProjectSummary } from '../common/project.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Projets (docs/ui/manager.md : mg-projets, mg-projet-new, mg-projet-overview, mg-projet-params).

const read = 'association.read';
const manage = 'projects.manage';

export const ProjectsQuery = ListQuery.extend({ status: ProjectStatus.optional(), q: z.string().min(1).optional() });

export const prList = defineEndpoint({
  id: 'pr.list',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects',
      request: { params: AssociationParams, query: ProjectsQuery },
      response: { status: 200, body: listOf(ProjectSummary) },
    },
  },
});

/** Champs modifiables tant que les conditions financières ne sont pas verrouillées. */
export const ProjectInput = FinancialTerms.extend({
  name: z.string().min(1).max(120),
  description: z.string().max(5000),
  coverFileId: Uuid.nullable().optional(),
  requiredSubscribers: z.int().min(1).nullable(),
  graceDays: z.int().min(0).max(90),
  paymentMethods: z.array(ProjectPaymentMethod),
});

/** Contrat saisi à l'étape 5 de la création (modèle, signataire, signature de l'association). */
export const ProjectContractInput = z.object({
  /** Texte avec variables `{nom_souscripteur}`, `{montant}`, `{frequence}`, `{date_debut}`. */
  bodyTemplate: z.string().min(1),
  signerName: z.string().min(1).max(120),
  signerTitle: z.string().min(1).max(120),
  /** « Je signe ce contrat au nom de l'association ». */
  signNow: z.boolean(),
});

export const CreateProjectInput = ProjectInput.extend({ contract: ProjectContractInput.optional() });

export const prCreate = defineEndpoint({
  id: 'pr.create',
  space: 'association',
  permission: manage,
  errors: ['quota_exceeded', 'validation_failed'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    /** Toujours créé en brouillon (`draft`). */
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects',
      request: { params: AssociationParams, body: CreateProjectInput },
      response: { status: 201, body: Project },
    },
  },
});

export const SchedulePreviewInput = FinancialTerms.extend({
  /** Date d'entrée d'un souscripteur ; début du projet si absente. */
  enrolledFrom: IsoDate.optional(),
  /** Cycle roulant : nombre d'échéances générées (12 par défaut). */
  horizon: z.int().min(1).max(120).optional(),
});

export const ScheduleLine = z.object({
  sequence: z.int().nonnegative(),
  kind: InstallmentKind,
  dueDate: IsoDate,
  amountDue: Money,
});

/** Résultat de `generateSchedule()` de @cotiz/domain, même fonction que l'aperçu du front. */
export const SchedulePreview = z.object({
  installments: z.array(ScheduleLine),
  periodicCount: z.int().nonnegative(),
  /** Dates fixes : total par souscripteur ; `null` pour un cycle roulant. */
  totalPerSubscriber: Money.nullable(),
});

export const prPreview = defineEndpoint({
  id: 'pr.preview',
  space: 'association',
  permission: manage,
  errors: ['validation_failed'],
  flags: noFlags,
  operations: {
    preview: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/schedule-preview',
      request: { params: AssociationParams, body: SchedulePreviewInput },
      response: { status: 200, body: SchedulePreview },
    },
  },
});

export const prGet = defineEndpoint({
  id: 'pr.get',
  space: 'association',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}',
      request: { params: ProjectParams },
      response: { status: 200, body: Project },
    },
  },
});

export const prPatch = defineEndpoint({
  id: 'pr.patch',
  space: 'association',
  permission: manage,
  errors: ['financial_terms_locked', 'version_conflict', 'invalid_state'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    /** Conditions financières refusées après verrouillage (`financial_terms_locked`). */
    patch: {
      method: 'PATCH',
      path: '/api/v1/associations/{aid}/projects/{pid}',
      request: { params: ProjectParams, body: ProjectInput.partial() },
      response: { status: 200, body: Project },
    },
  },
});

export const prLifecycle = defineEndpoint({
  id: 'pr.lifecycle',
  space: 'association',
  permission: manage,
  errors: ['invalid_state', 'quota_exceeded'],
  flags: { ...noFlags, audited: true },
  operations: {
    /** `draft → enrolling` : ouvre les inscriptions. */
    publish: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/publish',
      request: { params: ProjectParams },
      response: { status: 200, body: Project },
    },
    /** `enrolling | active → completed`. */
    close: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/close',
      request: { params: ProjectParams },
      response: { status: 200, body: Project },
    },
    /** Copie en brouillon, sans inscriptions. */
    duplicate: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/projects/{pid}/duplicate',
      request: { params: ProjectParams },
      response: { status: 201, body: Project },
    },
  },
});

export const prDelete = defineEndpoint({
  id: 'pr.delete',
  space: 'association',
  permission: manage,
  errors: ['invalid_state'],
  flags: { ...noFlags, ifMatch: true, audited: true },
  operations: {
    /** Brouillon uniquement. */
    remove: {
      method: 'DELETE',
      path: '/api/v1/associations/{aid}/projects/{pid}',
      request: { params: ProjectParams },
      response: { status: 204 },
    },
  },
});

/** Collecte d'une échéance du calendrier, tous souscripteurs. */
export const SequenceCollection = z.object({
  sequence: z.int().nonnegative(),
  dueDate: IsoDate,
  expected: Money,
  received: Money,
});

export const LateMember = z.object({
  member: PersonRef,
  enrollmentId: Uuid,
  lateInstallments: z.int().min(1),
  amountDue: Money,
  lateSince: IsoDate,
  /** Dates d'échéance en retard (« août, septembre »). */
  lateDueDates: z.array(IsoDate),
});

export const ProjectOverview = z.object({
  collected: Money,
  expectedToDate: Money,
  recoveryRate: z.number().min(0).max(1).nullable(),
  late: z.object({ count: z.int().nonnegative(), amount: Money }),
  nextDue: z.object({ dueDate: IsoDate, expectedTotal: Money }).nullable(),
  /** Inscriptions ouvertes : remplissage. */
  enrollment: z.object({ count: z.int().nonnegative(), required: z.int().min(1).nullable() }),
  paymentsToReview: z.object({ count: z.int().nonnegative(), oldestDeclaredAt: Instant.nullable() }),
  unsignedContracts: z.array(z.object({ enrollmentId: Uuid, member: PersonRef, enrolledAt: Instant })),
  /** Une entrée par échéance (hors fonds d'entrée). */
  collectionBySequence: z.array(SequenceCollection),
  /** Tous les retardataires, du plus gros montant au plus petit. */
  lateMembers: z.array(LateMember),
});

export const prOverview = defineEndpoint({
  id: 'pr.overview',
  space: 'association',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}/overview',
      request: { params: ProjectParams },
      response: { status: 200, body: ProjectOverview },
    },
  },
});
