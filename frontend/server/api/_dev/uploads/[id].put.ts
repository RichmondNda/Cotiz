// PUT /api/_dev/uploads/:id — dépôt simulé d'un fichier (URL présignée de fl.upload en dev) : le contenu est ignoré.
import { defineEventHandler, readRawBody, setResponseStatus } from 'h3'

export default defineEventHandler(async (event) => {
  await readRawBody(event, false)
  setResponseStatus(event, 200)
  return null
})
