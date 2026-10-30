import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { codeOf, PLANS } from './platform-associations.fixture.js';
import { type MembersFixture, PHONES, PROJECTS, startMembersFixture } from './members.fixture.js';

/**
 * Lot 2.3 · étape 5 : ajout en lot (en.bulk, ≤ 200 lignes). Chaque ligne passe par le cas d'usage unitaire (en.create),
 * dans sa propre transaction (Q11) : une ligne refusée n'annule pas les autres, le rapport dit ligne par ligne ce qui
 * s'est passé. Quota contrôlé ligne par ligne (`failed` + `quota_exceeded`). Les codes des nouveaux comptes ne sont pas
 * dans le rapport : ils sont dans « Codes à remettre ». La vérification de l'étape (200 personnes en moins de 10 s) est mesurée seule :
 * test/perf/enrollment-bulk-200.test.ts.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC, comme pour en.create.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Report = ENDPOINTS['en.bulk'].operations.create.response.body;

/** Numéro mobile ivoirien valide, distinct pour chaque `n` (< 10 000). */
const phoneOf = (n: number) => `+225070${String(n).padStart(7, '0')}`;
const person = (phone: string, extra: Record<string, unknown> = {}) => ({
  phone,
  firstName: 'Kofi',
  lastName: 'Annan',
  ...extra,
});

