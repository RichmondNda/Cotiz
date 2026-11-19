import { describe, expect, it } from 'vitest';
import { USAGE_CATCH_UP_DAYS, usageDaysToCompute, usagePeriod } from './usage.js';

const ABIDJAN = 'Africa/Abidjan';

describe('usageDaysToCompute — jours de usage.daily (lot 4.6)', () => {
  it('avant 02:00 locale : la veille n’est pas encore calculée', () => {
    const days = usageDaysToCompute(ABIDJAN, new Date('2026-11-15T01:59:00Z'), new Set());
    expect(days.at(-1)).toBe('2026-11-13');
    expect(days).toHaveLength(USAGE_CATCH_UP_DAYS - 1);
  });

  it('à partir de 02:00 locale : la veille, et les 7 derniers jours finis en rattrapage', () => {
    const days = usageDaysToCompute(ABIDJAN, new Date('2026-11-15T02:00:00Z'), new Set());
    expect(days).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });

  it('jours déjà calculés : ignorés (rejeu sans recalcul)', () => {
    const computed = new Set(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(usageDaysToCompute(ABIDJAN, new Date('2026-11-15T10:00:00Z'), computed)).toEqual(['2026-11-14']);
    computed.add('2026-11-14');
    expect(usageDaysToCompute(ABIDJAN, new Date('2026-11-15T10:00:00Z'), computed)).toEqual([]);
  });

  it('jour local du fuseau de l’association (Paris, UTC+1 en novembre)', () => {
    // 01:30 UTC = 02:30 à Paris : la veille parisienne (14) est due.
    expect(usageDaysToCompute('Europe/Paris', new Date('2026-11-15T01:30:00Z'), new Set()).at(-1)).toBe('2026-11-14');
  });
});

describe('usagePeriod — période de pf.asso.usage', () => {
  it('par défaut : les 30 derniers jours finis', () => {
    expect(usagePeriod({}, '2026-11-15')).toEqual({ from: '2026-10-16', to: '2026-11-14' });
  });

  it('bornes données : gardées ; une seule : l’autre par défaut', () => {
    expect(usagePeriod({ from: '2026-11-01', to: '2026-11-10' }, '2026-11-15')).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
    });
    expect(usagePeriod({ to: '2026-10-31' }, '2026-11-15')).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(usagePeriod({ from: '2026-11-10' }, '2026-11-15')).toEqual({ from: '2026-11-10', to: '2026-11-14' });
  });

  it('bornes inversées ou plus de 366 jours : refus', () => {
    expect(usagePeriod({ from: '2026-11-10', to: '2026-11-01' }, '2026-11-15')).toEqual({ issue: 'from_after_to' });
    expect(usagePeriod({ from: '2025-01-01', to: '2026-01-02' }, '2026-11-15')).toEqual({ issue: 'too_long' });
    expect(usagePeriod({ from: '2025-01-01', to: '2025-12-31' }, '2026-11-15')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('date illisible : erreur', () => {
    expect(() => usagePeriod({ from: '2026-13-01' }, '2026-11-15')).toThrow();
  });
});
