import { Inject, Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { credentials, oneTimeCodes, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { buildHandoff } from '../domain/handoff.js';
import { CodeService } from './code-service.js';

export interface ManagerContact {
  firstName: string;
  lastName: string;
  email: string;
  /** Téléphone E.164 ; gardé sur le compte s'il n'est pas déjà celui d'une autre personne. */
  phone: string;
}

export interface ManagerAccount {
  userId: string;
  status: (typeof users.status.enumValues)[number];
}

/**
 * Compte du gestionnaire principal d'une nouvelle association (approbation, création directe ; architecture/04 §4.1),
 * dans la transaction de l'appelant. Espace plateforme seulement (table globale `users`).
 * Code d'activation émis par la plateforme (sans association), chiffré pour reconstruire le message prêt au rejeu
 * idempotent : jamais de code en clair hors de la réponse.
 */
@Injectable()
export class ManagerAccounts {
  constructor(
    private readonly codes: CodeService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Compte existant de cette adresse (rattachement), `null` sinon. */
  async findByEmail(email: string): Promise<ManagerAccount | null> {
    assertPlatform('ManagerAccounts.findByEmail');
    const [user] = await currentTx()
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ? { userId: user.id, status: user.status } : null;
  }

  /** Nouveau compte en attente d'activation ; son identifiant. */
  async create(contact: ManagerContact): Promise<string> {
    assertPlatform('ManagerAccounts.create');
    const tx = currentTx();
    const [phoneTaken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, contact.phone))
      .limit(1);
    const userId = newId();
    await tx.insert(users).values({
      id: userId,
      email: contact.email,
      phoneE164: phoneTaken ? null : contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: 'pending_activation',
    });
    await tx.insert(credentials).values({ userId });
    return userId;
  }

  /** Émet le code d'activation et renvoie le message prêt (espace association). */
  async issueActivation(userId: string, issuedBy: string, personalMessage?: string): Promise<Handoff> {
    assertPlatform('ManagerAccounts.issueActivation');
    const code = await this.codes.issue({
      userId,
      purpose: 'activation',
      associationId: null,
      issuedBy,
      redisplayable: true,
    });
    return this.handoff(userId, code.code, code.expiresAt, personalMessage);
  }

  /**
   * Message prêt du code émis par `issuedBy` depuis `since` (rejeu de la même opération) ; `null` si ce code est
   * consommé, expiré, bloqué, remplacé, ou s'il n'y en a pas eu (compte déjà actif, rattaché sans code).
   */
  async reissuedHandoff(
    userId: string,
    issuedBy: string,
    since: Date,
    personalMessage?: string,
  ): Promise<Handoff | null> {
    assertPlatform('ManagerAccounts.reissuedHandoff');
    const [row] = await currentTx()
      .select({ id: oneTimeCodes.id, expiresAt: oneTimeCodes.expiresAt })
      .from(oneTimeCodes)
      .where(
        and(
          eq(oneTimeCodes.userId, userId),
          eq(oneTimeCodes.purpose, 'activation'),
          eq(oneTimeCodes.issuedBy, issuedBy),
          isNull(oneTimeCodes.associationId),
          gte(oneTimeCodes.createdAt, since),
        ),
      )
      .orderBy(desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id))
      .limit(1);
    const code = row ? await this.codes.reveal(row.id) : null;
    return row && code ? this.handoff(userId, code, row.expiresAt, personalMessage) : null;
  }

  private async handoff(userId: string, code: string, expiresAt: Date, personalMessage?: string): Promise<Handoff> {
    const [user] = await currentTx()
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phoneE164,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new Error('ManagerAccounts : compte introuvable');
    return buildHandoff({
      purpose: 'activation',
      space: 'association',
      code,
      expiresAt,
      recipient: user,
      appUrl: this.config.APP_PUBLIC_URL ?? 'http://localhost:3000',
      personalMessage,
    });
  }
}

function assertPlatform(what: string): void {
  if (currentContext()?.space !== 'platform') throw new Error(`${what} : espace plateforme seulement`);
}
