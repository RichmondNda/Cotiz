import { z } from 'zod';
import { ExportKind, ExportStatus, MemberStanding } from '../common/enums.js';
import { AssociationIdParams, AssociationParams, ProjectParams } from '../common/params.js';
import { PersonRef } from '../common/people.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';
import { SequenceCollection } from './projects.js';

// Rapports, exports et analytique (mg-projet-rapports, mg-annuaire).

export const PeriodQuery = z.object({ from: IsoDate.optional(), to: IsoDate.optional() });

export const ProjectReport = z.object({
  expected: Money,
  received: Money,
  remaining: Money,
  recoveryRate: z.number().min(0).max(1).nullable(),
  collectionBySequence: z.array(SequenceCollection),
  /** Taux de recouvrement cumulé après chaque échéance échue. */
  recoveryRateBySequence: z.array(z.object({ dueDate: IsoDate, rate: z.number().min(0).max(1) })),
  standingCounts: z.record(MemberStanding, z.int().nonnegative()),
  rows: z.array(
    z.object({
      member: PersonRef,
      expectedToDate: Money,
      paid: Money,
      remaining: Money,
      lateCount: z.int().nonnegative(),
      lastPaymentOn: IsoDate.nullable(),
    }),
  ),
});

export const rpReport = defineEndpoint({
  id: 'rp.report',
  space: 'association',
  permission: 'reports.read',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}/report',
      request: { params: ProjectParams, query: PeriodQuery },
      response: { status: 200, body: ProjectReport },
    },
  },
});

export const ExportJob = z.object({
  id: Uuid,
  kind: ExportKind,
  status: ExportStatus,
  /** Fichier prêt (lien signé via `fl.get`). */
  fileId: Uuid.nullable(),
  createdAt: Instant,
});

export const CreateExportInput = z.object({
  kind: ExportKind,
  projectId: Uuid.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export const rpExport = defineEndpoint({
  id: 'rp.export',
  space: 'association',
  permission: 'reports.export',
  errors: ['quota_exceeded'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    /** Export asynchrone : suivre son statut avec `get`. */
    create: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/exports',
      request: { params: AssociationParams, body: CreateExportInput },
      response: { status: 202, body: ExportJob },
    },
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/exports/{id}',
      request: { params: AssociationIdParams },
      response: { status: 200, body: ExportJob },
    },
  },
});

/** Séries des tableaux analytiques (lot 5.2). */
export const Analytics = z.object({
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      points: z.array(z.object({ x: z.string(), y: z.number() })),
    }),
  ),
});

export const rpAnalytics = defineEndpoint({
  id: 'rp.analytics',
  space: 'association',
  permission: 'reports.read',
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/analytics',
      request: { params: AssociationParams, query: PeriodQuery.extend({ projectId: Uuid.optional() }) },
      response: { status: 200, body: Analytics },
    },
  },
});
