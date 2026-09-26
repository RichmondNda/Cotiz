// Texte de contrat venant de l'API : paragraphes séparés par une ligne vide, `**…**` pour le gras (jamais de HTML brut).

export interface MorceauTexte {
  gras: boolean
  texte: string
}

export function paragraphesContrat(texte: string): MorceauTexte[][] {
  return texte.split(/\n{2,}/).map(p =>
    p.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(morceau => (morceau.startsWith('**')
      ? { gras: true, texte: morceau.slice(2, -2) }
      : { gras: false, texte: morceau })),
  )
}
