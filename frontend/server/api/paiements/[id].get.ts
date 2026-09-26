// GET /api/paiements/:id — détail avec souscripteur, projet et échéances couvertes.
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  return {
    ...p,
    souscripteur: store.souscripteurs.find(s => s.id === p.souscripteurId)!,
    projet: store.projets.find(x => x.id === p.projetId)!,
    echeances: store.echeances.filter(e => p.repartition.some(r => r.echeanceId === e.id)),
  }
})
