import { projects } from '@cotiz/db';
import { and, inArray, ne, sql } from 'drizzle-orm';
import { PROJECT_QUOTA_STATUSES } from '../../billing/billing.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export interface ProjectCounts {
  /** Projets de l'association, archivés exclus (liste et fiche plateforme). */
  total: number;
  /** Projets comptés par le quota du plan (QuotaService, choix Q6). */
  quota: number;
  /** Inscriptions ouvertes ou en cours (indicateur « projets actifs » de la fiche). */
  active: number;
}

const QUOTA = sql.join(
  PROJECT_QUOTA_STATUSES.map((s) => sql`${s}`),
  sql`, `,
);

/**
 * Comptes de projets de chaque association demandée (pf.asso.list, pf.asso.get), en une lecture ; une association sans
 * projet a des comptes à zéro. Plateforme seulement (connexion cotiz_platform).
 */
export async function platformProjectCountsOf(associationIds: readonly string[]): Promise<Map<string, ProjectCounts>> {
  if (currentContext()?.space !== 'platform') throw new Error('platformProjectCountsOf : espace plateforme seulement');
  const counts = new Map<string, ProjectCounts>(associationIds.map((id) => [id, { total: 0, quota: 0, active: 0 }]));
  if (counts.size === 0) return counts;
  const rows = await currentTx()
    .select({
      associationId: projects.associationId,
      total: sql<number>`count(*)`.mapWith(Number),
      quota: sql<number>`count(*) FILTER (WHERE ${projects.status} IN (${QUOTA}))`.mapWith(Number),
      active: sql<number>`count(*) FILTER (WHERE ${projects.status} IN ('enrolling', 'active'))`.mapWith(Number),
    })
    .from(projects)
    .where(and(inArray(projects.associationId, [...counts.keys()]), ne(projects.status, 'archived')))
    .groupBy(projects.associationId);
  for (const { associationId, ...row } of rows) counts.set(associationId, row);
  return counts;
}
