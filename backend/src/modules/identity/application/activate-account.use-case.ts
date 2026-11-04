import { Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import { credentials, users } from '@cotiz/db';
import { isStrongPassword } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { activeMembershipsOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { canonicalIdentifier } from '../domain/login-policy.js';
import { MAX_CODE_ATTEMPTS } from '../domain/one-time-code.js';
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

    const check = await this.codes.verify({ userId: user?.id ?? null, purpose: 'activation', code: input.code }, now);
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
