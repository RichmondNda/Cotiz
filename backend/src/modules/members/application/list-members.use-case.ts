import { Injectable } from '@nestjs/common';
import type { MembersQuery, MemberSummary } from '@cotiz/contracts';
import { Money, overallStanding } from '@cotiz/domain';
import type { z } from 'zod';
import { encodeCursor } from '../../../shared/pagination/index.js';
import { type EnrollmentEntry, listPosition, MemberDirectory, pageOf, standingFacets } from './member-directory.js';
import { associationToday, contextAssociationId } from './member-context.js';

type Summary = z.infer<typeof MemberSummary>;

/**
 * mb.list : annuaire de l'association, une ligne par personne inscrite à au moins un de ses projets (retirée comprise,
 * choix de l'étape 6), les membres les plus récents d'abord (première inscription). Totaux par Money.sum, situation =
 * la plus grave de ses inscriptions (overallStanding). Filtre projet : personnes inscrites à ce projet, tous leurs
 * projets affichés. Compteurs par situation sans le filtre de situation.
 */
@Injectable()
export class ListMembersUseCase {
  constructor(private readonly directory: MemberDirectory) {}

  async execute(aid: string, query: z.infer<typeof MembersQuery>) {
    const after = listPosition(query);
    const associationId = contextAssociationId(aid);
    const entries = await this.directory.entries(associationId, await associationToday(aid), { q: query.q });
    const byMember = new Map<string, EnrollmentEntry[]>();
    for (const entry of entries) byMember.set(entry.row.userId, [...(byMember.get(entry.row.userId) ?? []), entry]);
    const members = [...byMember.values()]
      .filter((own) => !query.projectId || own.some((e) => e.row.projectId === query.projectId))
      .map(summaryOf);
    const filtered = query.standing ? members.filter((m) => m.summary.standing === query.standing) : members;
    const page = pageOf(filtered, (m) => ({ at: m.at, id: m.summary.member.id }), after, query.limit);
    return {
      items: page.items.map((m) => m.summary),
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: filtered.length,
      facets: { standing: standingFacets(members.map((m) => m.summary.standing)) },
    };
  }
}

/** Ligne de l'annuaire d'une personne (inscriptions non vides) ; `at` : sa première inscription (clé de tri). */
function summaryOf(own: readonly EnrollmentEntry[]): { at: string; summary: Summary } {
  const sorted = [...own].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const [first] = sorted;
  if (!first) throw new Error('mb.list : personne sans inscription');
  const currency = first.view.paid.currency;
  const { status: _status, ...member } = first.member;
  return {
    at: first.at,
    summary: {
      member,
      projects: sorted.map((e) => ({ id: e.project.id, name: e.project.name })),
      totalPaid: Money.sum(
        sorted.map((e) => Money.of(e.view.paid.amount, e.view.paid.currency)),
        currency,
      ),
      totalRemaining: Money.sum(
        sorted.map((e) => Money.of(e.view.remaining.amount, e.view.remaining.currency)),
        currency,
      ),
      standing: overallStanding(sorted.map((e) => e.view.standing)),
    },
  };
}
