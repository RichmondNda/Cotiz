// GET /api/moi — fiche du souscripteur connecté (profil).
import type { Souscripteur } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler((event): Souscripteur => {
  const moi = souscripteurSession(event)
  return store.souscripteurs.find(s => s.id === moi.id) ?? introuvable('Souscripteur')
})
