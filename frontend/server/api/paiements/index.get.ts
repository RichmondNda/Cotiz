// GET /api/paiements?statut=&souscripteurId=&projetId=&associationId= — paiements déclarés, plus récents d'abord.
// Scénarios : `file-vide` (aucun en attente), `aucun-paiement`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'aucun-paiement') return []
  const statut = filtre(event, 'statut')
  const souscripteurId = filtre(event, 'souscripteurId')
  const projetId = filtre(event, 'projetId')
  const associationId = filtre(event, 'associationId')
  return store.paiements
    .filter(p => !(scenario === 'file-vide' && p.statut === 'en_attente'))
    .filter(p => (!statut || p.statut === statut)
      && (!souscripteurId || p.souscripteurId === souscripteurId)
      && (!projetId || p.projetId === projetId)
      && (!associationId || p.associationId === associationId))
    .sort((a, b) => b.declareLe.localeCompare(a.declareLe))
    .map(p => ({
      ...p,
      souscripteur: store.souscripteurs.find(s => s.id === p.souscripteurId)!,
      projet: store.projets.find(x => x.id === p.projetId)!,
    }))
})
