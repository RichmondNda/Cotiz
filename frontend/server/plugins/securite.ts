// En-têtes de sécurité (lot 3.5, étape 3 ; règles dans server/securite/entetes.ts) : communs sur chaque réponse,
// politique de contenu avec un nonce par page rendue, sans `X-Powered-By`. En développement (`nuxt dev`), pas de
// politique de contenu : le rechargement à chaud de Vite injecte scripts et connexions WebSocket.
import { randomBytes } from 'node:crypto'
import { removeResponseHeader, setResponseHeader, setResponseHeaders } from 'h3'
import { avecNonce, ENTETES_SECURITE, politiqueContenu } from '../securite/entetes'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    setResponseHeaders(event, ENTETES_SECURITE)
  })

  nitro.hooks.hook('beforeResponse', (event) => {
    removeResponseHeader(event, 'x-powered-by')
  })

  if (import.meta.dev) return
  nitro.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')
    const config = useRuntimeConfig(event)
    for (const partie of ['head', 'bodyPrepend', 'body', 'bodyAppend'] as const) {
      html[partie] = html[partie].map(fragment => avecNonce(fragment, nonce))
    }
    setResponseHeader(event, 'Content-Security-Policy', politiqueContenu(nonce, {
      stockage: config.storageOrigin,
      glitchtipDsn: String(config.public.glitchtipDsn ?? ''),
    }))
  })
})
