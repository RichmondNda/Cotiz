import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { NotificationsConsumer } from '../../src/modules/notifications/events/notifications.consumer.js';
import { EvaluateRemindersUseCase } from '../../src/modules/reminders/application/evaluate-reminders.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { PLANS } from './platform-associations.fixture.js';

/**
 * Lot 4.3 · étape 3 : tâche reminders.evaluate (jobs.yaml : quotidienne 08:30 locale ; architecture/04 § 4.9). Pour
 * chaque règle active, les échéances du jour visé encore dues → une relance (unique par règle, échéance et jour) :
 * rappel au souscripteur (`auto_sent`), ou, en retard, entrée « À relancer » avec le message prêt (`to_handle`).
 *
 * Horloge simulée : inscription le 2026-03-01 ; PROJECTS.a : 25 000 F le 5 de chaque mois ; Abidjan = UTC.
 */

const ENROLLED_ON = new Date('2026-03-01T10:00:00Z');
const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);
const F25 = `25${THIN}000${NBSP}F`;

interface Run {
  rule_id: string | null;
  installment_id: string;
  user_id: string;
  kind: string;
  status: string;
  channels: string[];
  message: string;
  run_date: string;
}

interface OutboxRow {
  id: string;
  event_type: EventType;
  association_id: string | null;
  actor_user_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: { runIds: string[]; associationId: string };
  occurred_at: Date;
}

