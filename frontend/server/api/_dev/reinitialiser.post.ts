// POST /api/_dev/reinitialiser — remet le jeu simulé dans son état initial (développement uniquement).
// Utilisé par le script de capture et les parcours e2e pour que chaque rendu parte du jeu de référence,
// même après une mutation (signature d'un contrat, déclaration d'un paiement…).
import { createError, defineEventHandler } from 'h3'
import { resetDb } from '../../mocks/db'

export default defineEventHandler(() => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  resetDb()
  return { ok: true }
})
