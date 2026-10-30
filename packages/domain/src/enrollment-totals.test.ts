import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, enrollmentTotals } from './index.js';
import type { InstallmentStatus } from './index.js';

const line = (amountDue: number, status: InstallmentStatus, amountPaid = 0) => ({ amountDue, amountPaid, status });

describe('enrollmentTotals : versé, reste, retard et engagement d’une inscription', () => {
  it('nouvelle inscription à dates fixes : rien de versé, engagement = somme des échéances', () => {
    const totals = enrollmentTotals([line(10_000, 'due'), line(25_000, 'late'), line(25_000, 'upcoming')], 'fixed');
    expect(totals).toEqual({ paid: 0, remaining: 60_000, lateAmount: 25_000, commitment: 60_000 });
  });

  it('cycle roulant : pas d’engagement, reste = échéances générées moins le versé', () => {
    expect(enrollmentTotals([line(25_000, 'paid', 25_000), line(25_000, 'upcoming')], 'rolling')).toEqual({
      paid: 25_000,
      remaining: 25_000,
      lateAmount: 0,
      commitment: null,
    });
  });

  it('échéances annulées ou dispensées : hors de tous les totaux, même partiellement versées', () => {
    const totals = enrollmentTotals(
      [line(25_000, 'canceled', 5_000), line(25_000, 'waived'), line(25_000, 'partial', 10_000)],
      'fixed',
    );
    expect(totals).toEqual({ paid: 10_000, remaining: 15_000, lateAmount: 0, commitment: 25_000 });
  });

  it('retard : reste dû des seules échéances en retard (versé partiel déduit, déclaration non déduite)', () => {
    const totals = enrollmentTotals(
      [line(25_000, 'late', 5_000), line(25_000, 'declared'), line(25_000, 'due')],
      'fixed',
    );
    expect(totals.lateAmount).toBe(20_000);
  });

  it('aucune échéance : tout à zéro', () => {
    expect(enrollmentTotals([], 'fixed')).toEqual({ paid: 0, remaining: 0, lateAmount: 0, commitment: 0 });
    expect(enrollmentTotals([], 'rolling')).toEqual({ paid: 0, remaining: 0, lateAmount: 0, commitment: null });
  });

  it.each([[line(-1, 'due')], [line(1.5, 'due')], [line(10, 'paid', 11)], [line(Number.MAX_SAFE_INTEGER + 1, 'due')]])(
    'montant invalide (%j) : invalid_amount',
    (bad) => {
      expect(() => enrollmentTotals([bad], 'fixed')).toThrow(DomainError);
    },
  );

  it('total non représentable en entier sûr : invalid_amount', () => {
    const big = line(Number.MAX_SAFE_INTEGER, 'due');
    expect(() => enrollmentTotals([big, big], 'fixed')).toThrow(DomainError);
  });

  const statuses: InstallmentStatus[] = [
    'upcoming',
    'due',
    'declared',
    'partial',
    'paid',
    'late',
    'waived',
    'canceled',
  ];
  const arbLine = fc
    .integer({ min: 1, max: 1_000_000 })
    .chain((due) => fc.tuple(fc.constant(due), fc.integer({ min: 0, max: due }), fc.constantFrom(...statuses)))
    .map(([due, paid, status]) => line(due, status, paid));
  const arbLines = fc.array(arbLine, { maxLength: 40 });
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  it('propriété : égal à un calcul de référence (annulées et dispensées exclues, retard = reste des seules late)', () => {
    fc.assert(
      fc.property(arbLines, fc.constantFrom('fixed' as const, 'rolling' as const), (lines, type) => {
        const kept = lines.filter((l) => l.status !== 'canceled' && l.status !== 'waived');
        const paid = sum(kept.map((l) => l.amountPaid));
        const due = sum(kept.map((l) => l.amountDue));
        const late = sum(kept.filter((l) => l.status === 'late').map((l) => l.amountDue - l.amountPaid));
        expect(enrollmentTotals(lines, type)).toEqual({
          paid,
          remaining: due - paid,
          lateAmount: late,
          commitment: type === 'fixed' ? due : null,
        });
      }),
    );
  });

  it('propriété : ajouter une échéance annulée ou dispensée ne change aucun total', () => {
    fc.assert(
      fc.property(
        arbLines,
        arbLine,
        fc.constantFrom('waived' as const, 'canceled' as const),
        (lines, extra, status) => {
          expect(enrollmentTotals([...lines, { ...extra, status }], 'fixed')).toEqual(enrollmentTotals(lines, 'fixed'));
        },
      ),
    );
  });

  it('propriété : 0 ≤ retard ≤ reste ≤ engagement', () => {
    fc.assert(
      fc.property(arbLines, (lines) => {
        const t = enrollmentTotals(lines, 'fixed');
        expect(t.lateAmount).toBeGreaterThanOrEqual(0);
        expect(t.lateAmount).toBeLessThanOrEqual(t.remaining);
        expect(t.remaining).toBeLessThanOrEqual(t.commitment ?? 0);
      }),
    );
  });
});
