import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { A, B, USERS } from './harness.js';

/**
 * Lot 3.3 : isolation des paiements du souscripteur (me.alloc ; me.declare et me.payment aux étapes suivantes).
 * Appartenances du jeu : A — Awa propriétaire, Moussa souscripteur, Fatou souscriptrice retirée ; B — Koffi
 * propriétaire, Fatou et Awa souscriptrices. Chacun n'est servi que sur ses inscriptions non retirées, dans les
 * associations où il est souscripteur actif ; tout autre projet → 404 identique. Politiques élargies : le filtre du
 * code tient seul.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Preview = ENDPOINTS['me.alloc'].operations.preview.response.body;
const UNKNOWN = '00000000-0000-7000-8000-00000000dead';
const everyone = { using: 'true', withCheck: null };
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('isolation : paiements du souscripteur (me.alloc)', () => {
  let f: LedgerFixture;
  let awaSubscriber: string;
  let fatou: string;

  const preview = (projectId: string, amount: number, token: string) =>
    f.call('/me/payments/allocation-preview', { token, method: 'POST', body: { projectId, amount: XOF(amount) } });
  const notFound = async (projectId: string, token: string) => {
    const res = await preview(projectId, 25000, token);
    expect(res.status).toBe(404);
    const body = Problem.parse(await res.json());
    expect(body.code).toBe('not_found');
    return { status: body.status, code: body.code, title: body.title, type: body.type, detail: body.detail };
  };

  /** Inscription active avec une échéance ouverte de 25 000 F au 2026-10-05 ; renvoie l'échéance. */
  const enrolledOpen = async (projectId: string, userId: string, associationId: string) => {
    const enrollmentId = await f.enroll(projectId, userId, associationId);
    const installmentId = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due, status)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-10-05', 25000, 'late')`,
      [installmentId, associationId, projectId, enrollmentId, userId],
    );
    return installmentId;
  };
  /** Moussa, Fatou (appartenance retirée) et Awa (gestionnaire seulement) sur PROJECTS.a ; Fatou et Awa sur PROJECTS.b. */
  const scenario = async () => ({
    moussaA: await enrolledOpen(PROJECTS.a, USERS.moussa, A.id),
    fatouA: await enrolledOpen(PROJECTS.a, USERS.fatou, A.id),
    awaA: await enrolledOpen(PROJECTS.a, USERS.awa, A.id),
    fatouB: await enrolledOpen(PROJECTS.b, USERS.fatou, B.id),
    awaB: await enrolledOpen(PROJECTS.b, USERS.awa, B.id),
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    [awaSubscriber, fatou] = await Promise.all([
      f.login('subscriber', 'awa@test.cotiz.app'),
      f.login('subscriber', 'fatou@test.cotiz.app'),
    ]);
  });
  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await f.resetLedger();
  });

  it('me.alloc : seulement les échéances de la personne, sur le projet demandé', async () => {
    const s = await scenario();
    const res = await preview(PROJECTS.a, 25000, f.tokens.moussa);
    expect(res.status).toBe(200);
    expect(Preview.parse(await res.json()).allocations).toEqual([{ installmentId: s.moussaA, amount: XOF(25000) }]);
    // Le reste dû est le sien seul (25 000 F), pas celui du projet.
    const over = await preview(PROJECTS.a, 50000, f.tokens.moussa);
    expect(over.status).toBe(422);
    expect(Problem.parse(await over.json())).toMatchObject({ code: 'amount_exceeds_remaining', maxAmount: 25000 });
    const awa = await preview(PROJECTS.b, 25000, awaSubscriber);
    expect(Preview.parse(await awa.json()).allocations).toEqual([{ installmentId: s.awaB, amount: XOF(25000) }]);
  });

  it('me.alloc : autre association, appartenance retirée, gestionnaire seulement, inconnu → 404 identique', async () => {
    await scenario();
    const unknown = await notFound(UNKNOWN, f.tokens.moussa);
    expect(await notFound(PROJECTS.b, f.tokens.moussa)).toEqual(unknown);
    expect(await notFound(PROJECTS.a2, f.tokens.moussa)).toEqual(unknown);
    // Fatou : inscrite sur PROJECTS.a, mais plus souscriptrice de A.
    expect(await notFound(PROJECTS.a, fatou)).toEqual(unknown);
    // Awa : inscrite sur PROJECTS.a, mais seulement gestionnaire de A.
    expect(await notFound(PROJECTS.a, awaSubscriber)).toEqual(unknown);
  });

  it('me.alloc : jeton gestionnaire → 403', async () => {
    await scenario();
    expect((await preview(PROJECTS.a, 25000, f.tokens.awa)).status).toBe(403);
  });

  it('me.alloc, politiques élargies : rien d’autrui', async () => {
    const s = await scenario();
    // Inscription de Moussa la plus récente : sans le filtre sur la personne, celle de Fatou ou d'Awa (même projet,
    // même association) viendrait en premier.
    await f.h.superuser(`UPDATE enrollments SET joined_at = now() + interval '1 day' WHERE user_id = $1`, [
      USERS.moussa,
    ]);
    await f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('installments', 'subscriber_self_read', everyone, async () => {
        const res = await preview(PROJECTS.a, 25000, f.tokens.moussa);
        expect(Preview.parse(await res.json()).allocations).toEqual([{ installmentId: s.moussaA, amount: XOF(25000) }]);
        const over = await preview(PROJECTS.a, 50000, f.tokens.moussa);
        expect(Problem.parse(await over.json())).toMatchObject({ maxAmount: 25000 });
        await notFound(PROJECTS.a, fatou);
      }),
    );
  });
});
