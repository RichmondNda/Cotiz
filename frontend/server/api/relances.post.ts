// POST /api/relances — relance (SMS) d'un ou plusieurs souscripteurs d'un projet. Mock : rien n'est envoyé.
export default defineMockHandler(async (event) => {
  const corps = await readBody<{ projetId?: string, souscripteurIds?: string[] }>(event)
  const ids = corps?.souscripteurIds ?? []
  if (!ids.length) throw createError({ statusCode: 422, statusMessage: 'Aucun souscripteur a relancer' })
  return { envoyees: ids.length, canal: 'sms' as const }
})
