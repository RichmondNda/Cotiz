import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.3 · étape 4 : file « À relancer » (rm.queue), relance manuelle (rm.send), historique (rm.hist).
 * La file liste exactement les échéances en retard encore dues, sans relance marquée du jour, avec le message prêt
 * (copier, WhatsApp, sms:) ; le marquage relancé / ignoré les en retire pour la journée.
 *
 * Horloge simulée : Moussa inscrit le 2026-03-01 à PROJECTS.a (25 000 F le 5 de chaque mois) ; aujourd'hui le
 * 2026-04-12 : échéances du 5 mars et du 5 avril en retard, celle du 5 mai à venir. Abidjan = UTC.
 */

const ENROLLED_ON = new Date('2026-03-01T10:00:00Z');
const TODAY = new Date('2026-04-12T10:00:00Z');
const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);
const F25 = `25${THIN}000${NBSP}F`;

const Queue = ENDPOINTS['rm.queue'].operations.list.response.body;
const Entry = ENDPOINTS['rm.queue'].operations.handled.response.body;
const Sent = ENDPOINTS['rm.send'].operations.send.response.body;
const History = ENDPOINTS['rm.hist'].operations.list.response.body;

describe('file « À relancer », relance manuelle, historique (rm.queue, rm.send, rm.hist)', () => {
  let f: LedgerFixture;
  let march: string;
  let april: string;
  let may: string;

  const queue = async (query = '', token = f.tokens.awa) => {
    const res = await f.call(`/associations/${A.id}/reminders/queue${query}`, { token });
    expect(res.status).toBe(200);
    return Queue.parse(await res.json());
  };
  const mark = (id: string, outcome: 'handled' | 'dismissed', options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/reminders/queue/${id}/handled`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body: { outcome },
    });
  const send = (body: unknown, options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/reminders`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
  const history = async (query = '', token = f.tokens.awa) => {
    const res = await f.call(`/associations/${A.id}/reminders/history${query}`, { token });
    expect(res.status).toBe(200);
    return History.parse(await res.json());
  };
  const runs = async () =>
    (
      await f.h.superuser(
        `SELECT installment_id, kind, status, rule_id, triggered_by, handled_by, run_date::text AS run_date
           FROM reminder_runs ORDER BY created_at, id`,
      )
    ).rows as {
      installment_id: string;
      kind: string;
      status: string;
      rule_id: string | null;
      triggered_by: string | null;
      handled_by: string | null;
      run_date: string;
    }[];
  const events = async (type: string) =>
    (await f.h.superuser(`SELECT payload FROM outbox_events WHERE event_type = $1 ORDER BY id`, [type])).rows as {
      payload: Record<string, unknown>;
    }[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: ENROLLED_ON });
    f = await startLedgerFixture();
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(ENROLLED_ON);
    await f.h.superuser('DELETE FROM notifications');
    await f.h.superuser('DELETE FROM reminder_runs');
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type IN ('reminder.sent', 'reminder.handled')`);
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = ANY($1)', [
      [PLANS.essentiel, PLANS.pro],
      ['auto_reminders'],
    ]);
    const m = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });
    march = await f.installmentOf(m.id, '2026-03-05');
    april = await f.installmentOf(m.id, '2026-04-05');
    may = await f.installmentOf(m.id, '2026-05-05');
    await f.h.superuser(
      `UPDATE installments SET status = 'late', late_since = (due_date + 6) WHERE id = ANY($1::uuid[])`,
      [[march, april]],
    );
    vi.setSystemTime(TODAY);
    // Jetons d'accès expirés par le saut d'horloge : nouvelles sessions au jour simulé.
    await relogin();
  });

  const relogin = async () => {
    const [awa, koffi] = await Promise.all([
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
    ]);
    Object.assign(f.tokens, { awa, koffi });
  };

  describe('rm.queue', () => {
    it('liste exactement les retards encore dus, avec le message prêt et ses liens', async () => {
      const page = await queue();
      expect(page.total).toBe(2);
      expect(page.items.map((e) => [e.installmentId, e.status, e.dueDate, e.lateSince])).toEqual([
        [march, 'to_handle', '2026-03-05', '2026-03-11'],
        [april, 'to_handle', '2026-04-05', '2026-04-11'],
      ]);
      const [first] = page.items;
      expect(first).toMatchObject({
        id: march,
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
        amountDue: { amount: 25000, currency: 'XOF' },
        member: { id: USERS.moussa },
      });
      expect(first?.message).toContain(`votre échéance du 5 mars 2026 pour Centre communautaire (${F25})`);
      expect(first?.whatsappUrl).toBe(
        `https://wa.me/${(first?.member.phone ?? '').replace('+', '')}?text=${encodeURIComponent(first?.message ?? '')}`,
      );
      expect(first?.smsUrl).toMatch(/^sms:\+225\d+\?body=/);
      expect(page.items.map((e) => e.installmentId)).not.toContain(may);
    });

    it('marquer relancé (sans relance existante) : relance manuelle créée, hors de la file du jour, puis de retour le lendemain', async () => {
      const res = await mark(march, 'handled');
      expect(res.status).toBe(200);
      const entry = Entry.parse(await res.json());
      expect(entry).toMatchObject({ installmentId: march, status: 'handled', kind: 'manual' });
      expect(await runs()).toEqual([
        {
          installment_id: march,
          kind: 'manual',
          status: 'handled',
          rule_id: null,
          triggered_by: USERS.awa,
          handled_by: USERS.awa,
          run_date: '2026-04-12',
        },
      ]);
      expect((await queue('?status=to_handle')).items.map((e) => e.installmentId)).toEqual([april]);
      expect((await queue()).items.map((e) => [e.installmentId, e.status])).toEqual([
        [march, 'handled'],
        [april, 'to_handle'],
      ]);
      expect((await events('reminder.handled')).map((e) => e.payload)).toEqual([
        { runId: entry.id, status: 'handled', handledBy: USERS.awa },
      ]);

      vi.setSystemTime(new Date('2026-04-13T10:00:00Z'));
      await relogin();
      const next = await queue('?status=to_handle');
      expect(next.items.map((e) => [e.id, e.installmentId])).toEqual([
        [march, march],
        [april, april],
      ]);
    });

    it('relance à traiter (règle ou envoi manuel) : l’entrée la cite ; marquer ignoré la met à jour', async () => {
      const sent = Sent.parse(await (await send({ userIds: [USERS.moussa], message: 'Relance de {{prenom}}' })).json());
      const [run] = sent.queued.filter((e) => e.installmentId === march);
      const listed = (await queue()).items.find((e) => e.installmentId === march);
      expect(listed).toMatchObject({ id: run?.id, kind: 'manual', status: 'to_handle' });
      expect(listed?.message).toMatch(/^Relance de \S+$/);

      expect((await mark(run?.id ?? '', 'dismissed')).status).toBe(200);
      const rows = (await runs()).filter((r) => r.installment_id === march);
      expect(rows.map((r) => [r.status, r.handled_by])).toEqual([['dismissed', USERS.awa]]);
      expect((await queue('?status=to_handle')).items.map((e) => e.installmentId)).toEqual([april]);
    });

    it('échéance soldée ou dispensée (décision 7) : hors de la file, marquage 404 ; id inconnu : 404', async () => {
      await f.h.superuser(`UPDATE installments SET status = 'waived' WHERE id = $1`, [march]);
      await f.h.superuser(`UPDATE installments SET status = 'paid' WHERE id = $1`, [april]);
      expect((await queue()).items).toEqual([]);
      expect((await mark(march, 'handled')).status).toBe(404);
      expect((await mark(crypto.randomUUID(), 'handled')).status).toBe(404);
      expect(await runs()).toEqual([]);
    });

    it('pages par curseur ; filtre de projet', async () => {
      const first = await queue('?limit=1');
      expect(first.items.map((e) => e.installmentId)).toEqual([march]);
      const second = await queue(`?limit=1&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
      expect(second.items.map((e) => e.installmentId)).toEqual([april]);
      expect(second.nextCursor).toBeNull();
      expect((await queue(`?projectId=${PROJECTS.a2}`)).items).toEqual([]);
    });

    it('sans auto_reminders : 403 feature_disabled ; lecteur : 403', async () => {
      await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, []]);
      const res = await f.call(`/associations/${A.id}/reminders/queue`, { token: f.tokens.awa });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('feature_disabled');
      expect((await mark(march, 'handled')).status).toBe(403);
      await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, ['auto_reminders']]);
      expect((await f.call(`/associations/${A.id}/reminders/queue`, { token: f.tokens.koffi })).status).toBe(403);
      expect((await mark(march, 'handled', { token: f.tokens.koffi })).status).toBe(403);
    });
  });

  describe('rm.send', () => {
    it('tous les retardataires d’un projet : relances manuelles à traiter, messages prêts renvoyés, rappel, audit', async () => {
      const res = await send({ projectId: PROJECTS.a, allLate: true });
      expect(res.status).toBe(202);
      const { queued } = Sent.parse(await res.json());
      expect(queued.map((e) => [e.installmentId, e.status, e.kind])).toEqual([
        [march, 'to_handle', 'manual'],
        [april, 'to_handle', 'manual'],
      ]);
      expect(queued[0]?.message).toContain(`(${F25})`);
      expect((await runs()).map((r) => [r.kind, r.status, r.triggered_by])).toEqual([
        ['manual', 'to_handle', USERS.awa],
        ['manual', 'to_handle', USERS.awa],
      ]);
      const [event] = await events('reminder.sent');
      expect(event?.payload).toMatchObject({ associationId: A.id });
      expect((event?.payload as { runIds: string[] }).runIds).toHaveLength(2);
      const audit = (
        await f.h.superuser(`SELECT after FROM audit_logs WHERE action = 'reminder.send' ORDER BY created_at DESC`)
      ).rows as { after: Record<string, unknown> }[];
      expect(audit[0]?.after).toMatchObject({ runs: 2, allLate: true, userIds: [USERS.moussa] });
    });

    it('personne sans retard : sa prochaine échéance due ; message à variable inconnue : 422', async () => {
      await f.h.superuser(`UPDATE installments SET status = 'paid' WHERE id = ANY($1::uuid[])`, [[march, april]]);
      const { queued } = Sent.parse(await (await send({ userIds: [USERS.moussa] })).json());
      expect(queued.map((e) => e.installmentId)).toEqual([may]);
      expect((await send({ userIds: [USERS.moussa], message: 'Bonjour {{surnom}}' })).status).toBe(422);
    });

    it('personne d’une autre association : rien ; projet d’une autre association : 404', async () => {
      await f.enrollByApi(
        { userId: USERS.fatou, startsFrom: '2026-03-01' },
        { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
      );
      const res = await send({ userIds: [USERS.fatou] });
      expect(res.status).toBe(202);
      expect(Sent.parse(await res.json()).queued).toEqual([]);
      expect((await send({ projectId: PROJECTS.b, allLate: true })).status).toBe(404);
      expect(await runs()).toEqual([]);
    });
  });

  describe('rm.hist', () => {
    it('relances de l’association, la plus récente d’abord, avec auteur ; lisible par le lecteur', async () => {
      await send({ userIds: [USERS.moussa] });
      vi.setSystemTime(new Date('2026-04-12T10:05:00Z'));
      const entry = (await queue()).items.find((e) => e.installmentId === april);
      expect((await mark(entry?.id ?? '', 'handled')).status).toBe(200);
      const page = await history('', f.tokens.koffi);
      expect(page.total).toBe(2);
      expect(page.items.map((h) => [h.kind, h.status])).toEqual([
        ['manual', 'handled'],
        ['manual', 'to_handle'],
      ]);
      expect(page.items[0]).toMatchObject({
        member: { id: USERS.moussa },
        project: { id: PROJECTS.a, name: 'Centre communautaire' },
        triggeredBy: { id: USERS.awa },
        ruleId: null,
      });
      expect((await history(`?projectId=${PROJECTS.a2}`)).items).toEqual([]);
      const first = await history('?limit=1');
      const second = await history(`?limit=1&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
      expect([...first.items, ...second.items].map((h) => h.id)).toEqual(page.items.map((h) => h.id));
    });
  });
});
