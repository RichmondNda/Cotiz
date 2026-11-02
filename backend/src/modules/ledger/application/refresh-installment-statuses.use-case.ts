import { Injectable, Logger } from '@nestjs/common';
import { installments } from '@cotiz/db';
import {
  byDueOrder,
  type Currency,
  hourIn,
  installmentStatus,
  type LedgerInstallment,
  lateSinceOf,
  Money,
  todayIn,
} from '@cotiz/domain';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { lockAssociationProjects } from '../../projects/projects.public.js';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/** Statuts qui ne changent plus avec le temps. */
const FINAL = ['paid', 'waived', 'canceled'] as const;
/** Heure locale de la tâche (jobs.yaml : quotidienne 01:00 dans le fuseau de chaque association). */
export const REFRESH_HOUR = 1;

/**
 * Tâche `installments.refresh-statuses` (jobs.yaml, architecture/04 § 4.6, lot 2.4), espace system (politiques
 * `system_access`) : lancée toutes les heures, elle traite les associations où il est 01:00. Une transaction par
 * association, verrous dans l'ordre des relectures de paiement (projets partagés, puis échéances par id) : statut par
 * installmentStatus(), date de retard par lateSinceOf() (gardée sous `declared`), une seule requête UPDATE ; puis un
 * événement installment.late par souscripteur et par projet pour les échéances qui passent en retard (`lateSince` :
 * la plus ancienne). Idempotente : relancée, elle ne change rien et ne republie rien.
 */
@Injectable()
export class RefreshInstallmentStatusesUseCase {
  private readonly logger = new Logger(RefreshInstallmentStatusesUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(now: Date): Promise<void> {
    const due = await this.db.withTenantContext({ space: 'system' }, async () => {
      const rows = await currentTx()
        .selectDistinct({ associationId: installments.associationId })
        .from(installments)
        .where(notInArray(installments.status, [...FINAL]));
      const timezones = await associationTimezonesOf(rows.map((r) => r.associationId));
      return rows
        .map((r) => ({ id: r.associationId, timezone: timezones.get(r.associationId) }))
        .filter((a): a is { id: string; timezone: string } => !!a.timezone && hourIn(a.timezone, now) === REFRESH_HOUR)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
    let changed = 0;
    const failures: unknown[] = [];
    // Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise (idempotente).
    for (const association of due) {
      try {
        const today = todayIn(association.timezone, now);
        changed += await this.db.withTenantContext({ space: 'system' }, () => this.refresh(association.id, today));
      } catch (error) {
        this.logger.error({ msg: 'statuts des échéances non recalculés', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (changed > 0) this.logger.log({ msg: 'statuts des échéances recalculés', count: changed });
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `installments.refresh-statuses : ${String(failures.length)} association(s) en échec`,
      );
    }
  }

  private async refresh(associationId: string, today: string): Promise<number> {
    const tx = currentTx();
    const projectOf = new Map(
      (await lockAssociationProjects(associationId)).map((p) => [
        p.id,
        { graceDays: p.graceDays, currency: p.currency as Currency },
      ]),
    );
    // Personne et projet dénormalisés sur l'échéance (clé composite vers l'inscription).
    const rows = await tx
      .select()
      .from(installments)
      .where(and(eq(installments.associationId, associationId), notInArray(installments.status, [...FINAL])))
      .orderBy(asc(installments.id))
      .for('update');

    const updates: { id: string; status: string; lateSince: string | null }[] = [];
    const late = new Map<
      string,
      { userId: string; projectId: string; enrollmentId: string; items: LedgerInstallment[]; since: string }
    >();
    for (const i of rows) {
      const { userId, projectId } = i;
      const project = projectOf.get(projectId);
      if (!project) throw new Error(`échéance ${i.id} : projet ${projectId} illisible`);
      const { graceDays, currency } = project;
      const state: LedgerInstallment = {
        id: i.id,
        enrollmentId: i.enrollmentId,
        kind: i.kind,
        sequence: i.sequence,
        dueDate: i.dueDate,
        amountDue: Money.fromDb(i.amountDue, currency).amount,
        amountPaid: Money.fromDb(i.amountPaid, currency).amount,
        amountPending: Money.fromDb(i.amountPending, currency).amount,
        status: i.status,
      };
      const status = installmentStatus(state, today, graceDays);
      const lateSince = lateSinceOf(state, today, graceDays);
      if (status === i.status && lateSince === i.lateSince) continue;
      updates.push({ id: i.id, status, lateSince });
      if (status === 'late' && i.status !== 'late' && lateSince) {
        const key = `${userId}:${projectId}`;
        const group = late.get(key) ?? { userId, projectId, enrollmentId: i.enrollmentId, items: [], since: lateSince };
        group.items.push(state);
        if (lateSince < group.since) group.since = lateSince;
        late.set(key, group);
      }
    }
    if (updates.length === 0) return 0;

    await tx.execute(sql`
      UPDATE installments i
         SET status = u.status::installments_status, late_since = u."lateSince",
             paid_at = CASE WHEN u.status = 'paid' THEN coalesce(i.paid_at, now()) END
        FROM json_to_recordset(${JSON.stringify(updates)}::json) AS u(id uuid, status text, "lateSince" date)
       WHERE i.association_id = ${associationId} AND i.id = u.id`);
    for (const group of late.values()) {
      await this.outbox.publish(tx, {
        type: 'installment.late',
        associationId,
        actorUserId: null,
        aggregate: { type: 'enrollment', id: group.enrollmentId },
        payload: {
          userId: group.userId,
          projectId: group.projectId,
          installmentIds: [...group.items].sort(byDueOrder).map((i) => i.id),
          lateSince: group.since,
        },
      });
    }
    return updates.length;
  }
}
