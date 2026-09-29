// PATCH /api/plateforme/profil — informations personnelles et préférences de notification.
import type { ModificationProfilPlateforme } from '~~/types'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const corps = await readBody<ModificationProfilPlateforme>(event)
  const p = store.profilPlateforme
  if (corps.prenom !== undefined) {
    if (!corps.prenom.trim()) throw createError({ statusCode: 422, statusMessage: 'Prenom obligatoire' })
    p.prenom = corps.prenom.trim()
  }
  if (corps.nom !== undefined) p.nom = corps.nom.trim()
  if (corps.email !== undefined) p.email = corps.email.trim()
  if (corps.preferences) Object.assign(p.preferences, corps.preferences)
  return p
})
