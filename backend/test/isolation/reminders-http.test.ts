import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { PLANS } from '../integration/platform-associations.fixture.js';
import { A, asManagerOf, B, USERS } from './harness.js';

/**
 * Isolation HTTP des relances (lot 4.3) : par l'espace de B, son owner (Koffi) ne voit ni ne marque les entrées de A
 * (404, comme un identifiant inconnu), ne lit ni ne modifie ses règles, sa file et son historique ne montrent que B, et une relance ciblée sur une
 * personne de A ne produit rien. Politiques élargies : la base laisse passer, le code filtre encore.
 *
 * Horloge simulée : Moussa (A, PROJECTS.a) et Fatou (B, PROJECTS.b) inscrits le 2026-03-01 ; aujourd'hui le 2026-04-12,
 * leurs échéances du 5 mars en retard.
 */

const ENROLLED_ON = new Date('2026-03-01T10:00:00Z');
const TODAY = new Date('2026-04-12T10:00:00Z');

interface Listed {
  items: { id: string; installmentId?: string; member: { id: string } }[];
}

describe('isolation HTTP : relances', () => {
  let f: LedgerFixture;
  let lateA: string;
  let lateB: string;
  let runA: string;
  const RULE_A = '00000000-0000-7000-8000-0000000f3a01';

  const get = async (aid: string, path: string, token: string) => {
    const res = await f.call(`/associations/${aid}${path}`, { token });
    expect(res.status).toBe(200);
    return (await res.json()) as Listed;
  };
  const mark = (aid: string, id: string, token: string) =>
    f
      .call(`/associations/${aid}/reminders/queue/${id}/handled`, {
        token,
        method: 'POST',
        body: { outcome: 'handled' },
      })
      .then((r) => r.status);
  const send = async (aid: string, body: unknown, token: string) => {
    const res = await f.call(`/associations/${aid}/reminders`, {
      token,
      method: 'POST',
      body,
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    return { status: res.status, body: (await res.json()) as { queued?: unknown[] } };
  };
  const runsOfA = async () =>
    (await f.h.superuser(`SELECT id, status FROM reminder_runs WHERE association_id = $1 ORDER BY id`, [A.id]))
      .rows as { id: string; status: string }[];

  /** Ce que Koffi (owner de B) obtient de l'espace de B : rien qui vienne de A. */
  const fromB = async () => {
    const koffi = f.tokens.koffi;
    expect(await mark(B.id, lateA, koffi)).toBe(404);
    expect(await mark(B.id, runA, koffi)).toBe(404);
    expect(await mark(B.id, crypto.randomUUID(), koffi)).toBe(404);
    const queue = await get(B.id, '/reminders/queue', koffi);
    expect(queue.items.map((e) => e.member.id)).toEqual([USERS.fatou]);
    const history = await get(B.id, '/reminders/history', koffi);
    expect(history.items.map((h) => h.id)).not.toContain(runA);
    expect(history.items.map((h) => h.member.id)).not.toContain(USERS.moussa);
    const targeted = await send(B.id, { userIds: [USERS.moussa] }, koffi);
    expect(targeted.status).toBe(202);
    expect(targeted.body.queued).toEqual([]);
    expect((await send(B.id, { allLate: true, projectId: PROJECTS.a }, koffi)).status).toBe(404);
    expect(await runsOfA()).toEqual([{ id: runA, status: 'to_handle' }]);
    const rules = await get(B.id, '/reminder-rules', koffi);
    expect(rules.items.map((r) => r.id)).not.toContain(RULE_A);
    const patched = await f.call(`/associations/${B.id}/reminder-rules/${RULE_A}`, {
      token: koffi,
      method: 'PATCH',
      body: { isActive: false },
    });
    expect(patched.status).toBe(404);
    expect((await f.h.superuser('SELECT is_active FROM reminder_rules WHERE id = $1', [RULE_A])).rows).toEqual([
      { is_active: true },
    ]);
  };

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
    await f.h.superuser('DELETE FROM reminder_rules');
    await f.h.superuser(
      `INSERT INTO reminder_rules (id, association_id, trigger, offset_days, channels) VALUES ($1, $2, 'after_due', 7, '{in_app}')`,
      [RULE_A, A.id],
    );
    await f.resetLedger();
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = ANY($1::uuid[])`, [
      [A.id, B.id],
    ]);
    await f.h.superuser('UPDATE plans SET features = $2 WHERE id = ANY($1)', [
      [PLANS.essentiel, PLANS.pro],
      ['auto_reminders'],
    ]);
    const m = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });
    const b = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    lateA = await f.installmentOf(m.id, '2026-03-05');
    lateB = await f.installmentOf(b.id, '2026-03-05');
    await f.h.superuser(
      `UPDATE installments SET status = 'late', late_since = (due_date + 6) WHERE id = ANY($1::uuid[])`,
      [[lateA, lateB]],
    );
    vi.setSystemTime(TODAY);
    const [awa, koffi] = await Promise.all([
      f.login('association', 'awa@test.cotiz.app'),
      f.login('association', 'koffi@test.cotiz.app'),
    ]);
    Object.assign(f.tokens, { awa, koffi });
    const sent = await send(A.id, { userIds: [USERS.moussa] }, f.tokens.awa);
    expect(sent.status).toBe(202);
    runA = (await runsOfA())[0]?.id ?? '';
  });

  it('par l’espace de B : entrées de A introuvables, file et historique de B seuls, relance vers A sans effet', async () => {
    await fromB();
  });

  it('lecteur de A (Koffi) : lit l’historique ; file, marquage et envoi refusés (403)', async () => {
    expect((await get(A.id, '/reminders/history', f.tokens.koffi)).items.map((h) => h.id)).toEqual([runA]);
    expect((await f.call(`/associations/${A.id}/reminders/queue`, { token: f.tokens.koffi })).status).toBe(403);
    expect(await mark(A.id, runA, f.tokens.koffi)).toBe(403);
    expect((await send(A.id, { allLate: true }, f.tokens.koffi)).status).toBe(403);
    expect(await runsOfA()).toEqual([{ id: runA, status: 'to_handle' }]);
  });

  it('politiques élargies : la base montre A à B, l’API ne renvoie toujours rien de A', async () => {
    const open = { using: 'true', withCheck: 'true' };
    await f.h.withPolicy('reminder_rules', 'tenant_isolation', open, () =>
      f.h.withPolicy('reminder_runs', 'tenant_isolation', open, () =>
        f.h.withPolicy('installments', 'tenant_isolation', open, () =>
          f.h.withPolicy('enrollments', 'tenant_isolation', open, async () => {
            const visible = await f.h.as(asManagerOf(B), (tx) =>
              tx.execute<{ id: string }>(sql`SELECT id FROM reminder_runs`).then((r) => r.rows.map((row) => row.id)),
            );
            expect(visible).toContain(runA);
            await fromB();
          }),
        ),
      ),
    );
  });
});
