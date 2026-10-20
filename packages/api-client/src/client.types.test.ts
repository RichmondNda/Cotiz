import { describe, expectTypeOf, it } from 'vitest';
import type { PaymentDetail } from '@cotiz/contracts';
import { createClient } from './index.js';

// Vérifié par `tsc` (pnpm typecheck) : un appel mal formé ne compile pas.
const client = createClient({ baseUrl: '', fetch: () => Promise.resolve(new Response(null, { status: 204 })) });
const aid = '01928f3e-6a7b-7c3d-9e4f-000000000001';

describe('types du client', () => {
  it('réponse typée par le schéma de l’opération', () => {
    expectTypeOf(() =>
      client.call('lg.pay.get', 'get', { params: { aid, payId: aid } }),
    ).returns.resolves.toEqualTypeOf<PaymentDetail>();
    expectTypeOf(() => client.call('auth.logout', 'logout')).returns.resolves.toBeUndefined();
    expectTypeOf(() => client.call('nt.stream', 'stream')).returns.resolves.toEqualTypeOf<Response>();
  });

  it('If-Match et paramètres de chemin obligatoires', () => {
    const appels = () => {
      // @ts-expect-error If-Match (version) manquant sur un endpoint `ifMatch`
      void client.call('lg.pay.validate', 'validate', { params: { aid, payId: aid }, body: {} });
      // @ts-expect-error paramètre de chemin manquant
      void client.call('lg.pay.get', 'get', { params: { aid } });
      // @ts-expect-error opération inconnue
      void client.call('lg.pay.get', 'remove', { params: { aid, payId: aid } });
      // @ts-expect-error pas de corps sur une lecture
      void client.call('as.get', 'get', { params: { aid }, body: {} });
      // @ts-expect-error If-Match exigé pour modifier un plan
      void client.call('pf.plan.write', 'patch', { params: { id: aid }, body: { name: 'Pro' } });
      // Création d'un plan : aucune version à fournir.
      void client.call('pf.plan.write', 'create', {
        body: {
          code: 'pro',
          name: 'Pro',
          description: null,
          priceMonthly: { amount: 0, currency: 'XOF' },
          priceYearly: { amount: 0, currency: 'XOF' },
          limits: { projects: null, subscribers: null, managers: 1 },
          features: [],
          isFeatured: false,
          isActive: true,
        },
      });
    };
    expectTypeOf(appels).toBeFunction();
  });
});
