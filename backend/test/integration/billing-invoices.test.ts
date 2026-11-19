import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { IssueInvoicesUseCase } from '../../src/modules/billing/application/issue-invoices.use-case.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import {
  C,
  codeOf,
  D,
  OWNERS,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
  SUBS,
} from './platform-associations.fixture.js';

/**
 * Lot 4.6 · étape 2 : factures d'abonnement. Tâche billing.issue-invoices (règles `billingRun` de @cotiz/domain),
 * numérotation continue jamais réutilisée, retards et statut de l'abonnement, bl.inv, pf.invoices, pf.invoice.paid,
 * notification de l'owner.
 *
 * Jeu plateforme (fuseau Africa/Abidjan = UTC) : A et C mensuels Essentiel (10 000 F) du 1er au 31 oct. ; B en essai
 * jusqu'au 14 oct., puis annuel Pro (300 000 F) ; D en essai jusqu'au 8 nov., puis mensuel Essentiel.
 */

const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);

interface InvoiceRow {
  id: string;
  association_id: string;
  number: string;
  period_start: string;
  period_end: string;
  amount: string;
  status: string;
  due_on: string;
  pdf_file_id: string | null;
}

interface OutboxRow {
  id: string;
  event_type: EventType;
  association_id: string | null;
  actor_user_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

describe('factures d’abonnement (lot 4.6)', () => {
  let f: PlatformFixture;
  let worker: INestApplicationContext;
  let owner: string;
  let support: string;
  let awa: string;
  let koffi: string;

  const issue = (at: string) => worker.get(IssueInvoicesUseCase).execute(new Date(at));
  const rows = async () =>
    (
      await f.h.superuser(
        `SELECT id::text, association_id::text, number, period_start::text, period_end::text, amount::text, status,
                to_char(due_at AT TIME ZONE 'Africa/Abidjan', 'YYYY-MM-DD') AS due_on, pdf_file_id::text
           FROM invoices ORDER BY number`,
      )
    ).rows as InvoiceRow[];
  const invoiceOf = async (aid: string, periodStart: string) =>
    (await rows()).find((r) => r.association_id === aid && r.period_start === periodStart);
  const subscription = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT status, current_period_start::text AS start, current_period_end::text AS "end"
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0] as { status: string; start: string; end: string };
  const outbox = async (type: EventType) =>
    (
      await f.h.superuser(
        `SELECT id::text, event_type, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
           FROM outbox_events WHERE event_type = $1 ORDER BY id`,
        [type],
      )
    ).rows as OutboxRow[];
  const deliver = async (type: EventType) => {
    for (const r of await outbox(type)) {
      const envelope: EventEnvelope = {
        id: r.id,
        type: r.event_type,
        version: 1,
        occurredAt: r.occurred_at.toISOString(),
        associationId: r.association_id,
        actorUserId: r.actor_user_id,
        aggregate: { type: r.aggregate_type, id: r.aggregate_id },
        payload: r.payload,
      };
      await worker.get(NotificationsConsumer).handle(envelope);
    }
  };
  const markPaid = (id: string, body: unknown, token = owner) =>
    f.call(`/platform/invoices/${id}/mark-paid`, {
      method: 'POST',
      token,
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });

  beforeAll(async () => {
    f = await startPlatformFixture();
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
    owner = await f.login('platform', STAFF.owner.email);
    support = await f.login('platform', STAFF.support.email);
    awa = await f.login('association', 'awa@test.cotiz.app');
    koffi = await f.login('association', 'koffi@test.cotiz.app');
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
  });

  describe('tâche billing.issue-invoices', () => {
    it('le 1er oct. puis le 13 nov. : chaque période traversée facturée une fois, numéros continus, essais terminés actifs', async () => {
      // 1er oct. : A et C facturés pour octobre (premier jour de la période) ; B et D encore en essai.
      expect(await issue('2026-10-01T10:00:00Z')).toEqual({ issued: 2 });
      // 13 nov. : novembre de A et C ; essais terminés de B et D. Mise en service (B, D jamais facturés) : seule la
      // période du jour, échéance comptée du jour d'émission (jamais échue à l'émission).
      expect(await issue('2026-11-13T10:00:00Z')).toEqual({ issued: 4 });
      const all = await rows();
      expect(all.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `CTZ-2026-00000${String(n)}`));
      const of = (aid: string) =>
        all
          .filter((r) => r.association_id === aid)
          .map((r) => [r.period_start, r.period_end, r.amount, r.due_on, r.status]);
      // A et C : octobre en retard depuis le 17 oct., novembre émis le 13 (rattrapage) à échéance du 28.
      for (const aid of [A.id, C]) {
        expect(of(aid)).toEqual([
          ['2026-10-01', '2026-10-31', '10000', '2026-10-16', 'overdue'],
          ['2026-11-01', '2026-11-30', '10000', '2026-11-28', 'open'],
        ]);
      }
      // B : essai fini le 14 oct. → première année payante le 15 oct., facturée le 13 nov.
      expect(of(B.id)).toEqual([['2026-10-15', '2027-10-14', '300000', '2026-11-28', 'open']]);
      // D : essai fini le 8 nov. → premier mois payant le 9 nov.
      expect(of(D)).toEqual([['2026-11-09', '2026-12-08', '10000', '2026-11-28', 'open']]);
      expect(await subscription(SUBS.a)).toEqual({ status: 'past_due', start: '2026-11-01', end: '2026-11-30' });
      expect(await subscription(SUBS.b)).toEqual({ status: 'active', start: '2026-10-15', end: '2027-10-14' });
      expect(await subscription(SUBS.d)).toEqual({ status: 'active', start: '2026-11-09', end: '2026-12-08' });
    });

    it('chaque facture a son PDF en attente dans cotiz-legal et un événement subscription.invoice_issued', async () => {
      const files = (
        await f.h.superuser(
          `SELECT f.purpose, f.bucket, f.scan_status, f.association_id = i.association_id AS same
             FROM invoices i JOIN files f ON f.id = i.pdf_file_id ORDER BY i.number`,
        )
      ).rows as { purpose: string; bucket: string; scan_status: string; same: boolean }[];
      expect(files).toHaveLength(6);
      for (const file of files) {
        expect(file).toEqual({ purpose: 'invoice_pdf', bucket: 'cotiz-legal', scan_status: 'pending', same: true });
      }
      const issued = (await outbox('subscription.invoice_issued')).map((e) => e.payload);
      const expected = (await rows()).map((r) => ({ invoiceId: r.id, associationId: r.association_id }));
      const byId = (x: Record<string, unknown>, y: Record<string, unknown>) =>
        String(x.invoiceId).localeCompare(String(y.invoiceId));
      expect(issued.sort(byId)).toEqual(expected.sort(byId));
    });

    it('rejouée le même jour (ou deux fois en même temps) : aucune facture de plus', async () => {
      expect(await issue('2026-11-13T18:00:00Z')).toEqual({ issued: 0 });
      const both = await Promise.all([issue('2026-11-13T19:00:00Z'), issue('2026-11-13T19:00:00Z')]);
      expect(both.reduce((n, r) => n + r.issued, 0)).toBe(0);
      expect(await rows()).toHaveLength(6);
    });

    it('numéros jamais réutilisés : une facture annulée garde le sien, les suivantes en prennent de nouveaux', async () => {
      const before = await rows();
      const voided = await invoiceOf(C, '2026-11-01');
      await f.h.superuser(`UPDATE invoices SET status = 'void' WHERE id = $1`, [voided?.id]);
      // Deux passages simultanés le 2 déc. : décembre de A et C, une seule fois chacun.
      const both = await Promise.all([issue('2026-12-02T09:00:00Z'), issue('2026-12-02T09:00:00Z')]);
      expect(both.reduce((n, r) => n + r.issued, 0)).toBe(2);
      const after = await rows();
      const numbers = after.map((r) => r.number);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(after.find((r) => r.id === voided?.id)).toMatchObject({ number: voided?.number, status: 'void' });
      const fresh = after.filter((r) => !before.some((b) => b.id === r.id));
      expect(fresh.map((r) => [r.association_id, r.period_start]).sort()).toEqual(
        [
          [A.id, '2026-12-01'],
          [C, '2026-12-01'],
        ].sort(),
      );
      const maxBefore = Math.max(...before.map((r) => Number(r.number.slice(-6))));
      for (const r of fresh) expect(Number(r.number.slice(-6))).toBeGreaterThan(maxBefore);
      // Le 2 déc. : novembre de A et le premier mois de D sont passés en retard.
      expect((await invoiceOf(A.id, '2026-11-01'))?.status).toBe('overdue');
      expect((await invoiceOf(D, '2026-11-09'))?.status).toBe('overdue');
      expect((await subscription(SUBS.d)).status).toBe('past_due');
    });
  });

