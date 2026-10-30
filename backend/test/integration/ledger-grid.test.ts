import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Lot 2.4 · étape 3 : grille d'un projet (lg.grid : souscripteurs × échéances, filtres, pages) et détail d'une
 * échéance (lg.inst : montants, statut calculé, répartitions des paiements). Statuts par installmentStatus() au jour de
 * l'association, jamais relus tels quels.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC. PROJECTS.a : 25 000 F le 5 de chaque mois, du
 * 2026-03-01 au 2027-08-31 (18 échéances, sans fonds d'entrée), délai de grâce 5 jours.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const Grid = ENDPOINTS['lg.grid'].operations.get.response.body;
const Detail = ENDPOINTS['lg.inst'].operations.get.response.body;
const NEW = { kofi: '+2250711223344', ama: '+2250722334455' } as const;
/** Problem sans son identifiant de requête (propre à chaque appel). */
const problemOf = (body: unknown) => ({ ...(body as Record<string, unknown>), requestId: undefined });

describe('grille et échéance (lg.grid, lg.inst)', () => {
  let f: MembersFixture;

  const enroll = async (body: unknown, options: { aid?: string; pid?: string; token?: string } = {}) => {
    const res = await f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(201);
    return Created.parse(await res.json()).enrollment;
  };
  const grid = (query = '', options: { aid?: string; pid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/grid${query}`, {
      token: options.token ?? f.tokens.awa,
    });
  const gridOf = async (query = '', options: Parameters<typeof grid>[1] = {}) => {
    const res = await grid(query, options);
    expect(res.status).toBe(200);
    return Grid.parse(await res.json());
  };
  const inst = (iid: string, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/installments/${iid}`, { token: options.token ?? f.tokens.awa });
  const installmentId = async (enrollmentId: string, dueDate: string) =>
    (
      (
        await f.h.superuser(`SELECT id FROM installments WHERE enrollment_id = $1 AND due_date = $2`, [
          enrollmentId,
          dueDate,
        ])
      ).rows as [{ id: string }]
    )[0].id;

  /**
   * Paiement en attente de la personne (12 500 F proposés sur l'échéance donnée), et paiement validé (25 000 F
   * confirmés sur une autre), posés en base comme une déclaration puis une validation.
   */
  const pay = async (enrollmentId: string, userId: string, pending: string, validated: string) => {
    const ids = { pending: crypto.randomUUID(), validated: crypto.randomUUID() };
    // Une instruction par paiement : paiement, répartition et échéance dans la même transaction (contrôle différé).
    const record = `WITH p AS (
                      INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared,
                                            paid_on, transaction_reference, status, declared_at, reviewed_by,
                                            reviewed_at, idempotency_key)
                      VALUES ($1, $2, $3, $4, $5, $6, '2026-11-02', 'REF', $7::payments_status, $8, $9, $10,
                              gen_random_uuid()::text)
                      RETURNING id),
                    a AS (
                      INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount,
                                               state)
                      SELECT gen_random_uuid(), $2, p.id, $11, $4, $6, $12::allocations_state FROM p)
                    UPDATE installments
                       SET amount_paid = amount_paid + CASE WHEN $7 = 'validated' THEN $6::bigint ELSE 0 END,
                           amount_pending = amount_pending + CASE WHEN $7 = 'pending' THEN $6::bigint ELSE 0 END,
                           status = CASE WHEN $7 = 'validated' THEN 'paid' ELSE status END,
                           paid_at = CASE WHEN $7 = 'validated' THEN $10::timestamptz ELSE paid_at END
                     WHERE id = $11`;
    const common = [A.id, PROJECTS.a, enrollmentId, userId];
    await f.h.superuser(record, [
      ids.validated,
      ...common,
      25000,
      'validated',
      '2026-11-01T09:00:00Z',
      USERS.awa,
      '2026-11-01T15:00:00Z',
      validated,
      'confirmed',
    ]);
    await f.h.superuser(record, [
      ids.pending,
      ...common,
      12500,
      'pending',
      '2026-11-07T08:00:00Z',
      null,
      null,
      pending,
      'proposed',
    ]);
    return ids;
  };

  /**
   * Kofi en retard (entré au début du projet), dont mars est validé et avril déclaré à moitié ; Moussa entré en
   * novembre, novembre réglé ; Ama non activée, entrée aujourd'hui (décembre).
   */
  const scenario = async () => {
    const late = await enroll({ phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan', startsFrom: '2026-03-01' });
    const upToDate = await enroll({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    const pending = await enroll({ phone: NEW.ama, firstName: 'Ama', lastName: 'Kouassi' });
    await f.h.superuser(
      `UPDATE installments SET amount_paid = amount_due WHERE enrollment_id = $1 AND due_date = '2026-11-05'`,
      [upToDate.id],
    );
    const kofiUserId = (
      (await f.h.superuser('SELECT user_id FROM enrollments WHERE id = $1', [late.id])).rows as [{ user_id: string }]
    )[0].user_id;
    const march = await installmentId(late.id, '2026-03-05');
    const april = await installmentId(late.id, '2026-04-05');
    const payments = await pay(late.id, kofiUserId, april, march);
    return { late, upToDate, pending, march, april, payments };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.h.superuser('DELETE FROM allocations');
    await f.h.superuser('DELETE FROM payments');
    await f.resetMembers();
  });

  describe('lg.grid', () => {
    it('colonnes du projet, une ligne par inscription, cases aux statuts calculés', async () => {
      const s = await scenario();
      const body = await gridOf();
      // 18 mensualités, numérotées par le projet (1 = mars 2026), quelles que soient les dates d'entrée.
      expect(body.columns).toHaveLength(18);
      expect(body.columns[0]).toEqual({ sequence: 1, kind: 'periodic', dueDate: '2026-03-05' });
      expect(body.columns.at(-1)).toEqual({ sequence: 18, kind: 'periodic', dueDate: '2027-08-05' });
      expect(body.total).toBe(3);
      expect(body.nextCursor).toBeNull();
      // Les plus récentes d'abord, comme l'onglet Souscripteurs (en.list).
      expect(body.items.map((r) => r.enrollmentId)).toEqual([s.pending.id, s.upToDate.id, s.late.id]);

      const kofi = body.items.find((r) => r.enrollmentId === s.late.id);
      expect(kofi).toMatchObject({ member: { firstName: 'Kofi', lastName: 'Annan' }, standing: 'late' });
      // Engagement 18 × 25 000 F, mars versé : reste 425 000 F (le déclaré n'est pas versé).
      expect(kofi?.remaining).toEqual(xof(425000));
      expect(kofi?.cells).toHaveLength(18);
      expect(kofi?.cells[0]).toEqual({
        installmentId: s.march,
        sequence: 1,
        status: 'paid',
        amountDue: xof(25000),
        amountPaid: xof(25000),
        amountPending: xof(0),
      });
      expect(kofi?.cells[1]).toMatchObject({ installmentId: s.april, status: 'declared', amountPending: xof(12500) });
      // Mai à octobre en retard au 8 novembre, novembre dû (délai de grâce), décembre à venir.
      expect(kofi?.cells.slice(2, 8).map((c) => c.status)).toEqual(Array(6).fill('late'));
      expect(kofi?.cells[8]).toMatchObject({ sequence: 9, status: 'due' });
      expect(kofi?.cells[9]).toMatchObject({ sequence: 10, status: 'upcoming' });

      // Moussa, entré le 1er novembre : cases de novembre (rang 9) à août 2027 seulement.
      const moussa = body.items.find((r) => r.enrollmentId === s.upToDate.id);
      expect(moussa?.standing).toBe('up_to_date');
      expect(moussa?.cells.map((c) => c.sequence)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
      expect(moussa?.cells[0]?.status).toBe('paid');
      expect(body.items[0]?.standing).toBe('activation_pending');
      expect(body.facets).toEqual({
        standing: { signature_required: 0, up_to_date: 1, late: 1, withdrawn: 0, activation_pending: 1 },
      });
    });

    it('filtres : situation, recherche, période ; compteurs sans le filtre de situation', async () => {
      const s = await scenario();
      const late = await gridOf('?standing=late');
      expect(late.items.map((r) => r.enrollmentId)).toEqual([s.late.id]);
      expect(late.total).toBe(1);
      expect(late.facets?.standing?.up_to_date).toBe(1);

      const found = await gridOf('?q=moussa');
      expect(found.items.map((r) => r.enrollmentId)).toEqual([s.upToDate.id]);

      const period = await gridOf('?from=2026-10-01&to=2026-12-31');
      expect(period.columns.map((c) => c.dueDate)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
      const kofi = period.items.find((r) => r.enrollmentId === s.late.id);
      expect(kofi?.cells.map((c) => c.sequence)).toEqual([8, 9, 10]);
      // Situation et reste dû portent sur toute l'inscription, pas sur la période affichée.
      expect(kofi).toMatchObject({ standing: 'late', remaining: xof(425000) });
      expect(period.items.find((r) => r.enrollmentId === s.upToDate.id)?.cells.map((c) => c.sequence)).toEqual([9, 10]);

      // Situation et période ensemble : seules les lignes en retard, cases de la période seulement.
      const both = await gridOf('?standing=late&from=2026-10-01&to=2026-12-31');
      expect(both.items.map((r) => [r.enrollmentId, r.cells.map((c) => c.sequence)])).toEqual([
        [s.late.id, [8, 9, 10]],
      ]);
    });

    it('pages par curseur, sans doublon ni oubli ; curseur illisible ou tri inconnu → 422', async () => {
      const s = await scenario();
      const first = await gridOf('?limit=2');
      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(3);
      expect(first.nextCursor).not.toBeNull();
      const second = await gridOf(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
      expect(second.items.map((r) => r.enrollmentId)).toEqual([s.late.id]);
      expect(second.nextCursor).toBeNull();
      expect(second.columns).toHaveLength(18);
      expect((await grid('?cursor=nimporte')).status).toBe(422);
      expect((await grid('?sort=name')).status).toBe(422);
    });

    it('inscription retirée : absente de la grille', async () => {
      const s = await scenario();
      const res = await f.call(`/associations/${A.id}/enrollments/${s.upToDate.id}/withdraw`, {
        token: f.tokens.awa,
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(200);
      const body = await gridOf();
      expect(body.items.map((r) => r.enrollmentId)).toEqual([s.pending.id, s.late.id]);
      expect(body.total).toBe(2);
    });

    it('cycle roulant : colonnes des échéances générées', async () => {
      await enroll({ userId: USERS.moussa, startsFrom: '2026-03-01' }, { pid: PROJECTS.rollingA });
      const body = await gridOf('', { pid: PROJECTS.rollingA });
      expect(body.columns.length).toBeGreaterThan(0);
      expect(body.columns[0]).toEqual({ sequence: 1, kind: 'periodic', dueDate: '2026-03-05' });
      expect(body.items[0]?.cells.map((c) => c.sequence)).toEqual(body.columns.map((c) => c.sequence));
    });

    it('lecture seule (viewer) autorisée ; projet d’une autre association ou inconnu, non-membre ou souscripteur → 404', async () => {
      await scenario();
      expect((await grid('', { token: f.tokens.koffi })).status).toBe(200);
      // Projet d'une autre association : exactement la réponse d'un projet inconnu (aucune fuite d'existence).
      const foreign = await grid('', { pid: PROJECTS.b });
      const unknown = await grid('', { pid: crypto.randomUUID() });
      expect([foreign.status, unknown.status]).toEqual([404, 404]);
      expect(problemOf(await foreign.json())).toEqual(problemOf(await unknown.json()));
      // Owner de B (et viewer de A) par l'URL de B : le projet de A n'existe pas dans ce contexte.
      expect((await grid('', { aid: B.id, pid: PROJECTS.a, token: f.tokens.koffi })).status).toBe(404);
      expect((await grid('', { aid: B.id, pid: PROJECTS.b, token: f.tokens.aminata })).status).toBe(404);
      expect((await grid('', { token: f.tokens.moussa })).status).toBe(404);
    });
  });

  describe('lg.inst', () => {
    it('échéance, personne, projet et répartitions des paiements', async () => {
      const s = await scenario();
      const res = await inst(s.april);
      expect(res.status).toBe(200);
      const body = Detail.parse(await res.json());
      expect(body.installment).toEqual({
        id: s.april,
        enrollmentId: s.late.id,
        projectId: PROJECTS.a,
        kind: 'periodic',
        sequence: 2,
        dueDate: '2026-04-05',
        amountDue: xof(25000),
        amountPaid: xof(0),
        amountPending: xof(12500),
        remaining: xof(12500),
        status: 'declared',
        lateSince: null,
        paidAt: null,
      });
      expect(body.member).toMatchObject({ firstName: 'Kofi', lastName: 'Annan' });
      expect(body.project).toEqual({ id: PROJECTS.a, name: 'Centre communautaire' });
      expect(body.allocations).toEqual([
        {
          paymentId: s.payments.pending,
          amount: xof(12500),
          state: 'proposed',
          paymentStatus: 'pending',
          paidOn: '2026-11-02',
          declaredAt: '2026-11-07T08:00:00.000Z',
        },
      ]);

      const march = Detail.parse(await (await inst(s.march)).json());
      expect(march.installment).toMatchObject({ status: 'paid', paidAt: '2026-11-01T15:00:00.000Z' });
      expect(march.allocations).toEqual([expect.objectContaining({ state: 'confirmed', paymentStatus: 'validated' })]);

      const may = Detail.parse(await (await inst(await installmentId(s.late.id, '2026-05-05'))).json());
      expect(may.installment).toMatchObject({ status: 'late', lateSince: '2026-05-11', remaining: xof(25000) });
      expect(may.allocations).toEqual([]);
    });

    it('échéance annulée (retrait) : plus rien de dû', async () => {
      const s = await scenario();
      const withdrawn = await f.call(`/associations/${A.id}/enrollments/${s.upToDate.id}/withdraw`, {
        token: f.tokens.awa,
        method: 'POST',
        body: {},
      });
      expect(withdrawn.status).toBe(200);
      const body = Detail.parse(await (await inst(await installmentId(s.upToDate.id, '2027-01-05'))).json());
      expect(body.installment).toMatchObject({ status: 'canceled', remaining: xof(0) });
    });

    it('échéance d’une autre association ou inconnue, non-membre ou souscripteur → 404', async () => {
      const s = await scenario();
      const other = await enroll(
        { userId: USERS.fatou, startsFrom: '2026-03-01' },
        {
          aid: B.id,
          pid: PROJECTS.b,
          token: f.tokens.koffi,
        },
      );
      const foreign = await installmentId(other.id, '2026-03-05');
      const [ofB, unknown] = [await inst(foreign), await inst(crypto.randomUUID())];
      expect([ofB.status, unknown.status]).toEqual([404, 404]);
      expect(problemOf(await ofB.json())).toEqual(problemOf(await unknown.json()));
      // Owner de B (et viewer de A) par l'URL de B : l'échéance de A n'existe pas dans ce contexte.
      expect((await inst(s.march, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
      expect((await inst(foreign, { aid: B.id, token: f.tokens.aminata })).status).toBe(404);
      expect((await inst(s.march, { token: f.tokens.moussa })).status).toBe(404);
    });
  });
});
