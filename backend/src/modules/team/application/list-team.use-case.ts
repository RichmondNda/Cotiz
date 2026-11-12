import { Injectable } from '@nestjs/common';
import { quotaOf } from '../../billing/billing.public.js';
import { teamOf } from '../../access/access.public.js';
import { TeamAccounts } from '../../identity/identity.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { teamMemberView, type TeamMemberView } from './team-views.js';

/**
 * tm.team › list : gestionnaires invités ou actifs (owner d'abord, puis ancienneté) et places de l'équipe (`seats` :
 * owner, manager, viewer invités ou actifs, limite de l'abonnement en cours ; `null` illimité).
 */
@Injectable()
export class ListTeamUseCase {
  constructor(private readonly accounts: TeamAccounts) {}

  async execute(aid: string): Promise<{ items: TeamMemberView[]; seats: { used: number; limit: number | null } }> {
    const associationId = contextAssociationId(aid);
    const rows = await teamOf(associationId);
    const contacts = await this.accounts.contactsOf(rows.map((r) => r.userId));
    const items = rows.flatMap((row) => {
      const contact = contacts.get(row.userId);
      return contact ? [teamMemberView(row, contact)] : [];
    });
    return { items, seats: await quotaOf(associationId, 'managers') };
  }
}
