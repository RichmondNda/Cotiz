// GET /api/projets/:id/souscripteurs — souscriptions du projet (retirées comprises, `retireLe`) avec le souscripteur.
// Scénarios : `aucun-souscripteur`, `tous-signes`.
import { store } from '../../../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const id = parametre(event, 'id')
  projetGestionnaire(id)
  if (scenario === 'aucun-souscripteur') return []
  return store.souscriptions
    .filter(s => s.projetId === id)
    .map(s => ({ ...s, souscripteur: store.souscripteurs.find(p => p.id === s.souscripteurId)! }))
    // `tous-signes` (MgProjetContrat) : les signatures en attente sont considérées comme faites.
    .map(s => (scenario === 'tous-signes' && s.statut === 'signature_attendue' ? { ...s, statut: 'a_jour' as const, contratSigneLe: s.inscritLe } : s))
})
