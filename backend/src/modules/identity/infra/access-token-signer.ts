import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import type { Space } from '../../../shared/tenant-context/index.js';
import { ACCESS_TOKEN_TTL_MS, MFA_TOKEN_TTL_MS, RESET_TOKEN_TTL_MS } from '../domain/login-policy.js';

const ALG = 'EdDSA';
const ISSUER = 'cotiz';
const AUDIENCE = 'cotiz-api';
/** Jeton de réinitialisation : autre audience, jamais accepté comme jeton d'accès (ni l'inverse). */
const RESET_AUDIENCE = 'cotiz-reset';
const RESET_TTL_SECONDS = RESET_TOKEN_TTL_MS / 1000;
/** Jeton de second facteur (auth.login → auth.mfa › verify) : autre audience, jamais un jeton d'accès. */
const MFA_AUDIENCE = 'cotiz-mfa';
const MFA_TTL_SECONDS = MFA_TOKEN_TTL_MS / 1000;

const MfaClaims = z.object({ sub: z.uuid(), rememberMe: z.boolean(), jti: z.uuid() });
/** Jeton de second facteur : la personne dont le mot de passe est vérifié, et son « rester connecté ». */
export type MfaClaims = z.infer<typeof MfaClaims>;
/** Ce que l'appelant fournit : `jti` (usage unique) est tiré à la signature. */
export type MfaTokenInput = Omit<MfaClaims, 'jti'>;

const ResetClaims = z.object({
  sub: z.uuid(),
  cid: z.uuid(),
  /** Espace de la demande : le proxy du front aiguille auth.reset vers ce back (bascule par espace). */
  space: z.enum(['platform', 'association', 'subscriber']),
});
/** Jeton de réinitialisation (auth.verify → auth.reset) : la personne et le code vérifié qu'il consommera. */
export type ResetClaims = z.infer<typeof ResetClaims>;

/**
 * Claims du jeton d'accès (architecture/03) : jamais d'association (lot 1.2, choix Q1) ; l'association d'une requête
 * est le `{aid}` de l'URL, vérifié contre les appartenances par MembershipGuard. Un claim inconnu est ignoré.
 */
const AccessClaims = z.object({
  sub: z.uuid(),
  space: z.enum(['platform', 'association', 'subscriber'] as const satisfies readonly Space[]),
  sid: z.uuid(),
  /**
   * `enroll` (lot 4.7) : session plateforme sans second facteur confirmé, restreinte à l'enrôlement (espace auth,
   * `me`, `me.profile`) par SpaceGuard ; recalculé à chaque renouvellement. Absent : session complète.
   */
  mfa: z.literal('enroll').optional(),
});
export type AccessClaims = z.infer<typeof AccessClaims>;

/** Jeton d'accès vérifié : claims et échéance (`exp`, secondes) — durée de vie du flux nt.stream (lot 4.2). */
const VerifiedAccess = AccessClaims.extend({ exp: z.int().positive() });
export type VerifiedAccess = z.infer<typeof VerifiedAccess>;

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
    const token = await new SignJWT({ cid: claims.cid, space: claims.space })
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

  /** Jeton de second facteur de 5 min, émis après un mot de passe juste (auth.login, espace plateforme). */
  async signMfaToken(claims: MfaTokenInput, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = new Date((issuedAt + MFA_TTL_SECONDS) * 1000);
    const token = await new SignJWT({ rememberMe: claims.rememberMe })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(MFA_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.privateKey);
    return { token, expiresAt };
  }

  /** Lève une erreur si le jeton n'est pas un jeton de second facteur valide. */
  async verifyMfaToken(token: string): Promise<MfaClaims> {
    const { payload } = await jwtVerify(token, this.verifyKey, {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: MFA_AUDIENCE,
    });
    return MfaClaims.parse(payload);
  }

  /** Vérifie signature, algorithme, émetteur, audience, expiration et forme des claims ; lève une erreur sinon. */
  async verify(token: string): Promise<VerifiedAccess> {
    const { payload } = await jwtVerify(token, this.verifyKey, {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return VerifiedAccess.parse(payload);
  }
}
