import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf } from './platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 6 : inscriptions d'un projet (en.list) et retrait (en.withdraw). Situation de chaque inscription par
 * @cotiz/domain sur les échéances chargées (choix de l'étape : le statut persisté n'est tenu à jour qu'au lot 2.4),
 * filtre, compteurs et pages en mémoire. Retrait : `active → withdrawn`, échéances futures sans montant annulées,
 * passées toujours dues, appartenance conservée.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC. Projets du jeu : 25 000 F le 5 de chaque mois depuis
 * le 2026-03-01, délai de grâce 5 jours : au 2026-11-08, retard jusqu'à l'échéance du 2026-10-05, celle du 2026-11-05
 * est due, les suivantes à venir.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Created = ENDPOINTS['en.create'].operations.create.response.body;
const List = ENDPOINTS['en.list'].operations.list.response.body;
const Withdrawn = ENDPOINTS['en.withdraw'].operations.withdraw.response.body;
const NEW = { kofi: '+2250711223344', ama: '+2250722334455' } as const;

describe('inscriptions d’un projet (en.list, en.withdraw)', () => {
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
  const list = (query = '', options: { aid?: string; pid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/enrollments${query}`, {
      token: options.token ?? f.tokens.awa,
    });
  const listed = async (query = '', options: Parameters<typeof list>[1] = {}) => {
    const res = await list(query, options);
    expect(res.status).toBe(200);
    return List.parse(await res.json());
  };
  const withdraw = (eid: string, body: unknown = {}, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/enrollments/${eid}/withdraw`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
    });
  const dbNow = async () => ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
  const installmentsOf = async (enrollmentId: string) =>
    (
      await f.h.superuser(
        `SELECT sequence, due_date::text, status FROM installments WHERE enrollment_id = $1 ORDER BY kind, sequence`,
        [enrollmentId],
      )
    ).rows as { sequence: number; due_date: string; status: string }[];

  /** Kofi en retard (entré au début du projet), Moussa à jour, Ama non activée (entrée aujourd'hui). */
  const scenario = async () => {
    const late = await enroll({ phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan', startsFrom: '2026-03-01' });
    const upToDate = await enroll({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    const pending = await enroll({ phone: NEW.ama, firstName: 'Ama', lastName: 'Kouassi' });
    // Moussa s'acquitte de l'échéance due du 2026-11-05 : la situation se calcule, aucun statut n'est relu tel quel.
    await f.h.superuser(
      `UPDATE installments SET amount_paid = amount_due WHERE enrollment_id = $1 AND due_date = '2026-11-05'`,
      [upToDate.id],
    );
    return { late, upToDate, pending };
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
    await f.resetMembers();
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
  });

  describe('en.list', () => {
    it('inscriptions du projet, situation et montants calculés par le domaine, compteurs par situation', async () => {
      const { late, upToDate, pending } = await scenario();
      const page = await listed();
      expect(page.total).toBe(3);
      expect(page.nextCursor).toBeNull();
      const byId = new Map(page.items.map((e) => [e.id, e]));
      expect(byId.get(late.id)).toMatchObject({
        member: { firstName: 'Kofi', phone: NEW.kofi },
        status: 'active',
        standing: 'late',
        // Huit échéances de mars à octobre en retard, celle de novembre due.
        lateAmount: { amount: 200_000, currency: 'XOF' },
        paid: { amount: 0, currency: 'XOF' },
        remaining: { amount: 450_000, currency: 'XOF' },
      });
      expect(byId.get(upToDate.id)).toMatchObject({
        member: { id: USERS.moussa },
        standing: 'up_to_date',
        paid: { amount: 25_000, currency: 'XOF' },
      });
      expect(byId.get(pending.id)).toMatchObject({ standing: 'activation_pending' });
      expect(page.facets).toEqual({
        standing: { late: 1, up_to_date: 1, activation_pending: 1, signature_required: 0, withdrawn: 0 },
      });
    });

    it('plus récentes d’abord, pages par curseur ; filtre par situation (compteurs inchangés)', async () => {
      const { late, upToDate, pending } = await scenario();
      const one = await listed('?limit=2');
      expect(one.items.map((e) => e.id)).toEqual([pending.id, upToDate.id]);
      const two = await listed(`?limit=2&cursor=${one.nextCursor ?? ''}`);
      expect(two.items.map((e) => e.id)).toEqual([late.id]);
      expect(two.nextCursor).toBeNull();

      const lateOnly = await listed('?standing=late');
      expect(lateOnly.items.map((e) => e.id)).toEqual([late.id]);
      expect(lateOnly.total).toBe(1);
      expect(lateOnly.facets?.standing).toMatchObject({ late: 1, up_to_date: 1, activation_pending: 1 });
    });

    it('recherche par nom (sans accents ni casse imposés) ou par téléphone', async () => {
      const { late, pending } = await scenario();
      expect((await listed('?q=annan')).items.map((e) => e.id)).toEqual([late.id]);
      expect((await listed('?q=kofi%20ann')).items.map((e) => e.id)).toEqual([late.id]);
      expect((await listed('?q=22334455')).items.map((e) => e.id)).toEqual([pending.id]);
      expect((await listed('?q=personne')).items).toEqual([]);
    });

    it('lecteur (viewer) : autorisé ; projet d’une autre association ou inconnu : 404', async () => {
      await scenario();
      expect((await list('', { token: f.tokens.koffi })).status).toBe(200);
      for (const pid of [PROJECTS.b, '00000000-0000-7000-8000-0000000000ff']) {
        const res = await list('', { pid });
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe('not_found');
      }
      // B (Koffi owner) ne voit pas les inscriptions de A par son association.
      expect((await list('', { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
    });

    it('curseur illisible ou tri inconnu : 422', async () => {
      for (const query of ['?cursor=nimporte', '?sort=name']) {
        const res = await list(query);
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('validation_failed');
      }
    });
  });

  describe('en.withdraw', () => {
    it('retrait : futures sans montant annulées, passées toujours dues, appartenance conservée, événement et audit', async () => {
      const { late } = await scenario();
      const since = await dbNow();
      const res = await withdraw(late.id, { reason: 'Déménagement' });
      expect(res.status).toBe(200);
      const body = Withdrawn.parse(await res.json());
      expect(body).toMatchObject({ id: late.id, status: 'withdrawn', standing: 'withdrawn' });
      expect(body.withdrawnAt).not.toBeNull();
      // Restent dues : huit en retard et celle de novembre (200 000 + 25 000) ; les futures ne comptent plus.
      expect(body.remaining).toEqual({ amount: 225_000, currency: 'XOF' });

      const lines = await installmentsOf(late.id);
      expect(lines.filter((l) => l.due_date <= '2026-11-08').every((l) => l.status !== 'canceled')).toBe(true);
      expect(lines.filter((l) => l.due_date > '2026-11-08').every((l) => l.status === 'canceled')).toBe(true);
      const membership = await f.h.superuser(
        `SELECT m.status FROM memberships m JOIN enrollments e ON e.user_id = m.user_id
          WHERE e.id = $1 AND m.association_id = $2 AND m.role = 'subscriber'`,
        [late.id, A.id],
      );
      expect(membership.rows).toEqual([{ status: 'active' }]);
      const row = await f.h.superuser('SELECT status, withdrawn_by, withdraw_reason FROM enrollments WHERE id = $1', [
        late.id,
      ]);
      expect(row.rows).toEqual([{ status: 'withdrawn', withdrawn_by: USERS.awa, withdraw_reason: 'Déménagement' }]);

      const events = await f.h.superuser(
        `SELECT association_id, payload FROM outbox_events WHERE event_type = 'member.withdrawn' AND occurred_at >= $1`,
        [since],
      );
      expect(events.rows).toEqual([
        { association_id: A.id, payload: { enrollmentId: late.id, reason: 'Déménagement' } },
      ]);
      const audit = await f.h.superuser(
        `SELECT entity_type, entity_id, after FROM audit_logs WHERE action = 'enrollment.withdraw' AND occurred_at >= $1`,
        [since],
      );
      expect(audit.rows).toMatchObject([
        { entity_type: 'enrollment', entity_id: late.id, after: { status: 'withdrawn', canceledInstallments: 9 } },
      ]);
    });

    it('futures réglées en partie ou déclarées, échéance du jour : conservées ; l’inscription retirée reste listée', async () => {
      const { late } = await scenario();
      await f.h.superuser(
        `UPDATE installments SET amount_paid = 5000 WHERE enrollment_id = $1 AND due_date = '2026-12-05'`,
        [late.id],
      );
      await f.h.superuser(
        `UPDATE installments SET amount_pending = amount_due, status = 'declared'
          WHERE enrollment_id = $1 AND due_date = '2027-01-05'`,
        [late.id],
      );
      // Échéance qui tombe aujourd'hui (fuseau de l'association) : due, pas future.
      await f.h.superuser(
        `UPDATE installments SET due_date = '2026-11-08' WHERE enrollment_id = $1 AND due_date = '2027-02-05'`,
        [late.id],
      );
      expect((await withdraw(late.id)).status).toBe(200);
      const lines = await installmentsOf(late.id);
      expect(lines.find((l) => l.due_date === '2026-12-05')?.status).toBe('upcoming');
      expect(lines.find((l) => l.due_date === '2027-01-05')?.status).toBe('declared');
      expect(lines.find((l) => l.due_date === '2026-11-08')?.status).not.toBe('canceled');
      expect(lines.filter((l) => l.status === 'canceled')).toHaveLength(6);
      const page = await listed('?standing=withdrawn');
      expect(page.items.map((e) => e.id)).toEqual([late.id]);
    });

    it('cycle roulant : les échéances générées à l’avance sont annulées', async () => {
      const rolling = await enroll(
        { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan', startsFrom: '2026-11-01' },
        { pid: PROJECTS.rollingA },
      );
      expect((await withdraw(rolling.id)).status).toBe(200);
      const lines = await installmentsOf(rolling.id);
      expect(lines.filter((l) => l.due_date > '2026-11-08').map((l) => l.status)).toEqual(
        Array.from({ length: 11 }, () => 'canceled'),
      );
    });

    it('déjà retirée : 409 invalid_state, rien ne change', async () => {
      const { late } = await scenario();
      expect((await withdraw(late.id)).status).toBe(200);
      const res = await withdraw(late.id);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('invalid_state');
    });

    it('inscription d’une autre association ou inconnue : 404 ; lecteur : 403', async () => {
      const theirs = await enroll(
        { phone: NEW.kofi, firstName: 'Kofi', lastName: 'Annan' },
        { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
      );
      for (const eid of [theirs.id, '00000000-0000-7000-8000-0000000000ff']) {
        const res = await withdraw(eid);
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe('not_found');
      }
      const ours = await enroll({ userId: USERS.moussa });
      expect((await withdraw(ours.id, {}, { token: f.tokens.koffi })).status).toBe(403);
      expect((await installmentsOf(theirs.id)).every((l) => l.status !== 'canceled')).toBe(true);
    });

    it('motif trop long : 422', async () => {
      const ours = await enroll({ userId: USERS.moussa });
      const res = await withdraw(ours.id, { reason: 'x'.repeat(501) });
      expect(res.status).toBe(422);
    });
  });
});
