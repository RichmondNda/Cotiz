import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { PLANS } from '../integration/platform-associations.fixture.js';
import { type MembersFixture, startMembersFixture } from '../integration/members.fixture.js';

/**
 * Lot 2.4 · étape 3, vérification : grille de 200 souscripteurs × 24 échéances en moins de 500 ms par page (100 lignes,
 * la plus grande page du contrat). Mesure de durée : lancée seule, après la suite parallèle (vitest.perf.config.ts).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const PROJECT = '00000000-0000-7000-8000-00000000c3f1';
const Grid = ENDPOINTS['lg.grid'].operations.get.response.body;
const phoneOf = (n: number) => `+225070${String(n).padStart(7, '0')}`;

describe('grille (lg.grid) : performance', () => {
  let f: MembersFixture;

  const page = async (cursor: string | null) => {
    const query = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const started = performance.now();
    const res = await f.call(`/associations/${A.id}/projects/${PROJECT}/grid${query}`, { token: f.tokens.awa });
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    return { body: Grid.parse(await res.json()), elapsed };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startMembersFixture();
    await f.h.superuser('UPDATE plans SET max_subscribers = 1000 WHERE id = $1', [PLANS.essentiel]);
    // 24 mensualités de 25 000 F, de mars 2026 à février 2028.
    await f.h.superuser(
      `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency, due_day,
                             schedule_type, start_date, end_date, created_by)
       VALUES ($1, $2, 'Grille 200 × 24', '', 'enrolling', 25000, 'monthly', 5, 'fixed', '2026-03-01', '2028-02-29', $3)`,
      [PROJECT, A.id, USERS.awa],
    );
    const rows = Array.from({ length: 200 }, (_, i) => ({
      phone: phoneOf(100 + i),
      firstName: `Personne ${String(i)}`,
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    }));
    const res = await f.call(`/associations/${A.id}/enrollments/bulk`, {
      token: f.tokens.awa,
      method: 'POST',
      body: { projectId: PROJECT, rows },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  it('200 × 24 : chaque page de 100 lignes en moins de 500 ms', async () => {
    const { rows } = await f.h.superuser('SELECT count(*)::int AS n FROM installments WHERE project_id = $1', [
      PROJECT,
    ]);
    expect(rows).toEqual([{ n: 200 * 24 }]);
    await page(null); // Préchauffage (première requête : compilation, connexions).
    const first = await page(null);
    const second = await page(first.body.nextCursor);
    expect(first.body.items).toHaveLength(100);
    expect(second.body.items).toHaveLength(100);
    expect(second.body.nextCursor).toBeNull();
    expect(first.body.columns).toHaveLength(24);
    expect(first.body.items.every((r) => r.cells.length === 24)).toBe(true);
    expect(first.elapsed).toBeLessThan(500);
    expect(second.elapsed).toBeLessThan(500);
  });
});
