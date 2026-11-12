import { addDays, type IsoDate } from './dates.js';

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
