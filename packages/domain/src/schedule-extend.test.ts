import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, extendRollingSchedule, generateSchedule } from './index.js';
import type { IsoDate, ScheduleInput, ScheduleLine } from './index.js';
import { loadVectors } from './test-vectors.js';

interface ExtendCase {
  name: string;
  description: string;
  input: { schedule: ScheduleInput; lastSequence: number; today: IsoDate };
  output?: ScheduleLine[];
  error?: { code: string };
}
const vectors = loadVectors<ExtendCase>('schedule-extend');

function run({ schedule, lastSequence, today }: ExtendCase['input']): ScheduleLine[] | { code: string } {
  try {
    return extendRollingSchedule(schedule, lastSequence, today);
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code };
    throw e;
  }
}

describe('extendRollingSchedule — vecteurs schedule-extend.json', () => {
  it('10 cas, dont 2 erreurs', () => {
    expect(vectors.function).toBe('extendRollingSchedule');
    expect(vectors.cases).toHaveLength(10);
    expect(vectors.cases.filter((c) => c.error)).toHaveLength(2);
  });

  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(run(c.input)).toEqual(c.output ?? c.error);
  });
});

describe('extendRollingSchedule — propriétés', () => {
  const day = fc.integer({ min: 0, max: 3 * 365 }).map((n) => {
    const d = new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const schedule = fc
    .record({
      frequency: fc.constantFrom<ScheduleInput['frequency']>('weekly', 'monthly', 'quarterly', 'semiannual', 'annual'),
      dueDay: fc.integer({ min: 1, max: 31 }),
      horizon: fc.integer({ min: 1, max: 24 }),
      entryFee: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
      start: day,
      enrolledOffset: fc.integer({ min: 0, max: 200 }),
    })
    .map((s) => ({ ...s, dueDay: s.frequency === 'weekly' ? ((s.dueDay - 1) % 7) + 1 : s.dueDay }));

  it('sans trou de numérotation, horizon atteint, aucune date avant l’entrée, jamais de fonds d’entrée, idempotent', () => {
    fc.assert(
      fc.property(schedule, day, ({ frequency, dueDay, horizon, entryFee, start, enrolledOffset }, later) => {
        const enrolledFrom = new Date(Date.parse(start) + enrolledOffset * 86_400_000).toISOString().slice(0, 10);
        const input: ScheduleInput = {
          installmentAmount: 1000,
          entryFeeAmount: entryFee,
          frequency,
          dueDay,
          scheduleType: 'rolling',
          startDate: start,
          enrolledFrom,
          horizon,
        };
        const initial = generateSchedule(input).filter((l) => l.kind === 'periodic');
        const last = initial.at(-1)?.sequence ?? 0;
        const today = later > enrolledFrom ? later : enrolledFrom;
        const added = extendRollingSchedule(input, last, today);
        const all = [...initial, ...added];
        added.forEach((line, i) => {
          expect(line.sequence).toBe(last + i + 1);
          expect(line.kind).toBe('periodic');
          expect(line.amountDue).toBe(1000);
          expect(line.dueDate >= enrolledFrom).toBe(true);
        });
        const ahead = all.filter((l) => l.dueDate >= today).length;
        expect(ahead).toBeGreaterThanOrEqual(horizon);
        if (added.length > 0) expect(ahead).toBe(horizon);
        expect(extendRollingSchedule(input, all.at(-1)?.sequence ?? 0, today)).toEqual([]);
      }),
    );
  });

  it('rang au-delà de la borne : invalid_sequence', () => {
    const input: ScheduleInput = {
      installmentAmount: 1000,
      frequency: 'monthly',
      dueDay: 5,
      scheduleType: 'rolling',
      startDate: '2026-03-01',
    };
    expect(() => extendRollingSchedule(input, 10_001, '2026-05-10')).toThrow(DomainError);
  });
});
