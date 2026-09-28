// GET /api/demandes/:id — demande et frise (reçue, consultée, décision). La première ouverture la marque consultée.
// Scénarios : `approuvee`, `refusee` (décision de la maquette : plan Essentiel, 2 comptes ; motif « Informations incomplètes »).
import type { Demande } from '~~/types'
import { DATE_REFERENCE } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const d = store.demandes.find(x => x.id === parametre(event, 'id')) ?? introuvable('Demande')
  if (!d.consulteeLe) d.consulteeLe = DATE_REFERENCE
  const decideLe = DATE_REFERENCE.slice(0, 10)
  let vue: Demande = d
  if (scenario === 'approuvee') {
    vue = { ...d, statut: 'approuvee', planAttribueId: d.besoins.planSouhaiteId, comptesGestionnaires: 2, decideLe }
  }
  else if (scenario === 'refusee') {
    vue = { ...d, statut: 'refusee', motifRefus: 'Informations incomplètes', refusEnvoyeLe: decideLe, decideLe }
  }
  return demandeDetaillee(vue)
})
