// DELETE /api/projets/:id — suppression définitive d'un projet sans aucun paiement (MgProjetParametres, zone de danger).
// Dès qu'un paiement a été déclaré ou validé, la suppression est refusée : il faut clôturer le projet.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const id = parametre(event, 'id')
  const projet = store.projets.find(p => p.id === id) ?? introuvable('Projet')
  const collecte = typeof projet.montantCollecte !== 'number' || projet.montantCollecte > 0
  if (collecte || store.paiements.some(p => p.projetId === id)) {
    erreurMetier(409, 'paiements_existants', 'Des paiements ont ete enregistres sur ce projet')
  }
  store.projets = store.projets.filter(p => p.id !== id)
  store.souscriptions = store.souscriptions.filter(s => s.projetId !== id)
  store.echeances = store.echeances.filter(e => e.projetId !== id)
  store.contrats = store.contrats.filter(c => c.projetId !== id)
  const association = store.associations.find(a => a.id === projet.associationId)
  if (association) association.nbProjets--
  return { supprime: id }
})
