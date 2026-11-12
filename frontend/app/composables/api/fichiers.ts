// Fichiers (fl.get) : lecture d'un fichier déposé, après contrôle d'accès du back. Lot 3.4 : preuve de paiement du
// souscripteur (justificatifs de l'historique) ; preuves vues par le gestionnaire (as.file).
//
// `fl.get` répond par une redirection 302 vers une URL signée de 5 min (MinIO). Un lien simple n'emporterait pas le
// jeton d'accès (en mémoire, jamais en cookie) : le client suit la redirection avec son en-tête Authorization, le
// navigateur le retire en changeant d'origine, et le contenu est servi à la page par une URL `blob:` locale, à libérer
// avec `URL.revokeObjectURL` quand elle n'est plus affichée.

import { associationCourante } from './session'

/**
 * Lecture d'un fichier par son identifiant : URL `blob:` locale du contenu (navigateur seulement). Espace gestionnaire :
 * `as.file` (fichiers de l'association courante, dont les preuves de paiement) ; ailleurs `fl.get` (fichiers déposés
 * depuis l'espace : preuve du souscripteur, contrat signé).
 */
export function useLectureFichier() {
  const client = useClient()
  const { role } = useSession()
  return async (fileId: string): Promise<string> => {
    const reponse = role.value === 'gestionnaire'
      ? await client.call('as.file', 'get', { params: { aid: await associationCourante(client), id: fileId } })
      : await client.call('fl.get', 'get', { params: { id: fileId } })
    return URL.createObjectURL(await reponse.blob())
  }
}
