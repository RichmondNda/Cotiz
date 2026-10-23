import { describe, expect, it } from 'vitest';
import { type WatchCandidate, watchlist, WATCHLIST_LIMIT } from './watchlist.js';

const NOW = new Date('2026-10-23T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function candidate(overrides: Partial<WatchCandidate> = {}): WatchCandidate {
  return {
    associationId: 'a1',
    name: 'Association A',
    status: 'active',
    createdAt: daysAgo(400),
    lastActivityAt: daysAgo(1),
    subscription: { status: 'active', currentPeriodEnd: '2026-10-31' },
    usage: { subscribers: 10, managers: 1 },
    limits: { subscribers: 100, managers: 5 },
    ...overrides,
  };
}

describe('watchlist', () => {
  it('association en règle, active et loin de ses quotas : absente', () => {
    expect(watchlist([candidate()], NOW)).toEqual([]);
  });

  it('abonnement impayé : unpaid depuis la fin de la période', () => {
    const c = candidate({ subscription: { status: 'past_due', currentPeriodEnd: '2026-09-30' } });
    expect(watchlist([c], NOW)).toEqual([
      { associationId: 'a1', name: 'Association A', signal: 'unpaid', since: '2026-09-30' },
    ]);
  });

  it('aucune session de gestionnaire depuis plus de 30 jours : inactive depuis la dernière activité', () => {
    expect(watchlist([candidate({ lastActivityAt: daysAgo(31) })], NOW)).toEqual([
      { associationId: 'a1', name: 'Association A', signal: 'inactive', since: '2026-09-22' },
    ]);
    expect(watchlist([candidate({ lastActivityAt: daysAgo(30) })], NOW)).toEqual([]);
  });

  it('jamais de session, créée il y a plus de 30 jours : inactive depuis la création', () => {
    const c = candidate({ lastActivityAt: null, createdAt: new Date('2026-08-01T09:00:00Z') });
    expect(watchlist([c], NOW)).toEqual([
      { associationId: 'a1', name: 'Association A', signal: 'inactive', since: '2026-08-01' },
    ]);
    expect(watchlist([candidate({ lastActivityAt: null, createdAt: daysAgo(10) })], NOW)).toEqual([]);
  });

  it('onboarding non terminé 30 jours après la création, malgré une activité récente : inactive depuis la création', () => {
    const c = candidate({
      status: 'onboarding',
      createdAt: new Date('2026-09-01T09:00:00Z'),
    });
    expect(watchlist([c], NOW)).toEqual([
      { associationId: 'a1', name: 'Association A', signal: 'inactive', since: '2026-09-01' },
    ]);
    expect(watchlist([{ ...c, createdAt: daysAgo(29) }], NOW)).toEqual([]);
    // Active : l'onboarding est terminé, même sans date enregistrée.
    expect(watchlist([{ ...c, status: 'active' }], NOW)).toEqual([]);
  });

  it('souscripteurs ou gestionnaires à 80 % de la limite ou plus : quota, sans date', () => {
    expect(watchlist([candidate({ usage: { subscribers: 80, managers: 1 } })], NOW)).toEqual([
      { associationId: 'a1', name: 'Association A', signal: 'quota', since: null },
    ]);
    expect(watchlist([candidate({ usage: { subscribers: 10, managers: 4 } })], NOW)).toHaveLength(1);
    expect(watchlist([candidate({ usage: { subscribers: 79, managers: 3 } })], NOW)).toEqual([]);
  });

  it('limite illimitée ou nulle, ou pas d’abonnement en cours : jamais quota', () => {
    expect(
      watchlist(
        [candidate({ usage: { subscribers: 900, managers: 9 }, limits: { subscribers: null, managers: null } })],
        NOW,
      ),
    ).toEqual([]);
    expect(
      watchlist([candidate({ usage: { subscribers: 0, managers: 0 }, limits: { subscribers: 0, managers: 0 } })], NOW),
    ).toEqual([]);
    expect(
      watchlist([candidate({ subscription: null, limits: null, usage: { subscribers: 900, managers: 9 } })], NOW),
    ).toEqual([]);
  });

  it('suspendue ou fermée : jamais surveillée (déjà traitée)', () => {
    const signals = {
      lastActivityAt: daysAgo(90),
      subscription: { status: 'past_due' as const, currentPeriodEnd: null },
    };
    expect(
      watchlist([candidate({ status: 'suspended', ...signals }), candidate({ status: 'closed', ...signals })], NOW),
    ).toEqual([]);
  });

  it('un seul signal par association, le plus grave : unpaid, puis inactive, puis quota', () => {
    const c = candidate({
      lastActivityAt: daysAgo(60),
      usage: { subscribers: 100, managers: 5 },
      subscription: { status: 'past_due', currentPeriodEnd: '2026-09-30' },
    });
    expect(watchlist([c], NOW).map((w) => w.signal)).toEqual(['unpaid']);
    expect(
      watchlist([{ ...c, subscription: { status: 'active', currentPeriodEnd: null } }], NOW).map((w) => w.signal),
    ).toEqual(['inactive']);
  });

  it('tri : par gravité, puis la plus ancienne, puis le nom ; limité à 10', () => {
    const quota = (id: string, name: string) =>
      candidate({ associationId: id, name, usage: { subscribers: 90, managers: 1 } });
    const list = watchlist(
      [
        quota('q2', 'Zeta'),
        candidate({ associationId: 'i1', name: 'Inactive récente', lastActivityAt: daysAgo(40) }),
        quota('q1', 'Alpha'),
        candidate({ associationId: 'i2', name: 'Inactive ancienne', lastActivityAt: daysAgo(200) }),
        candidate({
          associationId: 'u1',
          name: 'Impayée',
          subscription: { status: 'past_due', currentPeriodEnd: null },
        }),
      ],
      NOW,
    );
    expect(list.map((w) => w.associationId)).toEqual(['u1', 'i2', 'i1', 'q1', 'q2']);
    const many = Array.from({ length: 15 }, (_, i) => quota(`q${String(i)}`, `Asso ${String(i).padStart(2, '0')}`));
    expect(watchlist(many, NOW)).toHaveLength(WATCHLIST_LIMIT);
  });
});
