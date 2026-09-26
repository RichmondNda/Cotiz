// POST /api/gestionnaire/abonnement/changement — demande de changement de formule, traitée par l'équipe Cotiz.
import { store } from '../../../mocks/store'
import { gestionnaireSession } from '../../../utils/equipe'

export default defineMockHandler((event) => {
  const { associationId } = gestionnaireSession(event)
  if (!store.changementsFormuleDemandes.includes(associationId)) store.changementsFormuleDemandes.push(associationId)
  return { ok: true }
})
