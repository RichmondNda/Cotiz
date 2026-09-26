// PATCH /api/relances/regles/:id — active ou désactive une règle de relance automatique.
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const regle = store.reglesRelance.find(r => r.id === parametre(event, 'id')) ?? introuvable('Regle')
  const corps = await readBody<{ active?: boolean }>(event)
  if (typeof corps?.active === 'boolean') regle.active = corps.active
  return regle
})
