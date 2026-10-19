// Déconnexion dans un autre onglet (canal CANAL_SESSION) : jeton oublié ici aussi et retour à la connexion de l'espace,
// au lieu de laisser une interface affichée sans session.
import { CANAL_SESSION, CONNEXION_PAR_ROLE } from '~/composables/useSession'

export default defineNuxtPlugin(() => {
  if (!('BroadcastChannel' in window)) return
  const canal = new BroadcastChannel(CANAL_SESSION)
  canal.onmessage = (message: MessageEvent) => {
    if (message.data !== 'deconnexion') return
    useJetonAcces().definir(null)
    if (useRoute().path.startsWith('/plateforme')) void navigateTo(CONNEXION_PAR_ROLE.superadmin)
  }
})
