import { DUE_SOON_DAYS, formatMoney, type Money } from '@cotiz/domain';
import type { RenderedMessage } from './channel.js';

/**
 * Textes des notifications V1 (lot 2.5), rendus à la création. Liens d'action : architecture/07 (route front exacte).
 * `data` : liste blanche par type (libellé du bouton, identifiants utiles au front) ; jamais de code, de téléphone,
 * de preuve ni de commentaire. Vocabulaire de l'interface : « déclarer », « valider », jamais « payer », « approuver ».
 */

/** `amount` : montant reçu pour une validation (événement), montant déclaré sinon. */
interface PaymentFacts {
  paymentId: string;
  projectId: string;
  projectName: string;
  amount: Money;
}

const projectLink = (projectId: string) => `/projets/${projectId}`;

export function paymentValidatedMessage(p: PaymentFacts): RenderedMessage {
  return {
    type: 'payment.validated',
    title: 'Paiement validé',
    body: `Vos ${formatMoney(p.amount)} pour ${p.projectName} ont été validés.`,
    actionUrl: projectLink(p.projectId),
    data: { actionLabel: 'Voir le projet', paymentId: p.paymentId, projectId: p.projectId },
  };
}

export function paymentRejectedMessage(p: PaymentFacts): RenderedMessage {
  return {
    type: 'payment.rejected',
    title: 'Déclaration rejetée',
    body: `Votre déclaration de ${formatMoney(p.amount)} pour ${p.projectName} a été rejetée. Le motif est indiqué sur le projet.`,
    actionUrl: projectLink(p.projectId),
    data: { actionLabel: 'Voir le motif', paymentId: p.paymentId, projectId: p.projectId },
  };
}

export function paymentRevertedMessage(p: PaymentFacts): RenderedMessage {
  return {
    type: 'payment.reverted',
    title: 'Validation annulée',
    body: `Votre déclaration de ${formatMoney(p.amount)} pour ${p.projectName} est de nouveau en attente : sa validation a été annulée.`,
    actionUrl: projectLink(p.projectId),
    data: { actionLabel: 'Voir le projet', paymentId: p.paymentId, projectId: p.projectId },
  };
}

export function paymentDeclaredMessage(p: PaymentFacts & { subscriberName: string }): RenderedMessage {
  return {
    type: 'payment.declared',
    title: 'Nouvelle déclaration de paiement',
    body: `${p.subscriberName} a déclaré ${formatMoney(p.amount)} pour ${p.projectName}.`,
    actionUrl: `/asso/paiements/${p.paymentId}`,
    data: { actionLabel: 'Vérifier et valider', paymentId: p.paymentId, projectId: p.projectId },
  };
}

/** Regroupement (architecture/07) : au-delà de 5 déclarations en 1 h pour une association, une seule notification. */
export function paymentsDigestMessage(p: { pendingCount: number }): RenderedMessage {
  const n = Math.max(p.pendingCount, 1);
  return {
    type: 'payment.declared',
    title: n > 1 ? `${String(n)} paiements à valider` : '1 paiement à valider',
    body: 'De nombreuses déclarations sont arrivées en peu de temps : elles vous attendent dans la file de validation.',
    actionUrl: '/asso/paiements',
    data: { actionLabel: 'Ouvrir la file de validation', digest: true },
  };
}

export function memberEnrolledMessage(p: {
  associationName: string;
  projectId: string;
  projectName: string;
}): RenderedMessage {
  return {
    type: 'member.enrolled',
    title: 'Nouveau projet',
    body: `${p.associationName} vous a inscrit au projet ${p.projectName}.`,
    actionUrl: projectLink(p.projectId),
    data: { actionLabel: 'Voir le projet', projectId: p.projectId },
  };
}

export function userActivatedMessage(p: { userId: string; name: string }): RenderedMessage {
  return {
    type: 'user.activated',
    title: 'Compte activé',
    body: `${p.name} a activé son compte.`,
    actionUrl: `/asso/souscripteurs/${p.userId}`,
    data: { actionLabel: 'Voir le souscripteur', userId: p.userId },
  };
}

/** Souscripteur → gestionnaires de son association ; gestionnaire ou personnel → plateforme (sans nom). */
export function passwordResetRequestedMessage(
  p: { audience: 'manager'; name: string } | { audience: 'platform' },
): RenderedMessage {
  if (p.audience === 'manager') {
    return {
      type: 'password_reset.requested',
      title: 'Demande de réinitialisation',
      body: `${p.name} demande un code pour réinitialiser son mot de passe.`,
      actionUrl: '/asso/souscripteurs/reinitialisations',
      data: { actionLabel: 'Traiter la demande' },
    };
  }
  return {
    type: 'password_reset.requested',
    title: 'Demande de réinitialisation',
    body: 'Une demande de réinitialisation de mot de passe attend un code de la plateforme.',
    actionUrl: '/plateforme/reinitialisations',
    data: { actionLabel: 'Traiter la demande' },
  };
}

