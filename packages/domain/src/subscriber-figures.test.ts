import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bySubscriberCardOrder,
  DomainError,
  enrollmentLate,
  enrollmentNextDue,
  enrollmentProgress,
  enrollmentTotals,
  unsignedEnrollmentInstallments,
  subscriberSummary,
  type InstallmentStatus,
  type SubscriberInstallment,
} from './index.js';

const line = (
  dueDate: string,
  amountDue: number,
  status: InstallmentStatus,
  paid = 0,
  pending = 0,
  kind: 'entry_fee' | 'periodic' = 'periodic',
  sequence = 1,
): SubscriberInstallment => ({ kind, sequence, dueDate, amountDue, amountPaid: paid, amountPending: pending, status });

describe('enrollmentNextDue : prochaine échéance d’une inscription', () => {
  it('première échéance ni en retard ni couverte par une déclaration, montant = reste dû', () => {
    const next = enrollmentNextDue([
      line('2026-08-05', 25_000, 'late', 0, 0, 'periodic', 6),
      line('2026-09-05', 25_000, 'declared', 0, 25_000, 'periodic', 7),
      line('2026-10-05', 25_000, 'partial', 10_000, 0, 'periodic', 8),
      line('2026-11-05', 25_000, 'upcoming', 0, 0, 'periodic', 9),
    ]);
    expect(next).toEqual({ dueDate: '2026-10-05', amount: 15_000 });
  });

  it('ordre de l’échéancier : date, fonds d’entrée avant mensualité, rang', () => {
    const next = enrollmentNextDue([
      line('2026-10-05', 10_000, 'upcoming', 0, 0, 'periodic', 0),
      line('2026-10-05', 50_000, 'upcoming', 0, 0, 'entry_fee', 1),
    ]);
    // Rang plus grand pour le fonds d'entrée : seule la nature le fait passer devant.
    expect(next).toEqual({ dueDate: '2026-10-05', amount: 50_000 });
    // À nature égale, le rang départage.
    expect(
      enrollmentNextDue([
        line('2026-10-05', 10_000, 'upcoming', 0, 0, 'periodic', 2),
        line('2026-10-05', 20_000, 'upcoming', 0, 0, 'periodic', 1),
      ]),
    ).toEqual({ dueDate: '2026-10-05', amount: 20_000 });
  });

  it('échéance du jour (`due`) comprise ; payée, dispensée ou annulée exclues ; plus rien → null', () => {
    expect(enrollmentNextDue([line('2026-09-25', 10_000, 'due')])).toEqual({ dueDate: '2026-09-25', amount: 10_000 });
    expect(
      enrollmentNextDue([
        line('2026-09-05', 10_000, 'paid', 10_000),
        line('2026-10-05', 10_000, 'waived'),
        line('2026-11-05', 10_000, 'canceled'),
      ]),
    ).toBeNull();
    expect(enrollmentNextDue([])).toBeNull();
  });

  it('montant invalide refusé', () => {
    expect(() => enrollmentNextDue([line('2026-10-05', -1, 'upcoming')])).toThrow(DomainError);
  });
});

