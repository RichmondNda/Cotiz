import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Config, loadConfig } from '../../../config.js';
import { Can, DomainProblem, Endpoint } from '../../../shared/http/index.js';
import { type FakeRequest, httpContext, routeHandler } from '../../../shared/http/testing.js';
import { currentRequestInfo, runWithRequestInfo } from '../../../shared/request-info/index.js';
import { getRequestContext, WithoutTenantContext } from '../../../shared/tenant-context/index.js';
import {
  AccessTokenSigner,
  type AccessClaims,
  JwtGuard,
  type RevokedSessions,
} from '../../identity/identity.public.js';
import type { SelfRoles } from '../application/self-roles.js';
import { MembershipGuard } from './membership.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { SpaceGuard } from './space.guard.js';

const USER = '00000000-0000-7000-8000-000000000001';
const SID = '00000000-0000-7000-8000-0000000000b1';
const AID = '00000000-0000-7000-8000-00000000a001';
const OTHER_AID = '00000000-0000-7000-8000-00000000a002';

/** Une route par cas : seules leurs métadonnées comptent. */
class Routes {
  @Endpoint('auth.login', 'login')
  @Can('public')
  login(): void {
    // Route de test.
  }

  @Endpoint('auth.logout', 'logout')
  @Can('authenticated')
  logout(): void {
    // Route de test.
  }

  @Endpoint('pf.asso.list', 'list')
  @Can('platform.associations.read')
  platformList(): void {
    // Route de test.
  }

  @Endpoint('as.get', 'get')
  @Can('association.read')
  associationGet(): void {
    // Route de test.
  }

  @Endpoint('pr.preview', 'preview')
  @Can('projects.manage')
  associationManage(): void {
    // Route de test.
  }

  @Endpoint('me', 'get')
  @Can('authenticated')
  me(): void {
    // Route de test.
  }

  @Endpoint('me.dash', 'get')
  @Can('subscriber.self')
  dashboard(): void {
    // Route de test.
  }

  @Endpoint('fl.get', 'get')
  @Can('authenticated')
  file(): void {
    // Route de test.
  }

  @Endpoint('fl.get', 'get')
  @Can('public')
  wrongCan(): void {
    // Route de test.
  }

  @Endpoint('fl.get', 'get')
  noCan(): void {
    // Route de test.
  }

  outsideWithData(): void {
    // Route de test.
  }
}

@WithoutTenantContext()
class Docs {
  page(): void {
    // Route de test.
  }
}

type Route = Exclude<keyof Routes, 'constructor'>;

const env = {
  DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  LOG_LEVEL: 'silent',
};

