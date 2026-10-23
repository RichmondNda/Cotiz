import { describe, expect, it, vi } from 'vitest';

// Fonctions de mise en place d'un espace exportées par les autres modules : toutes refusées hors de l'espace
// plateforme, avant toute lecture ou écriture (tables globales, lignes de plusieurs associations).
const context = vi.hoisted((): { space: string | null } => ({ space: 'association' }));
const touched = vi.hoisted(() => vi.fn());
const touch = () => {
  touched();
  return new Error('aucune transaction attendue');
};

vi.mock('../../../shared/tenant-context/index.js', async (original) => ({
  ...(await original<object>()),
  currentContext: () => (context.space ? { space: context.space } : null),
  currentTx: () => {
    throw touch();
  },
}));

const { grantOwnership, membersOf, ownerOf, ownsAnAssociation } = await import('../../access/access.public.js');
const { currentSubscriptionOf, openSubscription } = await import('../../billing/billing.public.js');
const { createAssociation, platformAssociationOf } = await import('../../tenancy/tenancy.public.js');
const { ManagerAccounts, platformPersonContactsOf } = await import('../../identity/identity.public.js');

const ID = '00000000-0000-7000-8000-000000000001';
// Le service de codes passe lui aussi par la transaction : en plateforme, l'émission l'atteint.
const codes = { issue: () => Promise.reject(touch()), reveal: () => Promise.reject(touch()) };
const accounts = new ManagerAccounts(codes as never, {} as never);
const calls: [string, () => Promise<unknown>][] = [
  ['ownsAnAssociation', () => ownsAnAssociation(ID)],
  ['grantOwnership', () => grantOwnership(ID, ID, ID)],
  ['ownerOf', () => ownerOf(ID)],
  ['membersOf', () => membersOf(ID)],
  ['currentSubscriptionOf', () => currentSubscriptionOf(ID)],
  ['platformAssociationOf', () => platformAssociationOf(ID)],
  ['platformPersonContactsOf', () => platformPersonContactsOf([ID])],
  [
    'openSubscription',
    () =>
      openSubscription({
        associationId: ID,
        planId: ID,
        billingPeriod: 'monthly',
        startsOn: '2026-11-01',
        managerSeats: 1,
        trialDays: null,
      }),
  ],
  [
    'createAssociation',
    () =>
      createAssociation({
        name: 'X',
        type: 'association',
        city: 'Abidjan',
        country: 'CI',
        registrationNumber: null,
        description: null,
        contactEmail: 'x@x.ci',
        contactPhone: '+2250700000000',
      }),
  ],
  ['ManagerAccounts.findByEmail', () => accounts.findByEmail('x@x.ci')],
  [
    'ManagerAccounts.create',
    () => accounts.create({ firstName: 'X', lastName: 'Y', email: 'x@x.ci', phone: '+2250700000000' }),
  ],
  ['ManagerAccounts.issueActivation', () => accounts.issueActivation(ID, ID)],
  ['ManagerAccounts.reissuedHandoff', () => accounts.reissuedHandoff(ID, ID, new Date())],
];

describe('mise en place d’un espace : plateforme seulement', () => {
  for (const space of ['association', 'subscriber', 'me', 'auth', 'public', null]) {
    it.each(calls)(`%s refusée en espace ${String(space)}, sans accès base`, async (_name, call) => {
      context.space = space;
      touched.mockClear();
      await expect(call()).rejects.toThrow(/plateforme seulement/);
      expect(touched).not.toHaveBeenCalled();
    });
  }

  it.each(calls)('%s atteint la base en espace plateforme', async (_name, call) => {
    context.space = 'platform';
    touched.mockClear();
    await expect(call()).rejects.toThrow('aucune transaction attendue');
    expect(touched).toHaveBeenCalled();
  });
});