describe('ajout en lot (en.bulk)', () => {
  let f: MembersFixture;

  const bulk = (body: unknown, options: { aid?: string; token?: string; key?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/enrollments/bulk`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID() },
    });
  const reported = async (body: unknown, options: Parameters<typeof bulk>[1] = {}) => {
    const res = await bulk(body, options);
    expect(res.status).toBe(200);
    return Report.parse(await res.json());
  };
  const count = async (query: string, params: unknown[] = []) =>
    ((await f.h.superuser(query, params)).rows as [{ n: number }])[0].n;
  const enrollmentsIn = (projectId: string) =>
    count('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [projectId]);

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

  it('rapport ligne par ligne : inscrits, rattachés, déjà inscrits, refusés ; les lignes valides sont écrites', async () => {
    await f.enroll(PROJECTS.a, USERS.fatou);
    const report = await reported({
      projectId: PROJECTS.a,
      rows: [
        person(phoneOf(1)),
        person(PHONES.moussa, { firstName: 'Ignoré' }),
        person(PHONES.fatou),
        { phone: 'pas un numéro', firstName: '', lastName: 'Annan' },
        person('+2250000000000'),
        person(phoneOf(1), { firstName: 'Doublon' }),
        person(phoneOf(2), { startsFrom: '2026-01-01' }),
        person(phoneOf(3), { email: 'ama@exemple.ci', startsFrom: '2026-12-01' }),
      ],
    });
    const enrolled = report.results.filter((r) => r.outcome === 'enrolled' || r.outcome === 'attached');
    expect(report.results).toEqual([
      { index: 0, outcome: 'enrolled', enrollmentId: enrolled[0]?.enrollmentId, errorCode: null, fields: null },
      { index: 1, outcome: 'attached', enrollmentId: enrolled[1]?.enrollmentId, errorCode: null, fields: null },
      { index: 2, outcome: 'already_enrolled', enrollmentId: null, errorCode: 'already_enrolled', fields: null },
      {
        index: 3,
        outcome: 'failed',
        enrollmentId: null,
        errorCode: 'validation_failed',
        fields: { phone: expect.any(String) as string, firstName: expect.any(String) as string },
      },
      {
        index: 4,
        outcome: 'failed',
        enrollmentId: null,
        errorCode: 'invalid_phone',
        fields: { phone: 'invalid_phone' },
      },
      { index: 5, outcome: 'already_enrolled', enrollmentId: null, errorCode: 'already_enrolled', fields: null },
      {
        index: 6,
        outcome: 'failed',
        enrollmentId: null,
        errorCode: 'validation_failed',
        fields: { startsFrom: 'before_project_start' },
      },
      { index: 7, outcome: 'enrolled', enrollmentId: enrolled[2]?.enrollmentId, errorCode: null, fields: null },
    ]);
    expect(enrolled.every((r) => typeof r.enrollmentId === 'string')).toBe(true);
    expect(report.newAccounts).toBe(2);
    // Fatou (posée hors API), Moussa, les deux nouveaux comptes ; aucune trace des lignes refusées.
    expect(await enrollmentsIn(PROJECTS.a)).toBe(4);
    expect(
      await count('SELECT count(*)::int AS n FROM users WHERE phone_e164 = ANY($1)', [[phoneOf(2), '+2250000000000']]),
    ).toBe(0);
    const moussa = await f.h.superuser('SELECT first_name FROM users WHERE id = $1', [USERS.moussa]);
    expect(moussa.rows).toEqual([{ first_name: 'Moussa' }]);
  });

  it('nouveaux comptes : code émis (dans « Codes à remettre »), jamais dans le rapport', async () => {
    const res = await bulk({ projectId: PROJECTS.a, rows: [person(phoneOf(1)), person(phoneOf(2))] });
    const text = await res.text();
    expect(res.status).toBe(200);
    const codes = await f.call(`/associations/${A.id}/activation-codes`, { token: f.tokens.awa });
    const page = ENDPOINTS['mb.codes'].operations.list.response.body.parse(await codes.json());
    expect(page.items.map((e) => [e.member.phone, e.state])).toEqual([
      [phoneOf(2), 'live'],
      [phoneOf(1), 'live'],
    ]);
    // Les codes émis, et non un motif : un UUID peut contenir « 7209-9951 ».
    const issued = page.items.map((e) => e.handoff?.code);
    expect(issued.every((c) => typeof c === 'string')).toBe(true);
    for (const code of issued) expect(text).not.toContain(code);
  });

  it('codes distincts, chacun active son compte ; compte créé par une autre association : rattaché sans code de A', async () => {
    const created = await f.call(`/associations/${B.id}/projects/${PROJECTS.b}/enrollments`, {
      token: f.tokens.koffi,
      method: 'POST',
      body: person(phoneOf(9)),
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(created.status).toBe(201);
    const report = await reported({
      projectId: PROJECTS.a,
      rows: [person(phoneOf(1)), person(phoneOf(9)), person(phoneOf(2))],
    });
    expect(report.results.map((r) => r.outcome)).toEqual(['enrolled', 'attached', 'enrolled']);

    const codes = await f.call(`/associations/${A.id}/activation-codes`, { token: f.tokens.awa });
    const page = ENDPOINTS['mb.codes'].operations.list.response.body.parse(await codes.json());
    expect(page.items.map((e) => e.member.phone).sort()).toEqual([phoneOf(1), phoneOf(2)]);
    const [one, two] = page.items.map((e) => ({ phone: e.member.phone, code: e.handoff?.code ?? '' }));
    expect(one?.code).not.toBe(two?.code);
    const issuers = await f.h.superuser(
      `SELECT c.association_id FROM one_time_codes c JOIN users u ON u.id = c.user_id
        WHERE u.phone_e164 = $1 AND c.purpose = 'activation'`,
      [phoneOf(9)],
    );
    expect(issuers.rows).toEqual([{ association_id: B.id }]);
    for (const account of [one, two]) {
      const res = await fetch(`${f.base}/auth/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identifier: account?.phone,
          code: account?.code,
          space: 'subscriber',
          newPassword: 'Lagune-Baobab-2026',
        }),
      });
      expect(res.status).toBe(200);
    }
  });

  it('échéances identiques à celles de en.create pour la même date d’entrée (rattrapage : en retard comprises)', async () => {
    const lines = async (enrollmentId: string | null | undefined) =>
      (
        await f.h.superuser(
          `SELECT kind, sequence, due_date::text, amount_due::text, status, late_since::text
             FROM installments WHERE enrollment_id = $1 ORDER BY kind, sequence`,
          [enrollmentId],
        )
      ).rows as { status: string }[];
    const single = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments`, {
      token: f.tokens.awa,
      method: 'POST',
      body: person(phoneOf(1), { startsFrom: '2026-03-01' }),
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(single.status).toBe(201);
    const unitId = ENDPOINTS['en.create'].operations.create.response.body.parse(await single.json()).enrollment.id;
    const report = await reported({ projectId: PROJECTS.a, rows: [person(phoneOf(2), { startsFrom: '2026-03-01' })] });
    const expected = await lines(unitId);
    expect(expected.some((l) => l.status === 'late')).toBe(true);
    expect(await lines(report.results[0]?.enrollmentId)).toEqual(expected);
  });

  it('une ligne = le cas d’usage unitaire : échéances, événement member.enrolled et audit par ligne', async () => {
    const since = ((await f.h.superuser('SELECT clock_timestamp() AS t')).rows as [{ t: Date }])[0].t;
    const report = await reported({ projectId: PROJECTS.a, rows: [person(phoneOf(1), { startsFrom: '2026-11-01' })] });
    const enrollmentId = report.results[0]?.enrollmentId;
    expect(await count('SELECT count(*)::int AS n FROM installments WHERE enrollment_id = $1', [enrollmentId])).toBe(
      10,
    );
    expect(
      await count(
        `SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'member.enrolled' AND occurred_at >= $1`,
        [since],
      ),
    ).toBe(1);
    const audit = await f.h.superuser(
      `SELECT action, entity_id, after FROM audit_logs
        WHERE action IN ('enrollment.create', 'enrollment.bulk') AND occurred_at >= $1 ORDER BY occurred_at`,
      [since],
    );
    expect(audit.rows).toMatchObject([
      { action: 'enrollment.create', entity_id: enrollmentId },
      {
        action: 'enrollment.bulk',
        after: { projectId: PROJECTS.a, rows: 1, enrolled: 1, attached: 0, alreadyEnrolled: 0, failed: 0 },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(phoneOf(1));
  });

  it('quota contrôlé ligne par ligne : les lignes au-delà échouent en quota_exceeded, les précédentes restent', async () => {
    const usage = await count(
      `SELECT count(*)::int AS n FROM memberships WHERE association_id = $1 AND role = 'subscriber' AND status <> 'removed'`,
      [A.id],
    );
    await f.h.superuser('UPDATE plans SET max_subscribers = $1 WHERE id = $2', [usage + 2, PLANS.essentiel]);
    try {
      const report = await reported({
        projectId: PROJECTS.a,
        rows: [person(phoneOf(1)), person(phoneOf(2)), person(phoneOf(3)), person(PHONES.moussa)],
      });
      expect(report.results.map((r) => [r.outcome, r.errorCode])).toEqual([
        ['enrolled', null],
        ['enrolled', null],
        ['failed', 'quota_exceeded'],
        // Déjà souscripteur de A : ne compte pas de plus.
        ['attached', null],
      ]);
      expect(report.newAccounts).toBe(2);
      expect(await count('SELECT count(*)::int AS n FROM users WHERE phone_e164 = $1', [phoneOf(3)])).toBe(0);
    } finally {
      await f.h.superuser('UPDATE plans SET max_subscribers = 100 WHERE id = $1', [PLANS.essentiel]);
    }
  });

  it('projet fermé aux inscriptions : chaque ligne échoue en invalid_state', async () => {
    const report = await reported({ projectId: PROJECTS.draftA, rows: [person(phoneOf(1)), person(phoneOf(2))] });
    expect(report.results.map((r) => [r.outcome, r.errorCode])).toEqual([
      ['failed', 'invalid_state'],
      ['failed', 'invalid_state'],
    ]);
    expect(report.newAccounts).toBe(0);
  });

  it('projet inconnu ou d’une autre association : 404, rien n’est écrit', async () => {
    for (const projectId of [PROJECTS.b, '00000000-0000-7000-8000-0000000000ff']) {
      const res = await bulk({ projectId, rows: [person(phoneOf(1))] });
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    }
    expect(await count('SELECT count(*)::int AS n FROM users WHERE phone_e164 = $1', [phoneOf(1)])).toBe(0);
  });

  it('enveloppe invalide : 422 validation_failed (aucune ligne, plus de 200, projet absent)', async () => {
    for (const body of [
      { projectId: PROJECTS.a, rows: [] },
      { projectId: PROJECTS.a, rows: Array.from({ length: 201 }, (_, i) => person(phoneOf(i))) },
      { rows: [person(phoneOf(1))] },
    ]) {
      const res = await bulk(body);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('validation_failed');
    }
  });

  it('même Idempotency-Key : même rapport rejoué, rien n’est refait', async () => {
    const key = crypto.randomUUID();
    const body = { projectId: PROJECTS.a, rows: [person(phoneOf(1))] };
    const first = await reported(body, { key });
    const again = await bulk(body, { key });
    expect(again.status).toBe(200);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(Report.parse(await again.json())).toEqual(first);
    expect(await enrollmentsIn(PROJECTS.a)).toBe(1);
  });

  it('lecteur (viewer) : 403 ; association dont le jeton n’est pas gestionnaire : 404', async () => {
    const body = { projectId: PROJECTS.a, rows: [person(phoneOf(1))] };
    expect((await bulk(body, { token: f.tokens.koffi })).status).toBe(403);
    expect((await bulk({ ...body, projectId: PROJECTS.b }, { aid: B.id })).status).toBe(404);
    expect(await enrollmentsIn(PROJECTS.a)).toBe(0);
  });
});
