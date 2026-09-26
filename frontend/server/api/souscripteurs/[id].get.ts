// GET /api/souscripteurs/:id — fiche vue par le gestionnaire : coordonnées, souscriptions aux projets de son association
// (avec échéances), statut global, membre depuis, historique complet.
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const s = store.souscripteurs.find(x => x.id === parametre(event, 'id')) ?? introuvable('Souscripteur')
  const associationId = utilisateurSession(event)?.associationId ?? 'entraide-yopougon'
  return ficheSouscripteur(s, associationId)
})
