// GET /api/gestionnaire/equipe — gestionnaires de l'association et quota de comptes secondaires.
// Scénario : `quota-atteint` (3 comptes secondaires sur 3).
import type { EquipeAssociation } from '~~/types'
import { equipe, gestionnaireSession } from '../../../utils/equipe'

export default defineMockHandler((event, scenario): EquipeAssociation => {
  return equipe(gestionnaireSession(event).associationId, scenario)
})
