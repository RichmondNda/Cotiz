import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { getRequestContext, setRequestContext } from '../tenant-context/index.js';
import { ContractSpaceGuard } from './contract-space.guard.js';
import { Endpoint } from './endpoint.js';
import { type FakeRequest, httpContext, routeHandler } from './testing.js';

class Routes {
  @Endpoint('auth.login', 'login')
  login(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('pub.plans', 'list')
  plans(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('fl.get', 'get')
  file(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  outsideContract(): void {
    // Route de test : seules ses métadonnées comptent.
  }
}

const guard = new ContractSpaceGuard(new Reflector());
const request = (): FakeRequest => ({ method: 'POST', url: '/', headers: {} });
const run = (route: string, req = request()) => {
  expect(guard.canActivate(httpContext(routeHandler(Routes, route), Routes, req))).toBe(true);
  return getRequestContext(req);
};

describe('ContractSpaceGuard', () => {
  it('pose l’espace du contrat pour les endpoints auth et public', () => {
    expect(run('login')).toEqual({ space: 'auth' });
    expect(run('plans')).toEqual({ space: 'public' });
  });

  it('ne pose rien pour un endpoint d’un autre espace ni hors contrat', () => {
    expect(run('file')).toBeNull();
    expect(run('outsideContract')).toBeNull();
  });

  it('ne remplace jamais un contexte posé par une autre garde', () => {
    const req = request();
    setRequestContext(req, { space: 'platform', userId: '00000000-0000-7000-8000-000000000001' });
    expect(run('login', req)).toEqual({ space: 'platform', userId: '00000000-0000-7000-8000-000000000001' });
  });
});
