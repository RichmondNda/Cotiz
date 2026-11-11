import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { Can, DomainProblem, Endpoint } from '../../../shared/http/index.js';
import { type FakeRequest, httpContext, routeHandler } from '../../../shared/http/testing.js';
import { getRequestContext } from '../../../shared/tenant-context/index.js';
import { type AccessClaims, AccessTokenSigner } from '../infra/access-token-signer.js';
import type { RevokedSessions } from '../infra/revoked-sessions.js';
import { authenticatedSession, JwtGuard } from './jwt.guard.js';

const USER = '00000000-0000-7000-8000-000000000001';
const SID = '00000000-0000-7000-8000-0000000000b1';
const AID = '00000000-0000-7000-8000-00000000a001';

class Routes {
  @Endpoint('auth.logout', 'logout')
  @Can('authenticated')
  logout(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('fl.get', 'get')
  @Can('authenticated')
  file(): void {
    // Route de test : seules ses métadonnées comptent.
  }
}

const signer = new AccessTokenSigner(
  loadConfig({
    DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
    REDIS_URL: 'redis://127.0.0.1:1',
    S3_ENDPOINT: 'http://127.0.0.1:1',
    LOG_LEVEL: 'silent',
  }),
);
const revokedSids = new Set<string>();
const revoked = { isRevoked: (sid: string) => Promise.resolve(revokedSids.has(sid)) } as RevokedSessions;
const guard = new JwtGuard(signer, revoked, new Reflector());

const run = async (route: 'logout' | 'file', authorization?: string) => {
  const request: FakeRequest = { method: 'POST', url: '/', headers: { authorization } };
  await guard.canActivate(httpContext(routeHandler(Routes, route), Routes, request));
  return request;
};
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'accepté',
    (error: unknown) => (error instanceof DomainProblem ? error.code : 'autre'),
  );

describe('JwtGuard', () => {
  it('jeton valide sur un endpoint auth : espace auth et utilisateur du jeton', async () => {
    const { token, expiresAt } = await signer.sign({ sub: USER, space: 'association', sid: SID });
    const request = await run('logout', `Bearer ${token}`);
    expect(getRequestContext(request)).toEqual({ space: 'auth', userId: USER });
    // Échéance du jeton (lot 4.2 : durée de vie du flux nt.stream).
    expect(authenticatedSession(request)).toEqual({
      sub: USER,
      space: 'association',
      sid: SID,
      exp: expiresAt.getTime() / 1000,
    });
  });

  it('un claim aid (ancien jeton, jeton forgé) est ignoré : jamais d’association venue du jeton', async () => {
    const forged = { sub: USER, space: 'association', sid: SID, aid: AID } as AccessClaims;
    const { token } = await signer.sign(forged);
    const request = await run('logout', `Bearer ${token}`);
    expect(authenticatedSession(request)).not.toHaveProperty('aid');
  });

  it('hors espace auth : aucun contexte posé ici (SpaceGuard et MembershipGuard)', async () => {
    const { token } = await signer.sign({ sub: USER, space: 'platform', sid: SID });
    expect(getRequestContext(await run('file', `Bearer ${token}`))).toBeNull();
  });

  it('absent, mal formé ou falsifié : session_expired ; session en liste noire : session_revoked', async () => {
    const { token } = await signer.sign({ sub: USER, space: 'platform', sid: SID });
    expect(await codeOf(run('logout'))).toBe('session_expired');
    expect(await codeOf(run('logout', token))).toBe('session_expired');
    expect(await codeOf(run('logout', `Bearer ${token}x`))).toBe('session_expired');
    revokedSids.add(SID);
    expect(await codeOf(run('logout', `Bearer ${token}`))).toBe('session_revoked');
    revokedSids.clear();
  });
});