export function associationRequestSubmittedMessage(p: {
  requestId: string;
  reference: string;
  associationName: string;
}): RenderedMessage {
  return {
    type: 'association.request_submitted',
    title: 'Nouvelle demande de création',
    body: `${p.associationName} demande l’ouverture d’un espace (réf. ${p.reference}).`,
    actionUrl: `/plateforme/demandes/${p.requestId}`,
    data: { actionLabel: 'Examiner la demande', requestId: p.requestId },
  };
}

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

/** `2026-10-05` → « 5 octobre » ; « 1er » pour le premier du mois. */
function dayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  if (!month || !day || month > 12) throw new Error(`date illisible : ${isoDate}`);
  return `${day === 1 ? '1er' : String(day)} ${MONTHS[month - 1] ?? ''}`;
}

/** Rappel J-3 (architecture/07, DUE_SOON_DAYS) : reste dû des échéances visées, lien vers la déclaration pour ce projet. */
export function installmentDueSoonMessage(p: {
  projectId: string;
  projectName: string;
  dueDate: string;
  remaining: Money;
}): RenderedMessage {
  return {
    type: 'installment.due_soon',
    title: `Échéance dans ${String(DUE_SOON_DAYS)} jours`,
    body: `Prochaine échéance le ${dayAndMonth(p.dueDate)} : ${formatMoney(p.remaining)} pour ${p.projectName}.`,
    actionUrl: `/paiements/declarer?projet=${p.projectId}`,
    data: { actionLabel: 'Déclarer un paiement', projectId: p.projectId },
  };
}

/**
 * Récapitulatif quotidien des gestionnaires (jobs.yaml, managers.digest, 07:30 locale) : seules les rubriques non
 * nulles sont citées ; `null` si rien n'attend (aucune notification ce jour-là). Lien : tableau de bord.
 */
export function managersDigestMessage(p: {
  pendingPayments: number;
  newLateSubscribers: number;
  codesToHand: number;
}): RenderedMessage | null {
  const plural = (n: number, one: string, many: string) => `${String(n)} ${n > 1 ? many : one}`;
  const parts = [
    p.pendingPayments > 0 ? plural(p.pendingPayments, 'paiement à valider', 'paiements à valider') : null,
    p.newLateSubscribers > 0
      ? plural(p.newLateSubscribers, 'souscripteur passé en retard', 'souscripteurs passés en retard')
      : null,
    p.codesToHand > 0 ? plural(p.codesToHand, 'code d’activation à remettre', 'codes d’activation à remettre') : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return {
    type: 'digest.daily',
    title: 'Récapitulatif du jour',
    body: `${parts.join(' · ')}.`,
    actionUrl: '/asso',
    // Les chiffres sont dans le texte : `data` reste dans la liste blanche (aucune donnée en plus).
    data: { actionLabel: 'Ouvrir le tableau de bord', digest: true },
  };
}

const contractLink = (projectId: string) => `/projets/${projectId}/contrat`;

/** Inscription à un projet sous contrat (contrat verrouillé) : le souscripteur est invité à le signer. */
export function contractSignatureRequiredMessage(p: {
  associationName: string;
  projectId: string;
  projectName: string;
}): RenderedMessage {
  return {
    type: 'contract.signature_required',
    title: 'Contrat à signer',
    body: `${p.associationName} vous invite à signer le contrat du projet ${p.projectName}.`,
    actionUrl: contractLink(p.projectId),
    data: { actionLabel: 'Lire et signer', projectId: p.projectId },
  };
}

/** Contrat verrouillé (signé par l'association) : les souscripteurs en attente peuvent signer. */
export function contractLockedMessage(p: { associationName: string; projectId: string; projectName: string }) {
  return { ...contractSignatureRequiredMessage(p), type: 'contract.locked' } satisfies RenderedMessage;
}

/** Contre-signature d'un souscripteur → gestionnaires (architecture/07 : « Contrat signé »). */
export function contractSignedMessage(p: { name: string; projectId: string; projectName: string }): RenderedMessage {
  return {
    type: 'contract.signed',
    title: 'Contrat signé',
    body: `${p.name} a signé le contrat du projet ${p.projectName}.`,
    actionUrl: `/asso/projets/${p.projectId}/contrat`,
    data: { actionLabel: 'Voir le contrat', projectId: p.projectId },
  };
}
