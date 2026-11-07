// Fichiers (fl.get) : lecture d'un fichier déposé, après contrôle d'accès du back. Lot 3.4 : preuve de paiement du
// souscripteur (justificatifs de l'historique).
//
// `fl.get` répond par une redirection 302 vers une URL signée de 5 min (MinIO). Un lien simple n'emporterait pas le
// jeton d'accès (en mémoire, jamais en cookie) : le client suit la redirection avec son en-tête Authorization, le
// navigateur le retire en changeant d'origine, et le contenu est servi à la page par une URL `blob:` locale, à libérer
// avec `URL.revokeObjectURL` quand elle n'est plus affichée.

/** Lecture d'un fichier par son identifiant : URL `blob:` locale du contenu (navigateur seulement). */
export function useLectureFichier() {
  const client = useClient()
  return async (fileId: string): Promise<string> => {
    const reponse = await client.call('fl.get', 'get', { params: { id: fileId } })
    return URL.createObjectURL(await reponse.blob())
  }
}
