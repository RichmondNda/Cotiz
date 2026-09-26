// PATCH /api/souscripteurs/:id — le gestionnaire modifie l'email ou l'adresse d'un souscripteur (« Modifier » de la fiche).
// Le téléphone, identifiant de connexion, n'est pas modifiable.
import type { ModificationSouscripteur } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const s = store.souscripteurs.find(x => x.id === parametre(event, 'id')) ?? introuvable('Souscripteur')
  const corps = await readBody<ModificationSouscripteur>(event)
  const email = corps?.email?.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erreurMetier(422, 'email-invalide', 'Invalid email')
  s.email = email || undefined
  s.adresse = corps?.adresse?.trim() || undefined
  // Les coordonnées saisies remplacent les placeholders de la maquette.
  store.coordonneesAssociation = Object.fromEntries(Object.entries(store.coordonneesAssociation).filter(([id]) => id !== s.id))
  return ficheSouscripteur(s, moi.associationId ?? 'entraide-yopougon')
})
