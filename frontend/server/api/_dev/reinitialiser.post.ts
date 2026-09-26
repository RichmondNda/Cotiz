// POST /api/_dev/reinitialiser — remet le store des mocks dans son état initial (développement uniquement).
// Utilisé par le script de capture pour que chaque rendu parte des données de référence,
// même après une mutation (signature d'un contrat, déclaration d'un paiement…).
import { reinitialiserStore } from '../../mocks/store'

export default defineEventHandler(() => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  reinitialiserStore()
  return { ok: true }
})
