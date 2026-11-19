import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates.js';
import {
  billingRun,
  DomainError,
  invoiceDueOn,
  invoiceNumber,
  isInvoiceOverdue,
  periodEnd,
  subscriptionStatusAfterInvoices,
} from './index.js';
import type { BillingRunInput } from './index.js';

const monthly = (over: Partial<BillingRunInput> = {}): BillingRunInput => ({
  status: 'active',
  billingPeriod: 'monthly',
  currentPeriodStart: '2026-11-01',
  currentPeriodEnd: '2026-11-30',
  price: 10_000,
  invoicedPeriodStarts: [],
  today: '2026-11-13',
  ...over,
});

describe('invoiceNumber', () => {
  it('CTZ-<année>-<numéro sur 6 chiffres>', () => {
    expect(invoiceNumber(2026, 1)).toBe('CTZ-2026-000001');
    expect(invoiceNumber(2027, 123_456)).toBe('CTZ-2027-123456');
  });

  it('au-delà de 999 999, le numéro s’allonge sans jamais se répéter', () => {
    expect(invoiceNumber(2030, 1_000_000)).toBe('CTZ-2030-1000000');
  });

  it('refuse un numéro de séquence non entier ou nul', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => invoiceNumber(2026, bad)).toThrow(DomainError);
    }
  });

  it('deux numéros de séquence différents ne donnent jamais le même numéro', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2026, max: 2100 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (year, a, b) => a === b || invoiceNumber(year, a) !== invoiceNumber(year, b),
      ),
    );
  });
});

describe('invoiceDueOn / isInvoiceOverdue', () => {
  it('échéance : 15 jours après le premier jour de la période', () => {
    expect(invoiceDueOn('2026-11-01')).toBe('2026-11-16');
    expect(invoiceDueOn('2026-12-20')).toBe('2027-01-04');
  });

  it('émise après le début de sa période : 15 jours après son émission (jamais en retard dès l’émission)', () => {
    expect(invoiceDueOn('2026-11-01', '2026-11-13')).toBe('2026-11-28');
    expect(invoiceDueOn('2026-11-01', '2026-11-01')).toBe('2026-11-16');
    // Émise avant sa période (impossible en pratique) : le début de période fait foi.
    expect(invoiceDueOn('2026-11-01', '2026-10-30')).toBe('2026-11-16');
  });

  it('impayée le lendemain de l’échéance, pas le jour même', () => {
    expect(isInvoiceOverdue({ status: 'open', dueOn: '2026-11-16' }, '2026-11-16')).toBe(false);
    expect(isInvoiceOverdue({ status: 'open', dueOn: '2026-11-16' }, '2026-11-17')).toBe(true);
  });

  it('seule une facture ouverte devient impayée', () => {
    for (const status of ['draft', 'paid', 'void', 'overdue'] as const) {
      expect(isInvoiceOverdue({ status, dueOn: '2026-11-16' }, '2026-12-31')).toBe(false);
    }
  });
});

describe('billingRun — période en cours', () => {
  it('abonnement actif sans facture de la période : une facture, échéance 15 jours après son émission', () => {
    expect(billingRun(monthly())).toEqual({
      period: null,
      invoices: [{ periodStart: '2026-11-01', periodEnd: '2026-11-30', amount: 10_000, dueOn: '2026-11-28' }],
    });
    expect(billingRun(monthly({ today: '2026-11-01' })).invoices[0]?.dueOn).toBe('2026-11-16');
  });

  it('période déjà facturée : rien (rejeu de la tâche)', () => {
    expect(billingRun(monthly({ invoicedPeriodStarts: ['2026-11-01'] }))).toEqual({ period: null, invoices: [] });
  });

  it('impayé (past_due) : la période en cours est facturée comme pour un abonnement actif', () => {
    expect(billingRun(monthly({ status: 'past_due' })).invoices).toHaveLength(1);
  });

  it('plan à 0 F : aucune facture', () => {
    expect(billingRun(monthly({ price: 0 }))).toEqual({ period: null, invoices: [] });
  });

  it('essai en cours : aucune facture', () => {
    expect(billingRun(monthly({ status: 'trialing' }))).toEqual({ period: null, invoices: [] });
  });

  it('suspendu ou résilié : ni facture ni changement de période', () => {
    for (const status of ['suspended', 'canceled'] as const) {
      expect(billingRun(monthly({ status, today: '2027-03-01' }))).toEqual({ period: null, invoices: [] });
    }
  });
});

