import type { TeamMember } from '@cotiz/contracts';
import type { z } from 'zod';
import type { TeamRow } from '../../access/access.public.js';
import type { TeamContact } from '../../identity/identity.public.js';

export type TeamMemberView = z.infer<typeof TeamMember>;

/** Gestionnaire de l'équipe tel que tm.team le renvoie. */
export function teamMemberView(
  row: Pick<TeamRow, 'userId' | 'role' | 'title' | 'status'>,
  contact: TeamContact,
): TeamMemberView {
  return {
    member: {
      id: row.userId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
    },
    role: row.role,
    title: row.title,
    status: row.status,
    lastLoginAt: contact.lastLoginAt?.toISOString() ?? null,
  };
}
