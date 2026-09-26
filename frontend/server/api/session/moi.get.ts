// GET /api/session/moi — utilisateur de la session mockée (cookie `cotiz_role`),
// avec l'association courante du gestionnaire (nom, plan).
import type { UtilisateurSession } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler((event): UtilisateurSession => {
  const moi = utilisateurSession(event)
  if (!moi) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  const asso = store.associations.find(a => a.id === moi.associationId)
  if (!asso) return moi
  const plan = store.plans.find(p => p.id === asso.planId)
  return { ...moi, association: { id: asso.id, nom: asso.nom, sigle: asso.sigle, plan: plan?.nom ?? '' } }
})
