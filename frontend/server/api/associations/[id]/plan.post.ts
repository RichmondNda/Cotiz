// POST /api/associations/:id/plan — change le plan de l'association, et la limite de comptes gestionnaires secondaires
// (« Comptes gestionnaires autorisés », la même que l'écran Équipe du gestionnaire : « 2 sur 3 »).
import type { Identifiant } from '~~/types'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const a = store.associations.find(x => x.id === parametre(event, 'id')) ?? introuvable('Association')
  const corps = await readBody<{ planId?: Identifiant, comptesGestionnaires?: number }>(event)
  if (corps?.planId) {
    if (!store.plans.some(p => p.id === corps.planId)) throw createError({ statusCode: 400, statusMessage: 'Plan inconnu' })
    a.planId = corps.planId
  }
  if (corps?.comptesGestionnaires !== undefined) {
    if (!(corps.comptesGestionnaires >= 1)) throw createError({ statusCode: 400, statusMessage: 'Nombre de comptes invalide' })
    a.limiteComptesSecondaires = corps.comptesGestionnaires
  }
  return ficheAssociation(a)
})
