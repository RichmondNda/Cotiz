// Authentification mockée des écrans publics. Identifiants documentés dans server/mocks/IDENTIFIANTS.md.
// Les mots de passe déclencheurs (`provisoire`, `suspendu`) remplacent les cas que la maquette montre
// avec le même identifiant (awa@entraide.ci, 05 44 21 87 90).
import { chiffresTelephone } from '../../app/utils/validation'
import { store } from './store'

export { chiffresTelephone }

export const MOT_DE_PASSE = 'motdepasse'
export const MOT_DE_PASSE_PROVISOIRE = 'provisoire'
export const MOT_DE_PASSE_SUSPENDU = 'suspendu'
export const EMAIL_SUPERADMIN = 'richy@cotiz.app'
export const CODE_PLATEFORME = '481902'
export const CODE_SMS_VALIDE = '123456'
export const CODE_SMS_EXPIRE = '000000'

/** Échecs avant blocage, durée du blocage (spec : 5 échecs → 15 min). */
export const ECHECS_MAX = 5
export const DUREE_BLOCAGE_MS = 15 * 60 * 1000

export function souscripteurParTelephone(telephone: string) {
  const cible = chiffresTelephone(telephone)
  return store.souscripteurs.find(s => s.telephone && chiffresTelephone(s.telephone) === cible)
}

export function gestionnaireParEmail(email: string) {
  const cible = email.trim().toLowerCase()
  return store.gestionnaires.find(g => g.email.toLowerCase() === cible)
}

/** Tentatives échouées par identifiant (mémoire du serveur de dev). */
const tentatives = new Map<string, { echecs: number, bloqueJusqua?: number }>()

export function estBloque(cle: string): boolean {
  const t = tentatives.get(cle)
  if (!t?.bloqueJusqua) return false
  if (Date.now() < t.bloqueJusqua) return true
  tentatives.delete(cle)
  return false
}

/** Enregistre un échec ; renvoie `true` si ce nouvel échec déclenche le blocage. */
export function enregistrerEchec(cle: string): boolean {
  const t = tentatives.get(cle) ?? { echecs: 0 }
  t.echecs += 1
  if (t.echecs >= ECHECS_MAX) t.bloqueJusqua = Date.now() + DUREE_BLOCAGE_MS
  tentatives.set(cle, t)
  return Boolean(t.bloqueJusqua)
}

export function effacerEchecs(cle: string) {
  tentatives.delete(cle)
}
