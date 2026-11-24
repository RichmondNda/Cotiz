import { Inject, Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { credentials, oneTimeCodes, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { CodeService } from './code-service.js';

export interface StaffContact {
  firstName: string;
  lastName: string;
  email: string;
  status: (typeof users.status.enumValues)[number];
  lastLoginAt: Date | null;
}

function assertPlatform(what: string): void {
  if (currentContext()?.space !== 'platform') throw new Error(`${what} : espace plateforme attendu`);
}

/**
 * Comptes du personnel plateforme (pf.staff, lot 4.7), dans la transaction de l'appelant, espace plateforme. Invitation
 * d'une adresse sans compte seulement : compte en attente, code `staff_invite` (8 caractères, 72 h, haché, non
 * ré-affichable, jamais journalisé) remis par la personne qui invite (aucun email, ui-deviations).
 */
@Injectable()
export class StaffAccounts {
  constructor(
    private readonly codes: CodeService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Verrou de l'adresse (deux invitations simultanées de la même adresse ne créent qu'un compte). */
  async lockEmail(email: string): Promise<void> {
    assertPlatform('StaffAccounts.lockEmail');
    await currentTx().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`users:email:${email.toLowerCase()}`}, 0))`,
    );
  }

  /** Compte de cette adresse, `null` s'il n'y en a pas. */
  async findByEmail(email: string): Promise<{ userId: string; status: StaffContact['status'] } | null> {
    assertPlatform('StaffAccounts.findByEmail');
    const [user] = await currentTx()
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ? { userId: user.id, status: user.status } : null;
  }

  /** Nouveau compte en attente d'activation (mot de passe choisi à l'activation). */
  async create(account: { firstName: string; lastName: string; email: string }): Promise<string> {
    assertPlatform('StaffAccounts.create');
    const tx = currentTx();
    const userId = newId();
    await tx.insert(users).values({
      id: userId,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      status: 'pending_activation',
    });
    await tx.insert(credentials).values({ userId });
    return userId;
  }

  /** Compte créé par une invitation au personnel (son dernier code émis est un `staff_invite`) ? */
  async createdForStaff(userId: string): Promise<boolean> {
    assertPlatform('StaffAccounts.createdForStaff');
    const [code] = await currentTx()
      .select({ purpose: oneTimeCodes.purpose })
      .from(oneTimeCodes)
      .where(eq(oneTimeCodes.userId, userId))
      .orderBy(desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id))
      .limit(1);
    return code?.purpose === 'staff_invite';
  }

  /** Nouveau nom d'une personne encore invitée (réinvitation). */
  async rename(userId: string, name: { firstName: string; lastName: string }): Promise<void> {
    assertPlatform('StaffAccounts.rename');
    await currentTx().update(users).set(name).where(eq(users.id, userId));
  }

  /** Identité, statut du compte et dernière connexion des personnes du personnel. */
  async contactsOf(userIds: readonly string[]): Promise<Map<string, StaffContact>> {
    assertPlatform('StaffAccounts.contactsOf');
    if (userIds.length === 0) return new Map();
    const rows = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email ?? '',
          status: r.status,
          lastLoginAt: r.lastLoginAt,
        },
      ]),
    );
  }

  /** Émet le code d'invitation (invalide le précédent de la personne) ; le message prêt. */
  async issueInvite(input: { userId: string; issuedBy: string }, now = new Date()): Promise<Handoff> {
    assertPlatform('StaffAccounts.issueInvite');
    const code = await this.codes.issue(
      { userId: input.userId, purpose: 'staff_invite', associationId: null, issuedBy: input.issuedBy },
      now,
    );
    const [user] = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
      })
      .from(users)
      .where(eq(users.id, input.userId));
    if (!user) throw new Error('StaffAccounts : compte introuvable');
    return buildHandoff({
      purpose: 'staff_invite',
      space: 'platform',
      code: code.code,
      expiresAt: code.expiresAt,
      recipient: user,
      appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
    });
  }
}
