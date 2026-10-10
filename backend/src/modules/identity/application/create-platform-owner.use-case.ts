import { Inject, Injectable } from '@nestjs/common';
import { credentials, oneTimeCodes, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { grantPlatformRole } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { formatActivationCode, generateActivationCode } from '../domain/activation-code.js';
import { SecretHasher } from '../infra/secret-hasher.js';

/** Durée d'un code d'activation (architecture/03-auth.md). */
const ACTIVATION_TTL_MS = 72 * 3_600_000;

export interface PlatformOwnerInput {
  email: string;
  firstName: string;
  lastName: string;
  /** Qui a lancé le script (`cli:<compte système>`) : l'audit n'a pas d'utilisateur connecté. */
  operator: string;
}

export interface IssuedActivation {
  userId: string;
  /** Forme affichée (`K7M4-P9QX`) : à remettre à la personne, jamais journalisée. */
  code: string;
  expiresAt: Date;
  /** Lien d'activation, sans le code. */
  activationUrl: string;
}

export class EmailAlreadyUsedError extends Error {
  override readonly name = 'EmailAlreadyUsedError';
}

/**
 * CLI `create-platform-owner` (lot 1.1) : un owner plateforme en attente d'activation et son code d'activation (72 h,
 * haché, non ré-affichable), à remettre par la personne qui lance la commande. Espace auth : le module identity
 * avant toute authentification.
 */
@Injectable()
export class CreatePlatformOwnerUseCase {
  constructor(
    private readonly hasher: SecretHasher,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Audited('platform_staff.create_owner')
  async execute(input: PlatformOwnerInput, now = new Date()): Promise<IssuedActivation> {
    const tx = currentTx();
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (taken) throw new EmailAlreadyUsedError('adresse déjà utilisée par un compte');

    const userId = newId();
    const code = generateActivationCode();
    const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS);
    await tx.insert(users).values({
      id: userId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'pending_activation',
      mustChangePassword: true,
    });
    await tx.insert(credentials).values({ userId });
    await grantPlatformRole(userId, 'owner');
    await tx.insert(oneTimeCodes).values({
      userId,
      purpose: 'activation',
      delivery: 'manual',
      codeHash: await this.hasher.hash(code),
      expiresAt,
    });
    recordAudit({
      entityType: 'user',
      entityId: userId,
      associationId: null,
      after: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        platformRole: 'owner',
        operator: input.operator,
      },
    });

    const base = this.config.APP_PUBLIC_URL ?? 'http://localhost:3000';
    return { userId, code: formatActivationCode(code), expiresAt, activationUrl: new URL('/activer', base).href };
  }
}