describe('enrollmentLate : retard d’une inscription', () => {
  it('nombre, reste dû des échéances en retard, date d’échéance du plus ancien', () => {
    expect(
      enrollmentLate([
        line('2026-09-05', 25_000, 'late', 0, 0, 'periodic', 7),
        line('2026-08-05', 25_000, 'late', 5_000, 0, 'periodic', 6),
        line('2026-10-05', 25_000, 'upcoming', 0, 0, 'periodic', 8),
      ]),
    ).toEqual({ count: 2, amount: 45_000, since: '2026-08-05' });
  });

  it('aucun retard → null', () => {
    expect(enrollmentLate([line('2026-10-05', 25_000, 'upcoming')])).toBeNull();
  });

  it('échéance passée à la signature : « depuis » le départ de son retard (lateFrom), pas son échéance', () => {
    const signed = (dueDate: string, lateFrom: string | null, sequence: number): SubscriberInstallment => ({
      ...line(dueDate, 25_000, 'late', 0, 0, 'periodic', sequence),
      lateFrom,
    });
    // Signées le 20 novembre : août et septembre ne sont en retard que depuis la signature.
    expect(enrollmentLate([signed('2026-08-05', '2026-11-20', 1), signed('2026-09-05', '2026-11-20', 2)])).toEqual({
      count: 2,
      amount: 50_000,
      since: '2026-11-20',
    });
    // Le plus ancien départ l'emporte, même si son échéance est plus récente.
    expect(enrollmentLate([signed('2026-08-05', '2026-11-20', 1), signed('2026-10-05', null, 3)])?.since).toBe(
      '2026-10-05',
    );
  });
});

describe('subscriberSummary : synthèse toutes associations', () => {
  const engaged = (
    remaining: number,
    late: { count: number; amount: number } | null,
    next: string | null,
    amount = 0,
  ) => ({
    status: 'active' as const,
    remaining,
    late,
    nextDue: next ? { dueDate: next, amount } : null,
  });

  it('jeu de référence (Moussa) : 395 000 F restants, 50 000 F en retard, prochaine le 5 octobre (25 000 F)', () => {
    const summary = subscriberSummary([
      engaged(325_000, { count: 2, amount: 50_000 }, '2026-10-05', 25_000),
      { status: 'pending_signature', remaining: 130_000, late: null, nextDue: null },
      engaged(70_000, null, '2026-10-05', 10_000),
    ]);
    expect(summary).toEqual({ remainingTotal: 395_000, late: { count: 2, amount: 50_000 }, nextDueIndex: 0 });
  });

  it('prochaine échéance : la plus proche, à date égale la plus grosse, puis la première', () => {
    expect(
      subscriberSummary([engaged(0, null, '2026-10-05', 10_000), engaged(0, null, '2026-10-05', 25_000)]).nextDueIndex,
    ).toBe(1);
    expect(
      subscriberSummary([engaged(0, null, '2026-11-05', 99_000), engaged(0, null, '2026-10-05', 1_000)]).nextDueIndex,
    ).toBe(1);
    expect(
      subscriberSummary([engaged(0, null, '2026-10-05', 5_000), engaged(0, null, '2026-10-05', 5_000)]).nextDueIndex,
    ).toBe(0);
  });

  it('en attente de signature et retirée hors des totaux ; terminée comprise ; rien → zéro, null', () => {
    expect(
      subscriberSummary([
        { status: 'pending_signature', remaining: 10, late: null, nextDue: { dueDate: '2026-10-05', amount: 10 } },
        { status: 'withdrawn', remaining: 20, late: { count: 1, amount: 20 }, nextDue: null },
        { status: 'completed', remaining: 0, late: null, nextDue: null },
      ]),
    ).toEqual({ remainingTotal: 0, late: null, nextDueIndex: null });
  });

  it('propriété : reste total = somme des restes engagés, retard = somme des retards', () => {
    const card = fc.record({
      status: fc.constantFrom(
        'active' as const,
        'completed' as const,
        'pending_signature' as const,
        'withdrawn' as const,
      ),
      remaining: fc.integer({ min: 0, max: 10_000_000 }),
      lateAmount: fc.integer({ min: 0, max: 10_000_000 }),
      lateCount: fc.integer({ min: 0, max: 12 }),
    });
    fc.assert(
      fc.property(fc.array(card, { maxLength: 20 }), (cards) => {
        const input = cards.map((c) => ({
          status: c.status,
          remaining: c.remaining,
          late: c.lateCount > 0 ? { count: c.lateCount, amount: c.lateAmount } : null,
          nextDue: null,
        }));
        const counted = cards.filter((c) => c.status === 'active' || c.status === 'completed');
        const summary = subscriberSummary(input);
        expect(summary.remainingTotal).toBe(counted.reduce((t, c) => t + c.remaining, 0));
        expect(summary.late?.count ?? 0).toBe(counted.reduce((t, c) => t + c.lateCount, 0));
        expect(summary.late?.amount ?? 0).toBe(counted.reduce((t, c) => t + (c.lateCount > 0 ? c.lateAmount : 0), 0));
      }),
    );
  });

  it('montant invalide refusé', () => {
    expect(() => subscriberSummary([engaged(0.5, null, null)])).toThrow(DomainError);
  });
});

