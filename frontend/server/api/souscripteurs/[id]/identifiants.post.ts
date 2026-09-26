// POST /api/souscripteurs/:id/identifiants — renvoie au souscripteur ses identifiants de connexion. Mock : rien n'est envoyé.
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const s = store.souscripteurs.find(x => x.id === parametre(event, 'id')) ?? introuvable('Souscripteur')
  return { envoye: true, canal: 'sms' as const, telephone: s.telephone }
})
