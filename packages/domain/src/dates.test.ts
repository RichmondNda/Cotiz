import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysInMonth, isIsoDate, isoWeekday, parseIsoDate } from './dates.js';

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

  it('addMonths : premier jour du mois décalé', () => {
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths(2026, 1, 0)).toEqual({ year: 2026, month: 1 });
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
});
