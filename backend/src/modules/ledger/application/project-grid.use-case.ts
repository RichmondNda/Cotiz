import { Injectable } from '@nestjs/common';
import type { GridQuery, Grid } from '@cotiz/contracts';
import type { z } from 'zod';
import {
  associationToday,
  contextAssociationId,
  installmentView,
  listPosition,
  MemberDirectory,
  pageOf,
  standingFacets,
} from '../../members/members.public.js';
import { enrollmentScheduleOf, projectOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { encodeCursor } from '../../../shared/pagination/index.js';

type Column = z.infer<typeof Grid>['columns'][number];

/**
 * lg.grid : grille d'un projet de l'association, une ligne par inscription non retirée (les plus récentes d'abord,
 * comme l'onglet Souscripteurs), une case par échéance. Statuts par installmentStatus() au jour de l'association,
 * situation et reste dû de toute l'inscription (enrollmentView), quelle que soit la période affichée. Colonnes :
 * échéancier du projet (numérotation commune) et échéances générées depuis (cycle roulant). Recherche, situation,
 * compteurs et pages comme en.list.
 */
@Injectable()
export class ProjectGridUseCase {
  constructor(private readonly directory: MemberDirectory) {}

  async execute(aid: string, pid: string, query: z.infer<typeof GridQuery>): Promise<z.infer<typeof Grid>> {
    const after = listPosition(query);
    const associationId = contextAssociationId(aid);
    const project = await projectOf(associationId, pid);
    if (!project) throw new DomainProblem('not_found');
    const inPeriod = (date: string) => (!query.from || date >= query.from) && (!query.to || date <= query.to);
    const today = await associationToday(associationId);
    const entries = (await this.directory.entries(associationId, today, { projectId: pid, q: query.q })).filter(
      (e) => e.row.status !== 'withdrawn',
    );

    const columns = new Map<string, Column>();
    const schedule = enrollmentScheduleOf(project, project.startDate);
    for (const line of Array.isArray(schedule) ? schedule : []) {
      columns.set(`${line.kind}:${String(line.sequence)}`, {
        sequence: line.sequence,
        kind: line.kind,
        dueDate: line.dueDate,
      });
    }
    for (const line of entries.flatMap((e) => e.lines)) {
      const key = `${line.kind}:${String(line.sequence)}`;
      if (!columns.has(key)) columns.set(key, { sequence: line.sequence, kind: line.kind, dueDate: line.dueDate });
    }

    const filtered = query.standing ? entries.filter((e) => e.view.standing === query.standing) : entries;
    const page = pageOf(filtered, (e) => ({ at: e.at, id: e.row.id }), after, query.limit);
    return {
      items: page.items.map((e) => ({
        enrollmentId: e.row.id,
        member: { id: e.member.id, firstName: e.member.firstName, lastName: e.member.lastName },
        standing: e.view.standing,
        remaining: e.view.remaining,
        cells: e.lines
          .filter((line) => inPeriod(line.dueDate))
          .map((line) => {
            const cell = installmentView(line, e.project, today);
            return {
              installmentId: cell.id,
              sequence: cell.sequence,
              status: cell.status,
              amountDue: cell.amountDue,
              amountPaid: cell.amountPaid,
              amountPending: cell.amountPending,
            };
          }),
      })),
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: filtered.length,
      facets: { standing: standingFacets(entries.map((e) => e.view.standing)) },
      columns: [...columns.values()]
        .filter((c) => inPeriod(c.dueDate))
        .sort((a, b) => (a.kind === b.kind ? a.sequence - b.sequence : a.kind === 'entry_fee' ? -1 : 1)),
    };
  }
}
