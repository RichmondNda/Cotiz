// GET /api/moi/souscriptions — projets du souscripteur connecté (accueil, déclaration), avec projet, association,
// retards et prochaine échéance. Scénarios : `aucun-projet`, `tout-est-paye` (voir server/utils/souscripteur.ts).
import type { SouscriptionMembre } from '~~/types'

export default defineMockHandler((event, scenario): SouscriptionMembre[] => {
  const moi = souscripteurSession(event)
  return souscriptionsMembre(donneesMembre(moi.id, scenario))
})
