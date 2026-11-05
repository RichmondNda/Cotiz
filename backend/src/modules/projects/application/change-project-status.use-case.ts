import { Injectable } from '@nestjs/common';
import type { Project } from '@cotiz/contracts';
import { projects, updateWithVersion } from '@cotiz/db';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { ProjectFigures } from '../../reporting/reporting.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { canTransition, TRANSITIONS } from '../domain/project-lifecycle.js';
import { contextAssociationId, projectOf, toProject } from './project-records.js';

/**
 * Transition demandée par un gestionnaire (pr.lifecycle) : projet lu sous verrou de ligne (deux clôtures simultanées :
 * la seconde voit la première), transition refusée hors des statuts permis (409 `invalid_state`), version suivante,
 * événement par l'outbox, audit du statut.
 */
async function transition(
  outbox: OutboxService,
  figures: ProjectFigures,
  aid: string,
  pid: string,
  name: 'publish' | 'close',
): Promise<Project> {
  const actor = requireActor();
  const associationId = contextAssociationId(aid);
  const current = await projectOf(associationId, pid, { lock: true });
  if (!current) throw new DomainProblem('not_found');
  if (!canTransition(name, current.status)) throw new DomainProblem('invalid_state');

  const tx = currentTx();
  const closing = name === 'close';
  const updated = await updateWithVersion(
    tx,
    projects,
    { id: current.id, version: current.version },
    { status: TRANSITIONS[name].to, ...(closing ? { closedAt: new Date() } : {}) },
  );
  if (!updated) throw new DomainProblem('not_found');
  await outbox.publish(tx, {
    type: closing ? 'project.closed' : 'project.published',
    associationId,
    actorUserId: actor.userId,
    aggregate: { type: 'project', id: current.id },
    payload: { projectId: current.id },
  });
  const after = await toProject(updated);
  recordAudit({
    entityType: 'project',
    entityId: current.id,
    associationId,
    before: { status: current.status, ...(closing ? { closedAt: null } : {}) },
    after: { status: after.status, ...(closing ? { closedAt: after.closedAt } : {}) },
  });
  // Réponse : indicateurs calculés comme pr.get (l'audit n'en garde que le statut).
  const [withStats] = await figures.withStats(associationId, [after]);
  if (!withStats) throw new Error('pr.lifecycle : projet sans indicateurs');
  return withStats;
}

/** pr.lifecycle › publish : brouillon → inscriptions ouvertes (project.published). Quota : compté dès le brouillon (Q6). */
@Injectable()
export class PublishProjectUseCase {
  constructor(
    private readonly outbox: OutboxService,
    private readonly figures: ProjectFigures,
  ) {}

  @Audited('project.publish')
  execute(aid: string, pid: string): Promise<Project> {
    return transition(this.outbox, this.figures, aid, pid, 'publish');
  }
}

/** pr.lifecycle › close : inscriptions ouvertes ou en cours → terminé, date de clôture (project.closed). */
@Injectable()
export class CloseProjectUseCase {
  constructor(
    private readonly outbox: OutboxService,
    private readonly figures: ProjectFigures,
  ) {}

  @Audited('project.close')
  execute(aid: string, pid: string): Promise<Project> {
    return transition(this.outbox, this.figures, aid, pid, 'close');
  }
}
