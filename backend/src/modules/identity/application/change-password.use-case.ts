import { Injectable } from '@nestjs/common';
import { credentials, sessions, users } from '@cotiz/db';
import { isStrongPassword } from '@cotiz/domain';
import { and, eq } from 'drizzle-orm';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { SessionFamilies } from './session-families.js';

/**
 * me.profile › changePassword (lot 3.1), espace me : mot de passe actuel + nouveau mot de passe, pour la personne du
 * jeton. Mot de passe actuel faux : 401 `invalid_credentials` (rien n'est écrit) ; nouveau mot de passe refusé par la
 * même règle qu'à l'activation et à la réinitialisation (`isStrongPassword`, aussi contre l'email et le téléphone) :
 * 422 `weak_password`. La connexion en cours (sa famille de sessions) est gardée ; toutes les autres sont révoquées,
 * leurs jetons d'accès encore valides mis en liste noire APRÈS le COMMIT (Redis indisponible n'annule jamais le
 * changement en base). `user.password_changed`, audité ; jamais de mot de passe dans l'audit, l'événement ou un journal.
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly hasher: SecretHasher,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('user.change_password')
  async execute(
    input: { sessionId: string; currentPassword: string; newPassword: string },
    now = new Date(),
  ): Promise<AfterCommit<void>> {
    const { userId } = requireActor();
    const tx = currentTx();
    const [account] = await tx
      .select({ email: users.email, phone: users.phoneE164, passwordHash: credentials.passwordHash })
      .from(users)
      .leftJoin(credentials, eq(credentials.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!account) throw new DomainProblem('session_expired');
    if (!account.passwordHash || !(await this.hasher.verify(account.passwordHash, input.currentPassword))) {
      throw new DomainProblem('invalid_credentials');
    }
    const identifiers = [account.email, account.phone].filter((value): value is string => value !== null);
    if (
      !isStrongPassword(input.newPassword) ||
      identifiers.some((identifier) => !isStrongPassword(input.newPassword, { identifier }))
    ) {
      throw new DomainProblem('weak_password');
    }

    const [current] = await tx
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, userId)))
      .limit(1);
    if (!current) throw new DomainProblem('session_expired');

    await tx
      .update(credentials)
      .set({ passwordHash: await this.hasher.hash(input.newPassword), passwordChangedAt: now })
      .where(eq(credentials.userId, userId));

    // Les autres connexions, famille par famille (verrou de chaque famille : une rotation concurrente ne survit pas).
    const blacklist = await this.families.revokeOthers(userId, current.familyId, now);

    await this.outbox.publish(tx, {
      type: 'user.password_changed',
      associationId: null,
      actorUserId: userId,
      aggregate: { type: 'user', id: userId },
      payload: { userId },
    });
    // Sans association : un profil n'appartient à aucune (en espace association, @Audited reprend celle du contexte).
    recordAudit({ entityType: 'user', entityId: userId, after: { passwordChangedAt: now } });
    return afterCommit(() => (blacklist.length ? this.revoked.revoke(blacklist) : Promise.resolve()));
  }
}
