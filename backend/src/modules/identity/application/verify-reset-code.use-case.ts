import { Injectable } from '@nestjs/common';
import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { canonicalIdentifier } from '../domain/login-policy.js';
import { MAX_CODE_ATTEMPTS } from '../domain/one-time-code.js';
import { AccessTokenSigner } from '../infra/access-token-signer.js';
import { UncountedCodeAttempts } from '../infra/uncounted-code-attempts.js';
import { CodeService } from './code-service.js';

/**
 * auth.verify (architecture/03), espace auth : code de réinitialisation (6 chiffres) → jeton de réinitialisation de
 * 10 min, lié au code (consommé à auth.reset). Mêmes réponses qu'à l'activation, sans fuite d'existence : un compte
 * inconnu ou inactif est traité comme un identifiant sans code (essais comptés dans Redis, décision 22).
 */
@Injectable()
export class VerifyResetCodeUseCase {
  constructor(
    private readonly codes: CodeService,
    private readonly signer: AccessTokenSigner,
    private readonly uncounted: UncountedCodeAttempts,
  ) {}

  async execute(
    input: { space: 'platform' | 'association' | 'subscriber'; identifier: string; code: string },
    now = new Date(),
  ): Promise<{ resetToken: string; expiresAt: Date } | AfterCommit<never>> {
    const identifier = canonicalIdentifier(input.identifier);
    const [user] = await currentTx()
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(identifier.kind === 'email' ? eq(users.email, identifier.value) : eq(users.phoneE164, identifier.value))
      .limit(1);
    const userId = user?.status === 'active' ? user.id : null;

    const check = await this.codes.verify({ userId, purpose: 'password_reset', code: input.code }, now);
    if (!check.ok) {
      let problem: 'invalid_code' | 'code_expired' | 'too_many_attempts' =
        check.problem === 'already_used' ? 'invalid_code' : check.problem;
      if (check.uncounted && (await this.uncounted.hit('password_reset', identifier.value)) >= MAX_CODE_ATTEMPTS) {
        problem = 'too_many_attempts';
      }
      return afterCommit(() => Promise.reject(new DomainProblem(problem)));
    }
    if (!userId) throw new Error('auth.verify : code valide sans personne active');
    const { token, expiresAt } = await this.signer.signResetToken(
      { sub: userId, cid: check.codeId, space: input.space },
      now,
    );
    return { resetToken: token, expiresAt };
  }
}
