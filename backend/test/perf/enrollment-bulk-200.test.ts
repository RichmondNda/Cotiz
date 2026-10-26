import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { A } from '../isolation/harness.js';
import { PLANS } from '../integration/platform-associations.fixture.js';
import { type MembersFixture, PROJECTS, startMembersFixture } from '../integration/members.fixture.js';

/**
 * Lot 2.3 · étape 5, vérification : 200 personnes ajoutées en lot (en.bulk) en moins de 10 s. Mesure de durée : lancée
 * seule, après la suite parallèle (vitest.perf.config.ts), pour ne pas mesurer la charge des autres fichiers.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Report = ENDPOINTS['en.bulk'].operations.create.response.body;
const phoneOf = (n: number) => `+225070${String(n).padStart(7, '0')}`;

describe('ajout en lot (en.bulk) : performance', () => {
  let f: MembersFixture;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
    await f.h.superuser('UPDATE plans SET max_subscribers = 1000 WHERE id = $1', [PLANS.essentiel]);
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  it('200 personnes en moins de 10 s', { timeout: 60_000 }, async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      phone: phoneOf(100 + i),
      firstName: `Personne ${String(i)}`,
      lastName: 'Annan',
    }));
    const started = performance.now();
    const res = await f.call(`/associations/${A.id}/enrollments/bulk`, {
      token: f.tokens.awa,
      method: 'POST',
      body: { projectId: PROJECTS.a, rows },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    const report = Report.parse(await res.json());
    expect(report.results.every((r) => r.outcome === 'enrolled')).toBe(true);
    expect(report.newAccounts).toBe(200);
    const enrolled = await f.h.superuser('SELECT count(*)::int AS n FROM enrollments WHERE project_id = $1', [
      PROJECTS.a,
    ]);
    expect(enrolled.rows).toEqual([{ n: 200 }]);
    expect(elapsed).toBeLessThan(10_000);
  });
});
