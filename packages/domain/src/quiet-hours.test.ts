import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QUIET_HOURS, quietHoursDelayMs } from './quiet-hours.js';

/**
 * Heures calmes du push non urgent (architecture/07, jobs.yaml `notify-push`) : 21 h – 8 h heure de l'association ;
 * un envoi dans cette plage est différé jusqu'à 8 h locale (mis en attente, pas perdu).
 */
const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe('quietHoursDelayMs', () => {
  it('en journée (8 h – 21 h locale) : envoi immédiat', () => {
    expect(quietHoursDelayMs(at('2026-11-11T08:00:00Z'), 'Africa/Abidjan')).toBe(0);
    expect(quietHoursDelayMs(at('2026-11-11T12:30:00Z'), 'Africa/Abidjan')).toBe(0);
    expect(quietHoursDelayMs(at('2026-11-11T20:59:59Z'), 'Africa/Abidjan')).toBe(0);
  });

  it('dans la plage : différé jusqu’à 8 h locale, le soir même ou après minuit', () => {
    expect(quietHoursDelayMs(at('2026-11-11T21:00:00Z'), 'Africa/Abidjan')).toBe(11 * 60 * MIN);
    expect(quietHoursDelayMs(at('2026-11-11T23:30:00Z'), 'Africa/Abidjan')).toBe(8.5 * 60 * MIN);
    expect(quietHoursDelayMs(at('2026-11-12T07:59:00Z'), 'Africa/Abidjan')).toBe(MIN);
  });

  it('fuseau de l’association : 21 h à Douala (UTC+1) est 20 h UTC', () => {
    expect(quietHoursDelayMs(at('2026-11-11T20:00:00Z'), 'Africa/Douala')).toBe(11 * 60 * MIN);
    expect(quietHoursDelayMs(at('2026-11-11T19:59:00Z'), 'Africa/Douala')).toBe(0);
  });

  it('secondes et millisecondes comptées : on arrive exactement à 8 h 00', () => {
    expect(quietHoursDelayMs(at('2026-11-12T07:59:30.250Z'), 'Africa/Abidjan')).toBe(29_750);
  });

  it('propriété : jamais plus de 11 h, et l’instant obtenu est 8 h 00 locale ou un instant hors plage', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2035-01-01'), noInvalidDate: true }),
        fc.constantFrom('Africa/Abidjan', 'Africa/Douala', 'Africa/Dakar', 'Africa/Lagos'),
        (now, tz) => {
          const delay = quietHoursDelayMs(now, tz);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(11 * 60 * MIN);
          const sendAt = new Date(now.getTime() + delay);
          const hm = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(sendAt);
          const hour = Number(hm.slice(0, 2));
          if (delay > 0) expect(hm).toBe('08:00');
          else expect(hour >= QUIET_HOURS.end && hour < QUIET_HOURS.start).toBe(true);
        },
      ),
    );
  });
});
