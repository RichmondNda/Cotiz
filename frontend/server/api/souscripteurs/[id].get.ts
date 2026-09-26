// GET /api/souscripteurs/:id — fiche : souscripteur + souscriptions (avec projet). Scénarios : `a-jour`, `contrat-non-signe`.
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const s = store.souscripteurs.find(x => x.id === parametre(event, 'id')) ?? introuvable('Souscripteur')
  return {
    souscripteur: s,
    souscriptions: store.souscriptions
      .filter(x => x.souscripteurId === s.id)
      .map(x => ({ ...x, projet: store.projets.find(p => p.id === x.projetId)! })),
  }
})
