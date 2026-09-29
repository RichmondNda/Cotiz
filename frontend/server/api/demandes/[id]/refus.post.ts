// POST /api/demandes/:id/refus — refuse la demande avec un motif (obligatoire) et des précisions reprises dans l'email.
import type { RefusDemande } from '~~/types'
import { DATE_REFERENCE } from '../../../../app/utils/date-reference'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const d = store.demandes.find(x => x.id === parametre(event, 'id')) ?? introuvable('Demande')
  if (d.statut !== 'a_traiter') erreurMetier(409, 'deja_traitee', 'Demande deja traitee')
  const corps = await readBody<RefusDemande>(event)
  if (!corps?.motif?.trim()) throw createError({ statusCode: 400, statusMessage: 'Motif obligatoire' })
  const aujourdhui = DATE_REFERENCE.slice(0, 10)
  Object.assign(d, {
    statut: 'refusee',
    motifRefus: corps.motif,
    precisionsRefus: corps.precisions?.trim() || undefined,
    refusEnvoyeLe: aujourdhui,
    decideLe: aujourdhui,
    decidePar: 'richy',
  })
  return demandeDetaillee(d)
})
