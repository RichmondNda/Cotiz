import { daysOverdue, formatMoney, type IsoDate, type Money } from '@cotiz/domain';
import type { ReminderVariable } from './reminder-rule.js';

/** Message d'une relance manuelle sans texte du gestionnaire (rm.send) ; mêmes variables que les règles. */
export const DEFAULT_REMINDER_MESSAGE =
  'Bonjour {{prenom}}, votre échéance du {{echeance}} pour {{projet}} ({{montant}}) n’est pas encore réglée. ' +
  'Merci de la régler auprès de {{association}}, puis de déclarer votre paiement sur Cotiz.';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 5 novembre 2026 », « 1er mars 2027 ». */
export function longDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day || month > 12) throw new Error(`date illisible : ${iso}`);
  return `${day === 1 ? '1er' : String(day)} ${MONTHS[month - 1] ?? ''} ${String(year)}`;
}

/** Valeurs des variables d'un message de relance, déjà mises en forme, pour une échéance et une personne. */
export function reminderVars(p: {
  firstName: string;
  lastName: string;
  projectName: string;
  associationName: string;
  remaining: Money;
  dueDate: IsoDate;
  today: IsoDate;
}): Record<ReminderVariable, string> {
  const late = daysOverdue(p.dueDate, p.today);
  return {
    prenom: p.firstName,
    nom: p.lastName,
    projet: p.projectName,
    association: p.associationName,
    montant: formatMoney(p.remaining),
    echeance: longDate(p.dueDate),
    retard: late === 0 ? '' : `${String(late)} jour${late > 1 ? 's' : ''}`,
  };
}
