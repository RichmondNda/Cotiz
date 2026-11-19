import { describe, expect, it } from 'vitest';
import { daysOverdue, isRemindersTime, reminderDueDate, reminderRunStatus } from './reminders.js';

describe('reminderDueDate', () => {
  it('avant : échéances dans N jours, y compris au changement de mois et d’année', () => {
    expect(reminderDueDate('before_due', 3, '2026-11-12')).toBe('2026-11-15');
    expect(reminderDueDate('before_due', 3, '2026-12-30')).toBe('2027-01-02');
  });

  it('le jour même : échéances du jour, décalage ignoré', () => {
    expect(reminderDueDate('on_due', 0, '2026-11-12')).toBe('2026-11-12');
  });

  it('après : échéances passées depuis N jours (29 février compris)', () => {
    expect(reminderDueDate('after_due', 7, '2026-11-12')).toBe('2026-11-05');
    expect(reminderDueDate('after_due', 1, '2028-03-01')).toBe('2028-02-29');
  });

  it('décalage négatif ou non entier : refusé', () => {
    expect(() => reminderDueDate('after_due', -1, '2026-11-12')).toThrow(RangeError);
    expect(() => reminderDueDate('before_due', 1.5, '2026-11-12')).toThrow(RangeError);
  });
});

describe('reminderRunStatus', () => {
  it('automatique : rappel seul avant le retard, file « À relancer » en retard', () => {
    expect(reminderRunStatus('automatic', false)).toBe('auto_sent');
    expect(reminderRunStatus('automatic', true)).toBe('to_handle');
  });

  it('manuelle : toujours dans la file', () => {
    expect(reminderRunStatus('manual', false)).toBe('to_handle');
    expect(reminderRunStatus('manual', true)).toBe('to_handle');
  });
});

describe('daysOverdue', () => {
  it('jours écoulés depuis l’échéance, nul avant ou le jour même', () => {
    expect(daysOverdue('2026-11-05', '2026-11-12')).toBe(7);
    expect(daysOverdue('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysOverdue('2026-11-12', '2026-11-12')).toBe(0);
    expect(daysOverdue('2026-11-15', '2026-11-12')).toBe(0);
  });
});

describe('isRemindersTime', () => {
  it('08:30 locale ou plus tard, selon le fuseau', () => {
    expect(isRemindersTime('Africa/Abidjan', new Date('2026-11-12T08:29:00Z'))).toBe(false);
    expect(isRemindersTime('Africa/Abidjan', new Date('2026-11-12T08:30:00Z'))).toBe(true);
    // Kinshasa (UTC+1) : 08:30 locale = 07:30 UTC.
    expect(isRemindersTime('Africa/Kinshasa', new Date('2026-11-12T07:30:00Z'))).toBe(true);
    expect(isRemindersTime('Africa/Kinshasa', new Date('2026-11-12T07:29:00Z'))).toBe(false);
  });
});
