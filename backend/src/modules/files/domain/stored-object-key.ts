/**
 * Clé définitive d'un fichier analysé (architecture/08) : `{association_id}/{purpose}/{uuid}.{ext}`, jamais le nom
 * d'origine. Preuve d'un souscripteur pas encore rattachée à une association : `unassigned/…`. La clé ne sert qu'au
 * rangement : l'accès passe toujours par la ligne `files` et sa RLS.
 */
export function storedObjectKey(
  file: { id: string; associationId: string | null; purpose: string },
  extension: string,
) {
  return `${file.associationId ?? 'unassigned'}/${file.purpose}/${file.id}.${extension}`;
}
