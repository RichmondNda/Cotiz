// GET /api/moi/associations — associations du souscripteur connecté et ses projets dans chacune.
// Scénario : `une-seule-association`.
import type { AssociationMembre } from '~~/types'

export default defineMockHandler((event, scenario): AssociationMembre[] => {
  const moi = souscripteurSession(event)
  const liste = associationsMembre(souscriptionsMembre(donneesMembre(moi.id, scenario)))
  return scenario === 'une-seule-association' ? liste.slice(0, 1) : liste
})
