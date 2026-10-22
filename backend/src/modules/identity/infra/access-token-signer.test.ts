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
    expect(withAid).toEqual({ sub: USER, space: 'association', sid: SID });
    expect(await signer.verify(await forge({ space: 'association', sid: SID }))).toEqual({
      sub: USER,
      space: 'association',
      sid: SID,
    });
  });
});

/** Clé privée du signataire (test seulement) : forger des claims que `sign()` refuserait de typer. */
function privateKeyOf(signer: AccessTokenSigner) {
  return (signer as unknown as { privateKey: KeyObject }).privateKey;
}
