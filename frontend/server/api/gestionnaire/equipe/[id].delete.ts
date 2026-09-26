// DELETE /api/gestionnaire/equipe/:id — retire l'accès d'un gestionnaire secondaire (ou annule son invitation).
import { store } from '../../../mocks/store'
import { gestionnaireSession } from '../../../utils/equipe'

export default defineMockHandler((event) => {
  const { associationId } = gestionnaireSession(event)
  const i = store.gestionnaires.findIndex(g => g.id === parametre(event, 'id') && g.associationId === associationId)
  if (i < 0) introuvable('Gestionnaire')
  if (store.gestionnaires[i]!.role === 'principal') erreurMetier(403, 'principal', 'Cannot remove main manager')
  store.gestionnaires.splice(i, 1)
  return { ok: true }
})
