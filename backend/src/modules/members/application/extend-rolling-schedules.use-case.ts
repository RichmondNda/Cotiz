import { Injectable, Logger } from '@nestjs/common';
import { enrollments, installments, projects } from '@cotiz/db';
import { installmentStatus, lateSince, newId, todayIn } from '@cotiz/domain';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { rollingExtensionOf } from '../../projects/projects.public.js';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/** Projets dont les inscriptions suivent encore leur cycle (ni clos, ni archivés). */
const OPEN_PROJECTS = ['enrolling', 'active'] as const;
/**
 * Inscriptions dont l'échéancier se prolonge (retirées et terminées : jamais). En attente de signature (lot 4.1) : pas
 * encore d'échéancier, généré à la signature (décision 20) ; le prolonger ici créerait des échéances non signées.
 */
const RUNNING = ['active'] as const;

/**
 * Tâche `schedule.extend-rolling` (jobs.yaml : mensuelle, lot 2.3), espace system (politiques `system_access`) :
 * chaque inscription en cours d'un cycle roulant retrouve son horizon (12 échéances datées du jour de son association
 * ou plus tard) par extendRollingSchedule() de @cotiz/domain, à la suite de la dernière générée, au montant du projet.
 * Une transaction par projet, verrous dans l'ordre de la clôture (Q2) : projet (partagé), inscriptions par
 * identifiant (partagées : un retrait attend, ou est attendu). Idempotente (rangs uniques par inscription).
 */
@Injectable()
export class ExtendRollingSchedulesUseCase {
  private readonly logger = new Logger(ExtendRollingSchedulesUseCase.name);

  constructor(private readonly db: TenantDatabase) {}

  async execute(now: Date): Promise<void> {
    const rolling = await this.db.withTenantContext({ space: 'system' }, async () => {
      const rows = await currentTx()
        .select({ id: projects.id, associationId: projects.associationId })
        .from(projects)
        .where(and(eq(projects.scheduleType, 'rolling'), inArray(projects.status, [...OPEN_PROJECTS])))
        .orderBy(asc(projects.id));
      const timezones = await associationTimezonesOf(rows.map((r) => r.associationId));
      return rows.map((r) => ({ ...r, timezone: timezones.get(r.associationId) }));
    });
    let added = 0;
    const failures: unknown[] = [];
    // Un projet en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise (idempotente).
    for (const project of rolling) {
      try {
        if (!project.timezone) throw new Error(`association du projet ${project.id} illisible`);
        const today = todayIn(project.timezone, now);
        added += await this.db.withTenantContext({ space: 'system' }, () => this.extendProject(project.id, today));
      } catch (error) {
        this.logger.error({ msg: 'cycle roulant non prolongé', projectId: project.id, err: error });
        failures.push(error);
      }
    }
    if (added > 0) this.logger.log({ msg: 'échéances de cycles roulants ajoutées', count: added });
    if (failures.length > 0) {
      throw new AggregateError(failures, `schedule.extend-rolling : ${String(failures.length)} projet(s) en échec`);
    }
  }

  private async extendProject(projectId: string, today: string): Promise<number> {
    const tx = currentTx();
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).for('share');
    if (project?.scheduleType !== 'rolling' || !(OPEN_PROJECTS as readonly string[]).includes(project.status)) {
      return 0;
    }
    const running = await tx
      .select({ id: enrollments.id, userId: enrollments.userId, startsFrom: enrollments.startsFrom })
      .from(enrollments)
      .where(and(eq(enrollments.projectId, projectId), inArray(enrollments.status, [...RUNNING])))
      .orderBy(asc(enrollments.id))
      .for('share');
    if (running.length === 0) return 0;
    const last = await tx
      .select({ enrollmentId: installments.enrollmentId, sequence: max(installments.sequence) })
      .from(installments)
      .where(
        and(
          inArray(
            installments.enrollmentId,
            running.map((e) => e.id),
          ),
          eq(installments.kind, 'periodic'),
        ),
      )
      .groupBy(installments.enrollmentId);
    const lastOf = new Map(last.map((l) => [l.enrollmentId, l.sequence ?? 0]));
    const rows = running.flatMap((enrollment) =>
      rollingExtensionOf(project, enrollment.startsFrom, lastOf.get(enrollment.id) ?? 0, today).map((line) => {
        const status = installmentStatus(
          { dueDate: line.dueDate, amountDue: line.amountDue, amountPaid: 0, amountPending: 0, status: 'upcoming' },
          today,
          project.graceDays,
        );
        return {
          id: newId(),
          associationId: project.associationId,
          projectId,
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          kind: line.kind,
          sequence: line.sequence,
          dueDate: line.dueDate,
          amountDue: BigInt(line.amountDue),
          status,
          lateSince: status === 'late' ? lateSince(line, project.graceDays) : null,
        };
      }),
    );
    if (rows.length === 0) return 0;
    const inserted = await tx
      .insert(installments)
      .values(rows)
      .onConflictDoNothing({ target: [installments.enrollmentId, installments.kind, installments.sequence] })
      .returning({ id: installments.id });
    return inserted.length;
  }
}
