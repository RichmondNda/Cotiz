import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import type { Space } from '../../../shared/tenant-context/index.js';
import { ACCESS_TOKEN_TTL_MS } from '../domain/login-policy.js';

const ALG = 'EdDSA';
const ISSUER = 'cotiz';
const AUDIENCE = 'cotiz-api';
/** Jeton de réinitialisation : autre audience, jamais accepté comme jeton d'accès (ni l'inverse). */
const RESET_AUDIENCE = 'cotiz-reset';
const RESET_TTL_SECONDS = 10 * 60;

const ResetClaims = z.object({ sub: z.uuid(), cid: z.uuid() });
/** Jeton de réinitialisation (auth.verify → auth.reset) : la personne et le code vérifié qu'il consommera. */
export type ResetClaims = z.infer<typeof ResetClaims>;

/** Claims du jeton d'accès (architecture/03) : `aid` en espace association seulement, et toujours (lot 1.2). */
const AccessClaims = z
  .object({
    sub: z.uuid(),
    space: z.enum(['platform', 'association', 'subscriber'] as const satisfies readonly Space[]),
    sid: z.uuid(),
    aid: z.uuid().optional(),
  })
  .refine((claims) => (claims.space === 'association') === (claims.aid !== undefined), { path: ['aid'] });
export type AccessClaims = z.infer<typeof AccessClaims>;

/**
 * Jetons d'accès JWT EdDSA (Ed25519), 15 min. Clés JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (exigées en production) ; sans
 * elles, une paire éphémère : les jetons émis ne survivent pas au redémarrage de l'api.
 */
@Injectable()
export class AccessTokenSigner {
  private readonly privateKey: KeyObject;
  private readonly verifyKey: KeyObject;

  constructor(@Inject(CONFIG) config: Config) {
    if (config.JWT_PRIVATE_KEY !== undefined && config.JWT_PUBLIC_KEY !== undefined) {
      this.privateKey = createPrivateKey(config.JWT_PRIVATE_KEY);
      this.verifyKey = createPublicKey(config.JWT_PUBLIC_KEY);
    } else {
      ({ privateKey: this.privateKey, publicKey: this.verifyKey } = generateKeyPairSync('ed25519'));
      new Logger(AccessTokenSigner.name).warn(
        'clés JWT éphémères (JWT_PRIVATE_KEY absente) : hors production seulement',
      );
    }
  }

  /** Clé publique de vérification (gardes, lot 1.1 étape 4). */
  publicKey(): KeyObject {
    return this.verifyKey;
  }

  async sign(claims: AccessClaims, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    // Secondes entières : `exp` du jeton et `expiresAt` de la réponse sont identiques.
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = new Date((issuedAt + ACCESS_TOKEN_TTL_MS / 1000) * 1000);
    const { sub, ...rest } = claims;
    const token = await new SignJWT({ ...rest })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.privateKey);
    return { token, expiresAt };
  }

  /** Jeton de réinitialisation de 10 min, lié au code vérifié (architecture/03). */
  async signResetToken(claims: ResetClaims, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = new Date((issuedAt + RESET_TTL_SECONDS) * 1000);
    const token = await new SignJWT({ cid: claims.cid })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(RESET_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.privateKey);
    return { token, expiresAt };
  }

  /** Lève une erreur si le jeton n'est pas un jeton de réinitialisation valide. */
  async verifyResetToken(token: string): Promise<ResetClaims> {
    const { payload } = await jwtVerify(token, this.verifyKey, {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: RESET_AUDIENCE,
    });
    return ResetClaims.parse(payload);
  }

  /** Vérifie signature, algorithme, émetteur, audience, expiration et forme des claims ; lève une erreur sinon. */
  async verify(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.verifyKey, {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return AccessClaims.parse(payload);
  }
}
