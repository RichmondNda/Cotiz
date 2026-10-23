import { HttpCode } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { runWithRequestInfo } from '../request-info/index.js';
import { setRequestContext } from '../tenant-context/index.js';
import { DomainProblem } from './domain-problem.js';
import { Endpoint } from './endpoint.js';
import {
  type IdempotencyRecord,
  type IdempotencyStore,
  IdempotencyInterceptor,
  idempotentReplay,
  ReplayInHandler,
  requestFingerprint,
} from './idempotency.interceptor.js';
import { FakeResponse, fakeHandler, httpContext, routeHandler } from './testing.js';

class Routes {
  @Endpoint('me.declare', 'declare')
  @HttpCode(201)
  declare(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('pub.request', 'create')
  @HttpCode(201)
  submit(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('pf.req.approve', 'approve')
  @HttpCode(200)
  @ReplayInHandler()
  approve(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('pf.asso.create', 'create')
  @HttpCode(201)
  @ReplayInHandler((body) => ({ id: (body as { association: { id: string } }).association.id }))
  create(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('as.get', 'get')
  read(): void {
    // Route de test : seules ses métadonnées comptent.
  }
}

class MemoryStore implements IdempotencyStore {
  records = new Map<string, { record: IdempotencyRecord; ttl: number }>();
  begin(key: string, fingerprint: string, ttlSeconds: number): Promise<IdempotencyRecord | null> {
    const existing = this.records.get(key);
    if (existing) return Promise.resolve(existing.record);
    this.records.set(key, { record: { state: 'pending', fingerprint }, ttl: ttlSeconds });
    return Promise.resolve(null);
  }
  complete(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    this.records.set(key, { record, ttl: ttlSeconds });
    return Promise.resolve();
  }
  abandon(key: string): Promise<void> {
    this.records.delete(key);
    return Promise.resolve();
  }
}

const MOUSSA = '00000000-0000-7000-8000-000000000002';
const FATOU = '00000000-0000-7000-8000-000000000003';
const KEY = '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
const BODY = { amount: 25000, installmentIds: ['i1'] };

function setup() {
  const store = new MemoryStore();
  const interceptor = new IdempotencyInterceptor(new Reflector(), store);
  const call = async (
    options: {
      route?: 'declare' | 'read' | 'submit' | 'approve' | 'create';
      key?: string;
      body?: unknown;
      user?: string | null;
      result?: unknown;
      error?: unknown;
    } = {},
  ) => {
    const headers: Record<string, string | undefined> = { 'idempotency-key': 'key' in options ? options.key : KEY };
    const req = { method: 'POST', url: '/api/v1/me/payments', headers, body: options.body ?? BODY };
    if (options.user !== null) setRequestContext(req, { space: 'subscriber', userId: options.user ?? MOUSSA });
    const response = new FakeResponse();
    const handler = fakeHandler(options.result ?? { id: 'p1', status: 'pending' }, options.error);
    const replayed = () => idempotentReplay(req);
    const route = options.route ?? 'declare';
    const context = httpContext(routeHandler(Routes, route), Routes, req, response);
    try {
      const value = await runWithRequestInfo({ requestId: 'r', ip: '203.0.113.7', userAgent: null }, async () =>
        lastValueFrom(await interceptor.intercept(context, handler)),
      );
      return { value, response, calls: handler.calls, replayed: replayed() };
    } catch (error) {
      return { error, response, calls: handler.calls, replayed: replayed() };
    }
  };
  return { store, call };
}

const code = (error: unknown) => (error instanceof DomainProblem ? error.code : undefined);

describe('IdempotencyInterceptor (Idempotency-Key, réponse mémorisée 24 h)', () => {
  it('première requête exécutée et mémorisée 24 h ; la même requête rejouée sans réexécution', async () => {
    const { store, call } = setup();
    const first = await call();
    expect(first.calls).toBe(1);
    expect(first.value).toEqual({ id: 'p1', status: 'pending' });
    const [stored] = [...store.records.values()];
    expect(stored?.ttl).toBe(24 * 3600);
    expect(stored?.record).toMatchObject({ state: 'done', status: 201, body: { id: 'p1', status: 'pending' } });

    const replay = await call({ result: { id: 'p2' } });
    expect(replay.calls).toBe(0);
    expect(replay.value).toEqual({ id: 'p1', status: 'pending' });
    expect(replay.response.getHeader('idempotent-replayed')).toBe('true');
  });

  it('ReplayInHandler : rien de la réponse n’est mémorisé ; le rejeu repasse par le handler, marqué rejeu', async () => {
    const { store, call } = setup();
    const secret = { handoff: { code: 'K7M4-P9QX' } };
    const first = await call({ route: 'approve', result: secret });
    expect(first.value).toEqual(secret);
    expect(first.replayed).toBeNull();
    const [stored] = [...store.records.values()];
    expect(stored?.record).toMatchObject({ state: 'done', status: 200, body: null });
    expect(JSON.stringify(stored?.record)).not.toContain('K7M4');

    const replay = await call({ route: 'approve', result: { rebuilt: true } });
    expect(replay.calls).toBe(1);
    expect(replay.replayed).toEqual({ reference: null });
    expect(replay.value).toEqual({ rebuilt: true });
    expect(replay.response.getHeader('idempotent-replayed')).toBe('true');
    // Le rejeu ne remplace pas l'enregistrement (empreinte, 24 h).
    expect([...store.records.values()][0]?.record).toEqual(stored?.record);

    const reused = await call({ route: 'approve', body: { other: true } });
    expect(code(reused.error)).toBe('idempotency_key_reused');
    expect(reused.calls).toBe(0);
  });

  it('ReplayInHandler avec référence : seule la référence est mémorisée et rendue au rejeu', async () => {
    const { store, call } = setup();
    const result = { association: { id: 'a1', name: 'Mutuelle' }, handoff: { code: 'K7M4-P9QX' } };
    await call({ route: 'create', result });
    const [stored] = [...store.records.values()];
    expect(stored?.record).toMatchObject({ state: 'done', status: 201, body: { id: 'a1' } });
    expect(JSON.stringify(stored?.record)).not.toContain('K7M4');
    const replay = await call({ route: 'create', result: { rebuilt: true } });
    expect(replay.replayed).toEqual({ reference: { id: 'a1' } });
    expect(replay.value).toEqual({ rebuilt: true });
  });

  it('même clé, corps différent → 422 idempotency_key_reused, sans exécution', async () => {
    const { call } = setup();
    await call();
    const reused = await call({ body: { ...BODY, amount: 50000 } });
    expect(code(reused.error)).toBe('idempotency_key_reused');
    expect(reused.calls).toBe(0);
  });

  it('l’ordre des clés du corps ne change pas l’empreinte', async () => {
    const { call } = setup();
    await call({ body: { a: 1, b: { c: 2, d: 3 } } });
    expect((await call({ body: { b: { d: 3, c: 2 }, a: 1 } })).calls).toBe(0);
  });

  it('même clé envoyée par un autre utilisateur : sa propre opération, jamais la réponse du premier', async () => {
    const { call } = setup();
    await call({ user: MOUSSA });
    const other = await call({ user: FATOU, result: { id: 'p-fatou' } });
    expect(other.calls).toBe(1);
    expect(other.value).toEqual({ id: 'p-fatou' });
  });

  it('requête identique encore en cours → 409 invalid_state, sans seconde exécution', async () => {
    const { store, call } = setup();
    await store.begin(`${MOUSSA}:me.declare:${KEY}`, requestFingerprint('POST', '/api/v1/me/payments', BODY), 60);
    const concurrent = await call();
    expect(concurrent.calls).toBe(0);
    expect(code(concurrent.error)).toBe('invalid_state');
  });

  it('autre requête encore en cours sous la même clé → 422 idempotency_key_reused', async () => {
    const { store, call } = setup();
    await store.begin(`${MOUSSA}:me.declare:${KEY}`, requestFingerprint('POST', '/api/v1/me/payments', {}), 60);
    expect(code((await call()).error)).toBe('idempotency_key_reused');
  });

  it('échec de l’opération : rien n’est mémorisé, la même clé peut être renvoyée', async () => {
    const { store, call } = setup();
    const failed = await call({ error: new DomainProblem('amount_exceeds_remaining') });
    expect(code(failed.error)).toBe('amount_exceeds_remaining');
    expect(store.records.size).toBe(0);
    expect((await call()).calls).toBe(1);
  });

  it.each([
    ['absente', undefined, 'required'],
    ['trop courte', 'abc', 'invalid'],
    ['avec espaces', 'une clé avec espaces', 'invalid'],
  ])('clé %s → 422 validation_failed sur l’en-tête', async (_case, key, rule) => {
    const { call } = setup();
    const res = await call({ key });
    expect(code(res.error)).toBe('validation_failed');
    expect((res.error as DomainProblem).details.fields).toEqual({ 'Idempotency-Key': rule });
    expect(res.calls).toBe(0);
  });

  it('stockage indisponible : l’opération n’est pas exécutée (jamais de doublon possible)', async () => {
    const { store, call } = setup();
    store.begin = () => Promise.reject(new Error('redis indisponible'));
    const res = await call();
    expect(res.error).toBeInstanceOf(Error);
    expect(res.calls).toBe(0);
  });

  it('endpoint authentifié sans utilisateur identifié : erreur interne, jamais une portée par IP partagée', async () => {
    const { store, call } = setup();
    const res = await call({ user: null });
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error).not.toBeInstanceOf(DomainProblem);
    expect(res.calls).toBe(0);
    expect(store.records.size).toBe(0);
  });

  it('endpoint public (sans acteur) : portée par IP, clé au format UUID exigée', async () => {
    const { call } = setup();
    const notUuid = await call({ route: 'submit', user: null, key: 'cle-libre-longue' });
    expect((notUuid.error as DomainProblem).details.fields).toEqual({ 'Idempotency-Key': 'invalid' });
    expect((await call({ route: 'submit', user: null })).calls).toBe(1);
  });

  it('endpoint sans le drapeau : rien n’est exigé ni mémorisé', async () => {
    const { store, call } = setup();
    expect((await call({ route: 'read', key: undefined })).calls).toBe(1);
    expect(store.records.size).toBe(0);
  });
});
