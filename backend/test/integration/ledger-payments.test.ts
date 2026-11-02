import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { METHODS, xof } from './projects.fixture.js';

/**
 * Lot 2.4 · étape 4 : file des paiements (lg.pay.list : en attente par défaut, filtres, compteurs, pages) et détail
 * d'un paiement (lg.pay.get : répartition, échéancier, derniers versements, ETag, preuve lisible par fl.get).
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC. PROJECTS.a : 25 000 F le 5 de chaque mois depuis le
 * 2026-03-01. Paiements posés en base (déclaration, validation, rejet), comme les écriraient les lots 3.3 et 2.4.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const List = ENDPOINTS['lg.pay.list'].operations.list.response.body;
const Detail = ENDPOINTS['lg.pay.get'].operations.get.response.body;
/** Problem sans son identifiant de requête (propre à chaque appel). */
const problemOf = (body: unknown) => ({ ...(body as Record<string, unknown>), requestId: undefined });

describe('file et détail des paiements (lg.pay.list, lg.pay.get)', () => {
  let f: LedgerFixture;

  const list = (query = '', options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/payments${query}`, { token: options.token ?? f.tokens.awa });
  const listed = async (query = '', options: Parameters<typeof list>[1] = {}) => {
    const res = await list(query, options);
    expect(res.status).toBe(200);
    return List.parse(await res.json());
  };
  const get = (payId: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/payments/${payId}`, { token: options.token ?? f.tokens.awa });
  const detail = async (payId: string, options: Parameters<typeof get>[1] = {}) => {
    const res = await get(payId, options);
    expect(res.status).toBe(200);
    return { body: Detail.parse(await res.json()), etag: res.headers.get('etag') };
  };
  /**
   * Kofi (entré au début du projet) : mars et avril validés par Awa (mars le 5 mars, avril il y a 2 min, répartition
   * ajustée), mai rejeté, juin et juillet déclarés hier (preuve en fichier, Orange Money) ; Moussa : novembre
   * déclaré il y a 6 jours, 10 000 F. Dans B : un paiement en attente de Fatou.
   */
  const scenario = async () => {
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const moussa = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    const kofiUser = await f.userOf(kofi.id);
    const march = await f.installmentOf(kofi.id, '2026-03-05');
    const april = await f.installmentOf(kofi.id, '2026-04-05');
    const may = await f.installmentOf(kofi.id, '2026-05-05');
    const june = await f.installmentOf(kofi.id, '2026-06-05');
    const july = await f.installmentOf(kofi.id, '2026-07-05');
    const novemberMoussa = await f.installmentOf(moussa.id, '2026-11-05');
    const ids = {
      march: await f.record({
        enrollmentId: kofi.id,
        userId: kofiUser,
        amount: 25000,
        status: 'validated',
        declaredAt: '2026-03-05T08:00:00Z',
        reviewedBy: USERS.awa,
        reviewedAt: '2026-03-05T15:00:00Z',
        lines: [{ installmentId: march, amount: 25000, state: 'confirmed' }],
      }),
      // Déclaré sur avril et mai, validé sur avril seulement (montant reçu = 25 000) : répartition ajustée.
      april: await f.record({
        enrollmentId: kofi.id,
        userId: kofiUser,
        amount: 25000,
        status: 'validated',
        declaredAt: '2026-11-08T09:00:00Z',
        reviewedBy: USERS.awa,
        reviewedAt: '2026-11-08T09:58:00Z',
        lines: [
          { installmentId: april, amount: 12500, state: 'voided' },
          { installmentId: may, amount: 12500, state: 'voided' },
          { installmentId: april, amount: 25000, state: 'confirmed', round: 1 },
        ],
      }),
      may: await f.record({
        enrollmentId: kofi.id,
        userId: kofiUser,
        amount: 25000,
        status: 'rejected',
        declaredAt: '2026-11-05T08:00:00Z',
        reviewedBy: USERS.aminata,
        reviewedAt: '2026-11-05T12:00:00Z',
        rejection: { code: 'not_received', message: 'Rien reçu sur Orange Money.' },
        lines: [{ installmentId: may, amount: 25000, state: 'voided' }],
      }),
      juneJuly: await f.record({
        enrollmentId: kofi.id,
        userId: kofiUser,
        amount: 50000,
        status: 'pending',
        declaredAt: '2026-11-07T18:00:00Z',
        methodId: METHODS.orangeA,
        proofFileId: await f.proof(kofiUser),
        lines: [
          { installmentId: june, amount: 25000, state: 'proposed' },
          { installmentId: july, amount: 25000, state: 'proposed' },
        ],
      }),
      moussa: await f.record({
        enrollmentId: moussa.id,
        userId: USERS.moussa,
        amount: 10000,
        status: 'pending',
        declaredAt: '2026-11-02T08:00:00Z',
        lines: [{ installmentId: novemberMoussa, amount: 10000, state: 'proposed' }],
      }),
    };
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      {
        aid: B.id,
        pid: PROJECTS.b,
        token: f.tokens.koffi,
      },
    );
    const ofB = await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: fatou.id,
      userId: USERS.fatou,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-06T08:00:00Z',
      lines: [{ installmentId: await f.installmentOf(fatou.id, '2026-03-05'), amount: 25000, state: 'proposed' }],
    });
    return { kofi, moussa, kofiUser, ids, ofB, installments: { march, april, may, june, july } };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    // fl.get signe l'URL de lecture sans appeler MinIO : des identifiants fictifs suffisent.
    f = await startLedgerFixture({ S3_ACCESS_KEY_ID: 'test-access', S3_SECRET_ACCESS_KEY: 'test-secret' });
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(() => f.resetLedger());

  describe('lg.pay.list', () => {
    it('file de validation par défaut : paiements en attente de l’association, les plus récents d’abord', async () => {
      const s = await scenario();
      const body = await listed();
      expect(body.items.map((p) => p.id)).toEqual([s.ids.juneJuly, s.ids.moussa]);
      expect(body.total).toBe(2);
      expect(body.nextCursor).toBeNull();
      const [first] = body.items;
      expect(first).toMatchObject({
        status: 'pending',
        amountDeclared: xof(50000),
        amountReceived: null,
        paidOn: '2026-11-07',
        declaredAt: '2026-11-07T18:00:00.000Z',
        paymentMethodKind: 'mobile_money',
        member: { firstName: 'Kofi', lastName: 'Annan' },
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
        proof: { fileName: 'capture.jpg', mimeType: 'image/jpeg', transactionReference: null },
        reviewedBy: null,
        reviewedAt: null,
      });
      expect(first?.covered).toEqual([
        {
          installmentId: s.installments.june,
          kind: 'periodic',
          sequence: 4,
          dueDate: '2026-06-05',
          amount: xof(25000),
          state: 'proposed',
        },
        expect.objectContaining({ installmentId: s.installments.july, sequence: 5, state: 'proposed' }),
      ]);
      expect(body.items[1]).toMatchObject({
        paymentMethodKind: null,
        proof: { fileId: null, fileName: null, mimeType: null, transactionReference: 'REF-42' },
      });
      // Compteurs par statut, avec les autres filtres, sans celui du statut.
      expect(body.facets).toEqual({ status: { pending: 2, validated: 2, rejected: 1, canceled: 0 } });
    });

    it('tous les statuts ; validé : répartition confirmée et relecteur ; rejeté : répartition déclarée', async () => {
      const s = await scenario();
      const all = await listed('?status=all');
      expect(all.items.map((p) => p.id)).toEqual([s.ids.april, s.ids.juneJuly, s.ids.may, s.ids.moussa, s.ids.march]);
      const april = all.items[0];
      expect(april).toMatchObject({
        status: 'validated',
        reviewedBy: { id: USERS.awa, firstName: 'Awa' },
        reviewedAt: '2026-11-08T09:58:00.000Z',
      });
      expect(april?.covered).toEqual([
        expect.objectContaining({ amount: xof(25000), state: 'confirmed', sequence: 2 }),
      ]);
      const may = all.items[2];
      expect(may?.covered).toEqual([expect.objectContaining({ amount: xof(25000), state: 'voided', sequence: 3 })]);
      expect((await listed('?status=validated')).items.map((p) => p.id)).toEqual([s.ids.april, s.ids.march]);
      expect((await listed('?status=rejected')).total).toBe(1);
    });

    it('filtres : projet, personne, ancienneté, montant', async () => {
      const s = await scenario();
      expect((await listed(`?status=all&userId=${USERS.moussa}`)).items.map((p) => p.id)).toEqual([s.ids.moussa]);
      expect((await listed(`?status=all&projectId=${PROJECTS.a2}`)).total).toBe(0);
      expect((await listed(`?projectId=${PROJECTS.a}`)).total).toBe(2);
      // Déclaré depuis au moins 5 jours : Moussa (6 jours), pas Kofi (hier).
      expect((await listed('?olderThanDays=5')).items.map((p) => p.id)).toEqual([s.ids.moussa]);
      expect((await listed('?minAmount=20000')).items.map((p) => p.id)).toEqual([s.ids.juneJuly]);
      expect((await listed('?maxAmount=10000')).items.map((p) => p.id)).toEqual([s.ids.moussa]);
      const filtered = await listed(`?userId=${USERS.moussa}`);
      expect(filtered.facets).toEqual({ status: { pending: 1, validated: 0, rejected: 0, canceled: 0 } });
    });

    it('pages par curseur ; tri du plus ancien ; curseur illisible ou tri inconnu → 422', async () => {
      const s = await scenario();
      const first = await listed('?status=all&limit=2');
      expect(first.items.map((p) => p.id)).toEqual([s.ids.april, s.ids.juneJuly]);
      expect(first.total).toBe(5);
      const second = await listed(`?status=all&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
      expect(second.items.map((p) => p.id)).toEqual([s.ids.may, s.ids.moussa]);
      const third = await listed(`?status=all&limit=2&cursor=${encodeURIComponent(second.nextCursor ?? '')}`);
      expect(third.items.map((p) => p.id)).toEqual([s.ids.march]);
      expect(third.nextCursor).toBeNull();
      expect((await listed('?sort=declaredAt')).items.map((p) => p.id)).toEqual([s.ids.moussa, s.ids.juneJuly]);
      expect((await list('?cursor=nimporte')).status).toBe(422);
      expect((await list('?sort=amount')).status).toBe(422);
      // Une clé du prototype n'est pas un tri connu.
      expect((await list('?sort=constructor')).status).toBe(422);
      expect((await listed('?sort=-declaredAt')).items.map((p) => p.id)).toEqual([s.ids.juneJuly, s.ids.moussa]);
    });

    it('isolation : chaque association ne voit que ses paiements ; non-membre ou souscripteur → 404', async () => {
      const s = await scenario();
      const ofA = await listed('?status=all');
      expect(ofA.items.map((p) => p.id)).not.toContain(s.ofB);
      const ofB = await listed('?status=all', { aid: B.id, token: f.tokens.koffi });
      expect(ofB.items.map((p) => p.id)).toEqual([s.ofB]);
      expect(ofB.facets).toEqual({ status: { pending: 1, validated: 0, rejected: 0, canceled: 0 } });
      expect((await list('', { aid: B.id, token: f.tokens.aminata })).status).toBe(404);
      expect((await list('', { token: f.tokens.moussa })).status).toBe(404);
      // Viewer : lecture seule autorisée.
      expect((await list('', { token: f.tokens.koffi })).status).toBe(200);
    });
  });

  describe('lg.pay.get', () => {
    it('paiement en attente : répartition proposée, moyen, preuve, échéancier, derniers versements, ETag', async () => {
      const s = await scenario();
      const { body, etag } = await detail(s.ids.juneJuly);
      expect(etag).toBe('W/"1"');
      expect(body).toMatchObject({
        id: s.ids.juneJuly,
        status: 'pending',
        amountDeclared: xof(50000),
        paymentMethod: { id: METHODS.orangeA, kind: 'mobile_money', label: 'Orange Money' },
        comment: null,
        allocationAdjusted: false,
        rejection: null,
        revertibleUntil: null,
        version: 1,
      });
      expect(body.covered.map((c) => [c.sequence, c.state])).toEqual([
        [4, 'proposed'],
        [5, 'proposed'],
      ]);
      // Échéancier de l'inscription (18 échéances), statuts calculés au jour de l'association.
      expect(body.schedule).toHaveLength(18);
      expect(body.schedule[0]).toMatchObject({ sequence: 1, dueDate: '2026-03-05' });
      // 3 derniers paiements validés de la personne sur le projet, hors celui-ci : avril, mars.
      expect(body.recentPayments.map((p) => p.id)).toEqual([s.ids.april, s.ids.march]);
    });

    it('validé il y a 2 min par Awa : annulable par elle seule pendant 10 min ; répartition ajustée', async () => {
      const s = await scenario();
      const mine = (await detail(s.ids.april)).body;
      expect(mine).toMatchObject({
        status: 'validated',
        allocationAdjusted: true,
        revertibleUntil: '2026-11-08T10:08:00.000Z',
      });
      expect(mine.covered).toEqual([expect.objectContaining({ sequence: 2, amount: xof(25000), state: 'confirmed' })]);
      // Une autre gestionnaire ne peut pas annuler la validation d'Awa.
      expect((await detail(s.ids.april, { token: f.tokens.aminata })).body.revertibleUntil).toBeNull();
      // Validation ancienne : plus annulable ; répartition non ajustée.
      expect((await detail(s.ids.march)).body).toMatchObject({ allocationAdjusted: false, revertibleUntil: null });
    });

    it('rejeté : motif et message, répartition déclarée', async () => {
      const s = await scenario();
      const { body } = await detail(s.ids.may);
      expect(body).toMatchObject({
        status: 'rejected',
        rejection: { reasonCode: 'not_received', message: 'Rien reçu sur Orange Money.' },
        reviewedBy: { id: USERS.aminata },
        revertibleUntil: null,
      });
      expect(body.covered).toEqual([expect.objectContaining({ sequence: 3, state: 'voided' })]);
    });

    it('paiement d’une autre association ou inconnu → même 404 ; non-membre ou souscripteur → 404', async () => {
      const s = await scenario();
      const [foreign, unknown] = [await get(s.ofB), await get(crypto.randomUUID())];
      expect([foreign.status, unknown.status]).toEqual([404, 404]);
      expect(problemOf(await foreign.json())).toEqual(problemOf(await unknown.json()));
      expect((await get(s.ids.march, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
      expect((await get(s.ofB, { aid: B.id, token: f.tokens.aminata })).status).toBe(404);
      expect((await get(s.ids.march, { token: f.tokens.moussa })).status).toBe(404);
    });

    it('preuve : lisible par les gestionnaires de l’association (fl.get), pas par une autre association', async () => {
      const s = await scenario();
      const { body } = await detail(s.ids.juneJuly);
      const fileId = body.proof.fileId;
      expect(fileId).not.toBeNull();
      const read = (token: string, aid = A.id) =>
        fetch(`${f.base}/associations/${aid}/files/${fileId ?? ''}`, {
          headers: { authorization: `Bearer ${token}` },
          redirect: 'manual',
        });
      expect((await read(f.tokens.awa)).status).toBe(302);
      expect((await read(f.tokens.aminata)).status).toBe(302);
      expect((await read(f.tokens.koffi)).status).toBe(302);
      // Koffi gère aussi B : la preuve de A lue par l'URL de B n'existe pas. Un souscripteur : 404.
      expect((await read(f.tokens.koffi, B.id)).status).toBe(404);
      expect((await read(f.tokens.moussa)).status).toBe(404);
    });
  });
});
