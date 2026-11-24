import type { INestApplication } from '@nestjs/common';
import { AccessToken, LoginResponse } from '@cotiz/contracts';
import { decodeJwt } from 'jose';
import { base32Decode, hotp, totpStep } from '../../src/modules/identity/domain/totp.js';
import { RedisClient } from '../../src/shared/redis/redis.module.js';

/**
 * Connexion plateforme complète pour les tests (lot 4.7 : second facteur obligatoire). Première connexion d'une
 * personne : session restreinte → enrôlement (`POST /me/mfa/totp`) et confirmation ; ensuite : `mfa_required` →
 * `POST /auth/mfa/verify` avec le code TOTP du moment. Le secret est retenu par identifiant pour le fichier de test.
 * Un code TOTP ne se rejoue pas (même pas) : les pas déjà acceptés sont effacés de Redis avant chaque code, pour
 * enchaîner les connexions d'une même personne dans les 30 s. Le refus du rejeu est éprouvé par auth-mfa.test.ts.
 */
const secrets = new Map<string, string>();

export interface PlatformSession {
  accessToken: string;
  /** `cotiz_refresh=…` (en-tête Cookie). */
  cookie: string;
}

export interface PlatformLoginOptions {
  app: INestApplication;
  /** `http://…/api/v1` */
  base: string;
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

/** Code TOTP du moment pour un secret en base 32. */
export function totpNow(secret: string, now = new Date()): string {
  return hotp(base32Decode(secret), totpStep(now));
}

/** Secret TOTP retenu pour cet identifiant (après une première connexion par `platformLogin`). */
export function totpSecretOf(identifier: string): string | undefined {
  return secrets.get(identifier.toLowerCase());
}

/** Efface les pas TOTP déjà acceptés (rejeu) : connexions successives d'une même personne dans un même pas. */
export async function forgetUsedTotpSteps(app: INestApplication): Promise<void> {
  const redis = app.get(RedisClient).redis;
  const keys = await redis.keys('cotiz:mfa:step:*');
  if (keys.length > 0) await redis.del(...keys);
}

const cookieOf = (res: Response) =>
  /^(cotiz_refresh=[^;]*)/.exec(res.headers.getSetCookie().find((c) => c.startsWith('cotiz_refresh=')) ?? '')?.[1] ??
  '';

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

async function expectOk(res: Response, step: string): Promise<unknown> {
  if (!res.ok) throw new Error(`connexion plateforme (${step}) : ${String(res.status)} ${await res.text()}`);
  return res.json();
}

/** Connexion plateforme jusqu'à une session complète (second facteur enrôlé au besoin). */
export async function platformLogin(options: PlatformLoginOptions): Promise<PlatformSession> {
  const { app, base, identifier, password } = options;
  const key = identifier.toLowerCase();
  const login = async () =>
    LoginResponse.parse(
      await expectOk(
        await post(`${base}/auth/login`, {
          space: 'platform',
          identifier,
          password,
          rememberMe: options.rememberMe ?? false,
        }),
        'login',
      ),
    );
  let first = await login();
  if (first.status === 'authenticated') {
    if (decodeJwt(first.accessToken).mfa !== 'enroll')
      throw new Error('session plateforme complète sans second facteur');
    const bearer = { authorization: `Bearer ${first.accessToken}` };
    const enrollment = (await expectOk(await post(`${base}/me/mfa/totp`, {}, bearer), 'enroll')) as { secret: string };
    await forgetUsedTotpSteps(app);
    await expectOk(await post(`${base}/me/mfa/totp/confirm`, { code: totpNow(enrollment.secret) }, bearer), 'confirm');
    secrets.set(key, enrollment.secret);
    first = await login();
  }
  if (first.status !== 'mfa_required') throw new Error('attendu : mfa_required');
  const secret = secrets.get(key);
  if (!secret) throw new Error(`secret TOTP inconnu pour ${identifier} (facteur confirmé hors platformLogin)`);
  await forgetUsedTotpSteps(app);
  const res = await post(`${base}/auth/mfa/verify`, { mfaToken: first.mfaToken, code: totpNow(secret) });
  const body = AccessToken.parse(await expectOk(res, 'verify'));
  return { accessToken: body.accessToken, cookie: cookieOf(res) };
}
