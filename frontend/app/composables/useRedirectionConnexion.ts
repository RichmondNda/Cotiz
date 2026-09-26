// Après connexion : retour à la page protégée demandée (`?redirection=`, posé par les middlewares espace-*),
// si elle appartient à l'espace du rôle ; sinon, accueil de l'espace.
import type { Role } from '~~/types'
import { ACCUEIL_PAR_ROLE } from '~/composables/useSession'

const PREFIXES: Record<Role, RegExp> = {
  souscripteur: /^\/(accueil|projets|paiements|historique|associations|contrats|notifications|profil|bienvenue)(\/|$|\?)/,
  gestionnaire: /^\/asso(\/|$|\?)/,
  superadmin: /^\/plateforme(\/|$|\?)/,
}

export function useRedirectionConnexion() {
  const route = useRoute()
  return (role: Role) => {
    const r = route.query.redirection
    return typeof r === 'string' && PREFIXES[role].test(r) ? r : ACCUEIL_PAR_ROLE[role]
  }
}
