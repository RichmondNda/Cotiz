// GET /api/notifications — notifications de l'utilisateur connecté, plus récentes d'abord.
// Scénarios : `vide`, `tout-lu`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  if (scenario === 'vide') return []
  const moi = utilisateurSession(event)
  if (!moi) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  return store.notifications
    .filter(n => n.destinataireId === moi.id && moi.role !== 'superadmin')
    .map(n => (scenario === 'tout-lu' ? { ...n, lue: true } : n))
})