describe('reminders.evaluate', () => {
  let f: LedgerFixture;
  let worker: INestApplicationContext;

  const run = (at: string) => worker.get(EvaluateRemindersUseCase).execute(new Date(at));
  const runs = async () =>
    (
      await f.h.superuser(
        `SELECT rule_id, installment_id, user_id, kind, status, channels, message, run_date::text AS run_date
           FROM reminder_runs ORDER BY created_at, id`,
      )
    ).rows as Run[];
  const events = async () =>
    (
      await f.h.superuser(
        `SELECT id::text, event_type, association_id, actor_user_id, aggregate_type, aggregate_id, payload, occurred_at
           FROM outbox_events WHERE event_type = 'reminder.sent' ORDER BY id`,
      )
    ).rows as OutboxRow[];
  const deliver = async () => {
    const consumer = worker.get(NotificationsConsumer);
    for (const r of await events()) {
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
      await consumer.handle(envelope);
    }
  };
  const bells = async () =>
    (
      await f.h.superuser(
        `SELECT user_id, type, title, body, action_url FROM notifications WHERE type = 'reminder.sent'
          ORDER BY created_at`,
      )
    ).rows as { user_id: string; type: string; title: string; body: string; action_url: string }[];

  /** Règle posée en base (hors API), avec son message en modèle de l'association. */
  const rule = async (p: {
    trigger: 'before_due' | 'on_due' | 'after_due';
    offsetDays: number;
    message: string;
    aid?: string;
    projectId?: string | null;
    channels?: string[];
    isActive?: boolean;
  }) => {
    const id = crypto.randomUUID();
    const templateId = crypto.randomUUID();
    const aid = p.aid ?? A.id;
    await f.h.superuser(
      `INSERT INTO message_templates (id, association_id, key, channel, subject, body)
       VALUES ($1, $2, 'reminder.rule', 'manual', '', $3)`,
      [templateId, aid, p.message],
    );
    await f.h.superuser(
      `INSERT INTO reminder_rules (id, association_id, project_id, trigger, offset_days, channels, template_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        aid,
        p.projectId ?? null,
        p.trigger,
        p.offsetDays,
        p.channels ?? ['in_app', 'push'],
        templateId,
        p.isActive ?? true,
      ],
    );
    return id;
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: ENROLLED_ON });
    f = await startLedgerFixture();
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
  });

  afterAll(async () => {
    await worker.close();
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(ENROLLED_ON);
    await f.h.superuser('DELETE FROM notifications');
    await f.h.superuser('DELETE FROM reminder_runs');
    await f.h.superuser('DELETE FROM reminder_rules');
    await f.h.superuser(`DELETE FROM message_templates WHERE key = 'reminder.rule'`);
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'reminder.sent'`);
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = ANY($1)', [
      [PLANS.essentiel, PLANS.pro],
      ['auto_reminders'],
    ]);
  });

  const moussa = () => f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });

  it('à 08:30 locale, J-3 : un rappel `auto_sent` au message rendu, puis la cloche du souscripteur', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    const ruleId = await rule({
      trigger: 'before_due',
      offsetDays: 3,
      message: 'Bonjour {{prenom}}, {{montant}} pour {{projet}} le {{echeance}}.',
      channels: ['in_app'],
    });

    await run('2026-03-02T08:29:00Z');
    expect(await runs()).toEqual([]);

    await run('2026-03-02T08:30:00Z');
    const [only, ...others] = await runs();
    expect(others).toEqual([]);
    expect(only).toMatchObject({
      rule_id: ruleId,
      installment_id: march,
      user_id: USERS.moussa,
      kind: 'automatic',
      status: 'auto_sent',
      channels: ['in_app'],
      run_date: '2026-03-02',
    });
    expect(only?.message).toMatch(new RegExp(`^Bonjour \\S+, ${F25} pour Centre communautaire le 5 mars 2026\\.$`));
    const [event] = await events();
    expect(event).toMatchObject({ association_id: A.id, actor_user_id: null, payload: { associationId: A.id } });
    expect(event?.payload.runIds).toHaveLength(1);

    await deliver();
    expect(await bells()).toEqual([
      {
        user_id: USERS.moussa,
        type: 'reminder.sent',
        title: 'Rappel : échéance du 5 mars',
        body: only?.message,
        action_url: `/paiements/declarer?projet=${PROJECTS.a}`,
      },
    ]);
  });

  it('relancée deux fois le même jour, même marque perdue : une seule relance et un seul rappel', async () => {
    await moussa();
    await rule({ trigger: 'before_due', offsetDays: 3, message: 'Rappel {{montant}}' });
    await run('2026-03-02T08:30:00Z');
    await run('2026-03-02T09:30:00Z');
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await run('2026-03-02T10:30:00Z');
    expect(await runs()).toHaveLength(1);
    expect(await events()).toHaveLength(1);
    await deliver();
    await deliver();
    expect(await bells()).toHaveLength(1);
  });

  it('échéance en retard (après N jours) : entrée « À relancer » avec le message prêt, rappel en retard', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    await f.h.superuser(`UPDATE installments SET status = 'late', late_since = '2026-03-11' WHERE id = $1`, [march]);
    await rule({ trigger: 'after_due', offsetDays: 7, message: '{{prenom}}, {{retard}} de retard : {{montant}}.' });

    await run('2026-03-12T08:30:00Z');
    const [only] = await runs();
    expect(only).toMatchObject({ installment_id: march, status: 'to_handle', run_date: '2026-03-12' });
    expect(only?.message).toMatch(new RegExp(`, 7 jours de retard : ${F25}\\.$`));
    await deliver();
    expect((await bells()).map((b) => b.title)).toEqual(['Échéance du 5 mars en retard']);
  });

  it('échéance soldée ou dispensée (décision 7) : aucune relance', async () => {
    const m = await moussa();
    const march = await f.installmentOf(m.id, '2026-03-05');
    await rule({ trigger: 'before_due', offsetDays: 3, message: 'Rappel {{montant}}' });
    for (const status of ['waived', 'paid']) {
      await f.h.superuser(`UPDATE installments SET status = $2 WHERE id = $1`, [march, status]);
      await f.redis.exec(['redis-cli', 'FLUSHDB']);
      await run('2026-03-02T08:30:00Z');
      expect(await runs()).toEqual([]);
    }
  });

  it('règle inactive, autre projet, plan sans auto_reminders : aucune relance', async () => {
    await moussa();
    await rule({ trigger: 'before_due', offsetDays: 3, message: 'Rappel', isActive: false });
    await rule({ trigger: 'before_due', offsetDays: 3, message: 'Rappel', projectId: PROJECTS.a2 });
    await run('2026-03-02T08:30:00Z');
    expect(await runs()).toEqual([]);

    await rule({ trigger: 'before_due', offsetDays: 3, message: 'Rappel' });
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, []]);
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await run('2026-03-02T08:30:00Z');
    expect(await runs()).toEqual([]);

    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = $1', [PLANS.essentiel, ['auto_reminders']]);
    await f.redis.exec(['redis-cli', 'FLUSHDB']);
    await run('2026-03-02T08:30:00Z');
    expect(await runs()).toHaveLength(1);
  });

  it('chaque association n’applique que ses règles à ses échéances', async () => {
    await moussa();
    await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    await rule({ trigger: 'before_due', offsetDays: 3, message: 'B : {{projet}}', aid: B.id });
    await run('2026-03-02T08:30:00Z');
    const all = await runs();
    expect(all.map((r) => r.user_id)).toEqual([USERS.fatou]);
    expect(all[0]?.message).not.toContain('Centre communautaire');
  });
});
