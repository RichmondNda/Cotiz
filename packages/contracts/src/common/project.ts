import { z } from 'zod';
import { Frequency, ProjectStatus, ScheduleType } from './enums.js';
import { Instant, IsoDate, Money, Uuid } from './scalars.js';

export const ProjectRef = z.object({ id: Uuid, name: z.string() }).meta({ id: 'ProjectRef' });
export type ProjectRef = z.infer<typeof ProjectRef>;

/** Conditions financières (verrouillées au premier paiement validé, domain-rules.md § 9). */
export const FinancialTerms = z.object({
  /** Fonds d'entrée ; `null` = aucun. */
  entryFee: Money.nullable(),
  installmentAmount: Money,
  frequency: Frequency,
  /** 1–31 (jour du mois) ou 1–7 (jour ISO) pour `weekly`. */
  dueDay: z.int().min(1).max(31),
  scheduleType: ScheduleType,
  startDate: IsoDate,
  /** Obligatoire pour `fixed`, absent pour `rolling`. */
  endDate: IsoDate.nullable(),
});

/** Moyen de paiement retenu pour un projet, avec ses consignes propres. */
export const ProjectPaymentMethod = z
  .object({
    paymentMethodId: Uuid,
    instructionsOverride: z.string().nullable(),
  })
  .meta({ id: 'ProjectPaymentMethod' });

/** Indicateurs calculés par le back (listes, cartes, tableaux de bord). */
export const ProjectStats = z
  .object({
    subscribersCount: z.int().nonnegative(),
    collected: Money,
    expectedToDate: Money,
    /** Entre 0 et 1 ; `null` tant qu'aucune échéance n'est échue. */
    recoveryRate: z.number().min(0).max(1).nullable(),
    /** Part de l'engagement total déjà collectée, entre 0 et 1. */
    progress: z.number().min(0).max(1).nullable(),
    lateSubscribersCount: z.int().nonnegative(),
    pendingPaymentsCount: z.int().nonnegative(),
    pendingSignaturesCount: z.int().nonnegative(),
    nextDueDate: IsoDate.nullable(),
    /** Dates fixes : nombre d'échéances périodiques et engagement total par souscripteur. */
    installmentsCount: z.int().nonnegative().nullable(),
    totalPerSubscriber: Money.nullable(),
  })
  .meta({ id: 'ProjectStats' });

export const Project = FinancialTerms.extend({
  id: Uuid,
  name: z.string(),
  description: z.string(),
  coverFileId: Uuid.nullable(),
  status: ProjectStatus,
  /** `null` = sans limite. */
  requiredSubscribers: z.int().min(1).nullable(),
  graceDays: z.int().min(0).max(90),
  paymentMethods: z.array(ProjectPaymentMethod),
  financialTermsLockedAt: Instant.nullable(),
  closedAt: Instant.nullable(),
  createdAt: Instant,
  stats: ProjectStats,
  /** Verrouillage optimiste (`ETag`, `If-Match`). */
  version: z.int().min(1),
}).meta({ id: 'Project' });
export type Project = z.infer<typeof Project>;

/** Projet dans une liste ou une carte. */
export const ProjectSummary = Project.omit({ description: true, paymentMethods: true }).meta({ id: 'ProjectSummary' });
