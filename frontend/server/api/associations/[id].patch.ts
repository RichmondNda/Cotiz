// PATCH /api/associations/:id — profil et moyens de paiement de l'association (onboarding étapes 2 et 3, paramètres).
import type { ModificationAssociation } from '~~/types'
import { store } from '../../mocks/store'

const CHAMPS = ['nom', 'description', 'ville', 'telephoneContact', 'emailContact', 'logoUrl', 'modalitesPaiement', 'instructionsPaiement'] as const

export default defineMockHandler(async (event) => {
  const association = store.associations.find(a => a.id === parametre(event, 'id')) ?? introuvable('Association')
  const corps = await readBody<ModificationAssociation>(event)
  for (const cle of CHAMPS) {
    if (corps[cle] !== undefined) Object.assign(association, { [cle]: corps[cle] })
  }
  if (!association.nom.trim()) throw createError({ statusCode: 422, statusMessage: 'Nom obligatoire' })
  return association
})