describe('bySubscriberCardOrder : retard, signature, prochaine échéance', () => {
  it('trie les cartes du tableau de bord', () => {
    const cards = [
      { standing: 'up_to_date' as const, nextDueDate: '2026-10-05', createdAt: 'b' },
      { standing: 'signature_required' as const, nextDueDate: null, createdAt: 'c' },
      { standing: 'up_to_date' as const, nextDueDate: null, createdAt: 'a' },
      { standing: 'late' as const, nextDueDate: '2026-10-05', createdAt: 'd' },
      { standing: 'activation_pending' as const, nextDueDate: '2026-09-30', createdAt: 'e' },
    ];
    expect([...cards].sort(bySubscriberCardOrder).map((c) => c.createdAt)).toEqual(['d', 'c', 'e', 'b', 'a']);
  });

  it('à prochaine échéance égale : projet le plus ancien d’abord', () => {
    const a = { standing: 'up_to_date' as const, nextDueDate: '2026-10-05', createdAt: '2026-01-01' };
    const b = { standing: 'up_to_date' as const, nextDueDate: '2026-10-05', createdAt: '2026-05-20' };
    expect([b, a].sort(bySubscriberCardOrder)).toEqual([a, b]);
  });
});

describe('enrollmentProgress : versé / engagement', () => {
  it('rapport plafonné à 1, null sans engagement', () => {
    expect(enrollmentProgress(175_000, 500_000)).toBe(0.35);
    expect(enrollmentProgress(600, 500)).toBe(1);
    expect(enrollmentProgress(0, null)).toBeNull();
    expect(enrollmentProgress(0, 0)).toBeNull();
    expect(() => enrollmentProgress(-1, 10)).toThrow(DomainError);
  });
});

describe('unsignedEnrollmentInstallments : engagement d’une inscription en attente de signature', () => {
  const schedule = [
    { sequence: 0, kind: 'entry_fee' as const, dueDate: '2026-10-05', amountDue: 50_000 },
    { sequence: 5, kind: 'periodic' as const, dueDate: '2026-10-05', amountDue: 10_000 },
    { sequence: 6, kind: 'periodic' as const, dueDate: '2026-11-05', amountDue: 10_000 },
  ];

  it('dates fixes : l’échéancier à venir, rien de versé ; engagement et reste = somme, aucun retard', () => {
    const lines = unsignedEnrollmentInstallments(schedule, 'fixed');
    expect(lines.every((l) => l.status === 'upcoming' && l.amountPaid === 0 && l.amountPending === 0)).toBe(true);
    expect(enrollmentTotals(lines, 'fixed')).toEqual({ paid: 0, remaining: 70_000, lateAmount: 0, commitment: 70_000 });
  });

  it('cycle roulant : aucun terme, rien', () => {
    expect(unsignedEnrollmentInstallments(schedule, 'rolling')).toEqual([]);
  });

  it('montant invalide refusé ; versé supérieur au dû refusé par enrollmentLate', () => {
    expect(() =>
      unsignedEnrollmentInstallments(
        [{ sequence: 0, kind: 'entry_fee', dueDate: '2026-10-05', amountDue: -1 }],
        'fixed',
      ),
    ).toThrow(DomainError);
    expect(() => enrollmentLate([line('2026-08-05', 10_000, 'late', 20_000)])).toThrow(DomainError);
  });
});
