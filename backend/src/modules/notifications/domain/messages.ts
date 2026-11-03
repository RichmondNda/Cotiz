import { formatMoney, type Money } from '@cotiz/domain';
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
