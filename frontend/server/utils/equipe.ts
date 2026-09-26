// Équipe du gestionnaire connecté (MgEquipe) : membres affichés et quota de comptes secondaires.
import type { H3Event } from 'h3'
import type { EquipeAssociation, Gestionnaire, UtilisateurSession } from '~~/types'
import { EXCLUS_EQUIPE, INVITE_QUOTA } from '../mocks/referentiel'
import { store } from '../mocks/store'

/** Gestionnaire connecté ; 401 sinon. */
export function gestionnaireSession(event: H3Event): UtilisateurSession & { associationId: string } {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire' || !moi.associationId) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  return moi as UtilisateurSession & { associationId: string }
}

/** Membres de l'équipe (principal d'abord), scénario `quota-atteint` : une invitation de plus. */
export function membresEquipe(associationId: string, scenario?: string): Gestionnaire[] {
  const membres = store.gestionnaires.filter(g => g.associationId === associationId && !EXCLUS_EQUIPE.includes(g.id))
  if (scenario === 'quota-atteint' && !membres.some(m => m.id === INVITE_QUOTA.id)) membres.push({ ...INVITE_QUOTA, associationId })
  return membres.sort((a, b) => Number(a.role !== 'principal') - Number(b.role !== 'principal'))
}

export function equipe(associationId: string, scenario?: string): EquipeAssociation {
  const membres = membresEquipe(associationId, scenario)
  const association = store.associations.find(a => a.id === associationId)
  return {
    membres,
    comptesSecondaires: {
      utilises: membres.filter(m => m.role === 'secondaire').length,
      limite: association?.limiteComptesSecondaires ?? 0,
    },
  }
}
