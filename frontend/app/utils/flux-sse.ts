// Lecture d'un flux SSE (text/event-stream) reçu par `fetch` : EventSource n'envoie pas d'en-tête, or nt.stream exige le
// jeton d'accès en `Authorization` (lot 4.2). Format : https://html.spec.whatwg.org/multipage/server-sent-events.html

export interface EvenementSse {
  /** Champ `id` (reprise par `Last-Event-ID`), `null` s'il est absent. */
  id: string | null
  type: string
  data: string
}

/** Lit le corps jusqu'à sa fin (ou l'interruption de la requête) ; chaque événement complet est livré à `surEvenement`. */
export async function lireFluxSse(reponse: Response, surEvenement: (e: EvenementSse) => void): Promise<void> {
  if (!reponse.body) return
  const lecteur = reponse.body.pipeThrough(new TextDecoderStream()).getReader()
  let tampon = ''
  let id: string | null = null
  let type = ''
  let donnees: string[] = []
  const ligne = (texte: string) => {
    if (texte === '') {
      if (donnees.length > 0) surEvenement({ id, type: type || 'message', data: donnees.join('\n') })
      id = null
      type = ''
      donnees = []
      return
    }
    if (texte.startsWith(':')) return
    const deuxPoints = texte.indexOf(':')
    const champ = deuxPoints < 0 ? texte : texte.slice(0, deuxPoints)
    const valeur = deuxPoints < 0 ? '' : texte.slice(deuxPoints + 1).replace(/^ /, '')
    if (champ === 'id') id = valeur
    else if (champ === 'event') type = valeur
    else if (champ === 'data') donnees.push(valeur)
  }
  for (;;) {
    const { value, done } = await lecteur.read()
    if (done) return
    tampon += value
    let fin: number
    while ((fin = tampon.search(/\r\n|\r|\n/)) >= 0) {
      const separateur = tampon.startsWith('\r\n', fin) ? 2 : 1
      ligne(tampon.slice(0, fin))
      tampon = tampon.slice(fin + separateur)
    }
  }
}
