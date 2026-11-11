import { describe, expect, it } from 'vitest'
import { lireFluxSse } from '../../app/utils/flux-sse'

/** Réponse dont le corps arrive en morceaux (comme le réseau : un événement peut être coupé n'importe où). */
const reponse = (morceaux: string[]) =>
  new Response(new ReadableStream<Uint8Array>({
    start(controleur) {
      const encodeur = new TextEncoder()
      for (const m of morceaux) controleur.enqueue(encodeur.encode(m))
      controleur.close()
    },
  }))

describe('lireFluxSse (nt.stream, lot 4.2)', () => {
  it('événements complets, même coupés entre deux morceaux ; commentaires ignorés', async () => {
    const recus: { id: string | null, type: string, data: string }[] = []
    await lireFluxSse(reponse([
      'retry: 3000\n\n: ok\n\nid: a1\nevent: notif',
      'ication\ndata: {"id":"a1"}\n\n: ping\n\nid: a2\n',
      'event: notification\ndata: {"id":"a2"}\n\n',
    ]), e => recus.push(e))
    expect(recus).toEqual([
      { id: 'a1', type: 'notification', data: '{"id":"a1"}' },
      { id: 'a2', type: 'notification', data: '{"id":"a2"}' },
    ])
  })

  it('fins de ligne CRLF, données sur plusieurs lignes, type par défaut « message »', async () => {
    const recus: { id: string | null, type: string, data: string }[] = []
    await lireFluxSse(reponse(['data: un\r\ndata: deux\r\n\r\n']), e => recus.push(e))
    expect(recus).toEqual([{ id: null, type: 'message', data: 'un\ndeux' }])
  })

  it('événement sans ligne vide finale (flux coupé) : non livré', async () => {
    const recus: unknown[] = []
    await lireFluxSse(reponse(['id: a1\nevent: notification\ndata: {"id":"a1"}\n']), e => recus.push(e))
    expect(recus).toEqual([])
  })
})
