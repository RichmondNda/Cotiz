import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, generateSchedule } from './index.js';
import type { ScheduleInput, ScheduleLine } from './index.js';
import { loadVectors } from './test-vectors.js';

interface ScheduleCase {
  name: string;
  description: string;
  input: ScheduleInput;
  output?: ScheduleLine[];
  error?: { code: string };
}
const vectors = loadVectors<ScheduleCase>('schedule');

function run(input: ScheduleInput): ScheduleLine[] | { code: string } {
  try {
    return generateSchedule(input);
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code };
    throw e;
  }
}

describe('generateSchedule — vecteurs schedule.json', () => {
  it('15 cas, dont 4 erreurs', () => {
    expect(vectors.function).toBe('generateSchedule');
    expect(vectors.cases).toHaveLength(15);
    expect(vectors.cases.filter((c) => c.error)).toHaveLength(4);
  });

  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(run(c.input)).toEqual(c.output ?? c.error);
  });
});

describe('generateSchedule — contrôles des entrées', () => {
  const base: ScheduleInput = {
    installmentAmount: 25000,
    frequency: 'monthly',
    dueDay: 5,
    scheduleType: 'fixed',
    startDate: '2026-03-01',
    endDate: '2026-12-31',
  };
  const code = (patch: Partial<Record<keyof ScheduleInput, unknown>>) => run({ ...base, ...patch } as ScheduleInput);

  it.each([
    [{ installmentAmount: -1 }, 'invalid_amount'],
    [{ installmentAmount: 2500.5 }, 'invalid_amount'],
    [{ installmentAmount: 2 ** 53 }, 'invalid_amount'],
    [{ entryFeeAmount: -1 }, 'invalid_amount'],
    [{ entryFeeAmount: 0.5 }, 'invalid_amount'],
    [{ frequency: 'daily' }, 'invalid_frequency'],
    [{ dueDay: 0 }, 'invalid_due_day'],
    [{ dueDay: 32 }, 'invalid_due_day'],
    [{ dueDay: 5.5 }, 'invalid_due_day'],
    [{ frequency: 'weekly', dueDay: 8 }, 'invalid_due_day'],
    [{ scheduleType: 'flexible' }, 'invalid_schedule_type'],
    [{ startDate: '2026-02-30' }, 'invalid_date'],
    [{ endDate: '31/12/2026' }, 'invalid_date'],
    [{ enrolledFrom: '2026-13-01' }, 'invalid_date'],
    [{ scheduleType: 'rolling', endDate: undefined, horizon: 0 }, 'invalid_horizon'],
    [{ scheduleType: 'rolling', endDate: undefined, horizon: 1.5 }, 'invalid_horizon'],
  ])('%o → %s', (patch, expected) => {
    expect(code(patch)).toEqual({ code: expected });
  });

  it('fonds d’entrée à 0 ou absent : aucune échéance de fonds d’entrée', () => {
    const lines = generateSchedule({ ...base, entryFeeAmount: 0 });
    expect(lines.some((l) => l.kind === 'entry_fee')).toBe(false);
    expect(lines).toEqual(generateSchedule(base));
  });

  it('entrée après la fin du projet : aucune échéance, pas de fonds d’entrée', () => {
    expect(generateSchedule({ ...base, entryFeeAmount: 50000, enrolledFrom: '2027-01-01' })).toEqual([]);
  });

  it('entrée avant le début : traitée comme le début du projet', () => {
    expect(generateSchedule({ ...base, enrolledFrom: '2025-01-01' })).toEqual(generateSchedule(base));
  });

  it('cycle roulant : la date de fin est ignorée ; horizon personnalisé', () => {
    const rolling = { ...base, scheduleType: 'rolling' as const, horizon: 3 };
    expect(generateSchedule(rolling)).toHaveLength(3);
    expect(generateSchedule({ ...rolling, endDate: '2026-03-02' })).toHaveLength(3);
  });

  it('hebdomadaire : premier jour ISO ≥ début, puis tous les 7 jours', () => {
    const lines = generateSchedule({ ...base, frequency: 'weekly', dueDay: 7, endDate: '2026-03-15' });
    expect(lines.map((l) => l.dueDate)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15']);
  });
});

describe('generateSchedule — propriétés', () => {
  const day = (from: string, span: number) =>
    fc.integer({ min: 0, max: span }).map((n) => {
      const d = new Date(`${from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    });
  const input = fc
    .record({
      installmentAmount: fc.integer({ min: 1, max: 10_000_000 }),
      entryFeeAmount: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: undefined }),
      frequency: fc.constantFrom('weekly', 'monthly', 'quarterly', 'semiannual', 'annual'),
      dueDay: fc.integer({ min: 1, max: 31 }),
      scheduleType: fc.constantFrom('fixed', 'rolling'),
      startDate: day('2024-01-01', 1500),
      length: fc.integer({ min: 0, max: 1500 }),
      offset: fc.integer({ min: -30, max: 1800 }),
      horizon: fc.option(fc.integer({ min: 1, max: 24 }), { nil: undefined }),
    })
    .map(({ length, offset, ...i }) => {
      const shift = (d: string, n: number) => {
        const x = new Date(`${d}T00:00:00Z`);
        x.setUTCDate(x.getUTCDate() + n);
        return x.toISOString().slice(0, 10);
      };
      const dueDay = i.frequency === 'weekly' ? ((i.dueDay - 1) % 7) + 1 : i.dueDay;
      const result: ScheduleInput = {
        ...i,
        dueDay,
        endDate: i.scheduleType === 'fixed' ? shift(i.startDate, length) : undefined,
        enrolledFrom: shift(i.startDate, offset),
      };
      return result;
    });

  it('dates strictement croissantes, jamais avant enrolledFrom ni avant startDate', () => {
    fc.assert(
      fc.property(input, (i) => {
        const periodic = generateSchedule(i).filter((l) => l.kind === 'periodic');
        periodic.slice(1).forEach((line, k) => {
          const previous = periodic[k];
          expect(previous && line.dueDate > previous.dueDate).toBe(true);
          expect(line.sequence).toBe((previous?.sequence ?? -1) + 1);
        });
        for (const l of periodic) {
          expect(l.dueDate >= (i.enrolledFrom ?? i.startDate)).toBe(true);
          expect(l.dueDate >= i.startDate).toBe(true);
          if (i.endDate && i.scheduleType === 'fixed') expect(l.dueDate <= i.endDate).toBe(true);
          expect(l.amountDue).toBe(i.installmentAmount);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('numérotation du projet identique pour tous : une entrée tardive est une suite de l’échéancier complet', () => {
    fc.assert(
      fc.property(input, (i) => {
        fc.pre(i.scheduleType === 'fixed');
        const full = generateSchedule({ ...i, enrolledFrom: undefined }).filter((l) => l.kind === 'periodic');
        const late = generateSchedule(i).filter((l) => l.kind === 'periodic');
        const bySequence = new Map(full.map((l) => [l.sequence, l]));
        for (const l of late) expect(bySequence.get(l.sequence)).toEqual(l);
        if (late.length) expect(late.at(-1)).toEqual(full.at(-1));
      }),
      { numRuns: 500 },
    );
  });

  it('fonds d’entrée : séquence 0, en tête, à la première date du souscripteur', () => {
    fc.assert(
      fc.property(input, (i) => {
        const lines = generateSchedule(i);
        const fees = lines.filter((l) => l.kind === 'entry_fee');
        const periodic = lines.filter((l) => l.kind === 'periodic');
        if (!i.entryFeeAmount || periodic.length === 0) {
          expect(fees).toEqual([]);
        } else {
          expect(fees).toEqual([
            { sequence: 0, kind: 'entry_fee', dueDate: periodic[0]?.dueDate, amountDue: i.entryFeeAmount },
          ]);
          expect(lines[0]).toEqual(fees[0]);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('cycle roulant : exactement `horizon` échéances (12 par défaut)', () => {
    fc.assert(
      fc.property(input, (i) => {
        fc.pre(i.scheduleType === 'rolling');
        expect(generateSchedule(i).filter((l) => l.kind === 'periodic')).toHaveLength(i.horizon ?? 12);
      }),
      { numRuns: 300 },
    );
  });

  it('jour d’échéance ramené au dernier jour du mois, jamais au-delà', () => {
    fc.assert(
      fc.property(input, (i) => {
        fc.pre(i.frequency !== 'weekly');
        for (const l of generateSchedule(i).filter((x) => x.kind === 'periodic')) {
          const [y, m, d] = l.dueDate.split('-').map(Number) as [number, number, number];
          const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
          expect(d).toBe(Math.min(i.dueDay, last));
        }
      }),
      { numRuns: 300 },
    );
  });
});
