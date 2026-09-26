// POST /api/notifications/tout-lu — « Tout marquer comme lu » pour l'utilisateur connecté.
import { store } from '../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  if (!moi) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  store.notifications.filter(n => n.destinataireId === moi.id).forEach(n => (n.lue = true))
  return { ok: true }
})
