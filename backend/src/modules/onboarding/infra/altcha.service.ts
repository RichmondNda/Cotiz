import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AltchaChallenge } from '@cotiz/contracts';
import { createChallenge, randomInt, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';

/** Durée de validité d'un défi : le temps de remplir les trois étapes du formulaire. */
export const CHALLENGE_TTL_SECONDS = 10 * 60;

/**
 * Ce que renvoie le widget : le défi reçu et sa solution, en JSON encodé en base64. Les clés inconnues des paramètres
 * sont retirées avant la vérification de la signature : `altcha-lib` reste épinglée à une version exacte, une montée
 * qui signerait un nouveau paramètre ferait échouer tous les défis (test d'intégration).
 */
const Payload = z.object({
  challenge: AltchaChallenge,
  solution: z.object({ counter: z.int().nonnegative(), derivedKey: z.string().min(1), time: z.number().optional() }),
});

/**
 * Défis ALTCHA auto-hébergés (décision n° 12, `altcha-lib` v2, aucun service tiers) : preuve de travail PBKDF2 en mode
 * déterministe (compteur tiré au hasard, clé dérivée signée), défi signé par HMAC et daté. Vérification sans état ;
 * l'usage unique d'une solution relève de `AltchaReplayGuard`.
 */
@Injectable()
export class AltchaService {
  private readonly signatureSecret: string;
  private readonly keySignatureSecret: string;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    this.signatureSecret = config.ALTCHA_HMAC_KEY ?? randomBytes(32).toString('hex');
    this.keySignatureSecret = createHmac('sha256', this.signatureSecret).update('altcha-key-signature').digest('hex');
  }

  async create(now: Date = new Date()): Promise<AltchaChallenge> {
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: this.config.ALTCHA_COST,
      counter: randomInt(10_000, 5_000),
      deriveKey,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000),
      hmacSignatureSecret: this.signatureSecret,
      hmacKeySignatureSecret: this.keySignatureSecret,
    });
    return AltchaChallenge.parse(challenge);
  }

  /** Défi vérifié (signature, échéance, solution) ; `null` si la charge est illisible ou fausse. */
  async verify(encoded: string): Promise<AltchaChallenge | null> {
    let payload;
    try {
      payload = Payload.safeParse(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')));
    } catch {
      return null;
    }
    if (!payload.success) return null;
    try {
      const result = await verifySolution({
        challenge: payload.data.challenge,
        solution: payload.data.solution,
        deriveKey,
        hmacSignatureSecret: this.signatureSecret,
        hmacKeySignatureSecret: this.keySignatureSecret,
      });
      return result.verified ? payload.data.challenge : null;
    } catch {
      return null;
    }
  }
}
