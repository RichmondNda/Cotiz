import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { installmentStatus, lateSince, memberStanding } from './index.js';
import type { InstallmentState, InstallmentStatus, LedgerInstallment } from './index.js';
import { loadVectors } from './test-vectors.js';

interface StatusCase {
  name: string;
  input: { installment: LedgerInstallment; today: string; graceDays: number };
  output: InstallmentStatus;
}
const vectors = loadVectors<StatusCase>('status');

describe('installmentStatus — vecteurs status.json', () => {
  it('le fichier décrit installmentStatus', () => {
    expect(vectors.function).toBe('installmentStatus');
  });
  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(installmentStatus(c.input.installment, c.input.today, c.input.graceDays)).toBe(c.output);
  });
});

const base: InstallmentState = {
  dueDate: '2026-10-05',
  amountDue: 25000,
  amountPaid: 0,
  amountPending: 0,
  status: 'upcoming',
};

describe('installmentStatus — ordre d’évaluation', () => {
  it('waived et canceled persistés gagnent sur tout', () => {
    expect(installmentStatus({ ...base, status: 'canceled', amountPaid: 25000 }, '2027-01-01', 5)).toBe('canceled');
    expect(installmentStatus({ ...base, status: 'waived', amountPending: 100 }, '2027-01-01', 5)).toBe('waived');
  });

  it('paid avant declared ; declared avant late', () => {
    expect(installmentStatus({ ...base, amountPaid: 25000, amountPending: 1 }, '2027-01-01', 5)).toBe('paid');
    expect(installmentStatus({ ...base, amountPending: 1 }, '2027-01-01', 5)).toBe('declared');
  });

  it('le statut persisté (hors waived/canceled) est recalculé', () => {
    expect(installmentStatus({ ...base, status: 'paid' }, '2026-09-01', 5)).toBe('upcoming');
  });

  it('entrées invalides → DomainError', () => {
    expect(() => installmentStatus(base, '2026-13-01', 5)).toThrow(expect.objectContaining({ code: 'invalid_date' }));
    expect(() => installmentStatus(base, '2026-10-01', -1)).toThrow(
      expect.objectContaining({ code: 'invalid_grace_days' }),
    );
    expect(() => installmentStatus(base, '2026-10-01', 1.5)).toThrow(
      expect.objectContaining({ code: 'invalid_grace_days' }),
    );
    expect(() => installmentStatus({ ...base, amountPaid: 0.5 }, '2026-10-01', 5)).toThrow(
      expect.objectContaining({ code: 'invalid_amount' }),
    );
  });
});

describe('lateSince', () => {
  it('= échéance + délai de grâce + 1 jour', () => {
    expect(lateSince(base, 5)).toBe('2026-10-11');
    expect(lateSince(base, 0)).toBe('2026-10-06');
    expect(lateSince({ ...base, dueDate: '2026-12-31' }, 0)).toBe('2027-01-01');
  });

  it('cohérent avec installmentStatus : late à partir de lateSince, pas la veille', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 3000 }), (grace, offset) => {
        const dueDate = new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10);
        const x = { ...base, dueDate };
        const since = lateSince(x, grace);
        const before = new Date(`${since}T00:00:00Z`);
        before.setUTCDate(before.getUTCDate() - 1);
        expect(installmentStatus(x, since, grace)).toBe('late');
        expect(installmentStatus(x, before.toISOString().slice(0, 10), grace)).toBe('due');
      }),
    );
  });
});

describe('memberStanding', () => {
  it.each([
    ['pending_signature', ['late'], 'signature_required'],
    ['withdrawn', ['late'], 'withdrawn'],
    ['active', ['paid', 'late', 'upcoming'], 'late'],
    ['active', ['paid', 'partial', 'declared', 'due'], 'up_to_date'],
    ['completed', ['late'], 'late'],
    ['completed', [], 'up_to_date'],
  ] as const)('%s + %j → %s', (enrollment, statuses, expected) => {
    expect(memberStanding(enrollment, statuses)).toBe(expected);
  });

  it('statut d’inscription inconnu → invalid_status', () => {
    expect(() => memberStanding('frozen' as 'active', [])).toThrow(expect.objectContaining({ code: 'invalid_status' }));
  });
});
