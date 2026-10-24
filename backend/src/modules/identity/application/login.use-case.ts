import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import { credentials, users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { activeMembershipsOf, MANAGEMENT_ROLES, type ManagementRole } from '../../access/access.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { canonicalIdentifier, LOGIN_LOCK_MS } from '../domain/login-policy.js';
import { type LoginSubject, LoginThrottle } from '../infra/login-throttle.js';
import { SecretHasher } from '../infra/secret-hasher.js';
import { type OpenedSession, SessionOpener } from './session-opener.js';
import { SpaceAccess } from './space-access.js';

type Space = z.infer<typeof SessionSpace>;

export interface LoginInput {
  space: Space;
  identifier: string;
  password: string;
  rememberMe: boolean;
}

/**
 * auth.login (architecture/03-auth.md), espace auth. Aucune fuite d'existence de compte :
 * - compte inconnu, sans mot de passe (non activé) ou inactif : `invalid_credentials`, après une vérification argon2id
 *   sur un haché fictif (même temps de réponse) ;
 * - 5 échecs en 15 min verrouillent l'identifiant 15 min (`account_locked`), qu'il existe ou non, et le compte (ses
 *   email et téléphone partagent 5 essais ; qui connaît les deux peut constater qu'ils vont ensemble : accepté) ;
 * - `wrong_space` seulement après un mot de passe juste (message identique à l'écran) ;
 * - espace association : `association_suspended` si toutes les associations que la personne gère sont suspendues
 *   (après le mot de passe, comme `wrong_space`).
 * Un échec écrit son compteur puis lève l'erreur APRÈS le COMMIT (`afterCommit`) : l'erreur annulerait sinon l'écriture.
 */
@Injectable()
export class LoginUseCase {
  /** Haché d'un secret aléatoire inconnu de tous : ne correspond à aucun mot de passe. */
  private readonly decoyHash: Promise<string>;

  constructor(
    private readonly hasher: SecretHasher,
    private readonly throttle: LoginThrottle,
    private readonly sessions: SessionOpener,
    private readonly outbox: OutboxService,
    private readonly spaceAccess: SpaceAccess,
  ) {
    this.decoyHash = hasher.hash(randomBytes(32).toString('base64url'));
  }

  async execute(input: LoginInput, now = new Date()): Promise<OpenedSession | AfterCommit<never>> {
    const tx = currentTx();
    const identifier = canonicalIdentifier(input.identifier);
    const [account] = await tx
      .select({
        id: users.id,
        status: users.status,
        passwordHash: credentials.passwordHash,
        lockedUntil: credentials.lockedUntil,
      })
      .from(users)
      .leftJoin(credentials, eq(credentials.userId, users.id))
      .where(identifier.kind === 'email' ? eq(users.email, identifier.value) : eq(users.phoneE164, identifier.value))
      .limit(1);

    // Le verrou en base survit à une perte de Redis (pendant 15 min, un compte verrouillé y répond encore 423 et un
    // identifiant inconnu 401 : écart accepté, limité à cette fenêtre).
    if (account?.lockedUntil && account.lockedUntil > now) throw new DomainProblem('account_locked');

    // Essai réservé AVANT argon2 : des requêtes simultanées ne dépassent jamais 5 essais.
    const subjects: LoginSubject[] = [{ identifier: identifier.value }, ...(account ? [{ userId: account.id }] : [])];
    const attempt = await this.throttle.reserve(subjects);
    if (attempt.locked) throw new DomainProblem('account_locked');

    const passwordHash = account?.passwordHash ?? null;
    const passwordMatches = await this.hasher.verify(passwordHash ?? (await this.decoyHash), input.password);
    if (!account || passwordHash === null || !passwordMatches || account.status !== 'active') {
      const locked = await this.throttle.fail(subjects, attempt);
      // Le compteur vit dans Redis, pour tout identifiant. La base ne reçoit que le verrou (5e échec) : écrire à chaque
      // échec d'un compte connu, et jamais pour un inconnu, ferait un écart de temps mesurable (fuite d'existence).
      if (account && locked) {
        await tx
          .update(credentials)
          .set({ failedAttempts: attempt.attempts, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) })
          .where(eq(credentials.userId, account.id));
      }
      const problem = new DomainProblem(locked ? 'account_locked' : 'invalid_credentials');
      return afterCommit(() => Promise.reject(problem));
    }

    // Mot de passe juste : les essais sont effacés, et wrong_space ne révèle plus rien.
    await this.throttle.succeed(subjects);
    if (!(await this.spaceAccess.allows(account.id, input.space))) throw new DomainProblem('wrong_space');
    if (input.space === 'association' && (await allManagedSuspended(account.id))) {
      throw new DomainProblem('association_suspended');
    }

    await tx
      .update(credentials)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(credentials.userId, account.id));
    await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, account.id));

    const session = await this.sessions.open(
      { userId: account.id, space: input.space, rememberMe: input.rememberMe },
      now,
    );
    await this.outbox.publish(tx, {
      type: 'user.logged_in',
      associationId: null,
      actorUserId: account.id,
      aggregate: { type: 'user', id: account.id },
      payload: { userId: account.id, space: input.space },
    });

    return session;
  }
}

/** Toutes les associations que la personne gère (au moins une, vérifié par SpaceAccess) sont-elles suspendues ? */
async function allManagedSuspended(userId: string): Promise<boolean> {
  const managed = (await activeMembershipsOf(userId)).filter((m) =>
    MANAGEMENT_ROLES.includes(m.role as ManagementRole),
  );
  return managed.length > 0 && managed.every((m) => m.association.status === 'suspended');
}
