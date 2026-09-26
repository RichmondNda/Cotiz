// GET /api/gestionnaire/association — association du gestionnaire connecté (onboarding, création de projet).
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  return store.associations.find(a => a.id === moi?.associationId) ?? introuvable('Association')
})
