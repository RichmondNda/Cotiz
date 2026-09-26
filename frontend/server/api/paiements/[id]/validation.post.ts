// POST /api/paiements/:id/validation — le gestionnaire valide un paiement déclaré, avec éventuellement une répartition
// ajustée et le montant réellement reçu : échéances couvertes créditées (payées ou partielles), échéances retirées de
// la répartition libérées, souscription et compteurs du projet recalculés. Annulable (`/annulation`).
import type { ValidationPaiement } from '~~/types'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  if (p.statut !== 'en_attente') erreurMetier(409, 'deja_traite', 'Paiement deja traite')
  const corps = await readBody<ValidationPaiement | undefined>(event).catch(() => undefined)
  return validerPaiement(p, moi.id, { repartition: corps?.repartition, montantRecu: corps?.montantRecu })
})
