import { Injectable } from '@nestjs/common';
import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { Space } from '../../../shared/tenant-context/index.js';
import { generateTotpSecret, otpauthUrl } from '../domain/totp.js';
import { MfaFactors } from './mfa-factors.js';

/** Émetteur affiché par l'application d'authentification. */
const ISSUER = 'Cotiz';

/**
 * auth.mfa › enroll (`POST /me/mfa/totp`, lot 4.7) : nouveau secret TOTP, non confirmé, pour la personne du jeton.
 * Réservé aux sessions plateforme dans ce lot (double authentification obligatoire pour le personnel) : autre espace →
 * 403 `forbidden`. Facteur déjà confirmé → 409 `invalid_state` (aucune désactivation ni remplacement en V2). Un
 * enrôlement non confirmé précédent est remplacé.
 */
@Injectable()
export class EnrollTotpUseCase {
  constructor(private readonly factors: MfaFactors) {}

  async execute(input: { userId: string; space: Space }): Promise<{ secret: string; otpauthUrl: string }> {
    if (input.space !== 'platform') throw new DomainProblem('forbidden');
    await this.factors.lock(input.userId);
    if (await this.factors.hasConfirmed(input.userId)) throw new DomainProblem('invalid_state');
    const [user] = await currentTx()
      .select({ email: users.email, status: users.status })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (user?.status !== 'active') throw new DomainProblem('session_revoked');
    const secret = generateTotpSecret();
    await this.factors.startEnrollment(input.userId, secret);
    return { secret, otpauthUrl: otpauthUrl({ issuer: ISSUER, account: user.email ?? input.userId, secret }) };
  }
}
