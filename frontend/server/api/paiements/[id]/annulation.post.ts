// POST /api/paiements/:id/annulation — annule la validation ou le rejet qui vient d'être fait (toast « Annuler ») :
// le paiement repasse en attente, échéances, souscription et compteurs reviennent à leur état précédent.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  return annulerTraitement(p) ?? erreurMetier(409, 'rien_a_annuler', 'Rien a annuler')
})
