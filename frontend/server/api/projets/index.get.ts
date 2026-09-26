// GET /api/projets?associationId=&statut= — par défaut, les projets de l'association du gestionnaire connecté.
// Scénarios : `vide`, `aucun-projet`, `premier-usage`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'vide' || scenario === 'aucun-projet' || scenario === 'premier-usage') return []
  const associationId = filtre(event, 'associationId') ?? utilisateurSession(event)?.associationId
  const statut = filtre(event, 'statut')
  return store.projets.filter(p => (!associationId || p.associationId === associationId) && (!statut || p.statut === statut))
})
