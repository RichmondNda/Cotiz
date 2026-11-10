import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { enrollments, installments, projects } from '@cotiz/db';
import { installmentStatus, lateSince, newId, todayIn } from '@cotiz/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { enrollmentScheduleOf, rollingExtensionOf } from '../../projects/projects.public.js';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

const Payload = z.object({ enrollmentId: z.uuid() });

/**
 * `contract.signed` (lot 4.1, décision 20) : échéancier de l'inscription, généré à la signature (aucune échéance tant
 * qu'elle attend). Espace system (`installments` n'est ouverte en écriture ni au souscripteur ni à son contexte), une
 * transaction ; verrous dans l'ordre de l'inscription et de l'extension roulante : projet (partagé), inscription
 * (partagée), puis échéances. Lignes de generateSchedule() depuis la date d'entrée, statut initial par
 * installmentStatus() au jour de l'association (rattrapage, Q3), comme en.create ; cycle roulant : prolongé jusqu'à
 * l'horizon du jour de la signature (rollingExtensionOf). Échéancier impossible : erreur (réessai). Rejouable : rangs uniques par
 * inscription (ON CONFLICT DO NOTHING ; une extension roulante a pu passer entre-temps). Inscription retirée, inconnue
 * ou d'une autre association : rien.
 */
@Injectable()
export class ContractScheduleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractScheduleConsumer.name);
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly db: TenantDatabase,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'contract-schedule',
      types: ['contract.signed'],
      ownTransactions: true,
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async handle(event: EventEnvelope): Promise<void> {
    const associationId = event.associationId;
    if (!associationId) return;
    const { enrollmentId } = Payload.parse(event.payload);
    const added = await this.db.withTenantContext({ space: 'system' }, async () => {
      const tx = currentTx();
      const ofAssociation = and(eq(enrollments.id, enrollmentId), eq(enrollments.associationId, associationId));
      const [found] = await tx.select({ projectId: enrollments.projectId }).from(enrollments).where(ofAssociation);
      if (!found) return 0;
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, found.projectId), eq(projects.associationId, associationId)))
        .for('share');
      const [enrollment] = await tx.select().from(enrollments).where(ofAssociation).for('share');
      if (!project || enrollment?.status !== 'active') return 0;
      const base = enrollmentScheduleOf(project, enrollment.startsFrom);
      // Signée, l'inscription doit avoir son échéancier : erreur, l'outbox réessaie (jamais d'abandon silencieux).
      if (!Array.isArray(base) || base.length === 0) {
        throw new Error(`contract-schedule : échéancier impossible pour l'inscription ${enrollmentId}`);
      }
      const timezone = (await associationTimezonesOf([associationId])).get(associationId);
      if (!timezone) throw new Error(`contract-schedule : association ${associationId} illisible`);
      const today = todayIn(timezone);
      // Jour de la signature (activated_at, posé par me.sign) : le retard d'une échéance déjà passée en part (lateFrom),
      // pas de son échéance (domain-rules § 6) ; me.declare refusait tout paiement avant la signature.
      const signedOn = todayIn(timezone, enrollment.activatedAt ?? new Date());
      // Cycle roulant signé tard : l'horizon (12 échéances à venir) est rétabli dès la signature, à la suite.
      const lastPeriodic = Math.max(0, ...base.filter((l) => l.kind === 'periodic').map((l) => l.sequence));
      const lines =
        project.scheduleType === 'rolling'
          ? [...base, ...rollingExtensionOf(project, enrollment.startsFrom, lastPeriodic, today)]
          : base;
      const inserted = await tx
        .insert(installments)
        .values(
          lines.map((line) => {
            const lateFrom = line.dueDate < signedOn ? signedOn : null;
            const state = {
              dueDate: line.dueDate,
              lateFrom,
              amountDue: line.amountDue,
              amountPaid: 0,
              amountPending: 0,
              status: 'upcoming' as const,
            };
            const status = installmentStatus(state, today, project.graceDays);
            return {
              id: newId(),
              associationId,
              projectId: project.id,
              enrollmentId,
              userId: enrollment.userId,
              kind: line.kind,
              sequence: line.sequence,
              dueDate: line.dueDate,
              lateFrom,
              amountDue: BigInt(line.amountDue),
              status,
              lateSince: status === 'late' ? lateSince(state, project.graceDays) : null,
            };
          }),
        )
        .onConflictDoNothing({ target: [installments.enrollmentId, installments.kind, installments.sequence] })
        .returning({ id: installments.id });
      return inserted.length;
    });
    this.logger.log({ msg: 'échéancier généré à la signature', enrollmentId, added });
  }
}
