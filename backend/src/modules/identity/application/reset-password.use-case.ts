import { Injectable } from '@nestjs/common';
import { credentials, oneTimeCodes, passwordResetRequests, sessions, users } from '@cotiz/db';
import { isStrongPassword } from '@cotiz/domain';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { ErrorReporter } from '../../../shared/telemetry/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { ACCESS_TOKEN_TTL_MS } from '../domain/login-policy.js';
import { AccessTokenSigner, type ResetClaims } from '../infra/access-token-signer.js';
import { type LoginSubject, LoginThrottle } from '../infra/login-throttle.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { CodeService } from './code-service.js';

/**
 * auth.reset (architecture/03), espace auth : jeton de réinitialisation + nouveau mot de passe. Le code lié au jeton
 * est consommé (jeton à usage unique) ; toutes les sessions de la personne sont révoquées, leurs jetons d'accès mis en
 * liste noire, le verrou de connexion levé (après le COMMIT : Redis n'annule jamais le changement en base) ; la
 * demande est terminée ; `user.password_changed`, audit.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly codes: CodeService,
    private readonly hasher: SecretHasher,
    private readonly outbox: OutboxService,
    private readonly revoked: RevokedSessions,
    private readonly throttle: LoginThrottle,
    private readonly errors: ErrorReporter,
  ) {}

  async execute(input: { resetToken: string; newPassword: string }, now = new Date()): Promise<AfterCommit<void>> {
    let claims: ResetClaims;
    try {
      claims = await this.signer.verifyResetToken(input.resetToken);
    } catch {
      throw new DomainProblem('reset_token_invalid');
    }
    const tx = currentTx();
    const [target] = await tx
      .select({ status: users.status, email: users.email, phone: users.phoneE164, consumedAt: oneTimeCodes.consumedAt })
      .from(oneTimeCodes)
      .innerJoin(users, eq(users.id, oneTimeCodes.userId))
      .where(
        and(
          eq(oneTimeCodes.id, claims.cid),
          eq(oneTimeCodes.userId, claims.sub),
          eq(oneTimeCodes.purpose, 'password_reset'),
        ),
      )
      .limit(1);
    if (target?.consumedAt !== null || target.status !== 'active') throw new DomainProblem('reset_token_invalid');
    // Un code émis depuis rend ce jeton caduc (émettre invalide les codes précédents, et leurs jetons avec).
    const [latest] = await tx
      .select({ id: oneTimeCodes.id })
      .from(oneTimeCodes)
      .where(and(eq(oneTimeCodes.userId, claims.sub), eq(oneTimeCodes.purpose, 'password_reset')))
      .orderBy(desc(oneTimeCodes.createdAt), desc(oneTimeCodes.id))
      .limit(1);
    if (latest?.id !== claims.cid) throw new DomainProblem('reset_token_invalid');

    const identifiers = [target.email, target.phone].filter((value): value is string => value !== null);
    if (
      identifiers.some((identifier) => !isStrongPassword(input.newPassword, { identifier })) ||
      !isStrongPassword(input.newPassword)
    ) {
      throw new DomainProblem('weak_password');
    }
    // Deux réinitialisations simultanées avec le même jeton : une seule consomme.
    if (!(await this.codes.consume(claims.cid, now))) throw new DomainProblem('reset_token_invalid');

    const blacklist = await this.reset(claims, input.newPassword, now);
    const subjects: LoginSubject[] = [{ userId: claims.sub }, ...identifiers.map((identifier) => ({ identifier }))];
    // Les deux, quoi qu'il arrive à l'autre : une liste noire en échec ne laisse pas la personne verrouillée.
    return afterCommit(async () => {
      const [blacklisted, released] = await Promise.allSettled([
        this.revoked.revoke(blacklist),
        this.throttle.release(subjects),
      ]);
      if (released.status === 'rejected') this.errors.capture(released.reason, { step: 'reset_password.release' });
      // Jetons d'accès encore valides : l'échec n'est jamais ignoré (la base est déjà à jour).
      if (blacklisted.status === 'rejected') throw blacklisted.reason;
    });
  }

  /** Renvoie les sessions dont un jeton d'accès peut encore être valide (liste noire après le COMMIT). */
  @Audited('user.reset_password')
  private async reset(claims: ResetClaims, newPassword: string, now: Date): Promise<string[]> {
    const tx = currentTx();
    const secret = {
      passwordHash: await this.hasher.hash(newPassword),
      passwordChangedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
    };
    await tx
      .insert(credentials)
      .values({ userId: claims.sub, ...secret })
      .onConflictDoUpdate({ target: credentials.userId, set: secret });
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, claims.sub), isNull(sessions.revokedAt)));
    const recent = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, claims.sub),
          gt(sessions.createdAt, new Date(now.getTime() - ACCESS_TOKEN_TTL_MS - 60_000)),
        ),
      );
    await tx
      .update(passwordResetRequests)
      .set({ status: 'completed', codeId: claims.cid, handledAt: now })
      .where(
        and(
          eq(passwordResetRequests.userId, claims.sub),
          inArray(passwordResetRequests.status, ['pending', 'code_issued']),
        ),
      );
    await this.outbox.publish(tx, {
      type: 'user.password_changed',
      associationId: null,
      actorUserId: claims.sub,
      aggregate: { type: 'user', id: claims.sub },
      payload: { userId: claims.sub },
    });
    recordAudit({ entityType: 'user', entityId: claims.sub, associationId: null, after: { passwordChangedAt: now } });
    return recent.map((row) => row.id);
  }
}
