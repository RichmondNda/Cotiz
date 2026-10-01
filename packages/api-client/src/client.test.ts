import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './index.js';

const aid = '01928f3e-6a7b-7c3d-9e4f-000000000001';
const payId = '01928f3e-6a7b-7c3d-9e4f-000000000002';
const xof = (amount: number) => ({ amount, currency: 'XOF' as const });

function setup(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  const client = createClient({ baseUrl: 'https://cotiz.test', fetch, newIdempotencyKey: () => 'cle-unique-1234' });
  return { fetch, client };
}
const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
const sent = (fetch: ReturnType<typeof setup>['fetch']) => {
  const [url, init] = fetch.mock.calls[0] ?? [];
  return { url: url as string, init: init ?? {}, headers: new Headers(init?.headers) };
};

describe('client typé', () => {
  it('construit le chemin, la query (valeurs par défaut du schéma) et renvoie le corps JSON', async () => {
    const page = { items: [], nextCursor: null, total: 0 };
    const { fetch, client } = setup(json(page));
    const result = await client.call('lg.pay.list', 'list', { params: { aid }, query: { olderThanDays: 5 } });
    expect(result).toEqual(page);
    const { url, init } = sent(fetch);
    expect(init.method).toBe('GET');
    expect(url).toBe(`https://cotiz.test/api/v1/associations/${aid}/payments?limit=25&status=pending&olderThanDays=5`);
  });

  it('ajoute Idempotency-Key et If-Match quand l’endpoint porte les drapeaux', async () => {
    const { fetch, client } = setup(json({}));
    await client
      .call('lg.pay.validate', 'validate', { params: { aid, payId }, body: { amountReceived: xof(50000) }, ifMatch: 3 })
      .catch(() => undefined);
    const { init, headers } = sent(fetch);
    expect(init.method).toBe('POST');
    expect(headers.get('idempotency-key')).toBe('cle-unique-1234');
    expect(headers.get('if-match')).toBe('W/"3"');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ amountReceived: xof(50000) });
  });

  it('une clé d’idempotence fournie est réutilisée (nouvel essai de la même opération)', async () => {
    const { fetch, client } = setup(new Response(null, { status: 201 }));
    await client
      .call('pr.create', 'create', {
        params: { aid },
        body: {
          name: 'Centre communautaire',
          description: '',
          requiredSubscribers: null,
          entryFee: xof(50000),
          installmentAmount: xof(25000),
          frequency: 'monthly',
          dueDay: 5,
          scheduleType: 'fixed',
          startDate: '2026-03-01',
          endDate: '2027-08-31',
          graceDays: 5,
          paymentMethods: [],
        },
        idempotencyKey: 'deja-envoyee-42',
      })
      .catch(() => undefined);
    expect(sent(fetch).headers.get('idempotency-key')).toBe('deja-envoyee-42');
  });

  it('pas d’en-têtes d’idempotence ni de version sur une lecture', async () => {
    const { fetch, client } = setup(json({}));
    await client.call('lg.pay.get', 'get', { params: { aid, payId } }).catch(() => undefined);
    const { headers } = sent(fetch);
    expect(headers.has('idempotency-key')).toBe(false);
    expect(headers.has('if-match')).toBe(false);
  });

  it('refuse d’envoyer un corps invalide (montant décimal)', async () => {
    const { fetch, client } = setup(json({}));
    await expect(
      client.call('lg.pay.validate', 'validate', {
        params: { aid, payId },
        body: { amountReceived: { amount: 500.5, currency: 'XOF' } },
        ifMatch: 1,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('204 → undefined', async () => {
    const { client } = setup(new Response(null, { status: 204 }));
    await expect(client.call('auth.logout', 'logout')).resolves.toBeUndefined();
  });

  it('erreur Problem typée (code du catalogue, membres d’extension)', async () => {
    const problem = {
      type: 'https://docs.cotiz.app/errors/amount_exceeds_remaining',
      title: 'Montant supérieur au reste dû',
      status: 422,
      code: 'amount_exceeds_remaining',
      maxAmount: 50000,
    };
    const { client } = setup(json(problem, 422, 'application/problem+json'));
    const error = await client
      .call('me.alloc', 'preview', { body: { projectId: aid, amount: xof(200000) } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).problem).toEqual(problem);
    expect((error as ApiError).code).toBe('amount_exceeds_remaining');
  });

  it('erreur hors catalogue : ApiError sans Problem', async () => {
    const { client } = setup(new Response('Bad gateway', { status: 502 }));
    const error = (await client.call('sys.health', 'live').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.problem).toBeNull();
    expect(error.code).toBeNull();
  });

  it('url() pour les liens directs (fichier signé)', () => {
    const { client } = setup(json({}));
    expect(client.url('fl.get', 'get', { params: { id: payId } })).toBe(`https://cotiz.test/api/v1/files/${payId}`);
  });
});
