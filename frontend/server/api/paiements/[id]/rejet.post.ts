// POST /api/paiements/:id/rejet — le gestionnaire rejette un paiement déclaré (motif obligatoire, message au
// souscripteur) : les échéances couvertes retrouvent leur état. Annulable (`/annulation`).
import type { RejetPaiement } from '~~/types'
import { MOTIFS_REJET } from '../../../../app/utils/statuts'
import { store } from '../../../mocks/store'

export default defineMockHandler(async (event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  if (p.statut !== 'en_attente') erreurMetier(409, 'deja_traite', 'Paiement deja traite')
  const corps = await readBody<RejetPaiement | undefined>(event).catch(() => undefined)
  if (!corps?.motif || !(corps.motif in MOTIFS_REJET)) erreurMetier(422, 'motif_requis', 'Motif requis')
  return rejeterPaiement(p, moi.id, corps.motif, corps.message?.trim() || undefined)
})
