// GET /api/navigation/compteurs — compteurs des menus pour l'utilisateur connecté.
import type { CompteursNavigation } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario): CompteursNavigation => {
  const moi = utilisateurSession(event)
  const aValider = store.paiements.filter(p => p.statut === 'en_attente' && p.associationId === moi?.associationId).length
  return {
    paiementsAValider: scenario === 'file-vide' ? 0 : aValider,
    souscripteursEnRetard: scenario === 'tout-est-a-jour'
      ? 0
      : store.projets.filter(p => p.associationId === moi?.associationId).reduce((n, p) => n + p.nbEnRetard, 0),
    notificationsNonLues: scenario === 'tout-lu' ? 0 : store.notifications.filter(n => n.destinataireId === moi?.id && !n.lue).length,
    demandesATraiter: scenario === 'aucune-demande' ? 0 : store.demandes.filter(d => d.statut === 'a_traiter').length,
  }
})
