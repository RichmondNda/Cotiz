import { Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import { credentials, users } from '@cotiz/db';
import { isStrongPassword } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { acceptTeamInvitation, activeMembershipsOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { canonicalIdentifier } from '../domain/login-policy.js';
import { type CodePurpose, MAX_CODE_ATTEMPTS } from '../domain/one-time-code.js';
import { type LoginSubject, LoginThrottle } from '../infra/login-throttle.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { UncountedCodeAttempts } from '../infra/uncounted-code-attempts.js';
import { CodeService } from './code-service.js';
import { type OpenedSession, SessionOpener } from './session-opener.js';
import { SpaceAccess } from './space-access.js';

export interface ActivateInput {
  space: z.infer<typeof SessionSpace>;
  identifier: string;
  code: string;
  newPassword: string;
}

/**
 * auth.activate (architecture/03), espace auth : identifiant + code remis à la main + nouveau mot de passe. Sert au
 * super-admin (CLI), aux gestionnaires (lot 1.3) et aux souscripteurs (lot 2.3).
 * - Mot de passe faible : `weak_password` avant tout (ni essai compté, ni code consommé).
 * - Code (CodeService) : 5 essais comptés et validés avant l'erreur (afterCommit) ; personne inconnue : `invalid_code`.
 * - `already_activated` seulement avec preuve : le code saisi est le code d'activation déjà consommé du compte.
 * - Espace sans rôle : `wrong_space`, sans consommer le code ni activer (la personne réessaie depuis la bonne page).
 * - Réussite : code consommé, compte actif, mot de passe posé, `user.activated`, audit, session ouverte.
 * Invitation d'équipe (lot 4.5) : dans l'espace association, si la personne a un code `team_invite` encore utilisable,
 * c'est lui qui est comparé. Son appartenance invitée dans l'association du code passe `active` (`team.changed`
 * `joined`). Compte déjà actif : le mot de passe saisi doit être son mot de passe ACTUEL (jamais changé ici : un owner
 * qui connaît le code ne prend pas le compte d'un tiers) ; faux, il compte un essai sur le code et sur la connexion
 * (5 échecs verrouillent comme auth.login) et répond `invalid_code`.
 */
@Injectable()
export class ActivateAccountUseCase {
  constructor(
    private readonly codes: CodeService,
    private readonly hasher: SecretHasher,
    private readonly spaceAccess: SpaceAccess,
    private readonly sessions: SessionOpener,
    private readonly outbox: OutboxService,
    private readonly uncounted: UncountedCodeAttempts,
    private readonly throttle: LoginThrottle,
  ) {}

  async execute(input: ActivateInput, now = new Date()): Promise<OpenedSession | AfterCommit<never>> {
    const identifier = canonicalIdentifier(input.identifier);
    if (!isStrongPassword(input.newPassword, { identifier: identifier.value })) {
      throw new DomainProblem('weak_password');
    }
    const [user] = await currentTx()
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(identifier.kind === 'email' ? eq(users.email, identifier.value) : eq(users.phoneE164, identifier.value))
      .limit(1);

    const purpose: CodePurpose =
      input.space === 'association' && user && (await this.codes.hasLive(user.id, 'team_invite', now))
        ? 'team_invite'
        : 'activation';
    const check = await this.codes.verify({ userId: user?.id ?? null, purpose, code: input.code }, now);
    if (!check.ok) {
      let problem: 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'already_activated' =
        check.problem === 'already_used' ? 'invalid_code' : check.problem;
      if (check.problem === 'already_used' && (await this.statusOf(user?.id)) === 'active') {
        problem = 'already_activated';
      } else if (check.uncounted && (await this.uncounted.hit('activation', identifier.value)) >= MAX_CODE_ATTEMPTS) {
        // Sans code utilisable en base (identifiant inconnu, code consommé…) : essais comptés dans Redis.
        problem = 'too_many_attempts';
      }
      return afterCommit(() => Promise.reject(new DomainProblem(problem)));
    }
    // Code juste : la personne existe. Statut relu sous verrou (une activation simultanée vient peut-être d'aboutir).
    const status = await this.statusOf(user?.id, true);
    if (!user || status === undefined) throw new Error('auth.activate : code valide sans personne');
    if (purpose === 'team_invite') {
      return this.acceptInvitation(
        { userId: user.id, status, identifier: identifier.value, codeId: check.codeId },
        input,
        now,
      );
    }
    if (status === 'active') throw new DomainProblem('already_activated');
    if (status !== 'pending_activation') throw new DomainProblem('invalid_code');
    // Activer son compte : l'appartenance peut n'être qu'une invitation (choix du lot 1.2) ; jamais retirée.
    if (!(await this.spaceAccess.allows(user.id, input.space, ['active', 'invited']))) {
      throw new DomainProblem('wrong_space');
    }
    // Deux activations simultanées avec le même code : une seule consomme.
    if (!(await this.codes.consume(check.codeId, now))) throw new DomainProblem('already_activated');

    await this.activate(user.id, input.newPassword, now);
    return this.sessions.open({ userId: user.id, space: input.space, rememberMe: false }, now);
  }

  /** Code `team_invite` juste : compte en attente activé (mot de passe posé), ou compte actif (mot de passe actuel). */
  private async acceptInvitation(
    account: { userId: string; status: string; identifier: string; codeId: string },
    input: ActivateInput,
    now: Date,
  ): Promise<OpenedSession | AfterCommit<never>> {
    const { userId, codeId } = account;
    if (account.status === 'active') {
      const subjects: LoginSubject[] = [{ identifier: account.identifier }, { userId }];
      const attempt = await this.throttle.reserve(subjects);
      if (attempt.locked) return afterCommit(() => Promise.reject(new DomainProblem('too_many_attempts')));
      const [secret] = await currentTx()
        .select({ passwordHash: credentials.passwordHash })
        .from(credentials)
        .where(eq(credentials.userId, userId));
      const matches = secret?.passwordHash ? await this.hasher.verify(secret.passwordHash, input.newPassword) : false;
      if (!matches) {
        const codeBlocked = await this.codes.countAttempt(codeId);
        const locked = await this.throttle.fail(subjects, attempt);
        const problem = codeBlocked || locked ? 'too_many_attempts' : 'invalid_code';
        return afterCommit(() => Promise.reject(new DomainProblem(problem)));
      }
      await this.throttle.succeed(subjects);
    } else if (account.status !== 'pending_activation') {
      throw new DomainProblem('invalid_code');
    }
    const associationId = await this.codes.associationOf(codeId);
    if (!associationId) throw new Error('auth.activate : invitation d’équipe sans association');
    // Appartenance retirée depuis l'invitation : le code ne vaut plus rien.
    if (!(await acceptTeamInvitation(associationId, userId))) throw new DomainProblem('invalid_code');
    if (!(await this.codes.consume(codeId, now))) throw new DomainProblem('invalid_code');
    if (account.status === 'active') {
      await currentTx().update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
    } else {
      await this.activate(userId, input.newPassword, now);
    }
    await this.joined(associationId, userId);
    return this.sessions.open({ userId, space: 'association', rememberMe: false }, now);
  }

  @Audited('team.join')
  private async joined(associationId: string, userId: string): Promise<void> {
    await this.outbox.publish(currentTx(), {
      type: 'team.changed',
      associationId,
      actorUserId: userId,
      aggregate: { type: 'membership', id: userId },
      payload: { associationId, userId, change: 'joined' },
    });
    recordAudit({
      entityType: 'membership',
      entityId: userId,
      associationId,
      before: { status: 'invited' },
      after: { status: 'active' },
    });
  }

  private async statusOf(userId: string | undefined, lock = false) {
    if (!userId) return undefined;
    const query = currentTx().select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    // FOR NO KEY UPDATE : suffit pour changer le statut, sans attendre les clés étrangères posées en même temps vers ce
    // compte (inscription : FOR KEY SHARE), ce qui pourrait former un interblocage avec le verrou du code.
    const [row] = lock ? await query.for('no key update') : await query;
    return row?.status;
  }

  @Audited('user.activate')
  private async activate(userId: string, newPassword: string, now: Date): Promise<void> {
    const tx = currentTx();
    // Créée si absente : un compte ne s'active jamais sans mot de passe enregistré.
    const secret = {
      passwordHash: await this.hasher.hash(newPassword),
      passwordChangedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
    };
    await tx
      .insert(credentials)
      .values({ userId, ...secret })
      .onConflictDoUpdate({ target: credentials.userId, set: secret });
    await tx
      .update(users)
      .set({ status: 'active', mustChangePassword: false, lastLoginAt: now })
      .where(eq(users.id, userId));
    // Associations où la personne est souscriptrice active : leurs gestionnaires sont notifiés (lot 2.5).
    const associationIds = (await activeMembershipsOf(userId))
      .filter((m) => m.role === 'subscriber')
      .map((m) => m.association.id);
    await this.outbox.publish(tx, {
      type: 'user.activated',
      associationId: null,
      actorUserId: userId,
      aggregate: { type: 'user', id: userId },
      payload: { userId, associationIds },
    });
    recordAudit({
      entityType: 'user',
      entityId: userId,
      associationId: null,
      before: { status: 'pending_activation' },
      after: { status: 'active' },
    });
  }
}
