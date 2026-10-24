import { listOf, PlatformAssociationDetail, PlatformAssociationSummary } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import {
  C,
  codeOf,
  OWNERS,
  PLANS,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
  SUBS,
} from './platform-associations.fixture.js';

/**
 * Lot 1.4 · étape 1 : lecture plateforme des associations (pf.asso.list, pf.asso.get) par la connexion plateforme
 * (cotiz_platform). Vérification de l'étape : tests de permission (le support lit ; hors de l'espace plateforme, 404).
 * Lectures non auditées (endpoints.yaml `audited: false`, ADR 0017).
 */

const Page = listOf(PlatformAssociationSummary);

describe('lecture plateforme des associations (pf.asso.list, pf.asso.get)', () => {
  let f: PlatformFixture;
  let support: string;
  /** Heure de la connexion d'Awa (gestionnaire de A) : dernière activité de A. */
  let awaLoggedInAfter: Date;

  const call = (path: string, token?: string) => f.call(path, { token });
  const list = async (query = '', token = support) => {
    const res = await call(`/platform/associations${query}`, token);
    expect(res.status).toBe(200);
    return Page.parse(await res.json());
  };
  const get = async (id: string, token = support) => {
    const res = await call(`/platform/associations/${id}`, token);
    expect(res.status).toBe(200);
    return PlatformAssociationDetail.parse(await res.json());
  };
  const names = (page: { items: { name: string }[] }) => page.items.map((i) => i.name);
  const auditCount = async () =>
    ((await f.h.superuser('SELECT count(*)::int AS n FROM audit_logs')).rows[0] as { n: number }).n;

  beforeAll(async () => {
    f = await startPlatformFixture();
    support = await f.login('platform', STAFF.support.email);
    awaLoggedInAfter = new Date(Date.now() - 1000);
    await f.login('association', 'awa@test.cotiz.app');
  });

  afterAll(() => f.stop());

  describe('pf.asso.list', () => {
    it('toutes les associations, la plus ancienne en premier, avec compteurs par statut et par plan', async () => {
      const page = await list();
      expect(names(page)).toEqual([
        'Entraide Yopougon',
        'Ressortissants de Man',
        'Mutuelle de Dakar',
        'Jeunesse solidaire 100% Bouaké',
      ]);
      expect(page.total).toBe(4);
      expect(page.nextCursor).toBeNull();
      expect(page.facets).toEqual({
        status: { onboarding: 1, active: 2, past_due: 0, suspended: 1, closed: 0 },
        plan: { [PLANS.essentiel]: 3, [PLANS.pro]: 1 },
      });
    });

    it('résumé : plan en cours, souscripteurs non retirés, projets, dernière activité d’un gestionnaire', async () => {
      const { items } = await list();
      const a = items.find((i) => i.id === A.id);
      expect(a).toMatchObject({
        slug: 'entraide-yopougon',
        city: 'Abidjan',
        country: 'CI',
        logoFileId: null,
        status: 'active',
        plan: { id: PLANS.essentiel, code: 'essentiel', name: 'Essentiel' },
        projectsCount: 0,
        subscribersCount: 2,
        createdAt: '2026-09-01T08:00:00.000Z',
      });
      expect(new Date(a?.lastActivityAt ?? 0).getTime()).toBeGreaterThanOrEqual(awaLoggedInAfter.getTime());
      // Koffi (B) ne s'est connecté qu'en souscripteur ; la connexion d'Awa, souscriptrice de B, n'est pas une activité de B.
      expect(items.find((i) => i.id === B.id)).toMatchObject({ lastActivityAt: null, subscribersCount: 2 });
    });

    it('filtre par statut : les compteurs par statut restent ceux des autres filtres', async () => {
      const page = await list('?status=active');
      expect(names(page)).toEqual(['Entraide Yopougon', 'Ressortissants de Man']);
      expect(page.total).toBe(2);
      expect(page.facets?.status).toMatchObject({ active: 2, suspended: 1, onboarding: 1 });
      expect(page.facets?.plan).toEqual({ [PLANS.essentiel]: 1, [PLANS.pro]: 1 });
    });

    it('filtre par plan : les compteurs par plan restent ceux des autres filtres', async () => {
      const page = await list(`?planId=${PLANS.pro}`);
      expect(names(page)).toEqual(['Ressortissants de Man']);
      expect(page.facets?.plan).toEqual({ [PLANS.essentiel]: 3, [PLANS.pro]: 1 });
      expect(page.facets?.status).toMatchObject({ active: 1, suspended: 0 });
    });

    it('filtre par pays', async () => {
      expect(names(await list('?country=SN'))).toEqual(['Mutuelle de Dakar']);
    });

    it('recherche par nom ou ville, sans casse ; % est un caractère, pas un joker', async () => {
      expect(names(await list('?q=ENTRAIDE'))).toEqual(['Entraide Yopougon']);
      expect(names(await list('?q=dakar'))).toEqual(['Mutuelle de Dakar']);
      expect(names(await list('?q=abidjan'))).toEqual(['Entraide Yopougon', 'Ressortissants de Man']);
      expect(names(await list(`?q=${encodeURIComponent('100%')}`))).toEqual(['Jeunesse solidaire 100% Bouaké']);
      expect(names(await list(`?q=${encodeURIComponent('%')}`))).toEqual(['Jeunesse solidaire 100% Bouaké']);
    });

    it('pages par curseur, sans doublon ni oubli, dans les deux sens de tri', async () => {
      for (const [sort, expected] of [
        [
          '-createdAt',
          ['Jeunesse solidaire 100% Bouaké', 'Mutuelle de Dakar', 'Ressortissants de Man', 'Entraide Yopougon'],
        ],
        [
          'createdAt',
          ['Entraide Yopougon', 'Ressortissants de Man', 'Mutuelle de Dakar', 'Jeunesse solidaire 100% Bouaké'],
        ],
      ] as const) {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const page: ReturnType<typeof Page.parse> = await list(
            `?limit=3&sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          );
          expect(page.total).toBe(4);
          seen.push(...names(page));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(expected);
      }
    });

    it('tri inconnu ou curseur illisible : 422 validation_failed', async () => {
      for (const query of ['?sort=name', '?cursor=xyz']) {
        const res = await call(`/platform/associations${query}`, support);
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('validation_failed');
      }
    });
  });

  describe('pf.asso.get', () => {
    it('fiche : profil, abonnement, quotas, équipe, indicateurs, version', async () => {
      const detail = await get(A.id);
      expect(detail).toMatchObject({
        id: A.id,
        name: 'Entraide Yopougon',
        type: 'entraide',
        description: null,
        contactEmail: 'contact@ey.ci',
        contactPhone: '+2250700000000',
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        status: 'active',
        suspendedAt: null,
        suspensionReason: null,
        owner: { id: USERS.awa, firstName: 'Awa', email: 'awa@test.cotiz.app' },
        managers: [{ id: USERS.awa, role: 'owner' }],
        subscription: {
          id: SUBS.a,
          plan: { id: PLANS.essentiel },
          billingPeriod: 'monthly',
          status: 'active',
          price: { amount: 10000, currency: 'XOF' },
          currentPeriodStart: '2026-10-01',
          currentPeriodEnd: '2026-10-31',
          trialEndsOn: null,
          managerSeatsOverride: null,
        },
        quotas: {
          projects: { used: 0, limit: 5 },
          subscribers: { used: 2, limit: 100 },
          managers: { used: 1, limit: 2 },
        },
        kpi: { activeProjects: 0, subscribers: 2, collectedTotal: { amount: 0, currency: 'XOF' }, recoveryRate: null },
        version: 1,
      });
      expect(new Date(detail.lastActivityAt ?? 0).getTime()).toBeGreaterThanOrEqual(awaLoggedInAfter.getTime());
    });

    it('frise : les actions du journal sur l’association, la plus récente en premier, avec leur auteur', async () => {
      const detail = await get(A.id);
      expect(detail.events).toEqual([
        {
          type: 'association.created',
          at: '2026-09-01T08:00:00.000Z',
          by: { id: STAFF.owner.id, firstName: 'Richy', lastName: 'Nda' },
          detail: null,
        },
      ]);
    });

    it('surcharge des comptes gestionnaires : limite de l’abonnement, pas du plan', async () => {
      const detail = await get(B.id);
      expect(detail.subscription).toMatchObject({ status: 'trialing', managerSeatsOverride: 3 });
      expect(detail.quotas).toEqual({
        projects: { used: 0, limit: null },
        subscribers: { used: 2, limit: 500 },
        managers: { used: 1, limit: 3 },
      });
    });

    it('association suspendue : date et motif', async () => {
      expect(await get(C)).toMatchObject({
        status: 'suspended',
        suspendedAt: '2026-10-20T09:00:00.000Z',
        suspensionReason: 'Abonnement impayé',
        owner: { id: OWNERS.diop.id },
      });
    });

    it('association sans création au journal (seed, reprise) : la frise s’ouvre tout de même sur sa date d’entrée', async () => {
      expect((await get(C)).events).toEqual([
        { type: 'association.created', at: '2026-10-01T08:00:00.000Z', by: null, detail: null },
      ]);
    });

    it('association inconnue : 404 not_found', async () => {
      const res = await call('/platform/associations/00000000-0000-7000-8000-0000000015ff', support);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('permissions (platform.associations.read)', () => {
    it('le support lit la liste et une fiche, sans entrée au journal d’audit', async () => {
      const before = await auditCount();
      expect((await call('/platform/associations', support)).status).toBe(200);
      expect((await call(`/platform/associations/${A.id}`, support)).status).toBe(200);
      expect(await auditCount()).toBe(before);
    });

    it('sans jeton : 401 ; jeton gestionnaire ou souscripteur : 404 (espace plateforme)', async () => {
      expect((await call('/platform/associations')).status).toBe(401);
      expect((await call(`/platform/associations/${A.id}`)).status).toBe(401);
      for (const token of [
        await f.login('association', 'awa@test.cotiz.app'),
        await f.login('subscriber', 'moussa@test.cotiz.app'),
      ]) {
        expect((await call('/platform/associations', token)).status).toBe(404);
        expect((await call(`/platform/associations/${A.id}`, token)).status).toBe(404);
      }
    });
  });
});
