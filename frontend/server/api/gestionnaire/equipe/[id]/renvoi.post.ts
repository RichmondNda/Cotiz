// POST /api/gestionnaire/equipe/:id/renvoi — renvoie l'invitation (invité) ou les identifiants (actif) par email.
import { store } from '../../../../mocks/store'
import { gestionnaireSession } from '../../../../utils/equipe'

export default defineMockHandler((event) => {
  const { associationId } = gestionnaireSession(event)
  const g = store.gestionnaires.find(x => x.id === parametre(event, 'id') && x.associationId === associationId)
    ?? introuvable('Gestionnaire')
  return { envoye: true, email: g.email, type: g.statut === 'invite' ? 'invitation' : 'identifiants' }
})
