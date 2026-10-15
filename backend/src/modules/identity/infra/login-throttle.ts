import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../../../config.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { LOGIN_LOCK_MS, MAX_FAILED_LOGINS } from '../domain/login-policy.js';

const LOCK_SECONDS = LOGIN_LOCK_MS / 1000;

/**
 * Ce qui se verrouille : l'identifiant saisi (connu ou non : aucune fuite d'existence) et, pour un compte connu, le
 * compte lui-même (email et téléphone d'une même personne partagent ses 5 essais).
 */
export type LoginSubject = { identifier: string } | { userId: string };

/** Essai réservé : rang de l'essai (le plus élevé des sujets) et refus immédiat si un sujet est verrouillé. */
export interface LoginAttempt {
  attempts: number;
  locked: boolean;
}

/**
 * Verrouillage après 5 échecs en 15 min, pour 15 min (architecture/03), dans Redis.
 * - L'essai est RÉSERVÉ (compté) avant la vérification du mot de passe : des requêtes simultanées ne peuvent pas
 *   dépasser 5 essais ; un succès les efface.
 * - Clés : HMAC-SHA256 du sujet (clé LOG_PSEUDONYM_KEY, préfixe propre à cet usage ; hors production sans elle, une
 *   clé aléatoire du processus) : ni email ni téléphone en clair, ni retrouvables depuis une copie de Redis.
 * Redis indisponible : l'erreur remonte (la connexion est déjà refusée par la limitation de débit sans Redis).
 */
@Injectable()
export class LoginThrottle {
  private readonly key: string;

  constructor(
    private readonly client: RedisClient,
    @Inject(CONFIG) config: Config,
  ) {
    this.key = config.LOG_PSEUDONYM_KEY ?? randomBytes(32).toString('hex');
  }

  /** Compte l'essai pour chaque sujet, en une transaction Redis. */
  async reserve(subjects: LoginSubject[]): Promise<LoginAttempt> {
    const multi = this.client.redis.multi();
    for (const subject of subjects) {
      const failures = this.redisKey('fail', subject);
      multi.exists(this.redisKey('lock', subject)).incr(failures).expire(failures, LOCK_SECONDS, 'NX');
    }
    const results = (await multi.exec()) ?? [];
    let attempts = 0;
    let locked = false;
    for (let i = 0; i < subjects.length; i++) {
      const [lockError, lock] = results[i * 3] ?? [];
      const [countError, count] = results[i * 3 + 1] ?? [];
      if (lockError || countError || !Number.isInteger(count))
        throw new Error('verrouillage : réponse Redis illisible');
      locked ||= lock === 1;
      attempts = Math.max(attempts, Number(count));
    }
    // Au-delà du 5e essai (requêtes simultanées) : refusé sans vérifier le mot de passe, et verrouillé.
    if (!locked && attempts > MAX_FAILED_LOGINS) {
      await this.lock(subjects);
      locked = true;
    }
    return { attempts, locked };
  }

  /** Essai échoué : au 5e, les sujets sont verrouillés 15 min. Renvoie `true` s'ils viennent de l'être. */
  async fail(subjects: LoginSubject[], attempt: LoginAttempt): Promise<boolean> {
    if (attempt.attempts < MAX_FAILED_LOGINS) return false;
    await this.lock(subjects);
    return true;
  }

  /** Mot de passe juste : les essais précédents sont oubliés. */
  async succeed(subjects: LoginSubject[]): Promise<void> {
    await this.client.redis.del(...subjects.map((subject) => this.redisKey('fail', subject)));
  }

  private async lock(subjects: LoginSubject[]): Promise<void> {
    const multi = this.client.redis.multi();
    for (const subject of subjects) {
      multi.set(this.redisKey('lock', subject), '1', 'EX', LOCK_SECONDS).del(this.redisKey('fail', subject));
    }
    await multi.exec();
  }

  private redisKey(kind: 'fail' | 'lock', subject: LoginSubject): string {
    const name = 'identifier' in subject ? `identifier:${subject.identifier}` : `user:${subject.userId}`;
    return `cotiz:login:${kind}:${createHmac('sha256', this.key).update(`login-throttle:${name}`).digest('hex')}`;
  }
}