describe('billingRun — mise en service (aucune facture encore émise pour l’abonnement)', () => {
  it('périodes antérieures non facturées : seule celle du jour l’est, la période est réalignée', () => {
    const run = billingRun(monthly({ currentPeriodStart: '2026-06-01', currentPeriodEnd: '2026-06-30' }));
    expect(run).toEqual({
      period: { status: 'active', currentPeriodStart: '2026-11-01', currentPeriodEnd: '2026-11-30' },
      invoices: [{ periodStart: '2026-11-01', periodEnd: '2026-11-30', amount: 10_000, dueOn: '2026-11-28' }],
    });
  });

  it('impayé à la mise en service : rien de rétroactif, statut gardé', () => {
    const run = billingRun(
      monthly({ status: 'past_due', currentPeriodStart: '2026-09-01', currentPeriodEnd: '2026-09-30' }),
    );
    expect(run.invoices.map((i) => i.periodStart)).toEqual(['2026-11-01']);
    expect(run.period?.status).toBe('past_due');
  });

  it('essai fini avant la mise en service : actif, seule la période du jour facturée', () => {
    const run = billingRun(
      monthly({ status: 'trialing', currentPeriodStart: '2026-09-01', currentPeriodEnd: '2026-09-14' }),
    );
    expect(run.period).toEqual({ status: 'active', currentPeriodStart: '2026-10-15', currentPeriodEnd: '2026-11-14' });
    expect(run.invoices).toEqual([
      { periodStart: '2026-10-15', periodEnd: '2026-11-14', amount: 10_000, dueOn: '2026-11-28' },
    ]);
  });

  it('propriété : au plus une facture, celle de la période qui contient le jour, jamais échue à l’émission', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('monthly' as const, 'yearly' as const),
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 0, max: 2000 }),
        (billingPeriod, startOffset, elapsed) => {
          const start = addDays('2026-01-01', startOffset);
          const today = addDays(start, elapsed);
          const run = billingRun(
            monthly({
              billingPeriod,
              currentPeriodStart: start,
              currentPeriodEnd: periodEnd(start, billingPeriod),
              today,
            }),
          );
          expect(run.invoices.length).toBeLessThanOrEqual(1);
          for (const inv of run.invoices) {
            expect(inv.periodStart <= today && today <= inv.periodEnd).toBe(true);
            expect(isInvoiceOverdue({ status: 'open', dueOn: inv.dueOn }, today)).toBe(false);
          }
        },
      ),
    );
  });
});

