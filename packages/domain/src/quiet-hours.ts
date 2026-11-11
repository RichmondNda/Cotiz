/**
 * Heures calmes du push non urgent (architecture/07 « Heures calmes », jobs.yaml `notify-push`) : de 21 h à 8 h,
 * heure de l'association. Un envoi dans la plage est mis en attente jusqu'à 8 h 00 locale, jamais perdu.
 */
export const QUIET_HOURS = { start: 21, end: 8 } as const;

const DAY_MS = 24 * 3_600_000;

/** Heure, minute, seconde locales de `now` dans `timeZone`. */
function localClock(now: Date, timeZone: string): { h: number; m: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { h: part('hour'), m: part('minute'), s: part('second') };
}

/**
 * Délai avant d'envoyer un push non urgent (ms) : 0 entre 8 h et 21 h locale, sinon le temps jusqu'à 8 h 00 locale.
 * Fuseaux d'Afrique de l'Ouest et centrale sans heure d'été : le décalage du jour suffit.
 */
export function quietHoursDelayMs(now: Date, timeZone: string): number {
  const { h, m, s } = localClock(now, timeZone);
  if (h >= QUIET_HOURS.end && h < QUIET_HOURS.start) return 0;
  const elapsedToday = ((h * 60 + m) * 60 + s) * 1000 + now.getUTCMilliseconds();
  const endOfQuiet = QUIET_HOURS.end * 3_600_000;
  return (endOfQuiet - elapsedToday + DAY_MS) % DAY_MS;
}
