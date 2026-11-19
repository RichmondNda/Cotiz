import type { KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { AccessTokenSigner } from './access-token-signer.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  LOG_LEVEL: 'silent',
});
const USER = '00000000-0000-7000-8000-000000000001';
const SID = '00000000-0000-7000-8000-0000000000b1';
const AID = '00000000-0000-7000-8000-00000000a001';

describe('AccessTokenSigner', () => {
  const signer = new AccessTokenSigner(config);

  it('signe et vérifie un jeton EdDSA de 15 min', async () => {
    const now = new Date('2026-10-15T10:00:00.400Z');
    const { token, expiresAt } = await signer.sign({ sub: USER, space: 'platform', sid: SID }, now);
    expect(expiresAt.toISOString()).toBe('2026-10-15T10:15:00.000Z');
    await expect(signer.verify(token)).rejects.toThrow(); // expiré : `now` est dans le passé
    const fresh = await signer.sign({ sub: USER, space: 'platform', sid: SID });
    expect(await signer.verify(fresh.token)).toMatchObject({ sub: USER, space: 'platform', sid: SID });
  });

  it('refuse un jeton signé par une autre clé, ou avec un autre algorithme', async () => {
    const other = new AccessTokenSigner(config);
    const { token } = await other.sign({ sub: USER, space: 'platform', sid: SID });
    await expect(signer.verify(token)).rejects.toThrow();
    const hs256 = await new SignJWT({ space: 'platform', sid: SID })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setIssuer('cotiz')
      .setAudience('cotiz-api')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secret-partage-de-trente-deux-octets!!'));
    await expect(signer.verify(hs256)).rejects.toThrow();
  });

  it('refuse des claims mal formés ; un claim aid (lot 1.1) est ignoré, l’association vient de l’URL', async () => {
    const forge = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'EdDSA' })
        .setSubject(USER)
        .setIssuer('cotiz')
        .setAudience('cotiz-api')
        .setExpirationTime('5m')
        .sign(privateKeyOf(signer));
    await expect(signer.verify(await forge({ space: 'system', sid: SID }))).rejects.toThrow();
    await expect(signer.verify(await forge({ space: 'association' }))).rejects.toThrow();
    await expect(signer.verify(await forge({ space: 'association', sid: 'pas-un-uuid' }))).rejects.toThrow();
    const withAid = await signer.verify(await forge({ space: 'association', sid: SID, aid: AID }));
    // `exp` est rendu (lot 4.2, durée du flux nt.stream) ; `aid` ne l'est jamais.
    expect(withAid).toEqual({ sub: USER, space: 'association', sid: SID, exp: expect.any(Number) as number });
    expect(await signer.verify(await forge({ space: 'association', sid: SID }))).toEqual({
      sub: USER,
      space: 'association',
      sid: SID,
      exp: expect.any(Number) as number,
    });
  });

  it('claim mfa (lot 4.7) : `enroll` gardé, toute autre valeur refusée', async () => {
    const { token } = await signer.sign({ sub: USER, space: 'platform', sid: SID, mfa: 'enroll' });
    expect(await signer.verify(token)).toMatchObject({ mfa: 'enroll' });
    const full = await signer.sign({ sub: USER, space: 'platform', sid: SID });
    expect(await signer.verify(full.token)).not.toHaveProperty('mfa');
    const forged = await new SignJWT({ space: 'platform', sid: SID, mfa: 'done' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(USER)
      .setIssuer('cotiz')
      .setAudience('cotiz-api')
      .setExpirationTime('5m')
      .sign(privateKeyOf(signer));
    await expect(signer.verify(forged)).rejects.toThrow();
  });

  it('jeton de second facteur : 5 min, autre audience (jamais un jeton d’accès, ni l’inverse)', async () => {
    const now = new Date('2026-10-15T10:00:00.400Z');
    const expired = await signer.signMfaToken({ sub: USER, rememberMe: true }, now);
    expect(expired.expiresAt.toISOString()).toBe('2026-10-15T10:05:00.000Z');
    await expect(signer.verifyMfaToken(expired.token)).rejects.toThrow();
    const mfa = await signer.signMfaToken({ sub: USER, rememberMe: true });
    expect(await signer.verifyMfaToken(mfa.token)).toMatchObject({ sub: USER, rememberMe: true });
    await expect(signer.verify(mfa.token)).rejects.toThrow();
    const access = await signer.sign({ sub: USER, space: 'platform', sid: SID });
    await expect(signer.verifyMfaToken(access.token)).rejects.toThrow();
    const reset = await signer.signResetToken({ sub: USER, cid: SID, space: 'platform' });
    await expect(signer.verifyMfaToken(reset.token)).rejects.toThrow();
  });
});

/** Clé privée du signataire (test seulement) : forger des claims que `sign()` refuserait de typer. */
function privateKeyOf(signer: AccessTokenSigner) {
  return (signer as unknown as { privateKey: KeyObject }).privateKey;
}
