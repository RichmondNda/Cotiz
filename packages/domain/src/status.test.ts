import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  DUE_SOON_DAYS,
  dueDateTurningLateOn,
  dueSoonDate,
  hourIn,
  installmentStatus,
  isManagersDigestTime,
  lateSince,
  lateSinceOf,
  lateStart,
  memberStanding,
  minutesIn,
  overallStanding,
  todayIn,
} from './index.js';
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
  lateFrom: null,
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

describe('lateFrom — retard daté de la signature (domain-rules § 6)', () => {
  // Échéance du 5 octobre, signée le 20 novembre : en retard au plus tôt après la signature + le délai de grâce.
  const signedLate = { ...base, lateFrom: '2026-11-20' };

  it('le retard part de max(échéance, lateFrom) + délai de grâce + 1 jour', () => {
    expect(lateSince(signedLate, 5)).toBe('2026-11-26');
    expect(lateSince(signedLate, 0)).toBe('2026-11-21');
    // lateFrom avant l'échéance : sans effet.
    expect(lateSince({ ...base, lateFrom: '2026-09-01' }, 5)).toBe('2026-10-11');
  });

  it('installmentStatus : échue mais pas en retard avant la fin de la grâce comptée de la signature', () => {
    expect(installmentStatus(signedLate, '2026-11-20', 5)).toBe('due');
    expect(installmentStatus(signedLate, '2026-11-25', 5)).toBe('due');
    expect(installmentStatus(signedLate, '2026-11-26', 5)).toBe('late');
    expect(installmentStatus({ ...signedLate, amountPaid: 1000 }, '2026-11-25', 5)).toBe('partial');
  });

  it('lateSinceOf : date de retard persistée comptée de la signature', () => {
    expect(lateSinceOf(signedLate, '2026-11-25', 5)).toBeNull();
    expect(lateSinceOf(signedLate, '2026-12-01', 5)).toBe('2026-11-26');
  });

  it('lateStart = max(échéance, lateFrom) ; dueDateTurningLateOn en est l’inverse', () => {
    expect(lateStart(signedLate)).toBe('2026-11-20');
    expect(lateStart(base)).toBe('2026-10-05');
    expect(dueDateTurningLateOn(lateSince(signedLate, 5), 5)).toBe(lateStart(signedLate));
  });

  it('lateFrom invalide → DomainError', () => {
    expect(() => lateSince({ ...base, lateFrom: '2026-02-30' }, 5)).toThrow(
      expect.objectContaining({ code: 'invalid_date' }),
    );
  });

  it('propriété : jamais en retard plus tôt que sans lateFrom, et jamais avant lateFrom + grâce + 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (grace, dueOffset, signOffset) => {
          const dueDate = new Date(Date.UTC(2025, 0, 1 + dueOffset)).toISOString().slice(0, 10);
          const lateFrom = new Date(Date.UTC(2025, 0, 1 + signOffset)).toISOString().slice(0, 10);
          const withFrom = lateSince({ ...base, dueDate, lateFrom }, grace);
          expect(withFrom >= lateSince({ ...base, dueDate }, grace)).toBe(true);
          expect(withFrom >= lateSince({ ...base, dueDate: lateFrom }, grace)).toBe(true);
        },
      ),
    );
  });
});

describe('hourIn', () => {
  it('heure locale du fuseau, minuit = 0, heure d’été comprise', () => {
    expect(hourIn('Africa/Abidjan', new Date('2026-03-11T01:30:00Z'))).toBe(1);
    expect(hourIn('Africa/Abidjan', new Date('2026-03-11T00:00:00Z'))).toBe(0);
    expect(hourIn('Europe/Paris', new Date('2026-03-21T00:00:00Z'))).toBe(1);
    expect(hourIn('Europe/Paris', new Date('2026-07-01T23:00:00Z'))).toBe(1);
    expect(hourIn('America/New_York', new Date('2026-11-06T06:00:00Z'))).toBe(1);
  });
});

describe('lateSinceOf (late_since persisté)', () => {
  it('posée après le délai de grâce, même déclarée ; jamais soldée, dispensée, annulée, ni avant la date', () => {
    expect(lateSinceOf(base, '2026-10-11', 5)).toBe('2026-10-11');
    expect(lateSinceOf(base, '2026-10-10', 5)).toBeNull();
    expect(lateSinceOf({ ...base, amountPending: 10000 }, '2026-11-01', 5)).toBe('2026-10-11');
    expect(lateSinceOf({ ...base, amountPaid: 5000 }, '2026-11-01', 5)).toBe('2026-10-11');
    expect(lateSinceOf({ ...base, amountPaid: base.amountDue }, '2026-11-01', 5)).toBeNull();
    expect(lateSinceOf({ ...base, status: 'waived' }, '2026-11-01', 5)).toBeNull();
    expect(lateSinceOf({ ...base, status: 'canceled' }, '2026-11-01', 5)).toBeNull();
  });

  it('statut late ⇒ date posée ; date posée ⇒ late ou declared', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 25000 }),
        fc.integer({ min: 0, max: 25000 }),
        (grace, offset, paid, pending) => {
          const today = new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10);
          const x = {
            ...base,
            amountPaid: paid,
            amountPending: Math.min(pending, base.amountDue - Math.min(paid, base.amountDue)),
          };
          const status = installmentStatus(x, today, grace);
          const since = lateSinceOf(x, today, grace);
          if (status === 'late') expect(since).toBe(lateSince(x, grace));
          if (since !== null) expect(['late', 'declared']).toContain(status);
        },
      ),
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

