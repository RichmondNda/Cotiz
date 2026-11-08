// Contrat d'un projet (lot 4.1) : valeurs des variables du modèle et rendu du texte. Partagé par le back (texte signé,
// empreinte SHA-256, PDF) et le front (aperçu), pour un texte identique au caractère près.
import { parseIsoDate, type IsoDate } from './dates.js';
import { formatMoney, type Currency } from './money.js';
import type { Frequency, InstallmentKind } from './schedule.js';

/** Variables reconnues dans un modèle, `{nom}` (celles de l'assistant de création et des mocks). */
export const CONTRACT_VARIABLES = [
  'association',
  'nom_souscripteur',
  'telephone',
  'projet',
  'montant',
  'fonds_entree',
  'nb_echeances',
  'frequence',
  'montant_echeance',
  'jour',
  'date_debut',
] as const;
export type ContractVariable = (typeof CONTRACT_VARIABLES)[number];
/** Valeur de chaque variable ; absente : la variable reste telle quelle dans le texte. */
export type ContractValues = Partial<Record<ContractVariable, string>>;

export interface ContractContext {
  associationName: string;
  projectName: string;
  currency: Currency;
  /** Fonds d'entrée ; `null` ou 0 : aucun. */
  entryFee: number | null;
  installmentAmount: number;
  frequency: Frequency;
  dueDay: number;
  /** Date d'entrée du souscripteur (à défaut, début du projet) ; `null` : inconnue. */
  startDate: IsoDate | null;
  /** Échéancier (dates fixes) ; `null` : cycle roulant, sans terme. */
  schedule: readonly { kind: InstallmentKind; amountDue: number }[] | null;
  /** Absent : modèle vu par l'association, les variables du souscripteur restent à remplir. */
  subscriber?: { firstName: string; lastName: string; phone: string | null };
}

const FREQUENCY_WORDS: Record<Frequency, string> = {
  weekly: 'hebdomadaires',
  monthly: 'mensuelles',
  quarterly: 'trimestrielles',
  semiannual: 'semestrielles',
  annual: 'annuelles',
};

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
] as const;

/** « 1 mars 2026 » (comme `formatDate(…, 'long')` du front). */
function longDate(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${String(day)} ${MONTHS[month - 1] ?? ''} ${String(year)}`;
}

/** « +225 07 00 00 00 11 » (comme `formatTelephone` du front) : indicatif à 3 chiffres, puis groupes de deux. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/[\s.-]/g, '');
  if (!/^\+\d{4,}$/.test(digits)) return phone;
  const groups = digits.slice(4).match(/.{1,2}/g) ?? [];
  return `${digits.slice(0, 4)} ${groups.join(' ')}`;
}

/**
 * Valeurs des variables pour un projet (et un souscripteur) : montants par `formatMoney` (`25 000 F`), total
 * d'engagement = somme de l'échéancier (dates fixes) ; cycle roulant : `{montant}` = une échéance, pas de
 * `{nb_echeances}`. Un souscripteur sans téléphone : « non renseigné ».
 */
export function contractValues(context: ContractContext): ContractValues {
  const money = (amount: number) => formatMoney(amount, context.currency);
  const periodic = context.schedule?.filter((line) => line.kind === 'periodic').length;
  const total = context.schedule?.reduce((sum, line) => sum + line.amountDue, 0);
  const values: ContractValues = {
    association: context.associationName,
    projet: context.projectName,
    montant: money(total ?? context.installmentAmount),
    fonds_entree: money(context.entryFee ?? 0),
    ...(periodic === undefined ? {} : { nb_echeances: String(periodic) }),
    frequence: FREQUENCY_WORDS[context.frequency],
    montant_echeance: money(context.installmentAmount),
    jour: String(context.dueDay),
    ...(context.startDate === null ? {} : { date_debut: longDate(context.startDate) }),
  };
  const subscriber = context.subscriber;
  if (subscriber) {
    values.nom_souscripteur = `${subscriber.firstName} ${subscriber.lastName}`.trim();
    values.telephone = subscriber.phone ? formatPhone(subscriber.phone) : 'non renseigné';
  }
  return values;
}

const VARIABLE = /\{(\w+)\}/g;

/**
 * Texte du contrat : chaque `{variable}` reconnue et renseignée est remplacée, en une seule passe (une valeur qui
 * contient `{…}` n'est pas relue) ; toute autre accolade reste telle quelle. Déterministe : même modèle et mêmes
 * valeurs, même texte, donc même empreinte.
 */
export function renderContract(template: string, values: ContractValues): string {
  return template.replace(VARIABLE, (whole, name: string) => {
    const value = (CONTRACT_VARIABLES as readonly string[]).includes(name)
      ? values[name as ContractVariable]
      : undefined;
    return value ?? whole;
  });
}
