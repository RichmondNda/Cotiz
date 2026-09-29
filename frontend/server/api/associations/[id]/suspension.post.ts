// POST /api/associations/:id/suspension — suspend l'association (motif obligatoire) : plus d'accès pour ses membres.
import type { SuspensionAssociation } from '~~/types'
import { DATE_REFERENCE } from '../../../../app/utils/date-reference'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const a = store.associations.find(x => x.id === parametre(event, 'id')) ?? introuvable('Association')
  const corps = await readBody<SuspensionAssociation>(event)
  if (!corps?.motif?.trim()) throw createError({ statusCode: 400, statusMessage: 'Motif obligatoire' })
  const statutAvant = a.statut === 'suspendue' ? (store.suspensions[a.id]?.statutAvant ?? 'active') : a.statut
  store.suspensions[a.id] = { le: DATE_REFERENCE.slice(0, 10), motif: corps.motif, statutAvant }
  a.statut = 'suspendue'
  return ficheAssociation(a)
})
