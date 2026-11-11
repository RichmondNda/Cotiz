// Notifications en temps réel (nt.stream, lot 4.2) : un flux SSE par onglet, ouvert par le gabarit de l'espace
// (souscripteur, back-office). À chaque notification, la cloche (compteur) et la liste se relisent, sans recharger.
// Reconnexion : à la fin du flux (15 min, durée du jeton) ou après une coupure, avec `Last-Event-ID` pour rattraper
// ce qui a été manqué ; délai croissant après une erreur. Ni SSR, ni session simulée, ni fonctionnalité `realtime`
// absente de `GET /me` : rien n'est ouvert.
import { espaceDuJeton, fetchAvecRenouvellement } from '~/utils/jeton-acces'
import { endpointDisponible, espaceBascule, type Espace } from '~/utils/bascule'
import { ENDPOINTS } from '@cotiz/contracts'
import { lireFluxSse } from '~/utils/flux-sse'

const CHEMIN = ENDPOINTS['nt.stream'].operations.stream.path
const DELAI_MIN_MS = 3_000
const DELAI_MAX_MS = 60_000
/** Clés de `useLecture` relues à chaque notification (préfixes : la clé porte aussi le scénario). */
const LECTURES = ['compteurs-navigation:', 'notifications:']

const ESPACES: readonly Espace[] = ['platform', 'association', 'subscriber']
const estEspace = (s: string | null): s is Espace => ESPACES.includes(s as Espace)

export function useFluxNotifications() {
  if (import.meta.server) return
  const jeton = useJetonAcces()
  const { active, pret } = usePermissions()
  const nuxt = useNuxtApp()
  let controleur: AbortController | null = null
  let minuteur: ReturnType<typeof setTimeout> | undefined
  let dernierId: string | null = null
  let delai = DELAI_MIN_MS
  let arrete = false

  const rafraichir = () => {
    const cles = Object.keys(nuxt.payload.data).filter(c => LECTURES.some(p => c.startsWith(p)))
    if (cles.length) void refreshNuxtData(cles)
  }

  const planifier = (ms: number) => {
    clearTimeout(minuteur)
    if (!arrete) minuteur = setTimeout(() => void ouvrir(), ms)
  }

  async function ouvrir() {
    const espace = espaceDuJeton(jeton.valeur())
    if (arrete || !estEspace(espace) || !espaceBascule(espace) || !endpointDisponible('nt.stream', espace)) return
    controleur = new AbortController()
    try {
      const reseau = fetchAvecRenouvellement(globalThis.fetch.bind(globalThis), jeton)
      const reponse = await reseau(CHEMIN, {
        headers: {
          authorization: `Bearer ${jeton.valeur() ?? ''}`,
          accept: 'text/event-stream',
          ...(dernierId ? { 'last-event-id': dernierId } : {}),
        },
        signal: controleur.signal,
      })
      // Session perdue (401 malgré le renouvellement) ou flux indisponible : on n'insiste pas.
      if (reponse.status === 401 || reponse.status === 403 || reponse.status === 404) return
      if (!reponse.ok) throw new Error(`flux ${reponse.status}`)
      delai = DELAI_MIN_MS
      await lireFluxSse(reponse, (e) => {
        if (e.type !== 'notification') return
        if (e.id) dernierId = e.id
        rafraichir()
      })
      // Fin normale (durée de vie du flux) : reconnexion rapide, avec reprise.
      planifier(DELAI_MIN_MS)
    }
    catch {
      if (arrete) return
      planifier(delai)
      delai = Math.min(delai * 2, DELAI_MAX_MS)
    }
  }

  const fermer = () => {
    arrete = true
    clearTimeout(minuteur)
    controleur?.abort()
  }

  onMounted(() => {
    // `GET /me` lu : fonctionnalité `realtime` livrée ? Sinon, la cloche reste en lecture simple (pas de flux).
    watch(pret, (ok) => {
      if (ok && active('realtime') && !controleur && !arrete) void ouvrir()
    }, { immediate: true })
  })
  onBeforeUnmount(fermer)
}
