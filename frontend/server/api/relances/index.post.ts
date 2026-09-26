// POST /api/relances — relance ponctuelle d'un ou plusieurs souscripteurs (notification dans l'espace souscripteur ;
// SMS et email en V2). Mock : rien n'est envoyé ; la dernière relance et l'historique des envois sont mis à jour.
import { maintenant } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event) => {
  const corps = await readBody<{ projetId?: string, souscripteurIds?: string[], message?: string }>(event)
  const ids = corps?.souscripteurIds ?? []
  if (!ids.length) throw createError({ statusCode: 422, statusMessage: 'Aucun souscripteur a relancer' })
  const moi = utilisateurSession(event)
  const aujourdhui = maintenant().toISOString().slice(0, 10)
  for (const id of ids) store.dernieresRelances[id] = { type: 'manuelle', date: aujourdhui }
  const projet = store.projets.find(p => p.id === corps?.projetId)
  store.envoisRelance.unshift({
    id: `env-${Date.now()}`,
    date: aujourdhui,
    type: 'manuelle',
    projet: projet?.nom ?? 'Plusieurs projets',
    destinataires: ids.length,
    par: moi ? [moi.prenom, moi.nom].filter(Boolean).join(' ') : 'Gestionnaire',
  })
  return { envoyees: ids.length, canal: 'sms' as const }
})
