// PATCH /api/gestionnaire/profil — prénom, nom, email de connexion, téléphone, préférences de notification.
// Le résumé quotidien par email (V2) ne peut pas être activé.
import type { ModificationProfilGestionnaire, ProfilGestionnaire } from '~~/types'
import { store } from '../../../mocks/store'
import { complementProfil, gestionnaireConnecte, profilGestionnaire } from '../../../utils/profil-gestionnaire'

export default defineMockHandler(async (event): Promise<ProfilGestionnaire> => {
  const g = gestionnaireConnecte(event)
  const corps = await readBody<ModificationProfilGestionnaire>(event) ?? {}
  if (corps.prenom !== undefined && !corps.prenom.trim()) erreurMetier(422, 'prenom-requis', 'First name required')
  if (corps.nom !== undefined && !corps.nom.trim()) erreurMetier(422, 'nom-requis', 'Name required')
  if (corps.email !== undefined) {
    const email = corps.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurMetier(422, 'email-invalide', 'Invalid email')
    if (store.gestionnaires.some(x => x.id !== g.id && x.email.toLowerCase() === email.toLowerCase())) erreurMetier(409, 'email-existant', 'Email already used')
    g.email = email
  }
  if (corps.prenom !== undefined) g.prenom = corps.prenom.trim()
  if (corps.nom !== undefined) g.nom = corps.nom.trim()
  if (corps.telephone !== undefined) g.telephone = corps.telephone.trim() || undefined
  if (corps.preferences) {
    const complement = complementProfil(g.id)
    complement.preferences = { ...complement.preferences, ...corps.preferences, resumeQuotidien: false }
  }
  return profilGestionnaire(g)
})