describe('billingRun — passage à la période suivante', () => {
  it('période échue : la suivante commence le lendemain et est facturée', () => {
    expect(billingRun(monthly({ invoicedPeriodStarts: ['2026-11-01'], today: '2026-12-01' }))).toEqual({
      period: { status: 'active', currentPeriodStart: '2026-12-01', currentPeriodEnd: '2026-12-31' },
      invoices: [{ periodStart: '2026-12-01', periodEnd: '2026-12-31', amount: 10_000, dueOn: '2026-12-16' }],
    });
  });

  it('dernier jour de la période : encore la période en cours', () => {
    expect(billingRun(monthly({ invoicedPeriodStarts: ['2026-11-01'], today: '2026-11-30' }))).toEqual({
      period: null,
      invoices: [],
    });
  });

  it('fin d’essai : statut actif, première période payante le lendemain, facturée', () => {
    expect(
      billingRun(
        monthly({
          status: 'trialing',
          currentPeriodStart: '2026-10-15',
          currentPeriodEnd: '2026-11-13',
          today: '2026-11-14',
        }),
      ),
    ).toEqual({
      period: { status: 'active', currentPeriodStart: '2026-11-14', currentPeriodEnd: '2026-12-13' },
      invoices: [{ periodStart: '2026-11-14', periodEnd: '2026-12-13', amount: 10_000, dueOn: '2026-11-29' }],
    });
  });

  it('fin d’essai sur un plan à 0 F : statut actif, aucune facture', () => {
    expect(
      billingRun(
        monthly({
          status: 'trialing',
          price: 0,
          currentPeriodStart: '2026-10-15',
          currentPeriodEnd: '2026-11-13',
          today: '2026-11-14',
        }),
      ),
    ).toEqual({
      period: { status: 'active', currentPeriodStart: '2026-11-14', currentPeriodEnd: '2026-12-13' },
      invoices: [],
    });
  });

  it('impayé : le changement de période garde past_due', () => {
    const run = billingRun(monthly({ status: 'past_due', invoicedPeriodStarts: ['2026-11-01'], today: '2026-12-02' }));
    expect(run.period).toEqual({
      status: 'past_due',
      currentPeriodStart: '2026-12-01',
      currentPeriodEnd: '2026-12-31',
    });
  });

  it('tâche arrêtée plusieurs périodes : une facture par période traversée, sans trou', () => {
    const run = billingRun(monthly({ invoicedPeriodStarts: ['2026-11-01'], today: '2027-02-10' }));
    expect(run.period).toEqual({ status: 'active', currentPeriodStart: '2027-02-01', currentPeriodEnd: '2027-02-28' });
    expect(run.invoices.map((i) => [i.periodStart, i.periodEnd])).toEqual([
      ['2026-12-01', '2026-12-31'],
      ['2027-01-01', '2027-01-31'],
      ['2027-02-01', '2027-02-28'],
    ]);
    // Émises en retard : échéance 15 jours après l'émission, aucune en retard dès l'émission.
    expect(run.invoices.map((i) => i.dueOn)).toEqual(['2027-02-25', '2027-02-25', '2027-02-25']);
  });

  it('annuel : période de 12 mois', () => {
    const run = billingRun(
      monthly({
        billingPeriod: 'yearly',
        price: 100_000,
        currentPeriodStart: '2025-11-14',
        currentPeriodEnd: '2026-11-13',
        invoicedPeriodStarts: ['2025-11-14'],
        today: '2026-11-14',
      }),
    );
    expect(run.invoices).toEqual([
      { periodStart: '2026-11-14', periodEnd: '2027-11-13', amount: 100_000, dueOn: '2026-11-29' },
    ]);
  });

  it('abonnement sans fin de période : refusé', () => {
    expect(() => billingRun(monthly({ currentPeriodEnd: null }))).toThrow(DomainError);
  });

  it('montant négatif ou non entier : refusé', () => {
    for (const price of [-1, 1.5]) expect(() => billingRun(monthly({ price }))).toThrow(DomainError);
  });

  it('propriété : périodes contiguës, chacune facturée une fois, la dernière contient le jour', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('monthly' as const, 'yearly' as const),
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 0, max: 2000 }),
        (billingPeriod, startOffset, elapsed) => {
          const start = addDays('2026-01-01', startOffset);
          const end = periodEnd(start, billingPeriod);
          const today = addDays(start, elapsed);
          const run = billingRun(
            monthly({
              billingPeriod,
              currentPeriodStart: start,
              currentPeriodEnd: end,
              invoicedPeriodStarts: [start],
              today,
            }),
          );
          const current = run.period ?? { currentPeriodStart: start, currentPeriodEnd: end };
          expect(current.currentPeriodStart <= today && today <= current.currentPeriodEnd).toBe(true);
          let previousEnd = end;
          for (const inv of run.invoices) {
            expect(inv.periodStart).toBe(addDays(previousEnd, 1));
            expect(inv.periodEnd).toBe(periodEnd(inv.periodStart, billingPeriod));
            previousEnd = inv.periodEnd;
          }
          expect(new Set(run.invoices.map((i) => i.periodStart)).size).toBe(run.invoices.length);
        },
      ),
    );
  });
});

describe('subscriptionStatusAfterInvoices', () => {
  it('une facture impayée : past_due', () => {
    expect(subscriptionStatusAfterInvoices('active', { overdueCount: 1 })).toBe('past_due');
  });

  it('plus aucune facture impayée : past_due redevient active', () => {
    expect(subscriptionStatusAfterInvoices('past_due', { overdueCount: 0 })).toBe('active');
  });

  it('les autres statuts ne changent pas', () => {
    for (const status of ['trialing', 'suspended', 'canceled'] as const) {
      expect(subscriptionStatusAfterInvoices(status, { overdueCount: 2 })).toBe(status);
      expect(subscriptionStatusAfterInvoices(status, { overdueCount: 0 })).toBe(status);
    }
    expect(subscriptionStatusAfterInvoices('active', { overdueCount: 0 })).toBe('active');
  });
});
