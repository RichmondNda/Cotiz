// DELETE /api/projets/:id/souscripteurs/:souscripteurId — retire un souscripteur du projet.
// L'historique (paiements validés) est conservé ; les échéances à venir sont supprimées.
import { maintenant } from '../../../../../app/utils/date-reference'
import { store } from '../../../../mocks/store'

export default defineMockHandler((event) => {
  const id = parametre(event, 'id')
  const sid = parametre(event, 'souscripteurId')
  const projet = store.projets.find(p => p.id === id) ?? introuvable('Projet')
  const s = souscriptionsActives(id).find(x => x.souscripteurId === sid) ?? introuvable('Souscription')
  s.retireLe = maintenant().toISOString().slice(0, 10)
  store.echeances = store.echeances.filter(e => !(e.projetId === id && e.souscripteurId === sid && e.statut === 'a_venir'))
  if (typeof projet.nbSouscripteurs === 'number') projet.nbSouscripteurs = Math.max(0, projet.nbSouscripteurs - 1)
  if (s.statut === 'en_retard') projet.nbEnRetard = Math.max(0, projet.nbEnRetard - 1)
  if (s.statut === 'signature_attendue') projet.nbSignaturesAttendues = Math.max(0, projet.nbSignaturesAttendues - 1)
  return s
})
