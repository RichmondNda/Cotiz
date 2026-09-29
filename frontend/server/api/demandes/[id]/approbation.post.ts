// POST /api/demandes/:id/approbation — approuve la demande : crée l'association (onboarding) et son gestionnaire principal.
import type { ApprobationDemande } from '~~/types'
import { DATE_REFERENCE } from '../../../../app/utils/date-reference'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const d = store.demandes.find(x => x.id === parametre(event, 'id')) ?? introuvable('Demande')
  if (d.statut !== 'a_traiter') erreurMetier(409, 'deja_traitee', 'Demande deja traitee')
  const corps = await readBody<ApprobationDemande>(event)
  if (!store.plans.some(p => p.id === corps?.planId) || !(corps.comptesGestionnaires >= 1) || !corps.debutAbonnement) {
    throw createError({ statusCode: 400, statusMessage: 'Approbation incomplete' })
  }
  const aujourdhui = DATE_REFERENCE.slice(0, 10)
  const association = creerAssociation({
    nom: d.association.nom,
    type: d.association.type,
    ville: d.association.ville,
    pays: d.association.pays,
    description: d.association.description,
    numeroEnregistrement: d.association.numeroEnregistrement,
    planId: corps.planId,
    debut: corps.debutAbonnement,
    comptesGestionnaires: corps.comptesGestionnaires,
    gestionnaire: { ...d.responsable },
    creeeLe: aujourdhui,
  })
  Object.assign(d, {
    statut: 'approuvee',
    planAttribueId: corps.planId,
    comptesGestionnaires: corps.comptesGestionnaires,
    debutAbonnement: corps.debutAbonnement,
    noteInterne: corps.noteInterne,
    decideLe: aujourdhui,
    decidePar: 'richy',
    associationId: association.id,
  })
  return demandeDetaillee(d)
})
