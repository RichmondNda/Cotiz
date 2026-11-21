import { Injectable } from '@nestjs/common';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import type { Space } from '../../../shared/tenant-context/index.js';
import { generateRecoveryCodes, matchTotp, normalizeRecoveryCode } from '../domain/totp.js';
import { MfaAttempts } from '../infra/mfa-attempts.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { MfaFactors } from './mfa-factors.js';
import { SessionFamilies } from './session-families.js';

/**
 * auth.mfa › confirm (`POST /me/mfa/totp/confirm`, lot 4.7) : le premier code de l'application confirme l'enrôlement
 * en cours. Codes de secours générés, hachés (argon2id), affichés une seule fois. Événement `user.mfa_enabled`, audit
 * `user.mfa_enable`. Code faux : compté (5 → `too_many_attempts`, comme à la vérification), écrit après le COMMIT.
 * Sans enrôlement en cours, ou facteur déjà confirmé : 409 `invalid_state`. Toutes les autres connexions de la
 * personne sont révoquées : une session restreinte ouverte ailleurs avec le seul mot de passe ne devient jamais
 * complète au renouvellement (seule celle qui a prouvé le code le devient).
 */
@Injectable()
export class ConfirmTotpUseCase {
  constructor(
    private readonly factors: MfaFactors,
    private readonly attempts: MfaAttempts,
    private readonly hasher: SecretHasher,
    private readonly outbox: OutboxService,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
  ) {}

  async execute(
    input: { userId: string; sessionId: string; space: Space; code: string },
    now = new Date(),
  ): Promise<AfterCommit<{ recoveryCodes: string[] }> | AfterCommit<never>> {
    if (input.space !== 'platform') throw new DomainProblem('forbidden');
    await this.factors.lock(input.userId);
    if (await this.factors.hasConfirmed(input.userId)) throw new DomainProblem('invalid_state');
    const familyId = await this.families.familyOf(input.sessionId, input.userId);
    if (!familyId) throw new DomainProblem('session_expired');
    const pending = await this.factors.pendingFor(input.userId);
    if (!pending) throw new DomainProblem('invalid_state');
    if (await this.attempts.blocked(input.userId)) throw new DomainProblem('too_many_attempts');

    const step = matchTotp(pending.secret, input.code, now);
    if (step === null || !(await this.attempts.claimStep(input.userId, step))) {
      const blocked = await this.attempts.fail(input.userId);
      const problem = new DomainProblem(blocked ? 'too_many_attempts' : 'invalid_code');
      return afterCommit(() => Promise.reject(problem));
    }
    await this.attempts.succeed(input.userId);
    const recoveryCodes = await this.enable(input.userId, pending.id, now);
    const blacklist = await this.families.revokeOthers(input.userId, familyId, now);
    return afterCommit(async () => {
      if (blacklist.length > 0) await this.revoked.revoke(blacklist);
      return { recoveryCodes };
    });
  }

  @Audited('user.mfa_enable')
  private async enable(userId: string, factorId: string, now: Date): Promise<string[]> {
    const recoveryCodes = generateRecoveryCodes();
    const hashes = await Promise.all(recoveryCodes.map((code) => this.hasher.hash(normalizeRecoveryCode(code))));
    await this.factors.confirm(factorId, hashes, now);
    await this.outbox.publish(currentTx(), {
      type: 'user.mfa_enabled',
      associationId: null,
      actorUserId: userId,
      aggregate: { type: 'user', id: userId },
      payload: { userId },
    });
    recordAudit({
      entityType: 'user',
      entityId: userId,
      associationId: null,
      before: { mfa: null },
      after: { mfa: 'totp' },
    });
    return recoveryCodes;
  }
}