describe('todayIn', () => {
  it('date du jour dans le fuseau de l’association, y compris entre minuit UTC et minuit local', () => {
    const lateEvening = new Date('2026-09-29T23:30:00Z');
    expect(todayIn('Africa/Abidjan', lateEvening)).toBe('2026-09-29');
    expect(todayIn('Africa/Douala', lateEvening)).toBe('2026-09-30');
    expect(todayIn(undefined, lateEvening)).toBe('2026-09-29');
    expect(todayIn('America/Port-au-Prince', new Date('2026-09-30T02:00:00Z'))).toBe('2026-09-29');
  });
});

describe('overallStanding — situation globale d’un souscripteur (le pire de ses projets)', () => {
  it.each([
    [['up_to_date', 'late'], 'late'],
    [['late', 'signature_required'], 'late'],
    [['up_to_date', 'signature_required'], 'signature_required'],
    [['activation_pending', 'signature_required'], 'signature_required'],
    [['up_to_date', 'activation_pending'], 'activation_pending'],
    [['withdrawn', 'up_to_date'], 'up_to_date'],
    [['withdrawn', 'withdrawn'], 'withdrawn'],
    [['withdrawn', 'late'], 'late'],
  ] as const)('%j → %s', (standings, expected) => {
    expect(overallStanding(standings)).toBe(expected);
  });

  it('aucune inscription : erreur (un membre de l’annuaire en a toujours une)', () => {
    expect(() => overallStanding([])).toThrow();
  });
});

describe('dueSoonDate (rappel J-3, jobs.yaml installments.due-soon)', () => {
  it('trois jours après le jour de l’association, au-delà des fins de mois et d’année', () => {
    expect(DUE_SOON_DAYS).toBe(3);
    expect(dueSoonDate('2026-10-02')).toBe('2026-10-05');
    expect(dueSoonDate('2026-02-27')).toBe('2026-03-02');
    expect(dueSoonDate('2028-02-27')).toBe('2028-03-01');
    expect(dueSoonDate('2026-12-30')).toBe('2027-01-02');
  });

  it('date invalide refusée', () => {
    expect(() => dueSoonDate('2026-02-30')).toThrow();
  });
});

describe('récapitulatif gestionnaire (managers.digest, 07:30 locale)', () => {
  it('minutesIn : minutes depuis minuit dans le fuseau', () => {
    expect(minutesIn('Africa/Abidjan', new Date('2026-09-25T07:29:00Z'))).toBe(449);
    expect(minutesIn('Africa/Lagos', new Date('2026-09-25T06:30:00Z'))).toBe(450);
    expect(minutesIn('Africa/Abidjan', new Date('2026-09-25T00:00:00Z'))).toBe(0);
  });

  it('isManagersDigestTime : à partir de 07:30 locale, jusqu’à minuit', () => {
    expect(isManagersDigestTime('Africa/Abidjan', new Date('2026-09-25T07:29:59Z'))).toBe(false);
    expect(isManagersDigestTime('Africa/Abidjan', new Date('2026-09-25T07:30:00Z'))).toBe(true);
    expect(isManagersDigestTime('Africa/Abidjan', new Date('2026-09-25T23:59:00Z'))).toBe(true);
    // Lagos (UTC+1) : 06:30 UTC = 07:30 locale ; 23:30 UTC = 00:30 le lendemain.
    expect(isManagersDigestTime('Africa/Lagos', new Date('2026-09-25T06:30:00Z'))).toBe(true);
    expect(isManagersDigestTime('Africa/Lagos', new Date('2026-09-25T23:30:00Z'))).toBe(false);
  });

  it('dueDateTurningLateOn : l’échéance dont le premier jour de retard est ce jour (inverse de lateSince)', () => {
    expect(dueDateTurningLateOn('2026-09-11', 5)).toBe('2026-09-05');
    expect(dueDateTurningLateOn('2026-03-01', 0)).toBe('2026-02-28');
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90 }), fc.integer({ min: 0, max: 3000 }), (grace, offset) => {
        const due = addDaysForTest('2026-01-01', offset);
        expect(dueDateTurningLateOn(lateSince({ dueDate: due }, grace), grace)).toBe(due);
      }),
    );
    expect(() => dueDateTurningLateOn('2026-09-11', -1)).toThrow(DomainError);
  });
});

function addDaysForTest(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
