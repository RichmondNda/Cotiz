import { Injectable } from '@nestjs/common';
import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { matchTotp, normalizeRecoveryCode } from '../domain/totp.js';
import { AccessTokenSigner, type MfaClaims } from '../infra/access-token-signer.js';
import { MfaAttempts } from '../infra/mfa-attempts.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { MfaFactors, type TotpFactor } from './mfa-factors.js';
import { type OpenedSession, SessionOpener } from './session-opener.js';
import { SpaceAccess } from './space-access.js';

export type VerifyMfaInput = { mfaToken: string } & ({ code: string } | { recoveryCode: string });

/**
 * auth.mfa › verify (`POST /auth/mfa/verify`, lot 4.7), espace auth : second temps de la connexion plateforme. Le jeton
 * de second facteur (5 min, émis par auth.login après le mot de passe, à usage unique) et un code TOTP (pas courant ± 1, jamais
 * rejoué) ou un code de secours (usage unique, retiré à l'utilisation, audité `user.mfa_recovery_use`) ouvrent la
 * session complète. 5 codes faux en 15 min → 423 `too_many_attempts` (Redis), écrits après le COMMIT. Jeton absent,
 * expiré ou falsifié → 401 `session_expired` (recommencer la connexion) ; personne retirée du personnel ou compte
 * inactif entre-temps → 401 `wrong_space` (même message qu'à la connexion).
 */
@Injectable()
export class VerifyMfaUseCase {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly factors: MfaFactors,
    private readonly attempts: MfaAttempts,
    private readonly hasher: SecretHasher,
    private readonly sessions: SessionOpener,
    private readonly spaceAccess: SpaceAccess,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: VerifyMfaInput, now = new Date()): Promise<OpenedSession | AfterCommit<never>> {
    let claims: MfaClaims;
    try {
      claims = await this.signer.verifyMfaToken(input.mfaToken);
    } catch {
      throw new DomainProblem('session_expired');
    }
    const userId = claims.sub;
    const tx = currentTx();
    const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (user?.status !== 'active' || !(await this.spaceAccess.allows(userId, 'platform'))) {
      throw new DomainProblem('wrong_space');
    }
    // Facteur verrouillé AVANT de lire le compteur : des requêtes simultanées sont sérialisées et chacune voit les
    // essais comptés par les précédentes (jamais plus de 5 codes évalués).
    const factor = await this.factors.confirmedFor(userId);
    if (!factor) throw new DomainProblem('session_expired');
    if (await this.attempts.blocked(userId)) throw new DomainProblem('too_many_attempts');

    const accepted =
      'code' in input
        ? await this.totpAccepted(userId, factor, input.code, now)
        : await this.recoveryAccepted(factor, input.recoveryCode);
    if (!accepted) {
      const blocked = await this.attempts.fail(userId);
      const problem = new DomainProblem(blocked ? 'too_many_attempts' : 'invalid_code');
      return afterCommit(() => Promise.reject(problem));
    }
    await this.attempts.succeed(userId);
    // Jeton de second facteur à usage unique : un second code avec le même jeton n'ouvre pas une autre session.
    if (!(await this.attempts.consumeToken(claims.jti))) throw new DomainProblem('session_expired');

    await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
    const session = await this.sessions.open({ userId, space: 'platform', rememberMe: claims.rememberMe }, now);
    await this.outbox.publish(tx, {
      type: 'user.logged_in',
      associationId: null,
      actorUserId: userId,
      aggregate: { type: 'user', id: userId },
      payload: { userId, space: 'platform' },
    });
    return session;
  }

  private async totpAccepted(userId: string, factor: TotpFactor, code: string, now: Date): Promise<boolean> {
    const step = matchTotp(factor.secret, code, now);
    return step !== null && (await this.attempts.claimStep(userId, step));
  }

  /** Code de secours juste : retiré du facteur (verrouillé par confirmedFor), dans la même transaction. */
  private async recoveryAccepted(factor: TotpFactor, recoveryCode: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(recoveryCode);
    for (const [index, hash] of factor.recoveryCodeHashes.entries()) {
      if (await this.hasher.verify(hash, normalized)) {
        await this.useRecoveryCode(factor, index);
        return true;
      }
    }
    return false;
  }

  @Audited('user.mfa_recovery_use')
  private async useRecoveryCode(factor: TotpFactor, index: number): Promise<void> {
    const remaining = factor.recoveryCodeHashes.filter((_, i) => i !== index);
    await this.factors.replaceRecoveryCodes(factor.id, remaining);
    recordAudit({
      entityType: 'mfa_factor',
      entityId: factor.id,
      associationId: null,
      before: { recoveryCodesLeft: factor.recoveryCodeHashes.length },
      after: { recoveryCodesLeft: remaining.length },
    });
  }
}
