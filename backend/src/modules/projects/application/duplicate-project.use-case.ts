import { Injectable } from '@nestjs/common';
import type { Project } from '@cotiz/contracts';
import { projects } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { QuotaService } from '../../billing/billing.public.js';
import { lockPaymentMethods, paymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { replaceProjectPaymentMethods } from './project-payment-methods.js';
import { contextAssociationId, paymentMethodsOfProject, projectOf, toProject } from './project-records.js';

/** Longueur maximale d'un nom de projet (ProjectInput.name). */
const NAME_MAX = 120;
const COPY_SUFFIX = ' (copie)';

/**
 * pr.lifecycle › duplicate : copie en brouillon d'un projet de l'association, quel que soit son statut. Nom suivi de
 * « (copie) », ramené à la longueur permise ; mêmes conditions (déjà contrôlées) ; moyens encore actifs, sous le verrou
 * d'as.pm. Si aucun ne l'est plus, la copie n'en retient aucun, donc tous ceux de l'association (Q7) : c'est un
 * brouillon à relire (choix du 2026-10-25). Ni couverture, ni verrouillage, ni clôture, ni inscriptions. Quota du plan
 * (Q6). project.created, comme une création.
 */
@Injectable()
export class DuplicateProjectUseCase {
  constructor(
    private readonly quotas: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('project.duplicate')
  async execute(aid: string, pid: string): Promise<Project> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const source = await projectOf(associationId, pid);
    if (!source) throw new DomainProblem('not_found');
    await this.quotas.assert(associationId, 'projects');

    const [row] = await currentTx()
      .insert(projects)
      .values({
        id: newId(),
        associationId,
        name: copyName(source.name),
        description: source.description,
        requiredSubscribers: source.requiredSubscribers,
        entryFeeAmount: source.entryFeeAmount,
        installmentAmount: source.installmentAmount,
        frequency: source.frequency,
        dueDay: source.dueDay,
        scheduleType: source.scheduleType,
        startDate: source.startDate,
        endDate: source.endDate,
        graceDays: source.graceDays,
        currency: source.currency,
        createdBy: actor.userId,
      })
      .returning();
    if (!row) throw new Error('pr.lifecycle › duplicate : aucune ligne insérée');
    await lockPaymentMethods(associationId);
    const active = new Set((await paymentMethodsOf(associationId)).filter((m) => m.isActive).map((m) => m.id));
    const methods = (await paymentMethodsOfProject(associationId, source.id)).filter((m) =>
      active.has(m.paymentMethodId),
    );
    await replaceProjectPaymentMethods(associationId, row.id, methods);

    await this.outbox.publish(currentTx(), {
      type: 'project.created',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'project', id: row.id },
      payload: { projectId: row.id },
    });
    const project = await toProject(row);
    const { stats: _stats, ...after } = project;
    recordAudit({
      entityType: 'project',
      entityId: row.id,
      associationId,
      after: { ...after, duplicatedFrom: source.id },
    });
    return project;
  }
}

/** Nom de la copie : « (copie) » ajouté, nom coupé à la longueur permise (unités UTF-16, comme Zod) sans couper un caractère. */
function copyName(name: string): string {
  let kept = '';
  for (const char of name) {
    if (kept.length + char.length > NAME_MAX - COPY_SUFFIX.length) break;
    kept += char;
  }
  return `${kept}${COPY_SUFFIX}`;
}
