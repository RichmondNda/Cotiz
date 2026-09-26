// POST /api/gestionnaire/equipe — invite un gestionnaire secondaire (identifiants envoyés par email).
// Refusé si le quota de comptes secondaires est atteint.
import type { Gestionnaire, InvitationGestionnaire } from '~~/types'
import { store } from '../../../mocks/store'
import { equipe, gestionnaireSession } from '../../../utils/equipe'

export default defineMockHandler(async (event, scenario): Promise<Gestionnaire> => {
  const { associationId } = gestionnaireSession(event)
  const { comptesSecondaires } = equipe(associationId, scenario)
  if (comptesSecondaires.utilises >= comptesSecondaires.limite) erreurMetier(409, 'quota-atteint', 'Quota reached')
  const corps = await readBody<InvitationGestionnaire>(event)
  const prenom = corps?.prenom?.trim() ?? ''
  const nom = corps?.nom?.trim() ?? ''
  const email = corps?.email?.trim() ?? ''
  if (!prenom || !nom) erreurMetier(422, 'nom-requis', 'Name required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurMetier(422, 'email-invalide', 'Invalid email')
  if (store.gestionnaires.some(g => g.email.toLowerCase() === email.toLowerCase())) erreurMetier(409, 'email-existant', 'Email already used')
  const invite: Gestionnaire = {
    id: `gs-${Date.now()}`, associationId, prenom, nom, email, telephone: corps.telephone?.trim() || undefined,
    role: 'secondaire', statut: 'invite', derniereConnexion: null,
  }
  store.gestionnaires.push(invite)
  return invite
})
