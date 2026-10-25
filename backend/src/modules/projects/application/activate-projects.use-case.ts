import { Injectable, Logger } from '@nestjs/common';
import { projects } from '@cotiz/db';
import { todayIn } from '@cotiz/domain';
import { and, eq, lte, sql } from 'drizzle-orm';
import { TIMEZONE } from '../../../shared/scheduler/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { TRANSITIONS } from '../domain/project-lifecycle.js';

/**
 * Tâche `projects.activate` (jobs.yaml : quotidienne 00:30, lot 2.2), espace system (politique `system_access`),
 * idempotente : les projets aux inscriptions ouvertes dont la date de début (jour civil du fuseau de la plateforme)
 * est atteinte passent en cours, toutes associations confondues ; version suivante.
 */
@Injectable()
export class ActivateProjectsUseCase {
  private readonly logger = new Logger(ActivateProjectsUseCase.name);

  constructor(private readonly db: TenantDatabase) {}

  async execute(now: Date): Promise<void> {
    const today = todayIn(TIMEZONE, now);
    const activated = await this.db.withTenantContext({ space: 'system' }, () =>
      currentTx()
        .update(projects)
        .set({ status: TRANSITIONS.activate.to, version: sql`${projects.version} + 1` })
        .where(and(eq(projects.status, 'enrolling'), lte(projects.startDate, today)))
        .returning({ id: projects.id }),
    );
    if (activated.length > 0) this.logger.log({ msg: 'projets démarrés', count: activated.length });
  }
}
