// GET /api/moi/associations/:id — une association du souscripteur connecté et ses projets.
import type { AssociationMembre } from '~~/types'

export default defineMockHandler((event, scenario): AssociationMembre => {
  const moi = souscripteurSession(event)
  const id = parametre(event, 'id')
  return associationsMembre(souscriptionsMembre(donneesMembre(moi.id, scenario))).find(a => a.association.id === id)
    ?? introuvable('Association')
})
