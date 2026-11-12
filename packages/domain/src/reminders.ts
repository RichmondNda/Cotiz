import { addDays, type IsoDate, parseIsoDate } from './dates.js';
import { minutesIn } from './status.js';

/** Déclencheur d'une règle de relance (schema.sql : reminder_rules.trigger, lot 4.3). */
export type ReminderTrigger = 'before_due' | 'on_due' | 'after_due';

/**
 * Jour d'échéance visé par une règle de relance un jour donné (jour local de l'association, architecture/04 § 4.9) :
 * avant → les échéances dans `offsetDays` jours ; le jour même → celles du jour ; après → celles passées depuis
 * `offsetDays` jours. Une seule date par règle et par jour : un passage quotidien ne vise jamais deux fois la même
 * échéance pour une même règle.
 */
export function reminderDueDate(trigger: ReminderTrigger, offsetDays: number, today: IsoDate): IsoDate {
  if (!Number.isInteger(offsetDays) || offsetDays < 0)
    throw new RangeError(`décalage invalide : ${String(offsetDays)}`);
  if (trigger === 'on_due') return today;
  return addDays(today, trigger === 'before_due' ? offsetDays : -offsetDays);
}

/**
 * Suite donnée à une relance d'échéance : un rappel suffit tant que l'échéance n'est pas en retard (`auto_sent`) ; en
 * retard, le rappel part aussi et le gestionnaire reçoit une entrée « À relancer » avec le message prêt (`to_handle`).
 * Une relance manuelle va toujours dans la file : le gestionnaire transmet lui-même le message.
 */
export function reminderRunStatus(kind: 'automatic' | 'manual', late: boolean): 'auto_sent' | 'to_handle' {
  return kind === 'manual' || late ? 'to_handle' : 'auto_sent';
}

/** Jours de retard d'une échéance un jour donné (0 avant ou le jour de l'échéance) : variable `{{retard}}` des messages. */
export function daysOverdue(dueDate: IsoDate, today: IsoDate): number {
  const day = (d: IsoDate) => {
    const { year, month, day: dd } = parseIsoDate(d);
    return Date.UTC(year, month - 1, dd) / 86_400_000;
  };
  return Math.max(0, day(today) - day(dueDate));
}

/** Heure locale de l'évaluation des règles (jobs.yaml, reminders.evaluate : quotidienne 08:30 locale). */
export const REMINDERS_MINUTES = 8 * 60 + 30;

/** Est-il 08:30 ou plus tard (jusqu'à minuit) dans le fuseau de l'association ? Rattrapage dans la journée. */
export function isRemindersTime(timeZone: string, now: Date): boolean {
  return minutesIn(timeZone, now) >= REMINDERS_MINUTES;
}
