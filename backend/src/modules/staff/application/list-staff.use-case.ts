import { Injectable } from '@nestjs/common';
import { platformStaffList } from '../../access/access.public.js';
import { StaffAccounts } from '../../identity/identity.public.js';
import { staffMemberView, type StaffMemberView } from './staff-views.js';

/** pf.staff › list (lot 4.7) : tout le personnel, owners d'abord, puis admins et supports, par ancienneté. */
@Injectable()
export class ListStaffUseCase {
  constructor(private readonly accounts: StaffAccounts) {}

  async execute(): Promise<{ items: StaffMemberView[] }> {
    const rows = await platformStaffList();
    const contacts = await this.accounts.contactsOf(rows.map((r) => r.userId));
    return {
      items: rows.flatMap((row) => {
        const contact = contacts.get(row.userId);
        return contact ? [staffMemberView(row, contact)] : [];
      }),
    };
  }
}
