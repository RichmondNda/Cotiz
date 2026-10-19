import type { Handoff, PersonContact } from '@cotiz/contracts';
import type { CodePurpose } from './one-time-code.js';

export interface HandoffInput {
  purpose: CodePurpose;
  /** Espace où le code sert (libellé du message). */
  space: 'platform' | 'association' | 'subscriber';
  /** Forme affichée (`K7M4-P9QX`, 6 chiffres). */
  code: string;
  expiresAt: Date;
  recipient: PersonContact;
  /** Adresse publique du front (APP_PUBLIC_URL). */
  appUrl: string;
  /** Mot du gestionnaire, ajouté à la fin. */
  personalMessage?: string | undefined;
}

const SPACE_LABEL: Record<HandoffInput['space'], string> = {
  platform: 'l’espace plateforme',
  association: 'votre espace association',
  subscriber: 'votre espace souscripteur',
};

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });

/**
 * Message prêt à transmettre par une personne (sans fournisseur, architecture/03) et ses liens : WhatsApp et SMS si la
 * personne a un téléphone, email sinon ou en plus. Le lien d'activation porte le téléphone, JAMAIS le code.
 */
export function buildHandoff(input: HandoffInput): Handoff {
  const { recipient, code } = input;
  const activation = input.purpose !== 'password_reset';
  // Le téléphone seulement (architecture/03) : pas d'email dans une URL (journaux d'accès des proxys).
  const activatePage = new URL('/activer', input.appUrl).href;
  const activatePageFor = recipient.phone ? `${activatePage}?t=${encodeURIComponent(recipient.phone)}` : activatePage;
  const lines = activation
    ? [
        `Bonjour ${recipient.firstName}, voici votre code d’activation Cotiz pour ${SPACE_LABEL[input.space]} : ${code} (valable jusqu’au ${DAY.format(input.expiresAt)}).`,
        `Rendez-vous sur ${activatePageFor}, saisissez votre identifiant et ce code, puis choisissez votre mot de passe.`,
      ]
    : [
        `Bonjour ${recipient.firstName}, voici votre code de réinitialisation Cotiz : ${code} (valable 15 minutes).`,
        'Saisissez-le sur la page « Mot de passe oublié », puis choisissez votre nouveau mot de passe.',
      ];
  if (input.personalMessage?.trim()) lines.push(input.personalMessage.trim());
  const message = lines.join('\n');
  const text = encodeURIComponent(message);
  return {
    code,
    expiresAt: input.expiresAt.toISOString(),
    recipient,
    message,
    activationUrl: activation ? activatePageFor : null,
    whatsappUrl: recipient.phone ? `https://wa.me/${recipient.phone.replace('+', '')}?text=${text}` : null,
    smsUrl: recipient.phone ? `sms:${recipient.phone}?body=${text}` : null,
    mailtoUrl: recipient.email
      ? `mailto:${recipient.email}?subject=${encodeURIComponent('Votre accès Cotiz')}&body=${text}`
      : null,
  };
}
