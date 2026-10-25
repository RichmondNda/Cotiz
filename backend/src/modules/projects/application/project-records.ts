import type { Project, ProjectPaymentMethod, ProjectSummary } from '@cotiz/contracts';
import { projectPaymentMethods, projects } from '@cotiz/db';
import { type Currency, Money, type ScheduleLine } from '@cotiz/domain';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { fileNamesOf } from '../../files/files.public.js';
import { ownAssociationOf, paymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { previewOf, scheduleInputOf, scheduleOf } from '../domain/project-terms.js';

export type ProjectRecord = typeof projects.$inferSelect;

/** L'association du contexte (identifiant de l'URL en minuscules, comme MembershipGuard), sinon erreur. */
export function contextAssociationId(aid: string): string {
  const context = currentContext();
  const id = aid.toLowerCase();
  if (context?.space !== 'association' || context.associationId !== id) {
    throw new Error('contexte de cette association attendu');
  }
  return id;
}

/** Devise de l'association du contexte (RLS `tenant_self`) : celle de ses projets. */
export async function associationCurrencyOf(associationId: string): Promise<Currency> {
  const row = await ownAssociationOf(associationId);
  if (!row) throw new Error(`association ${associationId} illisible dans son propre contexte`);
  return row.currency as Currency;
}

/**
 * Un projet de l'association du contexte (RLS) ; `null` s'il n'existe pas ou n'est pas le sien. `lock` : verrouillé
 * jusqu'à la fin de la transaction, pour une modification qui dépend de son état (FOR NO KEY UPDATE), ou avant sa
 * suppression (`delete` : FOR UPDATE, qui bloque aussi les clés étrangères qui le visent).
 */
export async function projectOf(
  associationId: string,
  projectId: string,
  options: { lock?: boolean | 'delete' } = {},
): Promise<ProjectRecord | null> {
  const query = currentTx()
    .select()
    .from(projects)
    .where(and(eq(projects.associationId, associationId), eq(projects.id, projectId)));
  const [row] = await (options.lock === 'delete'
    ? query.for('update')
    : options.lock
      ? query.for('no key update')
      : query);
  return row ?? null;
}

/** Fonds d'entrée et montant par échéance du projet, en `Money` de sa devise. */
function termsOf(row: ProjectRecord) {
  const currency = row.currency as Currency;
  return {
    entryFee: row.entryFeeAmount === null ? null : Money.fromDb(row.entryFeeAmount, currency),
    installmentAmount: Money.fromDb(row.installmentAmount, currency),
    frequency: row.frequency,
    dueDay: row.dueDay,
    scheduleType: row.scheduleType,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

/** Calendrier du projet (depuis son début) par generateSchedule() ; conditions contrôlées à l'écriture. */
export function projectScheduleLines(row: ProjectRecord): ScheduleLine[] {
  const lines = scheduleOf(scheduleInputOf(termsOf(row)));
  // Une erreur ici est une ligne incohérente : jamais des indicateurs muets.
  if (!Array.isArray(lines)) throw new Error(`projet ${row.id} : conditions refusées par generateSchedule()`);
  return lines;
}

/**
 * Indicateurs d'un projet. Avant les inscriptions (lot 2.3) et les paiements (lot 2.4) : aucun souscripteur, rien
 * d'attendu ni d'encaissé ; dates fixes : nombre d'échéances et engagement par souscripteur, par generateSchedule().
 */
function statsOf(row: ProjectRecord): z.infer<typeof Project>['stats'] {
  const currency = row.currency as Currency;
  const preview = previewOf(projectScheduleLines(row), row.scheduleType, currency);
  const fixed = row.scheduleType === 'fixed';
  return {
    subscribersCount: 0,
    collected: Money.zero(currency),
    expectedToDate: Money.zero(currency),
    recoveryRate: null,
    progress: null,
    lateSubscribersCount: 0,
    pendingPaymentsCount: 0,
    pendingSignaturesCount: 0,
    nextDueDate: null,
    installmentsCount: fixed ? preview.periodicCount : null,
    totalPerSubscriber: fixed ? preview.totalPerSubscriber : null,
  };
}

/** Projet dans une liste ou une carte (pr.list) ; nom de la couverture lu par files. */
export async function toSummaries(rows: readonly ProjectRecord[]): Promise<z.infer<typeof ProjectSummary>[]> {
  const names = await fileNamesOf(rows.flatMap((r) => (r.coverFileId ? [r.coverFileId] : [])));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ...termsOf(row),
    coverFileId: row.coverFileId,
    coverFileName: row.coverFileId ? (names.get(row.coverFileId) ?? null) : null,
    status: row.status,
    requiredSubscribers: row.requiredSubscribers,
    graceDays: row.graceDays,
    financialTermsLockedAt: row.financialTermsLockedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    stats: statsOf(row),
    version: row.version,
  }));
}

/**
 * Moyens retenus pour le projet, dans l'ordre des moyens de l'association (as.pm.list : la table des liens n'a pas
 * d'ordre propre) ; liste vide = les moyens actifs de l'association (choix Q7).
 */
export async function paymentMethodsOfProject(
  associationId: string,
  projectId: string,
): Promise<z.infer<typeof ProjectPaymentMethod>[]> {
  const links = await currentTx()
    .select({
      paymentMethodId: projectPaymentMethods.paymentMethodId,
      instructionsOverride: projectPaymentMethods.instructionsOverride,
    })
    .from(projectPaymentMethods)
    .where(and(eq(projectPaymentMethods.associationId, associationId), eq(projectPaymentMethods.projectId, projectId)));
  if (links.length === 0) return [];
  const rank = new Map((await paymentMethodsOf(associationId)).map((m, i) => [m.id, i]));
  return links.sort((a, b) => (rank.get(a.paymentMethodId) ?? 0) - (rank.get(b.paymentMethodId) ?? 0));
}

/** Projet complet (pr.get, réponses des écritures). */
export async function toProject(row: ProjectRecord): Promise<z.infer<typeof Project>> {
  const [summary] = await toSummaries([row]);
  if (!summary) throw new Error('toProject : résumé manquant');
  return {
    ...summary,
    description: row.description,
    paymentMethods: await paymentMethodsOfProject(row.associationId, row.id),
  };
}
