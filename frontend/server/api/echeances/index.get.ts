// GET /api/echeances?projetId=&souscripteurId=&statut= — échéances (souscripteur : défaut = soi-même).
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const session = utilisateurSession(event)
  const projetId = filtre(event, 'projetId')
  const souscripteurId = filtre(event, 'souscripteurId') ?? (session?.role === 'souscripteur' ? session.id : undefined)
  const statut = filtre(event, 'statut')
  return store.echeances.filter(e => (!projetId || e.projetId === projetId)
    && (!souscripteurId || e.souscripteurId === souscripteurId)
    && (!statut || e.statut === statut))
})
