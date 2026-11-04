import { Injectable, Logger } from '@nestjs/common';
import { enrollments, installments } from '@cotiz/db';
import {
  byDueOrder,
  type Currency,
  dueSoonDate,
  hourIn,
  type LedgerInstallment,
  remainingOf,
  todayIn,
} from '@cotiz/domain';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { projectsOf } from '../../projects/projects.public.js';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { FINAL_INSTALLMENT_STATUSES, toLedger } from './payment-review.js';

/** Heure locale de la tâche (jobs.yaml : quotidienne 08:00 dans le fuseau de chaque association). */
export const DUE_SOON_HOUR = 8;

/**
 * Tâche `installments.due-soon` (jobs.yaml, lot 2.5) : lancée toutes les heures, elle liste en espace system les
 * associations où il est 08:00, puis traite chacune dans son propre contexte (RLS). Pour chaque souscripteur et chaque
 * projet d'une inscription active, les échéances dues dans 3 jours (jour de l'association, dueSoonDate) avec un reste
 * dû (remainingOf) → un événement `installment.due_soon`, que le consommateur notifications porte dans la cloche. Lecture seule : aucun verrou. Relancée le même jour, elle republie ; la
 * notification reste unique (clé `due_soon:{projet}:{date}:{personne}`).
 */
@Injectable()
export class SendDueSoonRemindersUseCase {
  private readonly logger = new Logger(SendDueSoonRemindersUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(now: Date): Promise<void> {
    const due = await this.db.withTenantContext({ space: 'system' }, async () => {
      const rows = await currentTx()
        .selectDistinct({ associationId: installments.associationId })
        .from(installments)
        .where(notInArray(installments.status, [...FINAL_INSTALLMENT_STATUSES]));
      const timezones = await associationTimezonesOf(rows.map((r) => r.associationId));
      return rows
        .map((r) => ({ id: r.associationId, timezone: timezones.get(r.associationId) }))
        .filter((a): a is { id: string; timezone: string } => !!a.timezone && hourIn(a.timezone, now) === DUE_SOON_HOUR)
        .sort((a, b) => a.id.localeCompare(b.id));
    });
    let published = 0;
    const failures: unknown[] = [];
    // Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise.
    for (const association of due) {
      try {
        const target = dueSoonDate(todayIn(association.timezone, now));
        // Contexte de cette association (RLS) en plus des filtres explicites : rien d'une autre association ne peut sortir.
        published += await this.db.withTenantContext({ space: 'association', associationId: association.id }, () =>
          this.remind(association.id, target),
        );
      } catch (error) {
        this.logger.error({ msg: 'rappels d’échéance non préparés', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (published > 0) this.logger.log({ msg: 'rappels d’échéance préparés', count: published });
    if (failures.length > 0) {
      throw new AggregateError(failures, `installments.due-soon : ${String(failures.length)} association(s) en échec`);
    }
  }

  private async remind(associationId: string, dueDate: string): Promise<number> {
    const tx = currentTx();
    // Inscriptions actives seulement : un retrait laisse ouvertes les échéances futures déjà en partie versées.
    const rows = (
      await tx
        .select({ installment: installments })
        .from(installments)
        .innerJoin(enrollments, eq(enrollments.id, installments.enrollmentId))
        .where(
          and(
            eq(installments.associationId, associationId),
            eq(installments.dueDate, dueDate),
            notInArray(installments.status, [...FINAL_INSTALLMENT_STATUSES]),
            eq(enrollments.associationId, associationId),
            eq(enrollments.status, 'active'),
          ),
        )
        .orderBy(asc(installments.id))
    ).map((r) => r.installment);
    if (rows.length === 0) return 0;
    const projects = await projectsOf(associationId, [...new Set(rows.map((r) => r.projectId))]);
    const groups = new Map<
      string,
      { userId: string; projectId: string; enrollmentId: string; items: LedgerInstallment[] }
    >();
    for (const i of rows) {
      const project = projects.get(i.projectId);
      if (!project) throw new Error(`échéance ${i.id} : projet ${i.projectId} illisible`);
      const currency = project.currency as Currency;
      const state = toLedger(i, currency);
      if (remainingOf(state) <= 0) continue;
      const key = `${i.userId}:${i.projectId}`;
      const group = groups.get(key) ?? {
        userId: i.userId,
        projectId: i.projectId,
        enrollmentId: i.enrollmentId,
        items: [],
      };
      group.items.push(state);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      await this.outbox.publish(tx, {
        type: 'installment.due_soon',
        associationId,
        actorUserId: null,
        aggregate: { type: 'enrollment', id: group.enrollmentId },
        payload: {
          userId: group.userId,
          projectId: group.projectId,
          installmentIds: [...group.items].sort(byDueOrder).map((i) => i.id),
          dueDate,
        },
      });
    }
    return groups.size;
  }
}
