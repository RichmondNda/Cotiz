import { contractValues, Money, renderContract } from '@cotiz/domain';
import { enrollmentScheduleOf, type ProjectRecord, termsOf } from '../../projects/projects.public.js';
import { sha256Of } from './contract-records.js';

/**
 * Texte du contrat d'une inscription, tel que présenté au souscripteur (me.contract) et tel que reproduit dans le PDF
 * signé (worker documents) : un seul calcul, donc une seule empreinte. `renderContract()` de @cotiz/domain avec les
 * conditions du projet (figées au verrouillage, domain-rules § 9) et l'échéancier depuis la date d'entrée (cycle à
 * dates fixes ; roulant : sans nombre d'échéances ni total).
 */
export function renderedContractOf(input: {
  associationName: string;
  project: ProjectRecord;
  startsFrom: string;
  bodyTemplate: string;
  subscriber: { firstName: string; lastName: string; phone: string | null };
}) {
  const { project } = input;
  const terms = termsOf(project);
  const currency = terms.installmentAmount.currency;
  const lines = project.scheduleType === 'fixed' ? enrollmentScheduleOf(project, input.startsFrom) : null;
  const schedule = Array.isArray(lines) ? lines : null;
  const body = renderContract(
    input.bodyTemplate,
    contractValues({
      associationName: input.associationName,
      projectName: project.name,
      currency,
      entryFee: terms.entryFee?.amount ?? null,
      installmentAmount: terms.installmentAmount.amount,
      frequency: terms.frequency,
      dueDay: terms.dueDay,
      startDate: input.startsFrom,
      schedule,
      subscriber: input.subscriber,
    }),
  );
  const total = schedule
    ? Money.sum(
        schedule.map((l) => Money.of(l.amountDue, currency)),
        currency,
      )
    : null;
  return { body, renderedSha256: sha256Of(body), terms, schedule, total };
}
