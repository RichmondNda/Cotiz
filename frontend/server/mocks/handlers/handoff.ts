// Message prêt à transmettre par une personne (codes d'activation, d'invitation) : aucun envoi, aucun fournisseur.
import type { UserRow } from '../db'
import { personContact } from '../views'

export const MOCK_ACTIVATION_CODE = 'K7M4-P9QX'

export function handoff(user: UserRow, space: 'association' | 'subscriber', personalMessage?: string, code = MOCK_ACTIVATION_CODE) {
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  const where = space === 'association' ? 'votre espace association' : 'votre espace souscripteur'
  const message = [
    `Bonjour ${user.firstName}, voici votre code d'activation Cotiz pour ${where} : ${code}.`,
    'Rendez-vous sur Cotiz, saisissez votre identifiant et ce code, puis choisissez votre mot de passe.',
    personalMessage,
  ].filter(Boolean).join('\n')
  const phone = user.phone?.replace('+', '') ?? null
  return {
    code, expiresAt, recipient: personContact(user), message, activationUrl: null,
    whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
    smsUrl: user.phone ? `sms:${user.phone}?body=${encodeURIComponent(message)}` : null,
    mailtoUrl: user.email ? `mailto:${user.email}?subject=${encodeURIComponent('Votre accès Cotiz')}&body=${encodeURIComponent(message)}` : null,
  }
}
