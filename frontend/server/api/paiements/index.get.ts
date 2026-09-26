// GET /api/paiements?statut=&souscripteurId=&projetId=&associationId= — paiements déclarés, plus récents d'abord
// (souscripteur connecté : les siens).
// Scénarios : `file-vide` (aucun en attente), `aucun-paiement`.
import { store } from '../../mocks/store'

function nomGestionnaire(id?: string): string | undefined {
  const g = id ? store.gestionnaires.find(x => x.id === id) : undefined
  return g ? `${g.prenom} ${g.nom}` : undefined
}

export default defineMockHandler((event, scenario) => {
  if (scenario === 'aucun-paiement') return []
  const statut = filtre(event, 'statut')
  const session = utilisateurSession(event)
  // Souscripteur : uniquement ses propres paiements.
  const souscripteurId = session?.role === 'souscripteur' ? session.id : filtre(event, 'souscripteurId')
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
      traiteParNom: nomGestionnaire(p.traitePar),
    }))
})
