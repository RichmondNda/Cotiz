// Fichiers proposés au téléchargement depuis le navigateur (export de ses données, journal d'audit).

/** Enregistre un Blob sous `nomFichier` (lien temporaire libéré aussitôt). */
export function telechargerBlob(nomFichier: string, contenu: Blob) {
  const url = URL.createObjectURL(contenu)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

/** JSON indenté (export de ses données, lot 4.7). */
export function telechargerJson(nomFichier: string, donnees: unknown) {
  telechargerBlob(nomFichier, new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }))
}
