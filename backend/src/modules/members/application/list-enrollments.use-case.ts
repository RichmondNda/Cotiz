import { Injectable } from '@nestjs/common';
import type { Enrollment, EnrollmentsQuery } from '@cotiz/contracts';
import type { z } from 'zod';
import { projectOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { encodeCursor } from '../../../shared/pagination/index.js';
import { listPosition, MemberDirectory, pageOf, standingFacets } from './member-directory.js';
import { associationToday, contextAssociationId } from './member-context.js';

/**
 * en.list : inscriptions d'un projet de l'association (onglet Souscripteurs), les plus récentes d'abord. Recherche par
 * nom ou téléphone ; filtre par situation calculée par le domaine ; compteurs par situation (sans ce filtre).
 */
@Injectable()
export class ListEnrollmentsUseCase {
  constructor(private readonly directory: MemberDirectory) {}

  async execute(aid: string, pid: string, query: z.infer<typeof EnrollmentsQuery>) {
    const after = listPosition(query);
    const associationId = contextAssociationId(aid);
    if (!(await projectOf(associationId, pid))) throw new DomainProblem('not_found');
    const entries = await this.directory.entries(associationId, await associationToday(aid), {
      projectId: pid,
      q: query.q,
    });
    const filtered = query.standing ? entries.filter((e) => e.view.standing === query.standing) : entries;
    const page = pageOf(filtered, (e) => ({ at: e.at, id: e.row.id }), after, query.limit);
    return {
      items: page.items.map((e): Enrollment => e.view),
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: filtered.length,
      facets: { standing: standingFacets(entries.map((e) => e.view.standing)) },
    };
  }
}
