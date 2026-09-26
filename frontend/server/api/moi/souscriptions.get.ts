// GET /api/moi/souscriptions — projets du souscripteur connecté (accueil, « Mes projets »), avec projet et association.
// Scénarios : `aucun-projet`, `tout-est-paye`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'souscripteur') throw createError({ statusCode: 403, statusMessage: 'Réservé aux souscripteurs' })
  if (scenario === 'aucun-projet') return []
  return store.souscriptions
    .filter(s => s.souscripteurId === moi.id)
    .map((s) => {
      const projet = store.projets.find(p => p.id === s.projetId)!
      const ajuste = scenario === 'tout-est-paye' && s.statut !== 'signature_attendue'
        ? { ...s, statut: 'a_jour' as const, montantEnRetard: 0 }
        : s
      return { ...ajuste, projet, association: store.associations.find(a => a.id === projet.associationId)! }
    })
})
