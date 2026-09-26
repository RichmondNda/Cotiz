// POST /api/contrats/:id/signature — le souscripteur signe son contrat (signature électronique horodatée).
// La souscription passe « À jour » et son échéancier est créé (fonds d'entrée compris).
import { DATE_REFERENCE } from '../../../../app/utils/date-reference'
import { genererEcheances } from '../../../mocks/generation'
import { store } from '../../../mocks/store'

// Heure de signature de la maquette (« Signé électroniquement le 25/09/2026 à 10:42 »).
const SIGNE_LE = `${DATE_REFERENCE.slice(0, 10)}T10:42:00`

export default defineMockHandler((event) => {
  const moi = souscripteurSession(event)
  const contrat = store.contrats.find(c => c.id === parametre(event, 'id') && c.souscripteurId === moi.id) ?? introuvable('Contrat')
  if (contrat.statut === 'signe') erreurMetier(409, 'deja-signe', 'Contract already signed')
  contrat.statut = 'signe'
  contrat.signeLe = SIGNE_LE

  const souscription = store.souscriptions.find(s => s.projetId === contrat.projetId && s.souscripteurId === moi.id)
  const projet = store.projets.find(p => p.id === contrat.projetId)
  if (souscription && projet) {
    souscription.contratSigneLe = SIGNE_LE
    souscription.statut = 'a_jour'
    if (!store.echeances.some(e => e.projetId === projet.id && e.souscripteurId === moi.id)) {
      store.echeances.push(...genererEcheances(projet, moi.id, ''))
    }
  }
  return {
    ...contrat,
    projet: projet!,
    souscripteur: store.souscripteurs.find(s => s.id === moi.id)!,
    association: store.associations.find(a => a.id === contrat.associationId)!,
  }
})
