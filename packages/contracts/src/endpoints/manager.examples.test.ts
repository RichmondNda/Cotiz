import { describe, expect, it } from 'vitest';
import {
  CreateEnrollmentInput,
  CreateProjectInput,
  Grid,
  LookupResult,
  ManagerDashboard,
  PaymentsQuery,
  SendReminderInput,
  ValidatePaymentInput,
} from '../index.js';

// Exemples tirés de docs/specs/seed-reference.yaml (Entraide Yopougon, Centre communautaire, Moussa).

const xof = (amount: number) => ({ amount, currency: 'XOF' });
const uuid = (n: number) => `01928f3e-6a7b-7c3d-9e4f-${String(n).padStart(12, '0')}`;
const moussa = { id: uuid(1), firstName: 'Moussa', lastName: 'Diarra' };

describe('espace gestionnaire', () => {
  it('pr.create : Centre communautaire, 50 000 F d’entrée puis 25 000 F le 5 de chaque mois', () => {
    const projet = {
      name: 'Centre communautaire',
      description: 'Construction du centre.',
      requiredSubscribers: null,
      entryFee: xof(50000),
      installmentAmount: xof(25000),
      frequency: 'monthly',
      dueDay: 5,
      scheduleType: 'fixed',
      startDate: '2026-03-01',
      endDate: '2027-08-31',
      graceDays: 5,
      paymentMethods: [{ paymentMethodId: uuid(9), instructionsOverride: 'Indiquez votre nom en référence' }],
    };
    expect(CreateProjectInput.safeParse(projet).success).toBe(true);
    expect(CreateProjectInput.safeParse({ ...projet, installmentAmount: 25000 }).success).toBe(false);
    expect(CreateProjectInput.safeParse({ ...projet, installmentAmount: xof(25000.5) }).success).toBe(false);
    expect(CreateProjectInput.safeParse({ ...projet, dueDay: 32 }).success).toBe(false);
  });

  it('mb.lookup : compte existant présenté par prénom et initiale', () => {
    const ok = {
      result: 'existing_user',
      person: { id: uuid(1), firstName: 'Moussa', lastInitial: 'D' },
      associationsCount: 2,
    };
    expect(LookupResult.parse(ok)).toEqual(ok);
    expect(LookupResult.safeParse({ ...ok, person: { ...ok.person, lastInitial: 'Diarra' } }).success).toBe(false);
  });

  it('en.create : compte existant (userId) ou nouveau compte (identité)', () => {
    expect(CreateEnrollmentInput.safeParse({ userId: uuid(1) }).success).toBe(true);
    expect(
      CreateEnrollmentInput.safeParse({ phone: '+2250122334455', firstName: 'Fatou', lastName: 'Traoré' }).success,
    ).toBe(true);
    expect(CreateEnrollmentInput.safeParse({ phone: '+2250122334455' }).success).toBe(false);
  });

  it('lg.grid : Moussa, août et septembre en retard, octobre à venir', () => {
    const cell = (n: number, status: string) => ({
      installmentId: uuid(100 + n),
      sequence: n,
      status,
      amountDue: xof(25000),
      amountPaid: xof(0),
      amountPending: xof(0),
    });
    const grid = {
      columns: [6, 7, 8].map((n) => ({
        sequence: n,
        kind: 'periodic',
        dueDate: `2026-${String(n + 2).padStart(2, '0')}-05`,
      })),
      items: [
        {
          enrollmentId: uuid(50),
          member: moussa,
          standing: 'late',
          remaining: xof(325000),
          cells: [cell(6, 'late'), cell(7, 'late'), cell(8, 'upcoming')],
        },
      ],
      nextCursor: null,
      total: 52,
      facets: { standing: { late: 14, up_to_date: 38 } },
    };
    expect(Grid.parse(grid)).toEqual(grid);
  });

  it('lg.pay.list : file de validation par défaut', () => {
    expect(PaymentsQuery.parse({})).toEqual({ limit: 25, status: 'pending' });
    expect(PaymentsQuery.parse({ status: 'all', olderThanDays: '5' })).toMatchObject({
      status: 'all',
      olderThanDays: 5,
    });
  });

  it('lg.pay.validate : répartition ajustée et montant reçu en Money', () => {
    const body = {
      allocations: [
        { installmentId: uuid(106), amount: xof(25000) },
        { installmentId: uuid(107), amount: xof(25000) },
      ],
      amountReceived: xof(50000),
    };
    expect(ValidatePaymentInput.parse(body)).toEqual(body);
    expect(ValidatePaymentInput.parse({})).toEqual({});
    expect(ValidatePaymentInput.safeParse({ allocations: [] }).success).toBe(false);
  });

  it('as.dashboard : chiffres attendus de seed-reference.yaml', () => {
    const dashboard = {
      collectedThisMonth: xof(1240000),
      expectedThisMonth: xof(1300000),
      paymentsToReview: { count: 6, oldestDeclaredAt: '2026-09-26T09:00:00Z' },
      lateSubscribers: { count: 14, activeCount: 52 },
      recoveryRate: 0.82,
      subscribersCount: 52,
      projectsCount: 3,
      activationCodesToHand: 1,
      unsignedContracts: [],
      monthlyCollection: [],
      projects: [],
      latestPayments: [],
    };
    expect(ManagerDashboard.parse(dashboard)).toEqual(dashboard);
    expect(ManagerDashboard.safeParse({ ...dashboard, recoveryRate: 82 }).success).toBe(false);
  });

  it('rm.send : tous les retardataires d’un projet ou sélection libre', () => {
    expect(SendReminderInput.safeParse({ projectId: uuid(2), allLate: true }).success).toBe(true);
    expect(SendReminderInput.safeParse({ userIds: [uuid(1)] }).success).toBe(true);
    expect(SendReminderInput.safeParse({ userIds: [] }).success).toBe(false);
  });
});
