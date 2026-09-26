// PATCH /api/notifications/:id — marque une notification de l'utilisateur connecté comme lue.
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  const n = store.notifications.find(x => x.id === parametre(event, 'id') && x.destinataireId === moi?.id)
    ?? introuvable('Notification')
  n.lue = true
  return n
})