describe('gardes d’authentification et d’accès (lots 1.1 et 1.2)', () => {
  const reflector = new Reflector();
  let config: Config;
  let signer: AccessTokenSigner;
  const revoked = { isRevoked: () => Promise.resolve(false) } as unknown as RevokedSessions;
  /** Rôles « en base » de la personne du jeton (SelfRoles simulé) : plateforme, et gestion par association. */
  let platformRole: string | null;
  let managementRoles: Record<string, string>;
  const selfRoles = {
    platformRole: () => Promise.resolve(platformRole),
    managementRole: (_userId: string, associationId: string) => Promise.resolve(managementRoles[associationId] ?? null),
  } as unknown as SelfRoles;

  beforeEach(() => {
    config = loadConfig(env);
    signer = new AccessTokenSigner(config);
    platformRole = null;
    managementRoles = {};
  });

  const token = async (claims: Omit<AccessClaims, 'sub' | 'sid'>) =>
    (await signer.sign({ sub: USER, sid: SID, ...claims })).token;

  /** Chaîne des gardes globales, dans l'ordre d'AppModule ; `ip` : adresse du client. */
  const chain = async (
    route: Route | ExecutionContext,
    options: { bearer?: string; ip?: string; config?: Config; aid?: string } = {},
  ) => {
    const request: FakeRequest = {
      method: 'GET',
      url: '/',
      headers: { authorization: options.bearer ? `Bearer ${options.bearer}` : undefined },
      params: options.aid === undefined ? {} : { aid: options.aid },
    };
    const context = typeof route === 'string' ? httpContext(routeHandler(Routes, route), Routes, request) : route;
    const req = context.switchToHttp().getRequest<FakeRequest>();
    const effective = options.config ?? config;
    await runWithRequestInfo({ requestId: 'r', ip: options.ip ?? '127.0.0.1', userAgent: null }, async () => {
      for (const guard of [
        new JwtGuard(signer, revoked, reflector),
        new SpaceGuard(reflector, effective),
        new MembershipGuard(reflector, selfRoles),
        new PermissionGuard(reflector, selfRoles),
      ]) {
        expect(await guard.canActivate(context)).toBe(true);
      }
      req.headers['x-role'] = currentRequestInfo()?.actorRole;
    });
    return { context: getRequestContext(req), role: req.headers['x-role'] };
  };

  const refusal = (promise: Promise<unknown>) =>
    promise.then(
      () => 'accepté',
      (error: unknown) => (error instanceof DomainProblem ? error.code : `erreur : ${(error as Error).message}`),
    );

  describe('JwtGuard (globale)', () => {
    it('route publique : aucun jeton exigé, aucun lu', async () => {
      expect(await refusal(chain('login'))).toBe('accepté');
      expect(await refusal(chain('login', { bearer: 'pas-un-jeton' }))).toBe('accepté');
    });

    it('route protégée sans jeton ou avec un jeton invalide : session_expired', async () => {
      expect(await refusal(chain('file'))).toBe('session_expired');
      expect(await refusal(chain('file', { bearer: 'pas-un-jeton' }))).toBe('session_expired');
    });

    it('hors contrat : ouverte seulement sans accès aux données (@WithoutTenantContext)', async () => {
      const docs = httpContext(routeHandler(Docs, 'page'), Docs, { method: 'GET', url: '/', headers: {} });
      expect(await refusal(chain(docs))).toBe('accepté');
      expect(await refusal(chain('outsideWithData'))).toMatch(/^erreur : route hors contrat/);
    });
  });

  describe('SpaceGuard', () => {
    it('un jeton platform ne passe jamais sur /associations/* (404, comme une association inconnue)', async () => {
      const bearer = await token({ space: 'platform' });
      expect(await refusal(chain('associationGet', { bearer }))).toBe('not_found');
    });

    it('un jeton association ou souscripteur ne passe pas sur /platform/* (404)', async () => {
      expect(await refusal(chain('platformList', { bearer: await token({ space: 'subscriber' }) }))).toBe('not_found');
      expect(await refusal(chain('platformList', { bearer: await token({ space: 'association' }) }))).toBe('not_found');
    });

    it('routes communes et /me : tout espace ; contexte de l’espace du jeton', async () => {
      expect((await chain('file', { bearer: await token({ space: 'platform' }) })).context).toEqual({
        space: 'platform',
        userId: USER,
      });
      expect((await chain('me', { bearer: await token({ space: 'subscriber' }) })).context).toEqual({
        space: 'subscriber',
        userId: USER,
      });
    });

    it('jeton platform depuis une adresse hors PLATFORM_ALLOWED_IPS : refusé à chaque requête', async () => {
      const restricted = loadConfig({ ...env, PLATFORM_ALLOWED_IPS: '203.0.113.0/24' });
      const bearer = await token({ space: 'platform' });
      expect(await refusal(chain('me', { bearer, config: restricted, ip: '127.0.0.1' }))).toBe('forbidden');
      expect(await refusal(chain('me', { bearer, config: restricted, ip: '203.0.113.9' }))).toBe('accepté');
    });
  });

  describe('MembershipGuard', () => {
    it('route d’association : le {aid} de l’URL, vérifié contre une appartenance de gestion active', async () => {
      managementRoles = { [AID]: 'manager' };
      const bearer = await token({ space: 'association' });
      expect(await chain('associationGet', { bearer, aid: AID })).toEqual({
        context: { space: 'association', associationId: AID, userId: USER },
        role: 'association:manager',
      });
    });

    it('association dont on ne gère rien, aid absent ou invalide : 404 (rien n’est révélé)', async () => {
      managementRoles = { [AID]: 'manager' };
      const bearer = await token({ space: 'association' });
      expect(await refusal(chain('associationGet', { bearer, aid: OTHER_AID }))).toBe('not_found');
      expect(await refusal(chain('associationGet', { bearer }))).toBe('not_found');
      expect(await refusal(chain('associationGet', { bearer, aid: 'pas-un-uuid' }))).toBe('not_found');
    });

    it('jeton association sur /me ou une route commune : la personne, sans association ni rôle', async () => {
      managementRoles = { [AID]: 'owner' };
      const bearer = await token({ space: 'association' });
      expect(await chain('me', { bearer, aid: AID })).toEqual({
        context: { space: 'association', userId: USER },
        role: undefined,
      });
      expect(await refusal(chain('dashboard', { bearer }))).toBe('forbidden');
    });
  });

  describe('espace auth (auth.logout)', () => {
    it('tout jeton peut se déconnecter : contexte auth et utilisateur, jamais l’association du jeton', async () => {
      for (const claims of [{ space: 'association' }, { space: 'subscriber' }, { space: 'platform' }] as const) {
        expect((await chain('logout', { bearer: await token(claims) })).context).toEqual({
          space: 'auth',
          userId: USER,
        });
      }
    });

    it('jeton platform hors PLATFORM_ALLOWED_IPS : la déconnexion reste possible', async () => {
      const restricted = loadConfig({ ...env, PLATFORM_ALLOWED_IPS: '203.0.113.0/24' });
      const bearer = await token({ space: 'platform' });
      expect(await refusal(chain('logout', { bearer, config: restricted, ip: '127.0.0.1' }))).toBe('accepté');
    });
  });

  describe('PermissionGuard + @Can()', () => {
    it('subscriber.self : le souscripteur seulement (403 pour un autre espace)', async () => {
      const subscriber = await chain('dashboard', { bearer: await token({ space: 'subscriber' }) });
      expect(subscriber.role).toBe('subscriber');
      expect(await refusal(chain('dashboard', { bearer: await token({ space: 'platform' }) }))).toBe('forbidden');
    });

    it('permission de rôle plateforme : le rôle lu en base ; sans rôle (retiré du personnel), refusée', async () => {
      const bearer = await token({ space: 'platform' });
      expect(await refusal(chain('platformList', { bearer }))).toBe('forbidden');
      platformRole = 'support';
      expect((await chain('platformList', { bearer })).role).toBe('platform:support');
    });

    it('permission de rôle d’association : celui de l’association de l’URL (lectrice : lecture seulement)', async () => {
      managementRoles = { [AID]: 'viewer', [OTHER_AID]: 'owner' };
      const bearer = await token({ space: 'association' });
      expect((await chain('associationGet', { bearer, aid: AID })).role).toBe('association:viewer');
      expect(await refusal(chain('associationManage', { bearer, aid: AID }))).toBe('forbidden');
      expect((await chain('associationManage', { bearer, aid: OTHER_AID })).role).toBe('association:owner');
    });

    it('@Can() absent ou différent du contrat : erreur de configuration (500), jamais ouvert', async () => {
      const bearer = await token({ space: 'platform' });
      expect(await refusal(chain('wrongCan', { bearer }))).toMatch(/^erreur : @Can/);
      expect(await refusal(chain('noCan', { bearer }))).toMatch(/^erreur : @Can/);
    });
  });
});
