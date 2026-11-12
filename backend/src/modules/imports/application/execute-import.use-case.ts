import { Injectable, Logger } from '@nestjs/common';
import { ImportField } from '@cotiz/contracts';
import { importJobs, importRows } from '@cotiz/db';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { CreateEnrollmentUseCase, PreparedCodes } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx, type TenantContext, TenantDatabase } from '../../../shared/tenant-context/index.js';
import type { RowError } from '../domain/row-check.js';
import { countsOf, importOf, type Progress, type StoredCounts, type StoredRow } from './import-records.js';

/** Codes d'activation hachés d'avance pendant que les lignes avancent (comme en.bulk). */
const LOOKAHEAD = 4;
/** Progression écrite toutes les N lignes (l'écran interroge im.read toutes les 2 s). */
const PROGRESS_EVERY = 25;

interface PendingRow {
  id: string;
  category: 'ready' | 'existing' | 'error' | 'duplicate' | 'ignored';
  normalized: StoredRow;
  resolvedUserId: string | null;
}

/**
 * Exécution d'un import (worker, `import.commit_requested`) : chaque ligne prête ou compte existant passe par le cas
 * d'usage d'inscription unitaire (en.create : verrous, quota, échéancier, contrat, code d'activation, `member.enrolled`,
 * audit), dans sa propre transaction avec le résultat de la ligne : une ligne refusée n'annule pas les autres, une
 * exécution interrompue reprend aux lignes sans résultat. Acteur : la personne qui a lancé l'envoi. Ligne refusée :
 * `error` avec le code d'en.create. À la fin : `completed`, `import.completed` (compteurs).
 */
@Injectable()
export class ExecuteImportUseCase {
  private readonly logger = new Logger(ExecuteImportUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly enrollments: CreateEnrollmentUseCase,
    private readonly accounts: SubscriberAccounts,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: { associationId: string; importId: string; requestedBy: string }): Promise<void> {
    const context: TenantContext = {
      space: 'association',
      associationId: input.associationId,
      userId: input.requestedBy,
    };
    const plan = await this.db.withTenantContext(context, async () => {
      const job = await importOf(input.associationId, input.importId);
      if (job?.status !== 'importing') return null;
      const rows = await currentTx()
        .select({
          id: importRows.id,
          category: importRows.category,
          normalized: importRows.normalized,
          resolvedUserId: importRows.resolvedUserId,
        })
        .from(importRows)
        .where(
          and(
            eq(importRows.importJobId, job.id),
            inArray(importRows.category, ['ready', 'existing']),
            sql`NOT (${importRows.normalized} ? 'outcome')`,
          ),
        )
        .orderBy(asc(importRows.rowNumber));
      return {
        projectId: job.projectId,
        rows: rows as PendingRow[],
        progress: await progressOf(job.id, countsOf(job)),
      };
    });
    if (!plan) return;

    const progress = plan.progress;
    const codes = new PreparedCodes(() => this.accounts.prepareActivation(), LOOKAHEAD);
    for (const [index, row] of plan.rows.entries()) {
      const outcome = await this.line(context, input.associationId, plan.projectId, row, codes);
      progress.processed += 1;
      progress[outcome] += 1;
      if ((index + 1) % PROGRESS_EVERY === 0) await this.saveProgress(context, input.importId, progress);
    }

    await this.db.withTenantContext(context, async () => {
      const job = await importOf(input.associationId, input.importId, { lock: true });
      if (job?.status !== 'importing') return;
      const final = await progressOf(job.id, countsOf(job));
      const counts: StoredCounts = { ...countsOf(job), progress: final, imported: final.enrolled + final.attached };
      await currentTx().update(importJobs).set({ status: 'completed', counts }).where(eq(importJobs.id, job.id));
      await this.outbox.publish(currentTx(), {
        type: 'import.completed',
        associationId: input.associationId,
        actorUserId: input.requestedBy,
        aggregate: { type: 'import', id: job.id },
        payload: { importId: job.id, counts: final },
      });
    });
  }

  private async line(
    context: TenantContext,
    aid: string,
    projectId: string,
    row: PendingRow,
    codes: PreparedCodes,
  ): Promise<'enrolled' | 'attached' | 'failed'> {
    const { values, phone } = row.normalized;
    try {
      return await this.db.withTenantContext(context, async () => {
        const input =
          row.category === 'existing' && row.resolvedUserId
            ? { userId: row.resolvedUserId }
            : {
                phone: phone ?? '',
                firstName: values.firstName ?? '',
                lastName: values.lastName ?? '',
                email: orNull(values.email),
                address: orNull(values.address),
              };
        const { created, isNewAccount } = await this.enrollments.enroll(aid, projectId, input, {
          activationCode: () => codes.take(),
        });
        const outcome = isNewAccount ? 'enrolled' : 'attached';
        await saveOutcome(row, { ...row.normalized, outcome, enrollmentId: created.enrollment.id });
        return outcome;
      });
    } catch (error) {
      // Erreur imprévue (base, programmation) : le job échoue et reprendra aux lignes sans résultat.
      if (!(error instanceof DomainProblem)) throw error;
      const fields = (error.details.fields ?? {}) as Record<string, unknown>;
      const errors: RowError[] = Object.keys(fields).length
        ? Object.entries(fields).map(([field, code]) => ({
            field: ImportField.safeParse(field).success ? (field as RowError['field']) : null,
            code: typeof code === 'string' ? code : error.code,
          }))
        : [{ field: null, code: error.code }];
      await this.db.withTenantContext(context, () =>
        saveOutcome(row, { ...row.normalized, outcome: 'failed' }, { category: 'error', errors }),
      );
      this.logger.log({ msg: 'ligne d’import refusée', row: row.id, code: error.code });
      return 'failed';
    }
  }

  private saveProgress(context: TenantContext, importId: string, progress: Progress): Promise<void> {
    return this.db.withTenantContext(context, async () => {
      await currentTx()
        .update(importJobs)
        .set({ counts: sql`jsonb_set(${importJobs.counts}, '{progress}', ${JSON.stringify(progress)}::jsonb)` })
        .where(and(eq(importJobs.id, importId), eq(importJobs.status, 'importing')));
    });
  }
}

/** Champ facultatif vide : absent. */
const orNull = (value: string | undefined) => (value === undefined || value === '' ? null : value);

async function saveOutcome(
  row: PendingRow,
  normalized: StoredRow,
  change: { category?: 'error'; errors?: RowError[] } = {},
): Promise<void> {
  await currentTx()
    .update(importRows)
    .set({ normalized, ...change })
    .where(eq(importRows.id, row.id));
}

/** Progression comptée en base (reprise après interruption comprise) ; total de l'envoi conservé. */
async function progressOf(importId: string, counts: StoredCounts): Promise<Progress> {
  const rows = await currentTx()
    .select({ outcome: sql<string>`${importRows.normalized} ->> 'outcome'`, n: sql<number>`count(*)::int` })
    .from(importRows)
    .where(and(eq(importRows.importJobId, importId), sql`${importRows.normalized} ? 'outcome'`))
    .groupBy(sql`${importRows.normalized} ->> 'outcome'`);
  const n = (outcome: string) => rows.find((r) => r.outcome === outcome)?.n ?? 0;
  const enrolled = n('enrolled');
  const attached = n('attached');
  const failed = n('failed');
  return {
    total: counts.progress?.total ?? enrolled + attached + failed,
    processed: enrolled + attached + failed,
    enrolled,
    attached,
    failed,
  };
}
