import type { StaffMember } from '@cotiz/contracts';
import type { z } from 'zod';
import type { StaffRow } from '../../access/access.public.js';
import type { StaffContact } from '../../identity/identity.public.js';

export type StaffMemberView = z.infer<typeof StaffMember>;

/** Personne du personnel telle que pf.staff la renvoie : invitée tant que son compte attend l'activation. */
export function staffMemberView(row: Pick<StaffRow, 'userId' | 'role'>, contact: StaffContact): StaffMemberView {
  return {
    user: { id: row.userId, firstName: contact.firstName, lastName: contact.lastName, email: contact.email },
    role: row.role,
    status: contact.status === 'pending_activation' ? 'invited' : 'active',
    lastLoginAt: contact.lastLoginAt?.toISOString() ?? null,
  };
}

/** Owners dont le compte est actif (une invitation en attente ne compte pas). */
export function activeOwners(rows: readonly Pick<StaffRow, 'userId' | 'role'>[], contacts: Map<string, StaffContact>) {
  return rows.filter((r) => r.role === 'owner' && contacts.get(r.userId)?.status === 'active').length;
}
