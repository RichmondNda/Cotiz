// GET /api/contrats?projetId=&souscripteurId=&statut= — souscripteur : défaut = ses contrats.
// Scénarios : `tout-signe`, `tous-signes`, `aucun-contrat`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'aucun-contrat') return []
  const session = utilisateurSession(event)
  const projetId = filtre(event, 'projetId')
  const souscripteurId = filtre(event, 'souscripteurId') ?? (session?.role === 'souscripteur' ? session.id : undefined)
  const statut = filtre(event, 'statut')
  const toutSigne = scenario === 'tout-signe' || scenario === 'tous-signes'
  return store.contrats
    .map(c => (toutSigne && c.statut === 'a_signer' ? { ...c, statut: 'signe' as const, signeLe: '2026-09-25' } : c))
    .filter(c => (!projetId || c.projetId === projetId)
      && (!souscripteurId || c.souscripteurId === souscripteurId)
      && (!statut || c.statut === statut))
    .map(c => ({
      ...c,
      projet: store.projets.find(p => p.id === c.projetId)!,
      souscripteur: store.souscripteurs.find(s => s.id === c.souscripteurId)!,
      association: store.associations.find(a => a.id === c.associationId)!,
    }))
})
