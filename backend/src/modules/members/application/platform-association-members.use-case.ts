import { Injectable } from '@nestjs/common';
import type { ListQuery, PlatformAssociationMember } from '@cotiz/contracts';
import { overallStanding, todayIn } from '@cotiz/domain';
import type { z } from 'zod';
import { platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { encodeCursor } from '../../../shared/pagination/index.js';
import { type EnrollmentEntry, listPosition, MemberDirectory, pageOf } from './member-directory.js';

type Member = z.infer<typeof PlatformAssociationMember>;

/**
 * pf.asso.sub › members : personnes inscrites à au moins un projet de l'association (comme mb.list, retirées
 * comprises), lues par la plateforme (connexion cotiz_platform) ; projets suivis (retraits exclus), situation la plus
 * grave calculée par @cotiz/domain au jour de l'association ; recherche par nom ou téléphone ; les membres les plus
 * récents d'abord. Lecture auditée (ADR 0017). Association inconnue : 404.
 */
@Injectable()
export class PlatformAssociationMembersUseCase {
  constructor(private readonly directory: MemberDirectory) {}

  @Audited('association.view_members')
  async execute(id: string, query: z.infer<typeof ListQuery> & { q?: string | undefined }) {
    const after = listPosition(query);
    const association = await platformAssociationOf(id);
    if (!association) throw new DomainProblem('not_found');
    recordAudit({ entityType: 'association', entityId: association.id, associationId: association.id });
    const entries = await this.directory.entries(association.id, todayIn(association.timezone), { q: query.q });
    const byMember = new Map<string, EnrollmentEntry[]>();
    for (const entry of entries) byMember.set(entry.row.userId, [...(byMember.get(entry.row.userId) ?? []), entry]);
    const members = [...byMember.values()].map(memberOf);
    const page = pageOf(members, (m) => ({ at: m.at, id: m.member.user.id }), after, query.limit);
    return {
      items: page.items.map((m) => m.member),
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: members.length,
    };
  }
}

/** Ligne d'une personne (inscriptions non vides) ; `at` : sa première inscription (clé de tri). */
function memberOf(own: readonly EnrollmentEntry[]): { at: string; member: Member } {
  const [first] = [...own].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (!first) throw new Error('pf.asso.sub : personne sans inscription');
  const { status: _status, ...user } = first.member;
  return {
    at: first.at,
    member: {
      user,
      projectsCount: own.filter((e) => e.row.status !== 'withdrawn').length,
      standing: overallStanding(own.map((e) => e.view.standing)),
    },
  };
}
