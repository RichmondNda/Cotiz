import { Injectable } from '@nestjs/common';
import { projectPaymentMethods, projects } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { DELETABLE_STATUSES } from '../domain/project-lifecycle.js';
import { contextAssociationId, projectOf, toProject } from './project-records.js';

/**
 * pr.delete : suppression d'un brouillon (Q4), sous verrou optimiste (`If-Match`, 412). Un projet publié n'est jamais
 * supprimé (il se clôture) : aucune inscription ni donnée financière n'existe avant la publication. Ses moyens
 * retenus partent avec lui ; sa couverture reste stockée (housekeeping ne purge que les dépôts non confirmés). Projet
 * lu FOR UPDATE : aucune ligne ne peut le référencer pendant la suppression. Audité avec l'état supprimé.
 */
@Injectable()
export class DeleteProjectUseCase {
  @Audited('project.delete')
  async execute(aid: string, pid: string): Promise<void> {
    const version = expectedVersion();
    const associationId = contextAssociationId(aid);
    const current = await projectOf(associationId, pid, { lock: 'delete' });
    if (!current) throw new DomainProblem('not_found');
    if (!DELETABLE_STATUSES.includes(current.status)) throw new DomainProblem('invalid_state');
    if (current.version !== version) throw new DomainProblem('version_conflict');

    const before = await toProject(current);
    const tx = currentTx();
    await tx
      .delete(projectPaymentMethods)
      .where(
        and(eq(projectPaymentMethods.associationId, associationId), eq(projectPaymentMethods.projectId, current.id)),
      );
    await tx.delete(projects).where(and(eq(projects.associationId, associationId), eq(projects.id, current.id)));
    const { stats: _stats, ...state } = before;
    recordAudit({ entityType: 'project', entityId: current.id, associationId, before: state, after: null });
  }
}
