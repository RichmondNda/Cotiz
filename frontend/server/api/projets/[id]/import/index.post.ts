// POST /api/projets/:id/import — lance l'import analysé. V0 : les lignes du fichier simulé ne sont pas créées
// dans le store (données fictives absentes des données de référence) ; renvoie le bilan affiché.
export default defineMockHandler(async (event) => {
  projetGestionnaire(parametre(event, 'id'))
  const corps = await readBody<{ lignes: number, canal: 'sms' | 'email' | 'les_deux' }>(event)
  if (!(corps?.lignes > 0)) erreurMetier(422, 'rien_a_importer', 'Aucune ligne a importer')
  return { importes: corps.lignes, invitations: corps.lignes, canal: corps.canal }
})
