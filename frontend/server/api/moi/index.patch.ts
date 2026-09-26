// PATCH /api/moi — le souscripteur modifie son email (le téléphone n'est modifiable que par l'association).
import type { Souscripteur } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event): Promise<Souscripteur> => {
  const moi = souscripteurSession(event)
  const s = store.souscripteurs.find(x => x.id === moi.id) ?? introuvable('Souscripteur')
  const corps = await readBody<{ email?: string }>(event)
  const email = corps?.email?.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurMetier(422, 'email-invalide', 'Invalid email')
  s.email = email || undefined
  return s
})
