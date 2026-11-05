import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysInMonth, formatIsoDate, isIsoDate, isoWeekday, parseIsoDate } from './dates.js';

describe('dates YYYY-MM-DD', () => {
  it('isIsoDate : format et calendrier', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate('2026-01-01T00:00:00Z')).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it('parseIsoDate refuse une date invalide (invalid_date)', () => {
    expect(parseIsoDate('2026-03-05')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(() => parseIsoDate('2026-02-30')).toThrow(expect.objectContaining({ code: 'invalid_date' }));
  });

  it('daysInMonth, années bissextiles comprises', () => {
    expect([1, 2, 4, 12].map((m) => daysInMonth(2026, m))).toEqual([31, 28, 30, 31]);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('addDays et isoWeekday', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isoWeekday('2026-03-06')).toBe(5); // vendredi
    expect(isoWeekday('2026-03-01')).toBe(7); // dimanche
  });

  it('addMonths : décalage en avant comme en arrière', () => {
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths(2026, 1, 0)).toEqual({ year: 2026, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 3, -14)).toEqual({ year: 2025, month: 1 });
  });

  it('formatIsoDate refuse une année hors de 0000–9999 (ordre des chaînes préservé)', () => {
    expect(formatIsoDate({ year: 9999, month: 12, day: 31 })).toBe('9999-12-31');
    expect(() => formatIsoDate({ year: 10000, month: 1, day: 5 })).toThrow(
      expect.objectContaining({ code: 'invalid_date' }),
    );
    expect(() => formatIsoDate({ year: -1, month: 1, day: 5 })).toThrow(
      expect.objectContaining({ code: 'invalid_date' }),
    );
  });

  it('oracle Date UTC de 1900 à 2199 : addDays, isoWeekday, daysInMonth', () => {
    const start = Date.UTC(1900, 0, 1);
    const span = Math.round((Date.UTC(2199, 11, 31) - start) / 86_400_000);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: span }), fc.integer({ min: -400, max: 400 }), (n, k) => {
        const d = new Date(start + n * 86_400_000);
        const iso = d.toISOString().slice(0, 10);
        expect(addDays('1900-01-01', n)).toBe(iso);
        expect(isoWeekday(iso)).toBe(d.getUTCDay() === 0 ? 7 : d.getUTCDay());
        expect(daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1)).toBe(
          new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
        );
        expect(addDays(iso, k)).toBe(new Date(d.getTime() + k * 86_400_000).toISOString().slice(0, 10));
      }),
      { numRuns: 3000 },
    );
    for (const [date, weekday] of [
      ['1900-02-28', 3],
      ['1900-03-01', 4],
      ['2000-02-29', 2],
      ['2100-03-01', 1],
    ] as const) {
      expect(isoWeekday(date)).toBe(weekday);
    }
    expect(addDays('1900-02-28', 1)).toBe('1900-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('propriété : addDays(d, n) puis addDays(…, −n) revient à d ; l’ordre des chaînes suit l’ordre des dates', () => {
    const day = fc.integer({ min: 0, max: 200 * 365 }).map((n) => addDays('1950-01-01', n));
    fc.assert(
      fc.property(day, fc.integer({ min: -5000, max: 5000 }), (d, n) => {
        expect(isIsoDate(d)).toBe(true);
        expect(addDays(addDays(d, n), -n)).toBe(d);
        if (n > 0) expect(addDays(d, n) > d).toBe(true);
      }),
    );
  });

  it('mémoire des dates lues : mêmes résultats, objet rendu modifiable sans effet, erreurs inchangées', () => {
    const first = parseIsoDate('2026-03-05');
    first.day = 31;
    expect(parseIsoDate('2026-03-05')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(addDays('2026-03-05', 6)).toBe('2026-03-11');
    expect(addDays('2026-03-05', 6)).toBe('2026-03-11');
    expect(addDays('2026-03-05', -6)).toBe('2026-02-27');
    for (let i = 0; i < 5000; i += 1) addDays('2026-01-01', i); // au-delà de la borne : la mémoire est vidée
    expect(addDays('2026-03-05', 6)).toBe('2026-03-11');
    expect(() => parseIsoDate('2026-02-30')).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});
