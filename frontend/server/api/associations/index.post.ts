// POST /api/associations — création directe par la plateforme (SaNouvelleAssociation), sans demande préalable.
import type { NouvelleAssociationPlateforme } from '~~/types'
import { DATE_REFERENCE } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default defineMockHandler(async (event) => {
  const c = await readBody<NouvelleAssociationPlateforme>(event)
  const a = c?.association
  const g = c?.gestionnaire
  const valide = a?.nom?.trim() && a.type && a.ville?.trim() && a.pays && (a.description ?? '').length <= 500
    && g?.prenom?.trim() && g.nom?.trim() && EMAIL.test(g.email ?? '') && g.telephone?.trim()
    && store.plans.some(p => p.id === c.abonnement?.planId) && c.abonnement.comptesGestionnaires >= 1
  if (!valide) throw createError({ statusCode: 400, statusMessage: 'Association incomplete' })
  return associationListe(creerAssociation({
    nom: a.nom.trim(),
    type: a.type,
    ville: a.ville.trim(),
    pays: a.pays,
    description: a.description?.trim(),
    numeroEnregistrement: a.numeroEnregistrement?.trim(),
    planId: c.abonnement.planId,
    debut: c.abonnement.debut,
    comptesGestionnaires: c.abonnement.comptesGestionnaires,
    gestionnaire: { prenom: g.prenom.trim(), nom: g.nom.trim(), email: g.email.trim(), telephone: g.telephone.trim() },
    creeeLe: DATE_REFERENCE.slice(0, 10),
  }))
})
