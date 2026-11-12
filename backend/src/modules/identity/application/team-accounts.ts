import { Inject, Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { credentials, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { eq, inArray, sql } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { CodeService } from './code-service.js';
import { assertAssociation } from './subscriber-accounts.js';

export interface TeamAccount {
  userId: string;
  status: (typeof users.status.enumValues)[number];
}

export interface TeamContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  lastLoginAt: Date | null;
}

export interface NewTeamAccount {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
}

/**
 * Comptes des gestionnaires invités dans une équipe (tm.team, lot 4.5), dans la transaction de l'appelant, contexte de
 * l'association. Code `team_invite` émis par l'association (8 caractères, 72 h, non ré-affichable : architecture/03),
 * jamais journalisé ; l'invitation d'un compte actif s'accepte avec son mot de passe actuel (auth.activate).
 */
@Injectable()
export class TeamAccounts {
  constructor(
    private readonly codes: CodeService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Verrou de l'adresse (deux invitations simultanées de la même adresse ne créent qu'un compte). */
  async lockEmail(email: string): Promise<void> {
    assertAssociation('TeamAccounts.lockEmail');
    await currentTx().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`users:email:${email.toLowerCase()}`}, 0))`,
    );
  }

  /** Compte de cette adresse, `null` s'il n'y en a pas. */
  async findByEmail(email: string): Promise<TeamAccount | null> {
    assertAssociation('TeamAccounts.findByEmail');
    const [user] = await currentTx()
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ? { userId: user.id, status: user.status } : null;
  }

  /** Nouveau compte en attente d'activation ; téléphone gardé s'il n'est pas celui d'une autre personne. */
  async create(account: NewTeamAccount): Promise<string> {
    assertAssociation('TeamAccounts.create');
    const tx = currentTx();
    const [phoneTaken] = account.phone
      ? await tx.select({ id: users.id }).from(users).where(eq(users.phoneE164, account.phone)).limit(1)
      : [];
    const userId = newId();
    await tx.insert(users).values({
      id: userId,
      email: account.email,
      phoneE164: account.phone && !phoneTaken ? account.phone : null,
      firstName: account.firstName,
      lastName: account.lastName,
      status: 'pending_activation',
    });
    await tx.insert(credentials).values({ userId });
    return userId;
  }

  /** Coordonnées et dernière connexion des personnes de l'équipe. */
  async contactsOf(userIds: readonly string[]): Promise<Map<string, TeamContact>> {
    assertAssociation('TeamAccounts.contactsOf');
    if (userIds.length === 0) return new Map();
    const rows = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
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
          phone: r.phone,
          lastLoginAt: r.lastLoginAt,
        },
      ]),
    );
  }

  /**
   * Émet le code d'invitation (invalide le précédent de la personne) ; le message prêt. `existingAccount` : compte déjà
   * actif, qui accepte avec son mot de passe actuel.
   */
  async issueInvite(input: {
    userId: string;
    associationId: string;
    associationName: string;
    issuedBy: string;
    existingAccount: boolean;
    personalMessage?: string | undefined;
  }): Promise<Handoff> {
    assertAssociation('TeamAccounts.issueInvite');
    const code = await this.codes.issue({
      userId: input.userId,
      purpose: 'team_invite',
      associationId: input.associationId,
      issuedBy: input.issuedBy,
    });
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
    if (!user) throw new Error('TeamAccounts : compte introuvable');
    return buildHandoff({
      purpose: 'team_invite',
      space: 'association',
      code: code.code,
      expiresAt: code.expiresAt,
      recipient: user,
      appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
      personalMessage: input.personalMessage,
      invitation: { associationName: input.associationName, existingAccount: input.existingAccount },
    });
  }
}