  describe('bl.inv', () => {
    it("les gestionnaires de A ne voient que les factures de A, les plus récentes d'abord", async () => {
      const res = await f.call(`/associations/${A.id}/invoices`, { token: awa });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { periodStart: string; amount: unknown }[]; total: number };
      expect(body.total).toBe(3);
      expect(body.items.map((i) => i.periodStart)).toEqual(['2026-12-01', '2026-11-01', '2026-10-01']);
      expect(body.items[0]?.amount).toEqual({ amount: 10000, currency: 'XOF' });
    });

    it('pagination par curseur, sans doublon', async () => {
      const first = (await (await f.call(`/associations/${A.id}/invoices?limit=2`, { token: awa })).json()) as {
        items: { id: string }[];
        nextCursor: string | null;
      };
      expect(first.items).toHaveLength(2);
      const next = (await (
        await f.call(`/associations/${A.id}/invoices?limit=2&cursor=${first.nextCursor ?? ''}`, { token: awa })
      ).json()) as { items: { id: string }[]; nextCursor: string | null };
      expect(next.items).toHaveLength(1);
      expect(next.nextCursor).toBeNull();
      expect(first.items.map((i) => i.id)).not.toContain(next.items[0]?.id);
    });

    it('un gestionnaire de B ne lit pas les factures de A', async () => {
      const res = await f.call(`/associations/${A.id}/invoices`, { token: koffi });
      expect(res.status).toBe(404);
      const own = (await (await f.call(`/associations/${B.id}/invoices`, { token: koffi })).json()) as {
        total: number;
      };
      expect(own.total).toBe(1);
    });
  });

  describe('pf.invoices', () => {
    it('toutes les associations, nom de chacune, comptes par statut et KPI', async () => {
      const res = await f.call('/platform/invoices?limit=100', { token: support });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: { association: { id: string; name: string } }[];
        total: number;
        summary: Record<string, { amount: number }>;
        facets: { status: Record<string, number> };
      };
      expect(body.total).toBe(8);
      expect(body.items.find((i) => i.association.id === D)?.association.name).toBe('Jeunesse solidaire 100% Bouaké');
      expect(body.facets.status).toEqual({ overdue: 5, open: 2, void: 1 });
      expect(body.summary.overdue?.amount).toBe(4 * 10000 + 300000);
      expect(body.summary.pending?.amount).toBe(2 * 10000);
      expect(body.summary.collected?.amount).toBe(0);
    });

    it('filtres par statut et par association', async () => {
      const late = (await (await f.call('/platform/invoices?status=overdue', { token: owner })).json()) as {
        total: number;
      };
      expect(late.total).toBe(5);
      const ofB = (await (await f.call(`/platform/invoices?associationId=${B.id}`, { token: owner })).json()) as {
        total: number;
      };
      expect(ofB.total).toBe(1);
    });

    it('réservé à la plateforme (autre espace : 404, comme toute route plateforme)', async () => {
      expect((await f.call('/platform/invoices', { token: awa })).status).toBe(404);
    });
  });

  describe('pf.invoice.paid', () => {
    it('le support ne marque pas une facture payée', async () => {
      const invoice = await invoiceOf(A.id, '2026-10-01');
      expect((await markPaid(invoice?.id ?? '', { paidOn: '2026-11-10' }, support)).status).toBe(403);
    });

    it("depuis l'espace association, même pour l'owner : 404 et facture inchangée", async () => {
      const invoice = await invoiceOf(A.id, '2026-10-01');
      expect((await markPaid(invoice?.id ?? '', { paidOn: '2026-11-10' }, awa)).status).toBe(404);
      expect((await invoiceOf(A.id, '2026-10-01'))?.status).toBe('overdue');
    });

    it('date de paiement future : 422', async () => {
      const invoice = await invoiceOf(A.id, '2026-10-01');
      expect((await markPaid(invoice?.id ?? '', { paidOn: '2099-01-01' })).status).toBe(422);
    });

    it("facture en retard réglée : payée, événement et audit ; l'abonnement reste impayé tant qu'il en reste une", async () => {
      const october = await invoiceOf(A.id, '2026-10-01');
      const res = await markPaid(october?.id ?? '', { paidOn: '2026-11-10', paymentReference: '  VIR-2026-118  ' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; paymentReference: string; paidAt: string };
      expect(body).toMatchObject({ status: 'paid', paymentReference: 'VIR-2026-118' });
      expect(body.paidAt).toBe('2026-11-10T00:00:00.000Z');
      expect((await subscription(SUBS.a)).status).toBe('past_due');

      const november = await invoiceOf(A.id, '2026-11-01');
      expect((await markPaid(november?.id ?? '', { paidOn: '2026-11-12' })).status).toBe(200);
      expect((await subscription(SUBS.a)).status).toBe('active');

      const paid = await outbox('subscription.invoice_paid');
      expect(paid.map((e) => [e.association_id, e.actor_user_id, e.payload])).toEqual([
        [A.id, STAFF.owner.id, { invoiceId: october?.id }],
        [A.id, STAFF.owner.id, { invoiceId: november?.id }],
      ]);
      const audit = (
        await f.h.superuser(
          `SELECT entity_id::text, association_id::text FROM audit_logs WHERE action = 'invoice.mark_paid'
            ORDER BY occurred_at`,
        )
      ).rows;
      expect(audit).toEqual([
        { entity_id: october?.id, association_id: A.id },
        { entity_id: november?.id, association_id: A.id },
      ]);
    });

    it('déjà payée ou annulée : 409 invalid_state ; inconnue : 404', async () => {
      const october = await invoiceOf(A.id, '2026-10-01');
      const again = await markPaid(october?.id ?? '', { paidOn: '2026-11-10' });
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe('invalid_state');
      const voided = (await rows()).find((r) => r.status === 'void');
      expect((await markPaid(voided?.id ?? '', { paidOn: '2026-11-10' })).status).toBe(409);
      expect((await markPaid(crypto.randomUUID(), { paidOn: '2026-11-10' })).status).toBe(404);
    });
  });

  describe('notifications', () => {
    it("l'owner reçoit les factures émises et leur règlement, une seule fois", async () => {
      // Un manager actif de A : il ne reçoit pas les factures (owner seulement).
      await f.h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES ($1, $2, $3, 'manager', 'active', now())`,
        [crypto.randomUUID(), A.id, USERS.fatou],
      );
      await deliver('subscription.invoice_issued');
      await deliver('subscription.invoice_paid');
      const bells = async () =>
        (
          await f.h.superuser(
            `SELECT user_id::text, association_id::text, type, body, action_url FROM notifications
              WHERE type LIKE 'subscription.invoice_%' ORDER BY created_at, type`,
          )
        ).rows as { user_id: string; association_id: string; type: string; body: string; action_url: string }[];
      const owners: Record<string, string> = {
        [A.id]: USERS.awa,
        [B.id]: USERS.koffi,
        [C]: OWNERS.diop.id,
        [D]: OWNERS.yao.id,
      };
      const all = await bells();
      for (const bell of all) expect(bell.user_id).toBe(owners[bell.association_id]);
      expect(all.filter((b) => b.type === 'subscription.invoice_issued')).toHaveLength(8);
      const paid = all.filter((b) => b.type === 'subscription.invoice_paid');
      expect(paid).toHaveLength(2);
      expect(paid[0]?.body).toContain(`10${THIN}000${NBSP}F`);
      expect(paid[0]?.action_url).toBe('/asso/abonnement');
      // Rejeu : aucune notification de plus (dedupe_key par événement et par personne).
      await deliver('subscription.invoice_paid');
      expect(await bells()).toHaveLength(all.length);
    });

    it('enveloppe falsifiée (association B, facture de A) : aucune notification', async () => {
      const before = (await f.h.superuser(`SELECT count(*)::int AS n FROM notifications`)).rows[0] as { n: number };
      const october = await invoiceOf(A.id, '2026-10-01');
      await worker.get(NotificationsConsumer).handle({
        id: crypto.randomUUID(),
        type: 'subscription.invoice_paid',
        version: 1,
        occurredAt: new Date().toISOString(),
        associationId: B.id,
        actorUserId: STAFF.owner.id,
        aggregate: { type: 'invoice', id: october?.id ?? '' },
        payload: { invoiceId: october?.id },
      });
      const after = (await f.h.superuser(`SELECT count(*)::int AS n FROM notifications`)).rows[0] as { n: number };
      expect(after.n).toBe(before.n);
    });
  });

  describe('concurrence et impayés restants (relecture argent)', () => {
    const audits = async (id: string) =>
      (
        (
          await f.h.superuser(
            `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'invoice.mark_paid' AND entity_id = $1`,
            [id],
          )
        ).rows[0] as { n: number }
      ).n;
    const paidEvents = async (id: string) =>
      (await outbox('subscription.invoice_paid')).filter((e) => e.payload.invoiceId === id).length;

    it('réglée alors qu’une autre facture est échue mais encore ouverte : l’abonnement reste impayé', async () => {
      // C : octobre en retard, décembre ouvert ; décembre rendu échu sans passage de la tâche.
      const december = await invoiceOf(C, '2026-12-01');
      await f.h.superuser(`UPDATE invoices SET due_at = '2026-11-01T23:59:59Z' WHERE id = $1`, [december?.id]);
      const october = await invoiceOf(C, '2026-10-01');
      expect((await markPaid(october?.id ?? '', { paidOn: '2026-11-14' })).status).toBe(200);
      const sub = (await f.h.superuser(`SELECT status FROM subscriptions WHERE association_id = $1`, [C])).rows[0] as {
        status: string;
      };
      expect(sub.status).toBe('past_due');
    });

    it('deux marquages simultanés (clés différentes) : un seul 200, puis 409 ; un événement, un audit', async () => {
      const invoice = await invoiceOf(B.id, '2026-10-15');
      const both = await Promise.all([
        markPaid(invoice?.id ?? '', { paidOn: '2026-11-14' }),
        markPaid(invoice?.id ?? '', { paidOn: '2026-11-14' }),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await paidEvents(invoice?.id ?? '')).toBe(1);
      expect(await audits(invoice?.id ?? '')).toBe(1);
    });

    it('même clé envoyée deux fois en même temps : un seul règlement', async () => {
      const invoice = await invoiceOf(D, '2026-11-09');
      const key = crypto.randomUUID();
      const send = () =>
        f.call(`/platform/invoices/${invoice?.id ?? ''}/mark-paid`, {
          method: 'POST',
          token: owner,
          body: { paidOn: '2026-11-14' },
          headers: { 'idempotency-key': key },
        });
      const both = await Promise.all([send(), send()]);
      expect(both.some((r) => r.status === 200)).toBe(true);
      for (const r of both) expect(r.status).toBeLessThan(500);
      expect(await paidEvents(invoice?.id ?? '')).toBe(1);
      expect(await audits(invoice?.id ?? '')).toBe(1);
    });

    it('marquage pendant le passage horaire (ordre des verrous) : ni interblocage ni facture réglée remise en retard', async () => {
      const december = await invoiceOf(A.id, '2026-12-01');
      for (let i = 0; i < 6; i += 1) {
        await f.h.superuser(
          `UPDATE invoices SET status = 'open', paid_at = NULL, payment_reference = NULL,
                  due_at = '2026-12-01T23:59:59Z' WHERE id = $1`,
          [december?.id],
        );
        const [, paid] = await Promise.all([
          issue('2026-12-02T10:00:00Z'),
          markPaid(december?.id ?? '', { paidOn: '2026-11-14' }),
        ]);
        const after = await invoiceOf(A.id, '2026-12-01');
        // L'un ou l'autre passe en premier : réglée (200), ou déjà en retard puis réglée (200 aussi : overdue est payable).
        expect(paid.status).toBe(200);
        expect(after?.status).toBe('paid');
      }
    });

    it('association sans période en cours : la tâche ne s’arrête pas pour elle', async () => {
      await f.h.superuser(`UPDATE subscriptions SET current_period_end = NULL WHERE id = $1`, [SUBS.d]);
      try {
        await expect(issue('2026-12-10T10:00:00Z')).resolves.toBeDefined();
      } finally {
        await f.h.superuser(`UPDATE subscriptions SET current_period_end = '2026-12-08' WHERE id = $1`, [SUBS.d]);
      }
    });
  });
});
