import { Injectable } from '@nestjs/common';
import type { MemberDetail } from '@cotiz/contracts';
import { subscriberProfiles } from '@cotiz/db';
import { overallStanding } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { installmentView } from './enrollment-views.js';
import { MemberDirectory } from './member-directory.js';
import { associationToday, contextAssociationId } from './member-context.js';

type Detail = z.infer<typeof MemberDetail>;

/**
 * mb.get : fiche d'une personne inscrite à au moins un projet de l'association (sinon 404, même souscriptrice) :
 * profil (adresse et ville de subscriber_profiles), membre depuis sa première inscription, situation la plus grave,
 * inscriptions (les plus récentes d'abord) avec leurs échéances calculées au jour de l'association, version du compte
 * (If-Match de mb.patch).
 */
@Injectable()
export class GetMemberUseCase {
  constructor(
    private readonly directory: MemberDirectory,
    private readonly accounts: SubscriberAccounts,
  ) {}

  async execute(aid: string, uid: string): Promise<Detail> {
    const associationId = contextAssociationId(aid);
    const today = await associationToday(aid);
    const entries = await this.directory.entries(associationId, today, { userId: uid });
    const sorted = [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const first = sorted.at(-1);
    if (!first) throw new DomainProblem('not_found');
    const [profile] = await currentTx()
      .select({ address: subscriberProfiles.address, city: subscriberProfiles.city })
      .from(subscriberProfiles)
      .where(eq(subscriberProfiles.userId, uid));
    const version = await this.accounts.versionOf(uid);
    if (version === null) throw new DomainProblem('not_found');
    const { status, ...contact } = first.member;
    return {
      member: { ...contact, address: profile?.address ?? null, city: profile?.city ?? null, accountStatus: status },
      memberSince: first.view.joinedAt,
      standing: overallStanding(sorted.map((e) => e.view.standing)),
      enrollments: sorted.map((e) => ({
        ...e.view,
        project: { id: e.project.id, name: e.project.name },
        installments: e.lines.map((i) => installmentView(i, e.project, today)),
      })),
      version,
    };
  }
}
